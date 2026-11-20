import { describe, expect, it } from 'vitest';
import { computeSameAgeCohorts } from '../src/services/cohort';
import { buildWorkspaceDashboard } from '../src/services/insights';
import { createTestEnv, seedTestWorkspace } from './helpers/test-env';

describe('Same-Age Cohort Velocity Engine (D+1 / D+3 / D+7) & Insights', () => {
  it('compares episodes strictly within identical age cutoffs and computes vs_prev, vs_median5, RPM, and vanity traps', async () => {
    const { env } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_coh',
      slug: 'cohort-demo',
      name: 'Cohort Demo',
      apiKey: 'key_coh',
      webhookSecret: 'sec_coh',
    });

    // Seed 6 historical episodes + 1 recent breakout episode aged 4 days (as_of = 2026-11-20T08:00:00Z)
    await env.DB.prepare(
      `INSERT INTO episodes (id, workspace_id, episode_code, title, platform, target_url, published_at) VALUES
      ('e1', 'ws_coh', 'ep-01', 'Ep 1', 'tiktok', 'https://a.id', '2026-10-20T08:00:00Z'),
      ('e2', 'ws_coh', 'ep-02', 'Ep 2', 'instagram', 'https://a.id', '2026-10-25T08:00:00Z'),
      ('e3', 'ws_coh', 'ep-03', 'Ep 3', 'tiktok', 'https://a.id', '2026-10-30T08:00:00Z'),
      ('e4', 'ws_coh', 'ep-04', 'Ep 4', 'youtube', 'https://a.id', '2026-11-04T08:00:00Z'),
      ('e5', 'ws_coh', 'ep-05', 'Ep 5', 'linkedin', 'https://a.id', '2026-11-08T08:00:00Z'),
      ('e6', 'ws_coh', 'ep-06', 'Ep 6', 'instagram', 'https://a.id', '2026-11-11T08:00:00Z'),
      ('e7', 'ws_coh', 'ep-07', 'Ep 7', 'linkedin', 'https://a.id', '2026-11-16T08:00:00Z')`
    ).run();

    // D+3 snapshots (e3 is a massive 200k-view vanity video, e7 is 8k-view high-intent)
    await env.DB.prepare(
      `INSERT INTO metric_snapshots (id, workspace_id, episode_id, age_days, captured_at, views) VALUES
      ('s1', 'ws_coh', 'e1', 3, '2026-10-23T08:00:00Z', 80000),
      ('s2', 'ws_coh', 'e2', 3, '2026-10-28T08:00:00Z', 10000),
      ('s3', 'ws_coh', 'e3', 3, '2026-11-02T08:00:00Z', 200000),
      ('s4', 'ws_coh', 'e4', 3, '2026-11-07T08:00:00Z', 7000),
      ('s5', 'ws_coh', 'e5', 3, '2026-11-11T08:00:00Z', 6000),
      ('s6', 'ws_coh', 'e6', 3, '2026-11-14T08:00:00Z', 12000),
      ('s7', 'ws_coh', 'e7', 3, '2026-11-19T08:00:00Z', 8000)`
    ).run();

    // Touchpoints: 100 clicks for e3 within D+3; 50 clicks for e7 within D+3
    for (let i = 0; i < 100; i++) {
      await env.DB.prepare(
        `INSERT INTO touchpoints (id, workspace_id, episode_id, visitor_hash, created_at)
         VALUES (?, 'ws_coh', 'e3', ?, '2026-10-31T10:00:00Z')`
      )
        .bind(`t_e3_${i}`, `vh_${i}`)
        .run();
    }
    for (let i = 0; i < 50; i++) {
      await env.DB.prepare(
        `INSERT INTO touchpoints (id, workspace_id, episode_id, visitor_hash, created_at)
         VALUES (?, 'ws_coh', 'e7', ?, '2026-11-17T10:00:00Z')`
      )
        .bind(`t_e7_${i}`, `vh7_${i}`)
        .run();
    }

    // Paid conversions within D+3:
    // e1: 1M, e2: 2M, e3: 500k (1 paid / 100 clicks = 1%), e4: 3M, e5: 4M, e6: 2.5M -> median5(e2..e6) = 2.5M!
    // Also add a LATE conversion on e2 at D+10 (MUST NOT leak into D+3!)
    await env.DB.prepare(
      `INSERT INTO conversions (
        id, workspace_id, external_id, provider, stage, customer_hash,
        first_touch_episode_id, last_touch_episode_id, currency, amount, amount_idr, occurred_at
      ) VALUES
      ('c1', 'ws_coh', 'o1', 'qris', 'paid', 'u1', 'e1', 'e1', 'IDR', 1000000, 1000000, '2026-10-21T10:00:00Z'),
      ('c2', 'ws_coh', 'o2', 'qris', 'paid', 'u2', 'e2', 'e2', 'IDR', 2000000, 2000000, '2026-10-26T10:00:00Z'),
      ('c2_late', 'ws_coh', 'o2_late', 'qris', 'paid', 'u2b', 'e2', 'e2', 'IDR', 99000000, 99000000, '2026-11-05T10:00:00Z'),
      ('c3', 'ws_coh', 'o3', 'qris', 'paid', 'u3', 'e3', 'e3', 'IDR', 500000, 500000, '2026-11-01T10:00:00Z'),
      ('c4', 'ws_coh', 'o4', 'qris', 'paid', 'u4', 'e4', 'e4', 'IDR', 3000000, 3000000, '2026-11-06T10:00:00Z'),
      ('c5', 'ws_coh', 'o5', 'qris', 'paid', 'u5', 'e5', 'e5', 'IDR', 4000000, 4000000, '2026-11-10T10:00:00Z'),
      ('c6', 'ws_coh', 'o6', 'qris', 'paid', 'u6', 'e6', 'e6', 'IDR', 2500000, 2500000, '2026-11-13T10:00:00Z'),
      ('c7a', 'ws_coh', 'o7a', 'midtrans', 'paid', 'u7a', 'e1', 'e7', 'IDR', 2500000, 2500000, '2026-11-17T12:00:00Z'),
      ('c7b', 'ws_coh', 'o7b', 'midtrans', 'paid', 'u7b', 'e7', 'e7', 'IDR', 2500000, 2500000, '2026-11-18T12:00:00Z')`
    ).run();

    const asOf = '2026-11-20T08:00:00Z';
    const d3 = await computeSameAgeCohorts(env.DB, 'ws_coh', 3, 'last_touch', asOf);
    expect(d3).toHaveLength(7);

    // Verify D+3 excludes c2_late (D+10) from e2!
    const ep2 = d3.find((c) => c.episode_code === 'ep-02');
    expect(ep2?.metrics.revenue_idr).toBe(2000000);

    // Verify e7 D+3 is not eligible for D+7 on 2026-11-20
    const d7 = await computeSameAgeCohorts(env.DB, 'ws_coh', 7, 'last_touch', asOf);
    expect(d7.some((c) => c.episode_code === 'ep-07')).toBe(false);

    // Verify e3 was flagged as VANITY_TRAP
    const ep3 = d3.find((c) => c.episode_code === 'ep-03');
    expect(ep3?.verdict).toBe('VANITY_TRAP');

    // Verify e7 D+3: revenue = 5,000,000 vs e6 (2,500,000 -> +100%), vs median5 (2,500,000 -> +100%) -> BREAKOUT
    const ep7 = d3.find((c) => c.episode_code === 'ep-07');
    expect(ep7?.metrics.revenue_idr).toBe(5000000);
    expect(ep7?.metrics.effective_rpm_idr).toBe(625000);
    expect(ep7?.vs_prev?.revenue_pct).toBe(100);
    expect(ep7?.vs_median5?.sample_size).toBe(5);
    expect(ep7?.vs_median5?.median_revenue_idr).toBe(2500000);
    expect(ep7?.vs_median5?.revenue_pct).toBe(100);
    expect(ep7?.verdict).toBe('BREAKOUT');

    // Verify Executive Insights contrast TikTok (vanity) vs LinkedIn (real revenue) + First-Touch Assist
    const dash = await buildWorkspaceDashboard(env.DB, 'ws_coh', 'last_touch', asOf);
    expect(dash.insights.some((i) => i.id === 'vanity-vs-revenue')).toBe(true);
    expect(dash.insights.some((i) => i.id === 'cohort-d3-velocity')).toBe(true);
    expect(dash.insights.some((i) => i.id === 'first-touch-assist')).toBe(true);
  });
});
