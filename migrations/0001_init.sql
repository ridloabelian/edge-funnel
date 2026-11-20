-- edge-funnel D1 Schema (Multi-Tenant First-Party Attribution & Cohort Analytics)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'IDR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  pull_signups_url TEXT,
  pull_orders_url TEXT,
  pull_bearer_token TEXT,
  last_pull_sync_at TEXT,
  waflare_api_url TEXT,
  waflare_api_token TEXT,
  report_wa_recipient TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  episode_code TEXT NOT NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT 'general',
  content_type TEXT NOT NULL DEFAULT 'video',
  target_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(workspace_id, episode_code)
);

CREATE INDEX IF NOT EXISTS idx_episodes_ws_pub
  ON episodes(workspace_id, published_at);

CREATE TABLE IF NOT EXISTS shortlinks (
  code TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL DEFAULT 'organic',
  utm_campaign TEXT,
  utm_content TEXT,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_shortlinks_ws_ep
  ON shortlinks(workspace_id, episode_id);

CREATE TABLE IF NOT EXISTS touchpoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  shortlink_code TEXT,
  visitor_id TEXT,
  visitor_hash TEXT NOT NULL,
  touch_type TEXT NOT NULL DEFAULT 'redirect' CHECK (touch_type IN ('redirect', 'pageview')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tp_ws_ep_time
  ON touchpoints(workspace_id, episode_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tp_ws_vid
  ON touchpoints(workspace_id, visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tp_ws_vhash
  ON touchpoints(workspace_id, visitor_hash, created_at);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  age_days INTEGER NOT NULL CHECK (age_days >= 0),
  captured_at TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  followers_gained INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, episode_id, age_days)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ws_age
  ON metric_snapshots(workspace_id, age_days, episode_id);

CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('lead', 'qualified', 'paid')),
  customer_hash TEXT,
  customer_ref TEXT,
  visitor_id TEXT,
  first_touch_episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  last_touch_episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USD')),
  amount REAL NOT NULL DEFAULT 0,
  amount_idr INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  raw_meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(workspace_id, provider, external_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_conv_ws_lt_time
  ON conversions(workspace_id, last_touch_episode_id, stage, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conv_ws_ft_time
  ON conversions(workspace_id, first_touch_episode_id, stage, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conv_ws_cust
  ON conversions(workspace_id, customer_hash, occurred_at);

CREATE TABLE IF NOT EXISTS report_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('waflare', 'telegram', 'preview')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'dry_run', 'failed')),
  payload_text TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
