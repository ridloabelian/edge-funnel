import { Hono } from 'hono';
import type { Env } from '../types';
import { buildDailyVisitorHash } from '../utils/crypto';
import { generateId } from '../utils/id';
import { EF_JS_SNIPPET } from '../snippet/ef-js';
import { recordTouchpoint, resolveEpisodeInWorkspace } from '../services/attribution';
import { getWorkspaceBySlug } from '../services/workspace';

export const edgeRoutes = new Hono<{ Bindings: Env }>();

interface ShortlinkLookupRow {
  code: string;
  workspace_id: string;
  episode_id: string;
  destination_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string | null;
  episode_code: string;
  ep_campaign: string;
}

function scheduleBackground(
  c: { executionCtx?: { waitUntil: (promise: Promise<unknown>) => void } },
  promise: Promise<unknown>
): void {
  try {
    if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(promise);
      return;
    }
  } catch {
    // Fallback when running outside Worker ExecutionContext
  }
  void promise;
}

/** Ultra-light (<2KB) first-party attribution script. */
edgeRoutes.get('/ef.js', (c) => {
  return c.body(EF_JS_SNIPPET, 200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
  });
});

/**
 * Smart edge redirect (<10ms hot path):
 * Resolves shortlink via single indexed D1 read, injects `ef_ep` + `utm_*`,
 * returns HTTP 302 immediately, and writes touchpoint + click counter in `waitUntil`.
 */
edgeRoutes.get('/r/:code', async (c) => {
  const code = c.req.param('code');
  const row = await c.env.DB.prepare(
    `SELECT s.code, s.workspace_id, s.episode_id, s.destination_url,
            s.utm_source, s.utm_medium, s.utm_campaign,
            e.episode_code, e.campaign AS ep_campaign
     FROM shortlinks s
     JOIN episodes e ON e.id = s.episode_id
     WHERE s.code = ? AND s.is_active = 1
     LIMIT 1`
  )
    .bind(code)
    .first<ShortlinkLookupRow>();

  if (!row) {
    return c.json({ error: 'Shortlink not found' }, 404);
  }

  const touchpointId = generateId('tp', 14);
  const dest = new URL(row.destination_url);
  if (!dest.searchParams.has('ef_ep')) dest.searchParams.set('ef_ep', row.episode_code);
  if (!dest.searchParams.has('utm_source')) dest.searchParams.set('utm_source', row.utm_source);
  if (!dest.searchParams.has('utm_medium')) dest.searchParams.set('utm_medium', row.utm_medium);
  const campaign = row.utm_campaign ?? row.ep_campaign;
  if (campaign && !dest.searchParams.has('utm_campaign')) {
    dest.searchParams.set('utm_campaign', campaign);
  }
  dest.searchParams.set('ef_tp', touchpointId);

  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';
  const ua = c.req.header('user-agent') ?? 'unknown';
  const referer = c.req.header('referer') ?? null;
  const country = c.req.header('cf-ipcountry') ?? null;

  const asyncWrite = (async () => {
    const visitorHash = await buildDailyVisitorHash(row.workspace_id, ip, ua);
    await recordTouchpoint(c.env.DB, {
      id: touchpointId,
      workspaceId: row.workspace_id,
      episodeId: row.episode_id,
      shortlinkCode: row.code,
      visitorHash,
      touchType: 'redirect',
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: campaign,
      referrer: referer,
      country,
    });
  })();

  scheduleBackground(c, asyncWrite);

  return c.redirect(dest.toString(), 302);
});

/** First-party pageview collect beacon fired by `/ef.js`. */
edgeRoutes.post('/api/v1/collect', async (c) => {
  const raw = await c.req.text();
  if (!raw) {
    return c.json({ ok: false, error: 'Empty beacon body' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const wsSlug =
    typeof body.ws === 'string' && body.ws.trim()
      ? body.ws.trim()
      : (c.env.DEFAULT_WORKSPACE_SLUG ?? 'saif-growth');
  const epCode = typeof body.ep === 'string' ? body.ep.trim() : '';

  if (!epCode) {
    return c.json({ ok: false, error: 'Missing ep parameter' }, 400);
  }

  const ws = await getWorkspaceBySlug(c.env.DB, wsSlug);
  if (!ws) {
    return c.json({ ok: false, error: 'Workspace not found' }, 404);
  }

  const ep = await resolveEpisodeInWorkspace(c.env.DB, ws.id, epCode);
  if (!ep) {
    return c.json({ ok: false, error: 'Episode not found in workspace' }, 404);
  }

  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';
  const ua = c.req.header('user-agent') ?? 'unknown';
  const visitorHash = await buildDailyVisitorHash(ws.id, ip, ua);

  const id = await recordTouchpoint(c.env.DB, {
    workspaceId: ws.id,
    episodeId: ep.id,
    visitorId: typeof body.vid === 'string' && body.vid.trim() ? body.vid.trim() : null,
    visitorHash,
    touchType: 'pageview',
    utmSource: typeof body.src === 'string' && body.src.trim() ? body.src.trim() : null,
    utmMedium: typeof body.med === 'string' && body.med.trim() ? body.med.trim() : null,
    utmCampaign: typeof body.cmp === 'string' && body.cmp.trim() ? body.cmp.trim() : null,
    referrer: typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : null,
    country: c.req.header('cf-ipcountry') ?? null,
  });

  return c.json({ ok: true, touchpoint_id: id, workspace: ws.slug, episode_code: ep.episode_code }, 202);
});
