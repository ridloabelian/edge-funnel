import { Hono } from 'hono';
import type { Env, WebhookProvider } from '../types';
import { processProviderWebhook } from '../services/webhooks';
import { getWorkspaceBySlug } from '../services/workspace';

export const webhookRoutes = new Hono<{ Bindings: Env }>();

const VALID_PROVIDERS = new Set<WebhookProvider>([
  'waflare',
  'qris',
  'midtrans',
  'xendit',
  'stripe',
  'generic',
]);

webhookRoutes.post('/api/v1/webhooks/:workspaceSlug/:provider', async (c) => {
  const workspaceSlug = c.req.param('workspaceSlug');
  const providerRaw = c.req.param('provider').toLowerCase() as WebhookProvider;

  if (!VALID_PROVIDERS.has(providerRaw)) {
    return c.json(
      {
        ok: false,
        error: `Unsupported provider '${providerRaw}'. Supported: waflare, qris, midtrans, xendit, stripe, generic.`,
      },
      400
    );
  }

  const ws = await getWorkspaceBySlug(c.env.DB, workspaceSlug);
  if (!ws) {
    return c.json({ ok: false, error: 'Workspace not found' }, 404);
  }

  const rawBody = await c.req.text();
  const result = await processProviderWebhook(
    c.env.DB,
    ws,
    providerRaw,
    rawBody,
    c.req.raw.headers,
    c.env
  );

  return c.json(result.body, result.statusCode as 200 | 400 | 401);
});
