import type {
  ConversionStage,
  CurrencyCode,
  Env,
  WebhookProvider,
  WebhookResult,
  WorkspaceRow,
} from '../types';
import {
  buildCustomerHash,
  constantTimeEqual,
  hmacSha256Hex,
  normalizeHexSig,
  sha512Hex,
} from '../utils/crypto';
import { generateId, toIdrAmount } from '../utils/id';
import { parseAttributionFromText, resolveAttribution } from './attribution';
import { parseWorkspaceSettings } from './workspace';

export interface NormalizedConversionInput {
  externalId: string;
  provider: string;
  stage: ConversionStage;
  amount: number;
  currency: CurrencyCode;
  occurredAt: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  visitorId?: string | null;
  explicitLastEp?: string | null;
  explicitFirstEp?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  rawMeta?: Record<string, unknown>;
}

interface ParsedAttributionMeta {
  ef_ep?: string;
  ef_ft_ep?: string;
  ef_vid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

function asString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

function asNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Number(val.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asRecord(val: unknown): Record<string, unknown> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === 'string' && val.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(val) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function extractMeta(source: Record<string, unknown>): ParsedAttributionMeta {
  const meta = asRecord(source.metadata ?? source.additional_data ?? source);
  return {
    ef_ep: asString(meta.ef_ep ?? source.ef_ep),
    ef_ft_ep: asString(meta.ef_ft_ep ?? source.ef_ft_ep),
    ef_vid: asString(meta.ef_vid ?? source.ef_vid),
    utm_source: asString(meta.utm_source ?? source.utm_source),
    utm_medium: asString(meta.utm_medium ?? source.utm_medium),
    utm_campaign: asString(meta.utm_campaign ?? source.utm_campaign),
  };
}

/**
 * Persist a normalized conversion idempotently into D1, linking `first_touch_episode_id`
 * and `last_touch_episode_id` across touchpoints and prior customer events.
 */
export async function recordConversion(
  db: D1Database,
  workspaceId: string,
  env: Env,
  input: NormalizedConversionInput
): Promise<{
  conversion_id: string;
  duplicate: boolean;
  amount_idr: number;
  first_touch_episode_id: string | null;
  last_touch_episode_id: string | null;
}> {
  const usdRate = Number(env.USD_TO_IDR_RATE ?? '16000') || 16000;
  const currency: CurrencyCode = input.currency === 'USD' ? 'USD' : 'IDR';
  const amount = Number.isFinite(input.amount) ? input.amount : 0;
  const amountIdr = toIdrAmount(amount, currency, usdRate);

  const { customerHash, customerRef } = await buildCustomerHash(
    workspaceId,
    input.customerPhone,
    input.customerEmail
  );

  const resolution = await resolveAttribution(db, workspaceId, {
    explicitLastEp: input.explicitLastEp,
    explicitFirstEp: input.explicitFirstEp,
    visitorId: input.visitorId,
    customerHash,
  });

  const existing = await db
    .prepare(
      `SELECT id, amount_idr, first_touch_episode_id, last_touch_episode_id
       FROM conversions
       WHERE workspace_id = ? AND provider = ? AND external_id = ? AND stage = ?
       LIMIT 1`
    )
    .bind(workspaceId, input.provider, input.externalId, input.stage)
    .first<{
      id: string;
      amount_idr: number;
      first_touch_episode_id: string | null;
      last_touch_episode_id: string | null;
    }>();

  if (existing) {
    return {
      conversion_id: existing.id,
      duplicate: true,
      amount_idr: existing.amount_idr,
      first_touch_episode_id: existing.first_touch_episode_id,
      last_touch_episode_id: existing.last_touch_episode_id,
    };
  }

  const conversionId = generateId('conv', 14);
  await db
    .prepare(
      `INSERT INTO conversions (
        id, workspace_id, external_id, provider, stage, customer_hash, customer_ref,
        visitor_id, first_touch_episode_id, last_touch_episode_id,
        utm_source, utm_medium, utm_campaign, currency, amount, amount_idr,
        occurred_at, raw_meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, provider, external_id, stage) DO NOTHING`
    )
    .bind(
      conversionId,
      workspaceId,
      input.externalId,
      input.provider,
      input.stage,
      customerHash,
      customerRef,
      input.visitorId ?? null,
      resolution.first_touch_episode_id,
      resolution.last_touch_episode_id,
      input.utmSource ?? null,
      input.utmMedium ?? null,
      input.utmCampaign ?? null,
      currency,
      amount,
      amountIdr,
      input.occurredAt,
      JSON.stringify(input.rawMeta ?? {})
    )
    .run();

  return {
    conversion_id: conversionId,
    duplicate: false,
    amount_idr: amountIdr,
    first_touch_episode_id: resolution.first_touch_episode_id,
    last_touch_episode_id: resolution.last_touch_episode_id,
  };
}

/** Verify Stripe `t=...,v1=...` signature header against raw body and timestamp tolerance. */
async function verifyStripeSignature(
  header: string | null,
  secret: string,
  rawBody: string,
  nowSec?: number
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',');
  let timestamp = '';
  const v1Sigs: string[] = [];

  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) v1Sigs.push(v.toLowerCase());
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || v1Sigs.length === 0) return false;

  const refNow = nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(refNow - tsNum) > 300) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return v1Sigs.some((sig) => constantTimeEqual(sig, expected));
}

function parseCustomFieldAttribution(rawField: unknown): ParsedAttributionMeta {
  const str = asString(rawField);
  if (!str) return {};
  if (str.startsWith('{')) {
    return extractMeta(asRecord(str));
  }
  const parsed = parseAttributionFromText(str);
  if (parsed.ef_ep || parsed.ef_ft_ep || parsed.ef_vid) {
    return parsed;
  }
  return { ef_ep: str };
}

function getNormalizedIso(rawTime: unknown): string {
  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    const ms = rawTime < 1e12 ? rawTime * 1000 : rawTime;
    return new Date(ms).toISOString();
  }
  const str = asString(rawTime);
  if (str) {
    const ms = Date.parse(str);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

export interface WebhookProcessOptions {
  nowSec?: number;
}

/**
 * Verify signature and ingest a provider webhook (`waflare`, `qris`, `midtrans`,
 * `xendit`, `stripe`, or `generic`) for the target workspace.
 */
export async function processProviderWebhook(
  db: D1Database,
  ws: WorkspaceRow,
  provider: WebhookProvider,
  rawBody: string,
  headers: Headers,
  env: Env,
  options?: WebhookProcessOptions
): Promise<{ statusCode: number; body: WebhookResult }> {
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        statusCode: 400,
        body: { ok: false, provider, reason: 'JSON object payload required' },
      };
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return {
      statusCode: 400,
      body: { ok: false, provider, reason: 'Invalid JSON body' },
    };
  }

  const settings = parseWorkspaceSettings(ws);
  let normalized: NormalizedConversionInput | null = null;

  if (provider === 'waflare') {
    const secret = settings.waflare_hmac_secret ?? env.WAFLARE_WEBHOOK_SECRET ?? ws.webhook_secret;
    const provided = normalizeHexSig(headers.get('x-waflare-signature') ?? headers.get('x-ef-signature'));
    const expected = await hmacSha256Hex(secret, rawBody);
    if (!provided || !constantTimeEqual(provided, expected)) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid waflare signature' } };
    }

    const text = asString(payload.text ?? payload.message ?? payload.body) ?? '';
    const parsedText = parseAttributionFromText(text);
    const meta = extractMeta(payload);
    const stageRaw = asString(payload.stage)?.toLowerCase();
    const stage: ConversionStage = stageRaw === 'qualified' ? 'qualified' : 'lead';

    normalized = {
      externalId: asString(payload.message_id ?? payload.id) ?? generateId('wa', 10),
      provider: 'waflare',
      stage,
      amount: 0,
      currency: 'IDR',
      occurredAt: getNormalizedIso(payload.timestamp ?? payload.occurred_at),
      customerPhone: asString(payload.from ?? payload.sender ?? payload.phone),
      customerEmail: asString(payload.email),
      visitorId: meta.ef_vid ?? parsedText.ef_vid,
      explicitLastEp: meta.ef_ep ?? parsedText.ef_ep,
      explicitFirstEp: meta.ef_ft_ep ?? parsedText.ef_ft_ep,
      utmSource: meta.utm_source ?? 'whatsapp',
      utmMedium: meta.utm_medium ?? 'waflare',
      utmCampaign: meta.utm_campaign,
      rawMeta: { text_preview: text.slice(0, 140) },
    };
  } else if (provider === 'qris') {
    const secret = settings.qris_hmac_secret ?? env.QRIS_WEBHOOK_SECRET ?? ws.webhook_secret;
    const provided = normalizeHexSig(headers.get('x-qris-signature') ?? headers.get('x-ef-signature'));
    const expected = await hmacSha256Hex(secret, rawBody);
    if (!provided || !constantTimeEqual(provided, expected)) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid QRIS signature' } };
    }

    const status = (asString(payload.status) ?? 'PAID').toUpperCase();
    if (!['PAID', 'SUCCESS', 'SETTLED', '00'].includes(status)) {
      return {
        statusCode: 200,
        body: { ok: true, provider, ignored: true, reason: `Ignored QRIS status: ${status}` },
      };
    }

    const meta = extractMeta(payload);
    const parsedRef = parseAttributionFromText(asString(payload.ref ?? payload.note));
    normalized = {
      externalId: asString(payload.tx_id ?? payload.transaction_id ?? payload.nmid_ref ?? payload.id) ?? generateId('qris', 10),
      provider: 'qris',
      stage: 'paid',
      amount: asNumber(payload.amount ?? payload.nominal) ?? 0,
      currency: 'IDR',
      occurredAt: getNormalizedIso(payload.paid_at ?? payload.occurred_at),
      customerPhone: asString(payload.customer_phone ?? payload.phone),
      customerEmail: asString(payload.customer_email ?? payload.email),
      visitorId: meta.ef_vid ?? parsedRef.ef_vid,
      explicitLastEp: meta.ef_ep ?? parsedRef.ef_ep,
      explicitFirstEp: meta.ef_ft_ep ?? parsedRef.ef_ft_ep,
      utmSource: meta.utm_source ?? 'qris',
      utmMedium: meta.utm_medium ?? 'qris_dinamis',
      utmCampaign: meta.utm_campaign,
      rawMeta: { acquirer: asString(payload.acquirer ?? payload.issuer) ?? 'qris' },
    };
  } else if (provider === 'midtrans') {
    const serverKey = settings.midtrans_server_key ?? env.MIDTRANS_SERVER_KEY ?? ws.webhook_secret;
    const orderId = asString(payload.order_id) ?? '';
    const statusCode = asString(payload.status_code) ?? String(asNumber(payload.status_code) ?? '');
    const grossAmount = asString(payload.gross_amount) ?? String(asNumber(payload.gross_amount) ?? '');
    const signatureKey = asString(payload.signature_key)?.toLowerCase() ?? '';

    const expectedNative = await sha512Hex(`${orderId}${statusCode}${grossAmount}${serverKey}`);
    const headerSig = normalizeHexSig(headers.get('x-ef-signature'));
    const expectedHmac = headerSig ? await hmacSha256Hex(ws.webhook_secret, rawBody) : '';

    const nativeValid = Boolean(signatureKey) && constantTimeEqual(signatureKey, expectedNative);
    const hmacFallbackValid = Boolean(headerSig) && constantTimeEqual(headerSig, expectedHmac);

    if (!nativeValid && !hmacFallbackValid) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid Midtrans signature_key' } };
    }

    const txStatus = (asString(payload.transaction_status) ?? '').toLowerCase();
    const fraudStatus = (asString(payload.fraud_status) ?? 'accept').toLowerCase();
    let stage: ConversionStage | null = null;
    if (txStatus === 'settlement' || (txStatus === 'capture' && fraudStatus !== 'challenge')) {
      stage = 'paid';
    } else if (txStatus === 'pending') {
      stage = 'qualified';
    } else {
      return {
        statusCode: 200,
        body: { ok: true, provider, ignored: true, reason: `Ignored Midtrans status: ${txStatus}` },
      };
    }

    const cf1 = parseCustomFieldAttribution(payload.custom_field1);
    const meta = extractMeta(payload);
    const custDetails = asRecord(payload.customer_details);

    normalized = {
      externalId: orderId || (asString(payload.transaction_id) ?? generateId('mid', 10)),
      provider: 'midtrans',
      stage,
      amount: asNumber(payload.gross_amount) ?? 0,
      currency: (asString(payload.currency)?.toUpperCase() === 'USD' ? 'USD' : 'IDR') as CurrencyCode,
      occurredAt: getNormalizedIso(payload.settlement_time ?? payload.transaction_time),
      customerPhone: asString(custDetails.phone ?? payload.customer_phone),
      customerEmail: asString(custDetails.email ?? payload.customer_email),
      visitorId: meta.ef_vid ?? cf1.ef_vid,
      explicitLastEp: meta.ef_ep ?? cf1.ef_ep ?? asString(payload.custom_field2),
      explicitFirstEp: meta.ef_ft_ep ?? cf1.ef_ft_ep ?? asString(payload.custom_field3),
      utmSource: meta.utm_source ?? 'midtrans',
      utmMedium: meta.utm_medium ?? (asString(payload.payment_type) ?? 'snap'),
      utmCampaign: meta.utm_campaign,
      rawMeta: { payment_type: asString(payload.payment_type) ?? 'midtrans' },
    };
  } else if (provider === 'xendit') {
    const callbackToken = settings.xendit_callback_token ?? env.XENDIT_CALLBACK_TOKEN ?? ws.webhook_secret;
    const hmacSecret = settings.xendit_hmac_secret ?? ws.webhook_secret;

    const headerToken = asString(headers.get('x-callback-token')) ?? '';
    const headerSig = normalizeHexSig(headers.get('x-xendit-signature') ?? headers.get('x-ef-signature'));

    const tokenValid = Boolean(headerToken) && constantTimeEqual(headerToken, callbackToken);
    const sigValid = headerSig
      ? constantTimeEqual(headerSig, await hmacSha256Hex(hmacSecret, rawBody))
      : false;

    if (!tokenValid && !sigValid) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid Xendit callback verification' } };
    }

    const status = (asString(payload.status) ?? 'PAID').toUpperCase();
    let stage: ConversionStage | null = null;
    if (['PAID', 'SETTLED', 'SUCCEEDED'].includes(status)) {
      stage = 'paid';
    } else if (status === 'PENDING') {
      stage = 'qualified';
    } else {
      return {
        statusCode: 200,
        body: { ok: true, provider, ignored: true, reason: `Ignored Xendit status: ${status}` },
      };
    }

    const meta = extractMeta(payload);
    const customer = asRecord(payload.customer);
    const rawCurrency = (asString(payload.currency) ?? 'IDR').toUpperCase();

    normalized = {
      externalId: asString(payload.external_id ?? payload.id) ?? generateId('xnd', 10),
      provider: 'xendit',
      stage,
      amount: asNumber(payload.paid_amount ?? payload.amount) ?? 0,
      currency: rawCurrency === 'USD' ? 'USD' : 'IDR',
      occurredAt: getNormalizedIso(payload.paid_at ?? payload.updated ?? payload.created),
      customerPhone: asString(customer.mobile_number ?? payload.mobile_number ?? payload.phone),
      customerEmail: asString(payload.payer_email ?? customer.email ?? payload.email),
      visitorId: meta.ef_vid,
      explicitLastEp: meta.ef_ep,
      explicitFirstEp: meta.ef_ft_ep,
      utmSource: meta.utm_source ?? 'xendit',
      utmMedium: meta.utm_medium ?? (asString(payload.payment_channel ?? payload.payment_method) ?? 'invoice'),
      utmCampaign: meta.utm_campaign,
      rawMeta: { payment_channel: asString(payload.payment_channel) ?? 'xendit' },
    };
  } else if (provider === 'stripe') {
    const secret = settings.stripe_webhook_secret ?? env.STRIPE_WEBHOOK_SECRET ?? ws.webhook_secret;
    const stripeHeader = headers.get('stripe-signature');
    const valid = await verifyStripeSignature(stripeHeader, secret, rawBody, options?.nowSec);
    if (!valid) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid Stripe signature' } };
    }

    const eventType = asString(payload.type) ?? '';
    if (!['checkout.session.completed', 'payment_intent.succeeded'].includes(eventType)) {
      return {
        statusCode: 200,
        body: { ok: true, provider, ignored: true, reason: `Ignored Stripe event: ${eventType}` },
      };
    }

    const data = asRecord(payload.data);
    const obj = asRecord(data.object);
    const meta = extractMeta(obj);
    const custDetails = asRecord(obj.customer_details);
    const rawCurrency = (asString(obj.currency) ?? 'usd').toUpperCase();
    const rawSmallestUnit = asNumber(obj.amount_total ?? obj.amount_received ?? obj.amount) ?? 0;
    const majorAmount = rawSmallestUnit / 100;

    normalized = {
      externalId: asString(obj.id ?? payload.id) ?? generateId('str', 10),
      provider: 'stripe',
      stage: 'paid',
      amount: majorAmount,
      currency: rawCurrency === 'USD' ? 'USD' : 'IDR',
      occurredAt: getNormalizedIso(payload.created ?? obj.created),
      customerPhone: asString(custDetails.phone),
      customerEmail: asString(custDetails.email ?? obj.receipt_email),
      visitorId: meta.ef_vid,
      explicitLastEp: meta.ef_ep,
      explicitFirstEp: meta.ef_ft_ep,
      utmSource: meta.utm_source ?? 'stripe',
      utmMedium: meta.utm_medium ?? 'checkout',
      utmCampaign: meta.utm_campaign,
      rawMeta: { event_type: eventType },
    };
  } else if (provider === 'generic') {
    const provided = normalizeHexSig(headers.get('x-ef-signature'));
    const expected = await hmacSha256Hex(ws.webhook_secret, rawBody);
    if (!provided || !constantTimeEqual(provided, expected)) {
      return { statusCode: 401, body: { ok: false, provider, reason: 'Invalid x-ef-signature' } };
    }

    const stageRaw = (asString(payload.stage) ?? 'paid').toLowerCase();
    const stage: ConversionStage =
      stageRaw === 'lead' || stageRaw === 'qualified' ? stageRaw : 'paid';
    const meta = extractMeta(payload);
    const rawCurrency = (asString(payload.currency) ?? ws.default_currency ?? 'IDR').toUpperCase();

    normalized = {
      externalId: asString(payload.external_id ?? payload.id) ?? generateId('gen', 10),
      provider: 'generic',
      stage,
      amount: asNumber(payload.amount) ?? 0,
      currency: rawCurrency === 'USD' ? 'USD' : 'IDR',
      occurredAt: getNormalizedIso(payload.occurred_at),
      customerPhone: asString(payload.customer_phone ?? payload.phone),
      customerEmail: asString(payload.customer_email ?? payload.email),
      visitorId: meta.ef_vid,
      explicitLastEp: meta.ef_ep,
      explicitFirstEp: meta.ef_ft_ep,
      utmSource: meta.utm_source ?? 'generic',
      utmMedium: meta.utm_medium ?? 'webhook',
      utmCampaign: meta.utm_campaign,
      rawMeta: meta as Record<string, unknown>,
    };
  }

  if (!normalized) {
    return { statusCode: 400, body: { ok: false, provider, reason: 'Unsupported provider' } };
  }

  const saved = await recordConversion(db, ws.id, env, normalized);
  return {
    statusCode: 200,
    body: {
      ok: true,
      provider,
      duplicate: saved.duplicate,
      conversion_id: saved.conversion_id,
      stage: normalized.stage,
      amount_idr: saved.amount_idr,
      first_touch_episode_id: saved.first_touch_episode_id,
      last_touch_episode_id: saved.last_touch_episode_id,
    },
  };
}
