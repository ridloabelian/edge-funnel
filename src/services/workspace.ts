import type { Env, WorkspaceRow, WorkspaceSettings } from '../types';
import { constantTimeEqual, sha256Hex } from '../utils/crypto';

/** Fetch a workspace by its URL slug. */
export async function getWorkspaceBySlug(db: D1Database, slug: string): Promise<WorkspaceRow | null> {
  const row = await db
    .prepare('SELECT * FROM workspaces WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<WorkspaceRow>();
  return row ?? null;
}

/** Fetch a workspace by its primary ID. */
export async function getWorkspaceById(db: D1Database, id: string): Promise<WorkspaceRow | null> {
  const row = await db
    .prepare('SELECT * FROM workspaces WHERE id = ? LIMIT 1')
    .bind(id)
    .first<WorkspaceRow>();
  return row ?? null;
}

/** List all workspaces (non-secret metadata only). */
export async function listWorkspaces(db: D1Database): Promise<
  Array<{
    id: string;
    slug: string;
    name: string;
    default_currency: string;
    timezone: string;
    last_pull_sync_at: string | null;
    created_at: string;
  }>
> {
  const res = await db
    .prepare(
      'SELECT id, slug, name, default_currency, timezone, last_pull_sync_at, created_at FROM workspaces ORDER BY created_at ASC'
    )
    .all<{
      id: string;
      slug: string;
      name: string;
      default_currency: string;
      timezone: string;
      last_pull_sync_at: string | null;
      created_at: string;
    }>();
  return res.results;
}

/** Parse optional provider-specific settings JSON safely. */
export function parseWorkspaceSettings(ws: WorkspaceRow): WorkspaceSettings {
  try {
    const parsed = JSON.parse(ws.settings_json || '{}') as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as WorkspaceSettings;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Verify a request's bearer or `x-ef-api-key` credential against either the workspace's
 * hashed API key or the optional global `EF_MASTER_API_KEY`.
 */
export async function verifyWorkspaceApiKey(
  ws: WorkspaceRow,
  providedKey: string | null | undefined,
  env: Env
): Promise<boolean> {
  if (!providedKey) return false;
  const cleanKey = providedKey.trim();
  if (!cleanKey) return false;

  if (env.EF_MASTER_API_KEY && constantTimeEqual(cleanKey, env.EF_MASTER_API_KEY)) {
    return true;
  }

  const providedHash = await sha256Hex(cleanKey);
  return constantTimeEqual(providedHash, ws.api_key_hash);
}
