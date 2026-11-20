import { Hono } from 'hono';
import type { AttributionModel, CohortDay, Env, WorkspaceRow } from '../types';
import { sha256Hex } from '../utils/crypto';
import { generateId, generateShortCode } from '../utils/id';
import { computeSameAgeCohorts } from '../services/cohort';
import { buildWorkspaceDashboard } from '../services/insights';
import { syncPullEndpoints } from '../services/pull-sync';
import { buildCohortReportText, dispatchWorkspaceReport } from '../services/reporter';
import { resolveEpisodeInWorkspace } from '../services/attribution';
import { getWorkspaceBySlug, listWorkspaces, verifyWorkspaceApiKey } from '../services/workspace';

export const apiRoutes = new Hono<{ Bindings: Env }>();

function extractApiKey(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const xKey = c.req.header('x-ef-api-key');
  if (xKey) return xKey;
  const auth = c.req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

async function requireAuthorizedWorkspace(
  c: {
    env: Env;
    req: { param: (k: string) => string; header: (name: string) => string | undefined };
    json: (data: unknown, status?: number) => Response;
  }
): Promise<{ ws: WorkspaceRow } | { error: Response }> {
  const slug = c.req.param('slug');
  const ws = await getWorkspaceBySlug(c.env.DB, slug);
  if (!ws) {
    return { error: c.json({ error: 'Workspace not found' }, 404) };
  }
  const providedKey = extractApiKey(c);
  const authorized = await verifyWorkspaceApiKey(ws, providedKey, c.env);
  if (!authorized) {
    return { error: c.json({ error: 'Unauthorized: invalid workspace API key' }, 401) };
  }
  return { ws };
}

function parseModel(raw: string | undefined): AttributionModel {
  return raw === 'first_touch' ? 'first_touch' : 'last_touch';
}

function parseCohortDay(raw: string | undefined): CohortDay {
  if (raw === '1') return 1;
  if (raw === '7') return 7;
  return 3;
}

/** Health check endpoint */
apiRoutes.get('/api/v1/health', (c) => {
  return c.json({
    ok: true,
    service: 'edge-funnel',
    timestamp: new Date().toISOString(),
  });
});

/** List workspaces (public non-secret metadata) */
apiRoutes.get('/api/v1/workspaces', async (c) => {
  const items = await listWorkspaces(c.env.DB);
  return c.json({ workspaces: items });
});

/** Provision a new isolated workspace tenant */
apiRoutes.post('/api/v1/workspaces', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.slug !== 'string' || typeof body.name !== 'string') {
    return c.json({ error: 'slug and name are required' }, 400);
  }

  const slug = body.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
    return c.json({ error: 'Invalid workspace slug format (lowercase alphanumeric & hyphen)' }, 400);
  }

  const existing = await getWorkspaceBySlug(c.env.DB, slug);
  if (existing) {
    return c.json({ error: 'Workspace slug already exists' }, 409);
  }

  const rawApiKey =
    typeof body.api_key === 'string' && body.api_key.trim()
      ? body.api_key.trim()
      : generateId('efk', 24);
  const webhookSecret =
    typeof body.webhook_secret === 'string' && body.webhook_secret.trim()
      ? body.webhook_secret.trim()
      : generateId('whsec', 24);

  const id = generateId('ws', 10);
  const apiKeyHash = await sha256Hex(rawApiKey);
  const currency = body.default_currency === 'USD' ? 'USD' : 'IDR';
  const timezone =
    typeof body.timezone === 'string' && body.timezone.trim()
      ? body.timezone.trim()
      : 'Asia/Jakarta';

  await c.env.DB.prepare(
    `INSERT INTO workspaces (
      id, slug, name, api_key_hash, webhook_secret, default_currency, timezone,
      pull_signups_url, pull_orders_url, pull_bearer_token, settings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      slug,
      body.name.trim(),
      apiKeyHash,
      webhookSecret,
      currency,
      timezone,
      typeof body.pull_signups_url === 'string' ? body.pull_signups_url.trim() : null,
      typeof body.pull_orders_url === 'string' ? body.pull_orders_url.trim() : null,
      typeof body.pull_bearer_token === 'string' ? body.pull_bearer_token.trim() : null,
      JSON.stringify(
        body.settings && typeof body.settings === 'object' ? body.settings : {}
      )
    )
    .run();

  return c.json(
    {
      workspace: {
        id,
        slug,
        name: body.name.trim(),
        default_currency: currency,
        timezone,
      },
      credentials: {
        api_key: rawApiKey,
        webhook_secret: webhookSecret,
      },
    },
    201
  );
});

/** Executive Dashboard payload (funnel, platforms, insights, cohorts D+1/D+3/D+7) */
apiRoutes.get('/api/v1/workspaces/:slug/dashboard', async (c) => {
  const ws = await getWorkspaceBySlug(c.env.DB, c.req.param('slug'));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  const model = parseModel(c.req.query('model'));
  const asOf = c.req.query('as_of') || new Date().toISOString();
  const dashboard = await buildWorkspaceDashboard(c.env.DB, ws.id, model, asOf);

  return c.json({
    workspace: {
      id: ws.id,
      slug: ws.slug,
      name: ws.name,
      default_currency: ws.default_currency,
      timezone: ws.timezone,
      last_pull_sync_at: ws.last_pull_sync_at,
    },
    ...dashboard,
  });
});

/** Same-Age Cohort comparison API (`?day=1|3|7&model=last_touch|first_touch`) */
apiRoutes.get('/api/v1/workspaces/:slug/cohorts', async (c) => {
  const ws = await getWorkspaceBySlug(c.env.DB, c.req.param('slug'));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  const day = parseCohortDay(c.req.query('day'));
  const model = parseModel(c.req.query('model'));
  const asOf = c.req.query('as_of') || new Date().toISOString();
  const cohorts = await computeSameAgeCohorts(c.env.DB, ws.id, day, model, asOf);

  return c.json({
    workspace_slug: ws.slug,
    age_days: day,
    model,
    as_of: asOf,
    cohorts,
  });
});

/** List episodes strictly scoped to the workspace */
apiRoutes.get('/api/v1/workspaces/:slug/episodes', async (c) => {
  const ws = await getWorkspaceBySlug(c.env.DB, c.req.param('slug'));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  const res = await c.env.DB.prepare(
    'SELECT * FROM episodes WHERE workspace_id = ? ORDER BY published_at DESC'
  )
    .bind(ws.id)
    .all();

  return c.json({ workspace_slug: ws.slug, episodes: res.results });
});

/** Create an episode inside the authenticated workspace */
apiRoutes.post('/api/v1/workspaces/:slug/episodes', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.episode_code !== 'string' ||
    typeof body.title !== 'string' ||
    typeof body.platform !== 'string' ||
    typeof body.target_url !== 'string'
  ) {
    return c.json(
      { error: 'episode_code, title, platform, and target_url are required' },
      400
    );
  }

  const id = generateId('ep', 10);
  const episodeCode = body.episode_code.trim();
  const publishedAt =
    typeof body.published_at === 'string' && body.published_at.trim()
      ? body.published_at.trim()
      : new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO episodes (
        id, workspace_id, episode_code, title, platform, campaign, content_type, target_url, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        auth.ws.id,
        episodeCode,
        body.title.trim(),
        body.platform.trim().toLowerCase(),
        typeof body.campaign === 'string' && body.campaign.trim() ? body.campaign.trim() : 'general',
        typeof body.content_type === 'string' && body.content_type.trim()
          ? body.content_type.trim()
          : 'video',
        body.target_url.trim(),
        publishedAt
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create episode';
    if (msg.toLowerCase().includes('unique')) {
      return c.json({ error: `Episode code '${episodeCode}' already exists in workspace` }, 409);
    }
    throw err;
  }

  return c.json(
    {
      episode: {
        id,
        workspace_id: auth.ws.id,
        episode_code: episodeCode,
        title: body.title.trim(),
        platform: body.platform.trim().toLowerCase(),
        published_at: publishedAt,
      },
    },
    201
  );
});

/** List shortlinks scoped to the workspace */
apiRoutes.get('/api/v1/workspaces/:slug/shortlinks', async (c) => {
  const ws = await getWorkspaceBySlug(c.env.DB, c.req.param('slug'));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  const res = await c.env.DB.prepare(
    `SELECT s.*, e.episode_code, e.platform
     FROM shortlinks s
     JOIN episodes e ON e.id = s.episode_id
     WHERE s.workspace_id = ?
     ORDER BY s.created_at DESC`
  )
    .bind(ws.id)
    .all();

  return c.json({ workspace_slug: ws.slug, shortlinks: res.results });
});

/** Create a shortlink scoped strictly to an episode in the authenticated workspace */
apiRoutes.post('/api/v1/workspaces/:slug/shortlinks', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.episode_code !== 'string' || typeof body.destination_url !== 'string') {
    return c.json({ error: 'episode_code and destination_url are required' }, 400);
  }

  const ep = await resolveEpisodeInWorkspace(c.env.DB, auth.ws.id, body.episode_code);
  if (!ep) {
    return c.json(
      { error: 'Episode not found in this workspace (cross-tenant access denied)' },
      404
    );
  }

  const code =
    typeof body.code === 'string' && body.code.trim()
      ? body.code.trim().replace(/[^a-zA-Z0-9_-]/g, '')
      : generateShortCode(6);

  if (!code) {
    return c.json({ error: 'Invalid shortlink code' }, 400);
  }

  const utmSource =
    typeof body.utm_source === 'string' && body.utm_source.trim()
      ? body.utm_source.trim()
      : 'social';
  const utmMedium =
    typeof body.utm_medium === 'string' && body.utm_medium.trim()
      ? body.utm_medium.trim()
      : 'organic';

  try {
    await c.env.DB.prepare(
      `INSERT INTO shortlinks (
        code, workspace_id, episode_id, destination_url, utm_source, utm_medium, utm_campaign, utm_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        code,
        auth.ws.id,
        ep.id,
        body.destination_url.trim(),
        utmSource,
        utmMedium,
        typeof body.utm_campaign === 'string' && body.utm_campaign.trim()
          ? body.utm_campaign.trim()
          : null,
        typeof body.utm_content === 'string' && body.utm_content.trim()
          ? body.utm_content.trim()
          : null
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create shortlink';
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('primary')) {
      return c.json({ error: `Shortlink code '${code}' already exists` }, 409);
    }
    throw err;
  }

  const origin = new URL(c.req.url).origin;
  return c.json(
    {
      shortlink: {
        code,
        short_url: `${origin}/r/${code}`,
        episode_code: ep.episode_code,
        destination_url: body.destination_url.trim(),
        utm_source: utmSource,
        utm_medium: utmMedium,
      },
    },
    201
  );
});

/** Upsert a D+1 / D+3 / D+7 social metric snapshot for an episode in the workspace */
apiRoutes.post('/api/v1/workspaces/:slug/snapshots', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.episode_code !== 'string' || typeof body.age_days !== 'number') {
    return c.json({ error: 'episode_code and numeric age_days are required' }, 400);
  }

  const ep = await resolveEpisodeInWorkspace(c.env.DB, auth.ws.id, body.episode_code);
  if (!ep) {
    return c.json({ error: 'Episode not found in workspace' }, 404);
  }

  const id = generateId('snap', 12);
  const capturedAt =
    typeof body.captured_at === 'string' && body.captured_at.trim()
      ? body.captured_at.trim()
      : new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO metric_snapshots (
      id, workspace_id, episode_id, age_days, captured_at,
      views, likes, comments, shares, saves, followers_gained
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, episode_id, age_days) DO UPDATE SET
      captured_at = excluded.captured_at,
      views = excluded.views,
      likes = excluded.likes,
      comments = excluded.comments,
      shares = excluded.shares,
      saves = excluded.saves,
      followers_gained = excluded.followers_gained`
  )
    .bind(
      id,
      auth.ws.id,
      ep.id,
      Math.max(0, Math.floor(body.age_days)),
      capturedAt,
      Number(body.views ?? 0) || 0,
      Number(body.likes ?? 0) || 0,
      Number(body.comments ?? 0) || 0,
      Number(body.shares ?? 0) || 0,
      Number(body.saves ?? 0) || 0,
      Number(body.followers_gained ?? 0) || 0
    )
    .run();

  return c.json({ ok: true, episode_code: ep.episode_code, age_days: Math.floor(body.age_days) });
});

/** List masked conversions strictly for the authenticated workspace */
apiRoutes.get('/api/v1/workspaces/:slug/conversions', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const res = await c.env.DB.prepare(
    `SELECT id, external_id, provider, stage, customer_ref, visitor_id,
            first_touch_episode_id, last_touch_episode_id,
            utm_source, utm_medium, utm_campaign, currency, amount, amount_idr, occurred_at
     FROM conversions
     WHERE workspace_id = ?
     ORDER BY occurred_at DESC
     LIMIT 100`
  )
    .bind(auth.ws.id)
    .all();

  return c.json({ workspace_slug: auth.ws.slug, conversions: res.results });
});

/** Trigger 2-Endpoint Pull Sync (`/ef/signups` & `/ef/orders`) on demand */
apiRoutes.post('/api/v1/workspaces/:slug/pull-sync', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const wsCopy: WorkspaceRow = {
    ...auth.ws,
    pull_signups_url:
      typeof body.pull_signups_url === 'string' && body.pull_signups_url.trim()
        ? body.pull_signups_url.trim()
        : auth.ws.pull_signups_url,
    pull_orders_url:
      typeof body.pull_orders_url === 'string' && body.pull_orders_url.trim()
        ? body.pull_orders_url.trim()
        : auth.ws.pull_orders_url,
  };

  const summary = await syncPullEndpoints(c.env.DB, wsCopy, c.env);
  return c.json(summary);
});

/** Preview formatted WhatsApp (`waflare`) & Telegram Cron Report Card */
apiRoutes.get('/api/v1/workspaces/:slug/reports/preview', async (c) => {
  const ws = await getWorkspaceBySlug(c.env.DB, c.req.param('slug'));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  const reportText = await buildCohortReportText(c.env.DB, ws);
  return c.json({ workspace_slug: ws.slug, report_text: reportText });
});

/** Dispatch WhatsApp (`waflare`) & Telegram report card immediately (authenticated) */
apiRoutes.post('/api/v1/workspaces/:slug/reports/dispatch', async (c) => {
  const auth = await requireAuthorizedWorkspace(c);
  if ('error' in auth) return auth.error;

  const result = await dispatchWorkspaceReport(c.env.DB, auth.ws);
  return c.json(result);
});

/**
 * Built-in Demo Read-Only 2-Endpoint Pull Contract:
 * Demonstrates how any SaaS / Odoo / Astro / Next.js app only needs 2 read-only JSON routes.
 */
apiRoutes.get('/demo-merchant/ef/signups', (c) => {
  const since = c.req.query('since');
  const items = [
    {
      id: 'demo_signup_901',
      occurred_at: '2026-11-18T09:15:00Z',
      stage: 'lead',
      ef_ep: 'ep-07',
      ef_ft_ep: 'ep-01',
      customer_phone: '+6281199887766',
      utm_source: 'linkedin',
      utm_medium: 'organic',
    },
    {
      id: 'demo_signup_902',
      occurred_at: '2026-11-19T14:20:00Z',
      stage: 'qualified',
      ef_ep: 'ep-07',
      ef_ft_ep: 'ep-07',
      customer_email: 'budi.cto@example.id',
      utm_source: 'linkedin',
      utm_medium: 'organic',
    },
  ].filter((item) => !since || item.occurred_at > since);

  return c.json({ items });
});

apiRoutes.get('/demo-merchant/ef/orders', (c) => {
  const since = c.req.query('since');
  const items = [
    {
      id: 'demo_order_901',
      occurred_at: '2026-11-19T16:45:00Z',
      amount: 2500000,
      currency: 'IDR',
      ef_ep: 'ep-07',
      ef_ft_ep: 'ep-01',
      customer_phone: '+6281199887766',
      utm_source: 'linkedin',
      utm_medium: 'organic',
    },
  ].filter((item) => !since || item.occurred_at > since);

  return c.json({ items });
});
