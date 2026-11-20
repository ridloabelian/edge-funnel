import { describe, expect, it } from 'vitest';
import {
  parseAttributionFromText,
  recordTouchpoint,
  resolveAttribution,
} from '../src/services/attribution';
import { recordConversion } from '../src/services/webhooks';
import { buildCustomerHash, buildDailyVisitorHash } from '../src/utils/crypto';
import { createTestEnv, seedTestWorkspace } from './helpers/test-env';

describe('First-Touch vs Last-Touch Attribution Engine', () => {
  it('parses [ref:ef_ep=...|ft=...|vid=...] embedded in WhatsApp messages', () => {
    const parsed = parseAttributionFromText(
      'Halo admin, saya mau daftar kelas VIP [ref:ef_ep=ep-07|ft=ep-01|vid=v_abc123]'
    );
    expect(parsed).toEqual({
      ef_ep: 'ep-07',
      ef_ft_ep: 'ep-01',
      ef_vid: 'v_abc123',
    });

    const queryStyle = parseAttributionFromText('Ref: ef_ep=wakaf-sumur-01');
    expect(queryStyle.ef_ep).toBe('wakaf-sumur-01');
  });

  it('preserves first-touch from earlier visitor touchpoints and customer leads across sessions', async () => {
    const { env } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_1',
      slug: 'acme',
      name: 'Acme',
      apiKey: 'key_acme',
      webhookSecret: 'sec_acme',
    });

    await env.DB.prepare(
      `INSERT INTO episodes (id, workspace_id, episode_code, title, platform, target_url, published_at)
       VALUES
       ('ep_a', 'ws_1', 'ep-tiktok-a', 'Discovery Video', 'tiktok', 'https://acme.id', '2026-11-01T08:00:00Z'),
       ('ep_b', 'ws_1', 'ep-linkedin-b', 'Closer Post', 'linkedin', 'https://acme.id', '2026-11-05T08:00:00Z')`
    ).run();

    // Visitor clicks Ep A on Nov 1, then clicks Ep B on Nov 5
    await recordTouchpoint(env.DB, {
      workspaceId: 'ws_1',
      episodeId: 'ep_a',
      visitorId: 'vid_john',
      visitorHash: 'vh_day1',
      touchType: 'pageview',
      createdAt: '2026-11-01T10:00:00Z',
    });

    await recordTouchpoint(env.DB, {
      workspaceId: 'ws_1',
      episodeId: 'ep_b',
      visitorId: 'vid_john',
      visitorHash: 'vh_day5',
      touchType: 'pageview',
      createdAt: '2026-11-05T10:00:00Z',
    });

    // Lead happens on Ep B via WhatsApp (no visitor_id, only phone number) -> wait, visitorId is present here
    const leadRes = await recordConversion(env.DB, 'ws_1', env, {
      externalId: 'wa_msg_1',
      provider: 'waflare',
      stage: 'lead',
      amount: 0,
      currency: 'IDR',
      occurredAt: '2026-11-05T11:00:00Z',
      customerPhone: '081234567890',
      visitorId: 'vid_john',
      explicitLastEp: 'ep-linkedin-b',
    });

    expect(leadRes.first_touch_episode_id).toBe('ep_a');
    expect(leadRes.last_touch_episode_id).toBe('ep_b');

    // Later, customer pays from a completely different device (no visitorId, normalized +62 phone matches 0812)
    const paidRes = await recordConversion(env.DB, 'ws_1', env, {
      externalId: 'mid_order_1',
      provider: 'midtrans',
      stage: 'paid',
      amount: 1500000,
      currency: 'IDR',
      occurredAt: '2026-11-06T09:00:00Z',
      customerPhone: '+62 812-3456-7890',
      explicitLastEp: 'ep-linkedin-b',
    });

    expect(paidRes.duplicate).toBe(false);
    expect(paidRes.first_touch_episode_id).toBe('ep_a');
    expect(paidRes.last_touch_episode_id).toBe('ep_b');
    expect(paidRes.amount_idr).toBe(1500000);

    // Replaying exact same external_id + stage is idempotent
    const replay = await recordConversion(env.DB, 'ws_1', env, {
      externalId: 'mid_order_1',
      provider: 'midtrans',
      stage: 'paid',
      amount: 1500000,
      currency: 'IDR',
      occurredAt: '2026-11-06T09:00:00Z',
      customerPhone: '+62 812-3456-7890',
      explicitLastEp: 'ep-linkedin-b',
    });
    expect(replay.duplicate).toBe(true);
    expect(replay.conversion_id).toBe(paidRes.conversion_id);
  });

  it('rotates visitor hashes daily and isolates customer hashes by workspace', async () => {
    const h1 = await buildDailyVisitorHash('ws_1', '1.2.3.4', 'Mozilla/5.0', new Date('2026-11-18T10:00:00Z'));
    const h2 = await buildDailyVisitorHash('ws_1', '1.2.3.4', 'Mozilla/5.0', new Date('2026-11-19T10:00:00Z'));
    expect(h1).not.toBe(h2);

    const c1 = await buildCustomerHash('ws_1', '081234567890');
    const c2 = await buildCustomerHash('ws_2', '+6281234567890');
    expect(c1.customerHash).not.toBeNull();
    expect(c1.customerHash).not.toBe(c2.customerHash);

    const { env } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_1',
      slug: 'w1',
      name: 'W1',
      apiKey: 'k1',
      webhookSecret: 's1',
    });
    const missingEp = await resolveAttribution(env.DB, 'ws_1', {
      explicitLastEp: 'non-existent',
    });
    expect(missingEp.first_touch_episode_id).toBeNull();
    expect(missingEp.last_touch_episode_id).toBeNull();
  });
});
