import type { AttributionResolution } from '../types';
import { generateId } from '../utils/id';

export interface AttributionInput {
  explicitLastEp?: string | null;
  explicitFirstEp?: string | null;
  visitorId?: string | null;
  visitorHash?: string | null;
  customerHash?: string | null;
}

export interface ParsedWaAttribution {
  ef_ep?: string;
  ef_ft_ep?: string;
  ef_vid?: string;
}

interface EpisodeIdLookup {
  id: string;
  episode_code: string;
}

/**
 * Extract `ef_ep`, `ef_ft_ep` (`ft`), and `ef_vid` (`vid`) embedded in WhatsApp message text
 * by `/ef.js` (`[ref:ef_ep=ep-07|ft=ep-02|vid=v_abc]`) or query-style strings (`ef_ep=ep-07`).
 */
export function parseAttributionFromText(text: string | null | undefined): ParsedWaAttribution {
  if (!text) return {};
  const result: ParsedWaAttribution = {};

  const bracketMatch = text.match(/\[ref:([^\]]+)\]/i);
  if (bracketMatch && bracketMatch[1]) {
    const parts = bracketMatch[1].split('|');
    for (const part of parts) {
      const [rawKey, rawVal] = part.split('=');
      const key = rawKey?.trim().toLowerCase();
      const val = rawVal?.trim();
      if (!key || !val) continue;
      if (key === 'ef_ep' || key === 'ep') result.ef_ep = val;
      if (key === 'ft' || key === 'ef_ft_ep') result.ef_ft_ep = val;
      if (key === 'vid' || key === 'ef_vid') result.ef_vid = val;
    }
    if (result.ef_ep || result.ef_ft_ep || result.ef_vid) {
      return result;
    }
  }

  const epMatch = text.match(/\bef_ep=([a-zA-Z0-9_-]+)/);
  if (epMatch?.[1]) result.ef_ep = epMatch[1];

  const ftMatch = text.match(/\bef_ft_ep=([a-zA-Z0-9_-]+)/);
  if (ftMatch?.[1]) result.ef_ft_ep = ftMatch[1];

  const vidMatch = text.match(/\bef_vid=([a-zA-Z0-9_-]+)/);
  if (vidMatch?.[1]) result.ef_vid = vidMatch[1];

  return result;
}

/** Resolve an `episode_code` OR internal `episode.id` strictly within `workspaceId`. */
export async function resolveEpisodeInWorkspace(
  db: D1Database,
  workspaceId: string,
  codeOrId: string | null | undefined
): Promise<EpisodeIdLookup | null> {
  if (!codeOrId) return null;
  const trimmed = codeOrId.trim();
  if (!trimmed) return null;

  const row = await db
    .prepare(
      'SELECT id, episode_code FROM episodes WHERE workspace_id = ? AND (episode_code = ? OR id = ?) LIMIT 1'
    )
    .bind(workspaceId, trimmed, trimmed)
    .first<EpisodeIdLookup>();
  return row ?? null;
}

async function lookupEpisodeById(
  db: D1Database,
  workspaceId: string,
  episodeId: string | null | undefined
): Promise<EpisodeIdLookup | null> {
  if (!episodeId) return null;
  const row = await db
    .prepare('SELECT id, episode_code FROM episodes WHERE workspace_id = ? AND id = ? LIMIT 1')
    .bind(workspaceId, episodeId)
    .first<EpisodeIdLookup>();
  return row ?? null;
}

/**
 * Resolve both `first_touch_episode_id` and `last_touch_episode_id` strictly within `workspaceId`.
 *
 * Resolution rules:
 * 1. Prior touchpoints for `visitor_id` (preferred) or `visitor_hash` define chronological
 *    first-touch and last-touch history.
 * 2. Prior conversions for `customer_hash` (e.g., an earlier WhatsApp `lead` -> later Midtrans `paid`)
 *    anchor `first_touch_episode_id` across devices and browsers!
 * 3. Explicit `explicitFirstEp` (`ef_ft_ep`) supplies first-touch when no earlier DB history exists.
 * 4. Explicit `explicitLastEp` (`ef_ep`) always sets `last_touch_episode_id` when valid in the workspace.
 * 5. If only one of first/last touch is resolved, both fields mirror that episode.
 */
export async function resolveAttribution(
  db: D1Database,
  workspaceId: string,
  input: AttributionInput
): Promise<AttributionResolution> {
  const [explicitLast, explicitFirst] = await Promise.all([
    resolveEpisodeInWorkspace(db, workspaceId, input.explicitLastEp),
    resolveEpisodeInWorkspace(db, workspaceId, input.explicitFirstEp),
  ]);

  let historyFirst: EpisodeIdLookup | null = null;
  let historyLast: EpisodeIdLookup | null = null;

  if (input.visitorId) {
    const firstTp = await db
      .prepare(
        'SELECT episode_id FROM touchpoints WHERE workspace_id = ? AND visitor_id = ? ORDER BY created_at ASC LIMIT 1'
      )
      .bind(workspaceId, input.visitorId)
      .first<{ episode_id: string }>();
    const lastTp = await db
      .prepare(
        'SELECT episode_id FROM touchpoints WHERE workspace_id = ? AND visitor_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(workspaceId, input.visitorId)
      .first<{ episode_id: string }>();

    historyFirst = await lookupEpisodeById(db, workspaceId, firstTp?.episode_id);
    historyLast = await lookupEpisodeById(db, workspaceId, lastTp?.episode_id);
  } else if (input.visitorHash) {
    const firstTp = await db
      .prepare(
        'SELECT episode_id FROM touchpoints WHERE workspace_id = ? AND visitor_hash = ? ORDER BY created_at ASC LIMIT 1'
      )
      .bind(workspaceId, input.visitorHash)
      .first<{ episode_id: string }>();
    const lastTp = await db
      .prepare(
        'SELECT episode_id FROM touchpoints WHERE workspace_id = ? AND visitor_hash = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(workspaceId, input.visitorHash)
      .first<{ episode_id: string }>();

    historyFirst = await lookupEpisodeById(db, workspaceId, firstTp?.episode_id);
    historyLast = await lookupEpisodeById(db, workspaceId, lastTp?.episode_id);
  }

  let customerFirst: EpisodeIdLookup | null = null;
  let customerLast: EpisodeIdLookup | null = null;
  if (input.customerHash) {
    const prevConv = await db
      .prepare(
        `SELECT first_touch_episode_id, last_touch_episode_id
         FROM conversions
         WHERE workspace_id = ? AND customer_hash = ?
         ORDER BY occurred_at ASC
         LIMIT 1`
      )
      .bind(workspaceId, input.customerHash)
      .first<{ first_touch_episode_id: string | null; last_touch_episode_id: string | null }>();

    if (prevConv) {
      customerFirst = await lookupEpisodeById(
        db,
        workspaceId,
        prevConv.first_touch_episode_id ?? prevConv.last_touch_episode_id
      );
      customerLast = await lookupEpisodeById(
        db,
        workspaceId,
        prevConv.last_touch_episode_id ?? prevConv.first_touch_episode_id
      );
    }
  }

  // First-touch priority: earlier customer conversion > earlier visitor touchpoint > explicit ef_ft_ep > explicit ef_ep
  const firstTouch = customerFirst ?? historyFirst ?? explicitFirst ?? explicitLast ?? null;
  // Last-touch priority: explicit ef_ep > latest visitor touchpoint > earlier customer conversion > explicit ef_ft_ep
  const lastTouch = explicitLast ?? historyLast ?? customerLast ?? explicitFirst ?? null;

  return {
    first_touch_episode_id: firstTouch?.id ?? null,
    last_touch_episode_id: lastTouch?.id ?? null,
    first_touch_episode_code: firstTouch?.episode_code ?? null,
    last_touch_episode_code: lastTouch?.episode_code ?? null,
  };
}

/** Record a first-party pageview or redirect touchpoint and optionally increment shortlink counter. */
export async function recordTouchpoint(
  db: D1Database,
  params: {
    id?: string;
    workspaceId: string;
    episodeId: string;
    shortlinkCode?: string | null;
    visitorId?: string | null;
    visitorHash: string;
    touchType: 'redirect' | 'pageview';
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    referrer?: string | null;
    country?: string | null;
    createdAt?: string;
  }
): Promise<string> {
  const id = params.id ?? generateId('tp', 14);
  const createdAt = params.createdAt ?? new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO touchpoints (
        id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash,
        touch_type, utm_source, utm_medium, utm_campaign, referrer, country, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.workspaceId,
      params.episodeId,
      params.shortlinkCode ?? null,
      params.visitorId ?? null,
      params.visitorHash,
      params.touchType,
      params.utmSource ?? null,
      params.utmMedium ?? null,
      params.utmCampaign ?? null,
      params.referrer ?? null,
      params.country ?? null,
      createdAt
    )
    .run();

  if (params.shortlinkCode) {
    await db
      .prepare('UPDATE shortlinks SET clicks_count = clicks_count + 1 WHERE code = ? AND workspace_id = ?')
      .bind(params.shortlinkCode, params.workspaceId)
      .run();
  }

  return id;
}
