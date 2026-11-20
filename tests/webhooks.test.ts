import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index';
import { syncPullEndpoints } from '../src/services/pull-sync';
import { dispatchWorkspaceReport } from '../src/services/reporter';
import { processProviderWebhook } from '../src/services/webhooks';
import { getWorkspaceBySlug } from '../src/services/workspace';
import { hmacSha256Hex, sha512Hex } from '../src/utils/crypto';
import { createTestEnv, seedTestWorkspace } from './helpers/test-env';

describe('HMAC Webhooks, 2-Endpoint Pull Sync & Cron Reporter', () => {
  async function setupEnv() {
    const { env } = createTestEnv();
    await seedTestWorkspace(env.DB, {
      id: 'ws_pay',
      slug: 'pay-demo',
      name: 'Pay Demo',
      apiKey: 'ef_pay_key',
      webhookSecret: 'whsec_default',
      settings: {
        waflare_hmac_secret: 'waflare_sec',
        qris_hmac_secret: 'qris_sec',
        midtrans_server_key: 'mid_srv_key',
        xendit_callback_token: 'xnd_cb_tok',
        xendit_hmac_secret: 'xnd_hmac_sec',
        stripe_webhook_secret: 'whsec_stripe',
      },
    });
    await env.DB.prepare(
      `INSERT INTO episodes (id, workspace_id, episode_code, title, platform, target_url, published_at)
       VALUES
       ('ep_p1', 'ws_pay', 'ep-01', 'TikTok Hook', 'tiktok', 'https://demo.id', '2026-11-01T08:00:00Z'),
       ('ep_p2', 'ws_pay', 'ep-02', 'LinkedIn VIP', 'linkedin', 'https://demo.id', '2026-11-10T08:00:00Z')`
    ).run();
    const ws = await getWorkspaceBySlug(env.DB, 'pay-demo');
    if (!ws) throw new Error('Workspace seed failed');
    return { env, ws };
  }

  it('verifies and ingests waflare, qris, midtrans, xendit, stripe, and generic webhooks while rejecting tampered signatures', async () => {
    const { env, ws } = await setupEnv();
    const app = createApp();

    // 1. waflare (invalid signature rejected with 401)
    const waPayload = JSON.stringify({
      message_id: 'wamid_100',
      from: '62812000111',
      text: 'Mau join [ref:ef_ep=ep-02|ft=ep-01|vid=v_99]',
      timestamp: '2026-11-12T08:00:00Z',
    });
    const badWa = await app.fetch(
      new Request('http://localhost/api/v1/webhooks/pay-demo/waflare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-waflare-signature': 'sha256=deadbeef' },
        body: waPayload,
      }),
      env
    );
    expect(badWa.status).toBe(401);

    const waSig = await hmacSha256Hex('waflare_sec', waPayload);
    const okWa = await app.fetch(
      new Request('http://localhost/api/v1/webhooks/pay-demo/waflare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-waflare-signature': `sha256=${waSig}` },
        body: waPayload,
      }),
      env
    );
    expect(okWa.status).toBe(200);
    const waJson = (await okWa.json()) as {
      stage: string;
      first_touch_episode_id: string;
      last_touch_episode_id: string;
    };
    expect(waJson.stage).toBe('lead');
    expect(waJson.first_touch_episode_id).toBe('ep_p1');
    expect(waJson.last_touch_episode_id).toBe('ep_p2');

    // 2. QRIS Dinamis
    const qrisBody = JSON.stringify({
      tx_id: 'qris_991',
      status: 'PAID',
      amount: 250000,
      customer_phone: '0812000222',
      metadata: { ef_ep: 'ep-02' },
    });
    const qrisSig = await hmacSha256Hex('qris_sec', qrisBody);
    const okQris = await processProviderWebhook(
      env.DB,
      ws,
      'qris',
      qrisBody,
      new Headers({ 'x-qris-signature': qrisSig }),
      env
    );
    expect(okQris.statusCode).toBe(200);
    expect(okQris.body.stage).toBe('paid');
    expect(okQris.body.amount_idr).toBe(250000);

    // 3. Midtrans native SHA-512 signature_key
    const midOrder = 'ORD-MID-01';
    const midCode = '200';
    const midGross = '1500000.00';
    const midSigKey = await sha512Hex(`${midOrder}${midCode}${midGross}mid_srv_key`);
    const midBody = JSON.stringify({
      order_id: midOrder,
      status_code: midCode,
      gross_amount: midGross,
      signature_key: midSigKey,
      transaction_status: 'settlement',
      payment_type: 'qris',
      custom_field1: '[ref:ef_ep=ep-02|ft=ep-01]',
      customer_details: { email: 'buyer@mid.id', phone: '+62812333444' },
    });
    const okMid = await processProviderWebhook(env.DB, ws, 'midtrans', midBody, new Headers(), env);
    expect(okMid.statusCode).toBe(200);
    expect(okMid.body.amount_idr).toBe(1500000);
    expect(okMid.body.first_touch_episode_id).toBe('ep_p1');

    // 4. Xendit (x-callback-token)
    const xndBody = JSON.stringify({
      external_id: 'xnd_inv_77',
      status: 'PAID',
      paid_amount: 2000000,
      currency: 'IDR',
      payer_email: 'vip@xendit.id',
      metadata: { ef_ep: 'ep-02' },
    });
    const okXnd = await processProviderWebhook(
      env.DB,
      ws,
      'xendit',
      xndBody,
      new Headers({ 'x-callback-token': 'xnd_cb_tok' }),
      env
    );
    expect(okXnd.statusCode).toBe(200);
    expect(okXnd.body.amount_idr).toBe(2000000);

    // 5. Stripe (t=...,v1=... with USD -> IDR conversion & replay timestamp window check)
    const nowSec = 1795000000;
    const stripeBody = JSON.stringify({
      id: 'evt_stripe_1',
      type: 'checkout.session.completed',
      created: nowSec,
      data: {
        object: {
          id: 'cs_test_1',
          amount_total: 10000, // $100.00 USD -> Rp1.600.000
          currency: 'usd',
          customer_details: { email: 'global@stripe.dev' },
          metadata: { ef_ep: 'ep-02' },
        },
      },
    });
    const v1 = await hmacSha256Hex('whsec_stripe', `${nowSec}.${stripeBody}`);
    const expiredStripe = await processProviderWebhook(
      env.DB,
      ws,
      'stripe',
      stripeBody,
      new Headers({ 'stripe-signature': `t=${nowSec},v1=${v1}` }),
      env,
      { nowSec: nowSec + 500 }
    );
    expect(expiredStripe.statusCode).toBe(401);

    const okStripe = await processProviderWebhook(
      env.DB,
      ws,
      'stripe',
      stripeBody,
      new Headers({ 'stripe-signature': `t=${nowSec},v1=${v1}` }),
      env,
      { nowSec }
    );
    expect(okStripe.statusCode).toBe(200);
    expect(okStripe.body.amount_idr).toBe(1600000);

    // 6. Generic HMAC webhook
    const genBody = JSON.stringify({
      external_id: 'gen_1',
      stage: 'paid',
      amount: 500000,
      currency: 'IDR',
      ef_ep: 'ep-01',
    });
    const genSig = await hmacSha256Hex('whsec_default', genBody);
    const okGen = await processProviderWebhook(
      env.DB,
      ws,
      'generic',
      genBody,
      new Headers({ 'x-ef-signature': genSig }),
      env
    );
    expect(okGen.statusCode).toBe(200);
    expect(okGen.body.amount_idr).toBe(500000);
  });

  it('syncs the 2-endpoint read-only pull contract (/ef/signups & /ef/orders) and formats cron reports', async () => {
    const { env, ws } = await setupEnv();
    const wsWithPull = {
      ...ws,
      pull_signups_url: 'https://merchant.example/ef/signups',
      pull_orders_url: 'https://merchant.example/ef/orders',
      pull_bearer_token: 'pull_tok',
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/ef/signups')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'su_1',
                occurred_at: '2026-11-11T10:00:00Z',
                stage: 'lead',
                ef_ep: 'ep-02',
                ef_ft_ep: 'ep-01',
                customer_phone: '081999888777',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'ord_1',
              occurred_at: '2026-11-11T12:00:00Z',
              amount: 1200000,
              currency: 'IDR',
              ef_ep: 'ep-02',
              customer_phone: '+6281999888777',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const summary = await syncPullEndpoints(env.DB, wsWithPull, env, mockFetch);
    expect(summary.signups_inserted).toBe(1);
    expect(summary.orders_inserted).toBe(1);

    const report = await dispatchWorkspaceReport(env.DB, ws);
    expect(report.waflare_status).toBe('dry_run');
    expect(report.telegram_status).toBe('dry_run');
    expect(report.report_text).toContain('EDGE-FUNNEL DIGEST');
    expect(report.report_text).toContain('Rp1.200.000');
  });
});
