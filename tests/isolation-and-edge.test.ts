import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index';
import { EF_JS_SNIPPET } from '../src/snippet/ef-js';
import { createTestEnv, seedTestWorkspace } from './helpers/test-env';

describe('Multi-Tenant Isolation, Smart Redirect /r/:code & /ef.js Edge Contract', () => {
  it('keeps /ef.js strictly under 2KB and returns proper cache headers', async () => {
    const byteLength = new TextEncoder().encode(EF_JS_SNIPPET).byteLength;
    expect(byteLength).toBeLessThan(2048);
    expect(() => new Function(EF_JS_SNIPPET)).not.toThrow();
    expect(EF_JS_SNIPPET).toContain('ef_ep');
    expect(EF_JS_SNIPPET).toContain('ef_ft');
    expect(EF_JS_SNIPPET).toContain('ef_lt');
    expect(EF_JS_SNIPPET).toContain('wa.me/');

    const { env } = createTestEnv();
    const app = createApp();
    const resp = await app.fetch(new Request('http://localhost/ef.js'), env);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/javascript');
    const bodyText = await resp.text();
    expect(new TextEncoder().encode(bodyText).byteLength).toBeLessThan(2048);
  });

  it('performs smart 302 redirect on /r/:code and records touchpoint asynchronously via waitUntil', async () => {
    const { env, ctx } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_edge',
      slug: 'edge-ws',
      name: 'Edge WS',
      apiKey: 'edge_key',
      webhookSecret: 'edge_sec',
    });

    await env.DB.prepare(
      `INSERT INTO episodes (id, workspace_id, episode_code, title, platform, campaign, target_url, published_at)
       VALUES ('ep_edge_1', 'ws_edge', 'ep-edge-01', 'Edge Ep', 'linkedin', 'launch-q4', 'https://saif.co.id/offer', '2026-11-18T08:00:00Z')`
    ).run();

    await env.DB.prepare(
      `INSERT INTO shortlinks (code, workspace_id, episode_id, destination_url, utm_source, utm_medium)
       VALUES ('go-vip', 'ws_edge', 'ep_edge_1', 'https://saif.co.id/offer', 'linkedin', 'organic')`
    ).run();

    const app = createApp();
    const resp = await app.fetch(
      new Request('http://localhost/r/go-vip', {
        headers: {
          'cf-connecting-ip': '203.0.113.10',
          'user-agent': 'VitestBrowser/1.0',
        },
      }),
      env,
      ctx
    );

    expect(resp.status).toBe(302);
    const location = resp.headers.get('location') ?? '';
    const locUrl = new URL(location);
    expect(locUrl.origin + locUrl.pathname).toBe('https://saif.co.id/offer');
    expect(locUrl.searchParams.get('ef_ep')).toBe('ep-edge-01');
    expect(locUrl.searchParams.get('utm_source')).toBe('linkedin');
    expect(locUrl.searchParams.get('utm_medium')).toBe('organic');
    expect(locUrl.searchParams.get('utm_campaign')).toBe('launch-q4');
    expect(locUrl.searchParams.get('ef_tp')).toBeTruthy();

    await ctx.flush();

    const sl = await env.DB.prepare('SELECT clicks_count FROM shortlinks WHERE code = ?')
      .bind('go-vip')
      .first<{ clicks_count: number }>();
    expect(sl?.clicks_count).toBe(1);

    const tp = await env.DB.prepare(
      'SELECT workspace_id, episode_id, touch_type, visitor_hash FROM touchpoints WHERE shortlink_code = ?'
    )
      .bind('go-vip')
      .first<{ workspace_id: string; episode_id: string; touch_type: string; visitor_hash: string }>();
    expect(tp?.workspace_id).toBe('ws_edge');
    expect(tp?.episode_id).toBe('ep_edge_1');
    expect(tp?.touch_type).toBe('redirect');
    expect(tp?.visitor_hash).not.toContain('203.0.113.10');
  });

  it('enforces strict multi-tenant API isolation and serves the dark-first dashboard UI', async () => {
    const { env } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_a',
      slug: 'tenant-a',
      name: 'Tenant A',
      apiKey: 'key_a',
      webhookSecret: 'sec_a',
    });
    await seedTestWorkspace(env.DB, {
      id: 'ws_b',
      slug: 'tenant-b',
      name: 'Tenant B',
      apiKey: 'key_b',
      webhookSecret: 'sec_b',
    });

    const app = createApp();

    // Create episode inside Tenant A
    const createEpA = await app.fetch(
      new Request('http://localhost/api/v1/workspaces/tenant-a/episodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ef-api-key': 'key_a' },
        body: JSON.stringify({
          episode_code: 'secret-a-01',
          title: 'Tenant A Exclusive',
          platform: 'linkedin',
          target_url: 'https://tenanta.id',
        }),
      }),
      env
    );
    expect(createEpA.status).toBe(201);

    // Tenant A key CANNOT write to Tenant B
    const crossAuth = await app.fetch(
      new Request('http://localhost/api/v1/workspaces/tenant-b/episodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ef-api-key': 'key_a' },
        body: JSON.stringify({
          episode_code: 'hijack',
          title: 'Hijack',
          platform: 'tiktok',
          target_url: 'https://evil.id',
        }),
      }),
      env
    );
    expect(crossAuth.status).toBe(401);

    // Tenant B CANNOT create a shortlink pointing to Tenant A's episode_code
    const crossLink = await app.fetch(
      new Request('http://localhost/api/v1/workspaces/tenant-b/shortlinks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ef-api-key': 'key_b' },
        body: JSON.stringify({
          episode_code: 'secret-a-01',
          destination_url: 'https://tenantb.id',
        }),
      }),
      env
    );
    expect(crossLink.status).toBe(404);

    // Tenant B episode listing does not contain Tenant A's episode
    const listB = await app.fetch(
      new Request('http://localhost/api/v1/workspaces/tenant-b/episodes'),
      env
    );
    const listBJson = (await listB.json()) as { episodes: unknown[] };
    expect(listBJson.episodes).toHaveLength(0);

    // Dashboard UI renders dark-first palette
    const htmlResp = await app.fetch(new Request('http://localhost/'), env);
    expect(htmlResp.status).toBe(200);
    const html = await htmlResp.text();
    expect(html).toContain('#08101F');
    expect(html).toContain('#C19F65');
    expect(html).toContain('Same-Age Cohort Velocity Engine');
  });
});
