export interface Env {
  DB: D1Database;
  DEFAULT_WORKSPACE_SLUG?: string;
  USD_TO_IDR_RATE?: string;
  EF_MASTER_API_KEY?: string;
  WAFLARE_WEBHOOK_SECRET?: string;
  QRIS_WEBHOOK_SECRET?: string;
  MIDTRANS_SERVER_KEY?: string;
  XENDIT_CALLBACK_TOKEN?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export type AttributionModel = 'last_touch' | 'first_touch';
export type ConversionStage = 'lead' | 'qualified' | 'paid';
export type CohortDay = 1 | 3 | 7;
export type CurrencyCode = 'IDR' | 'USD';
export type WebhookProvider =
  | 'waflare'
  | 'qris'
  | 'midtrans'
  | 'xendit'
  | 'stripe'
  | 'generic';

export interface WorkspaceSettings {
  midtrans_server_key?: string;
  xendit_callback_token?: string;
  xendit_hmac_secret?: string;
  stripe_webhook_secret?: string;
  qris_hmac_secret?: string;
  waflare_hmac_secret?: string;
}

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  api_key_hash: string;
  webhook_secret: string;
  default_currency: string;
  timezone: string;
  pull_signups_url: string | null;
  pull_orders_url: string | null;
  pull_bearer_token: string | null;
  last_pull_sync_at: string | null;
  waflare_api_url: string | null;
  waflare_api_token: string | null;
  report_wa_recipient: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  settings_json: string;
  created_at: string;
}

export interface EpisodeRow {
  id: string;
  workspace_id: string;
  episode_code: string;
  title: string;
  platform: string;
  campaign: string;
  content_type: string;
  target_url: string;
  published_at: string;
  created_at: string;
}

export interface ShortlinkRow {
  code: string;
  workspace_id: string;
  episode_id: string;
  destination_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string | null;
  utm_content: string | null;
  clicks_count: number;
  is_active: number;
  created_at: string;
}

export interface TouchpointRow {
  id: string;
  workspace_id: string;
  episode_id: string;
  shortlink_code: string | null;
  visitor_id: string | null;
  visitor_hash: string;
  touch_type: 'redirect' | 'pageview';
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  country: string | null;
  created_at: string;
}

export interface MetricSnapshotRow {
  id: string;
  workspace_id: string;
  episode_id: string;
  age_days: number;
  captured_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
}

export interface ConversionRow {
  id: string;
  workspace_id: string;
  external_id: string;
  provider: string;
  stage: ConversionStage;
  customer_hash: string | null;
  customer_ref: string | null;
  visitor_id: string | null;
  first_touch_episode_id: string | null;
  last_touch_episode_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  currency: CurrencyCode;
  amount: number;
  amount_idr: number;
  occurred_at: string;
  raw_meta_json: string;
  created_at: string;
}

export interface CohortMetricBlock {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers_gained: number;
  clicks: number;
  leads: number;
  qualified: number;
  paid: number;
  revenue_idr: number;
  effective_rpm_idr: number;
  click_to_paid_pct: number;
  lead_to_paid_pct: number;
}

export interface CohortComparison {
  episode_id: string;
  episode_code: string;
  title: string;
  platform: string;
  campaign: string;
  published_at: string;
  age_days: CohortDay;
  cutoff_at: string;
  metrics: CohortMetricBlock;
  vs_prev: {
    prev_episode_code: string;
    views_pct: number | null;
    clicks_pct: number | null;
    paid_pct: number | null;
    revenue_pct: number | null;
    rpm_pct: number | null;
  } | null;
  vs_median5: {
    sample_size: number;
    median_views: number;
    median_clicks: number;
    median_paid: number;
    median_revenue_idr: number;
    median_rpm_idr: number;
    views_pct: number | null;
    clicks_pct: number | null;
    paid_pct: number | null;
    revenue_pct: number | null;
    rpm_pct: number | null;
  } | null;
  verdict: 'BREAKOUT' | 'OUTPERFORMING' | 'VANITY_TRAP' | 'ON_PACE' | 'LAGGING';
}

export interface PlatformFunnelRow {
  platform: string;
  episodes_count: number;
  views: number;
  clicks: number;
  leads: number;
  qualified: number;
  paid: number;
  revenue_idr: number;
  views_share_pct: number;
  clicks_share_pct: number;
  revenue_share_pct: number;
  click_to_paid_pct: number;
  lead_to_paid_pct: number;
  effective_rpm_idr: number;
}

export interface NaturalInsight {
  id: string;
  severity: 'opportunity' | 'warning' | 'win' | 'attribution';
  headline: string;
  detail: string;
  metric_badge: string;
}

export interface AttributionResolution {
  first_touch_episode_id: string | null;
  last_touch_episode_id: string | null;
  first_touch_episode_code: string | null;
  last_touch_episode_code: string | null;
}

export interface WebhookResult {
  ok: boolean;
  provider: WebhookProvider;
  ignored?: boolean;
  duplicate?: boolean;
  conversion_id?: string;
  stage?: ConversionStage;
  amount_idr?: number;
  first_touch_episode_id?: string | null;
  last_touch_episode_id?: string | null;
  reason?: string;
}
