import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, WorkspaceRow } from './types';
import { edgeRoutes } from './routes/edge';
import { webhookRoutes } from './routes/webhooks';
import { apiRoutes } from './routes/api';
import { syncPullEndpoints } from './services/pull-sync';
import { dispatchWorkspaceReport } from './services/reporter';
import { DASHBOARD_HTML } from './ui/dashboard';

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    '/api/v1/collect',
    cors({
      origin: '*',
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  );

  app.get('/', (c) => c.html(DASHBOARD_HTML));

  app.route('/', edgeRoutes);
  app.route('/', webhookRoutes);
  app.route('/', apiRoutes);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const task = (async () => {
      const res = await env.DB.prepare('SELECT * FROM workspaces').all<WorkspaceRow>();
      for (const ws of res.results) {
        if (ws.pull_signups_url || ws.pull_orders_url) {
          await syncPullEndpoints(env.DB, ws, env).catch((err) => {
            console.error(`Pull sync failed for ${ws.slug}:`, err);
          });
        }
        await dispatchWorkspaceReport(env.DB, ws).catch((err) => {
          console.error(`Report dispatch failed for ${ws.slug}:`, err);
        });
      }
    })();
    ctx.waitUntil(task);
  },
};
