import type { ConversionStage, CurrencyCode, Env, WorkspaceRow } from '../types';
import { recordConversion } from './webhooks';

export interface PullSignupItem {
  id: string;
  occurred_at: string;
  stage?: 'lead' | 'qualified';
  ef_ep?: string;
  ef_ft_ep?: string;
  ef_vid?: string;
  customer_phone?: string;
  customer_email?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface PullOrderItem {
  id: string;
  occurred_at: string;
  amount: number;
  currency?: CurrencyCode;
  ef_ep?: string;
  ef_ft_ep?: string;
  ef_vid?: string;
  customer_phone?: string;
  customer_email?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface PullSyncSummary {
  workspace_slug: string;
  signups_fetched: number;
  signups_inserted: number;
  orders_fetched: number;
  orders_inserted: number;
  synced_at: string;
}

function appendSinceQuery(baseUrl: string, since: string | null): string {
  if (!since) return baseUrl;
  const u = new URL(baseUrl);
  u.searchParams.set('since', since);
  return u.toString();
}

async function fetchEndpointItems<T>(
  url: string,
  bearerToken: string | null,
  fetcher: typeof fetch
): Promise<T[]> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  const resp = await fetcher(url, { headers });
  if (!resp.ok) {
    throw new Error(`Pull endpoint ${url} failed with HTTP ${resp.status}`);
  }
  const payload = (await resp.json()) as unknown;
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

/**
 * Sync conversions from the 2-Endpoint Read-Only Pull Contract:
 *   1. `GET <pull_signups_url>?since=<iso>` -> `lead` / `qualified`
 *   2. `GET <pull_orders_url>?since=<iso>`  -> `paid`
 */
export async function syncPullEndpoints(
  db: D1Database,
  ws: WorkspaceRow,
  env: Env,
  fetcher: typeof fetch = fetch
): Promise<PullSyncSummary> {
  const syncedAt = new Date().toISOString();
  let signupsFetched = 0;
  let signupsInserted = 0;
  let ordersFetched = 0;
  let ordersInserted = 0;

  if (ws.pull_signups_url) {
    const signupsUrl = appendSinceQuery(ws.pull_signups_url, ws.last_pull_sync_at);
    const items = await fetchEndpointItems<PullSignupItem>(signupsUrl, ws.pull_bearer_token, fetcher);
    signupsFetched = items.length;

    for (const item of items) {
      if (!item.id) continue;
      const stage: ConversionStage = item.stage === 'qualified' ? 'qualified' : 'lead';
      const saved = await recordConversion(db, ws.id, env, {
        externalId: String(item.id),
        provider: 'pull_sync',
        stage,
        amount: 0,
        currency: 'IDR',
        occurredAt: item.occurred_at || syncedAt,
        customerPhone: item.customer_phone,
        customerEmail: item.customer_email,
        visitorId: item.ef_vid,
        explicitLastEp: item.ef_ep,
        explicitFirstEp: item.ef_ft_ep,
        utmSource: item.utm_source ?? 'pull_sync',
        utmMedium: item.utm_medium ?? 'signups_endpoint',
        utmCampaign: item.utm_campaign,
      });
      if (!saved.duplicate) signupsInserted += 1;
    }
  }

  if (ws.pull_orders_url) {
    const ordersUrl = appendSinceQuery(ws.pull_orders_url, ws.last_pull_sync_at);
    const items = await fetchEndpointItems<PullOrderItem>(ordersUrl, ws.pull_bearer_token, fetcher);
    ordersFetched = items.length;

    for (const item of items) {
      if (!item.id) continue;
      const saved = await recordConversion(db, ws.id, env, {
        externalId: String(item.id),
        provider: 'pull_sync',
        stage: 'paid',
        amount: Number(item.amount) || 0,
        currency: item.currency === 'USD' ? 'USD' : 'IDR',
        occurredAt: item.occurred_at || syncedAt,
        customerPhone: item.customer_phone,
        customerEmail: item.customer_email,
        visitorId: item.ef_vid,
        explicitLastEp: item.ef_ep,
        explicitFirstEp: item.ef_ft_ep,
        utmSource: item.utm_source ?? 'pull_sync',
        utmMedium: item.utm_medium ?? 'orders_endpoint',
        utmCampaign: item.utm_campaign,
      });
      if (!saved.duplicate) ordersInserted += 1;
    }
  }

  await db
    .prepare('UPDATE workspaces SET last_pull_sync_at = ? WHERE id = ?')
    .bind(syncedAt, ws.id)
    .run();

  return {
    workspace_slug: ws.slug,
    signups_fetched: signupsFetched,
    signups_inserted: signupsInserted,
    orders_fetched: ordersFetched,
    orders_inserted: ordersInserted,
    synced_at: syncedAt,
  };
}
