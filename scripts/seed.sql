PRAGMA foreign_keys = ON;

-- Idempotent reset of demo workspaces (cascades to episodes, shortlinks, touchpoints, snapshots, conversions)
DELETE FROM workspaces WHERE id IN ('ws_saif_demo', 'ws_nazhir_demo');

-- 1. Workspaces (demo keys: ef_demo_saif_key / ef_demo_nazhir_key)
INSERT INTO workspaces (
  id, slug, name, api_key_hash, webhook_secret, default_currency, timezone,
  pull_signups_url, pull_orders_url, settings_json
) VALUES
(
  'ws_saif_demo',
  'saif-growth',
  'SAIF Studio Growth',
  '888362ebc0f4ce8f8894be972749f7b46e3086eb4b6a98bc6d1aa78fc00fb91b',
  'whsec_saif_demo',
  'IDR',
  'Asia/Jakarta',
  'http://127.0.0.1:8792/demo-merchant/ef/signups',
  'http://127.0.0.1:8792/demo-merchant/ef/orders',
  '{"midtrans_server_key":"midtrans_demo_saif","qris_hmac_secret":"qris_demo_saif","waflare_hmac_secret":"waflare_demo_saif"}'
),
(
  'ws_nazhir_demo',
  'nazhir-reach',
  'Nazhir Wakaf & Tabligh',
  'dc5374ac4a92e4fae8365f1964bf2024c9323ea2095f86a2f8a82cc1ec1fb11e',
  'whsec_nazhir_demo',
  'IDR',
  'Asia/Jakarta',
  NULL,
  NULL,
  '{}'
);

-- 2. Episodes (saif-growth: 7 episodes showcasing TikTok vanity views vs LinkedIn/YouTube high conversion)
INSERT INTO episodes (id, workspace_id, episode_code, title, platform, campaign, content_type, target_url, published_at) VALUES
('ep_saif_01', 'ws_saif_demo', 'ep-01', 'Hook AI Gratis untuk UMKM', 'tiktok', 'ai-umkm', 'short_video', 'https://saif.co.id/kelas-ai', strftime('%Y-%m-%dT08:00:00Z', 'now', '-30 days')),
('ep_saif_02', 'ws_saif_demo', 'ep-02', 'Carousel Arsitektur Edge $0', 'instagram', 'edge-arch', 'carousel', 'https://saif.co.id/kelas-ai', strftime('%Y-%m-%dT08:00:00Z', 'now', '-25 days')),
('ep_saif_03', 'ws_saif_demo', 'ep-03', 'Drama SaaS Lokal 30 Detik', 'tiktok', 'saas-drama', 'short_video', 'https://saif.co.id/kelas-ai', strftime('%Y-%m-%dT08:00:00Z', 'now', '-20 days')),
('ep_saif_04', 'ws_saif_demo', 'ep-04', 'Deep Dive Serverless D1', 'youtube', 'serverless-d1', 'long_video', 'https://saif.co.id/vip-advisory', strftime('%Y-%m-%dT08:00:00Z', 'now', '-16 days')),
('ep_saif_05', 'ws_saif_demo', 'ep-05', 'Case Study B2B Otomasi WA', 'linkedin', 'b2b-wa', 'article', 'https://saif.co.id/vip-advisory', strftime('%Y-%m-%dT08:00:00Z', 'now', '-12 days')),
('ep_saif_06', 'ws_saif_demo', 'ep-06', 'Bedah Funnel Konversi Nyata', 'instagram', 'funnel-teardown', 'reel', 'https://saif.co.id/kelas-ai', strftime('%Y-%m-%dT08:00:00Z', 'now', '-8 days')),
('ep_saif_07', 'ws_saif_demo', 'ep-07', 'Blueprint SAIF 10-Gate Filter', 'linkedin', 'saif-10gate', 'carousel', 'https://saif.co.id/vip-advisory', strftime('%Y-%m-%dT08:00:00Z', 'now', '-4 days')),
-- nazhir-reach workspace episodes (tabligh-os & nazhir-reach compatible)
('ep_naz_01', 'ws_nazhir_demo', 'wakaf-sumur-01', 'Wakaf Sumur Bor Pelosok', 'whatsapp', 'wakaf-air', 'broadcast', 'https://nazhir.id/wakaf-sumur', strftime('%Y-%m-%dT07:00:00Z', 'now', '-14 days')),
('ep_naz_02', 'ws_nazhir_demo', 'tabligh-subuh-02', 'Kajian Subuh Manajemen Masjid', 'youtube', 'tabligh-os', 'video', 'https://nazhir.id/program-masjid', strftime('%Y-%m-%dT07:00:00Z', 'now', '-9 days')),
('ep_naz_03', 'ws_nazhir_demo', 'wakaf-produktif-03', 'Laporan Transparansi Wakaf Produktif', 'instagram', 'wakaf-produktif', 'reel', 'https://nazhir.id/wakaf-produktif', strftime('%Y-%m-%dT07:00:00Z', 'now', '-2 days'));

-- 3. Shortlinks
INSERT INTO shortlinks (code, workspace_id, episode_id, destination_url, utm_source, utm_medium, utm_campaign, clicks_count) VALUES
('tt-ai', 'ws_saif_demo', 'ep_saif_01', 'https://saif.co.id/kelas-ai', 'tiktok', 'bio_link', 'ai-umkm', 145),
('ig-edge', 'ws_saif_demo', 'ep_saif_02', 'https://saif.co.id/kelas-ai', 'instagram', 'carousel', 'edge-arch', 42),
('tt-drama', 'ws_saif_demo', 'ep_saif_03', 'https://saif.co.id/kelas-ai', 'tiktok', 'bio_link', 'saas-drama', 165),
('yt-d1', 'ws_saif_demo', 'ep_saif_04', 'https://saif.co.id/vip-advisory', 'youtube', 'description', 'serverless-d1', 48),
('li-wa', 'ws_saif_demo', 'ep_saif_05', 'https://saif.co.id/vip-advisory', 'linkedin', 'organic', 'b2b-wa', 45),
('ig-funnel', 'ws_saif_demo', 'ep_saif_06', 'https://saif.co.id/kelas-ai', 'instagram', 'reel', 'funnel-teardown', 54),
('li-saif', 'ws_saif_demo', 'ep_saif_07', 'https://saif.co.id/vip-advisory', 'linkedin', 'organic', 'saif-10gate', 68),
('wk-sumur', 'ws_nazhir_demo', 'ep_naz_01', 'https://nazhir.id/wakaf-sumur', 'whatsapp', 'broadcast', 'wakaf-air', 32),
('tb-subuh', 'ws_nazhir_demo', 'ep_naz_02', 'https://nazhir.id/program-masjid', 'youtube', 'description', 'tabligh-os', 24),
('wk-prod', 'ws_nazhir_demo', 'ep_naz_03', 'https://nazhir.id/wakaf-produktif', 'instagram', 'reel', 'wakaf-produktif', 18);

-- 4. Metric Snapshots (D+1, D+3, D+7; ep_saif_07 has D+1 & D+3 only since age is 4 days)
INSERT INTO metric_snapshots (id, workspace_id, episode_id, age_days, captured_at, views, likes, comments, shares, saves, followers_gained) VALUES
('sn_01_d1', 'ws_saif_demo', 'ep_saif_01', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-29 days'), 85000, 4200, 190, 620, 410, 890),
('sn_01_d3', 'ws_saif_demo', 'ep_saif_01', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-27 days'), 118000, 5600, 240, 810, 530, 1180),
('sn_01_d7', 'ws_saif_demo', 'ep_saif_01', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-23 days'), 140000, 6800, 295, 950, 610, 1410),

('sn_02_d1', 'ws_saif_demo', 'ep_saif_02', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-24 days'), 9200, 610, 44, 130, 290, 95),
('sn_02_d3', 'ws_saif_demo', 'ep_saif_02', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-22 days'), 13500, 880, 61, 190, 420, 140),
('sn_02_d7', 'ws_saif_demo', 'ep_saif_02', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-18 days'), 16000, 1020, 72, 230, 510, 175),

('sn_03_d1', 'ws_saif_demo', 'ep_saif_03', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-19 days'), 110000, 7400, 410, 1200, 310, 1050),
('sn_03_d3', 'ws_saif_demo', 'ep_saif_03', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-17 days'), 155000, 9900, 530, 1650, 420, 1420),
('sn_03_d7', 'ws_saif_demo', 'ep_saif_03', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-13 days'), 185000, 11400, 610, 1950, 490, 1690),

('sn_04_d1', 'ws_saif_demo', 'ep_saif_04', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-15 days'), 3800, 290, 38, 65, 190, 74),
('sn_04_d3', 'ws_saif_demo', 'ep_saif_04', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-13 days'), 6900, 520, 64, 115, 340, 132),
('sn_04_d7', 'ws_saif_demo', 'ep_saif_04', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-9 days'), 9500, 710, 89, 160, 460, 185),

('sn_05_d1', 'ws_saif_demo', 'ep_saif_05', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-11 days'), 3200, 240, 31, 58, 140, 62),
('sn_05_d3', 'ws_saif_demo', 'ep_saif_05', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-9 days'), 5600, 410, 52, 102, 245, 108),
('sn_05_d7', 'ws_saif_demo', 'ep_saif_05', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-5 days'), 7400, 540, 68, 130, 320, 144),

('sn_06_d1', 'ws_saif_demo', 'ep_saif_06', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-7 days'), 11400, 760, 52, 140, 380, 120),
('sn_06_d3', 'ws_saif_demo', 'ep_saif_06', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-5 days'), 17200, 1150, 79, 215, 590, 185),
('sn_06_d7', 'ws_saif_demo', 'ep_saif_06', 7, strftime('%Y-%m-%dT08:00:00Z', 'now', '-1 days'), 21000, 1390, 94, 260, 710, 230),

('sn_07_d1', 'ws_saif_demo', 'ep_saif_07', 1, strftime('%Y-%m-%dT08:00:00Z', 'now', '-3 days'), 4900, 430, 67, 138, 310, 115),
('sn_07_d3', 'ws_saif_demo', 'ep_saif_07', 3, strftime('%Y-%m-%dT08:00:00Z', 'now', '-1 days'), 8200, 710, 112, 240, 540, 198),

('sn_naz_01_d1', 'ws_nazhir_demo', 'ep_naz_01', 1, strftime('%Y-%m-%dT07:00:00Z', 'now', '-13 days'), 1800, 140, 19, 44, 30, 22),
('sn_naz_01_d3', 'ws_nazhir_demo', 'ep_naz_01', 3, strftime('%Y-%m-%dT07:00:00Z', 'now', '-11 days'), 2400, 195, 28, 65, 42, 31),
('sn_naz_01_d7', 'ws_nazhir_demo', 'ep_naz_01', 7, strftime('%Y-%m-%dT07:00:00Z', 'now', '-7 days'), 2900, 230, 34, 80, 55, 38),
('sn_naz_02_d1', 'ws_nazhir_demo', 'ep_naz_02', 1, strftime('%Y-%m-%dT07:00:00Z', 'now', '-8 days'), 4100, 310, 42, 71, 120, 64),
('sn_naz_02_d3', 'ws_nazhir_demo', 'ep_naz_02', 3, strftime('%Y-%m-%dT07:00:00Z', 'now', '-6 days'), 6200, 480, 61, 108, 185, 92),
('sn_naz_02_d7', 'ws_nazhir_demo', 'ep_naz_02', 7, strftime('%Y-%m-%dT07:00:00Z', 'now', '-2 days'), 7800, 610, 78, 140, 240, 118),
('sn_naz_03_d1', 'ws_nazhir_demo', 'ep_naz_03', 1, strftime('%Y-%m-%dT07:00:00Z', 'now', '-1 days'), 3100, 275, 35, 88, 115, 51);

-- 5. Touchpoints across D+1, D+3, D+7 windows
WITH RECURSIVE c1(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c1 WHERE x < 145)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_01_' || x, 'ws_saif_demo', 'ep_saif_01', 'tt-ai', 'vid_01_' || x, 'vh_01_' || x, 'redirect', 'tiktok', 'bio_link',
  CASE WHEN x <= 80 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-30 days')
       WHEN x <= 120 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-28 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-25 days') END
FROM c1;

WITH RECURSIVE c2(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c2 WHERE x < 42)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_02_' || x, 'ws_saif_demo', 'ep_saif_02', 'ig-edge', 'vid_02_' || x, 'vh_02_' || x, 'redirect', 'instagram', 'carousel',
  CASE WHEN x <= 20 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-25 days')
       WHEN x <= 35 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-23 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-20 days') END
FROM c2;

WITH RECURSIVE c3(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c3 WHERE x < 165)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_03_' || x, 'ws_saif_demo', 'ep_saif_03', 'tt-drama', 'vid_03_' || x, 'vh_03_' || x, 'redirect', 'tiktok', 'bio_link',
  CASE WHEN x <= 90 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-20 days')
       WHEN x <= 140 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-18 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-15 days') END
FROM c3;

WITH RECURSIVE c4(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c4 WHERE x < 48)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_04_' || x, 'ws_saif_demo', 'ep_saif_04', 'yt-d1', 'vid_04_' || x, 'vh_04_' || x, 'redirect', 'youtube', 'description',
  CASE WHEN x <= 20 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-16 days')
       WHEN x <= 38 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-14 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-11 days') END
FROM c4;

WITH RECURSIVE c5(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c5 WHERE x < 45)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_05_' || x, 'ws_saif_demo', 'ep_saif_05', 'li-wa', 'vid_05_' || x, 'vh_05_' || x, 'redirect', 'linkedin', 'organic',
  CASE WHEN x <= 22 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-12 days')
       WHEN x <= 39 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-10 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-7 days') END
FROM c5;

WITH RECURSIVE c6(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c6 WHERE x < 54)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_06_' || x, 'ws_saif_demo', 'ep_saif_06', 'ig-funnel', 'vid_06_' || x, 'vh_06_' || x, 'redirect', 'instagram', 'reel',
  CASE WHEN x <= 25 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-8 days')
       WHEN x <= 44 THEN strftime('%Y-%m-%dT00:00:00Z', 'now', '-6 days')
       ELSE strftime('%Y-%m-%dT12:00:00Z', 'now', '-3 days') END
FROM c6;

WITH RECURSIVE c7(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c7 WHERE x < 68)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_07_' || x, 'ws_saif_demo', 'ep_saif_07', 'li-saif', 'vid_07_' || x, 'vh_07_' || x, 'redirect', 'linkedin', 'organic',
  CASE WHEN x <= 34 THEN strftime('%Y-%m-%dT14:00:00Z', 'now', '-4 days')
       ELSE strftime('%Y-%m-%dT10:00:00Z', 'now', '-2 days') END
FROM c7;

WITH RECURSIVE cn1(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cn1 WHERE x < 32)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_n1_' || x, 'ws_nazhir_demo', 'ep_naz_01', 'wk-sumur', 'vn1_' || x, 'vhn1_' || x, 'redirect', 'whatsapp', 'broadcast',
  strftime('%Y-%m-%dT12:00:00Z', 'now', '-14 days') FROM cn1;

WITH RECURSIVE cn2(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cn2 WHERE x < 24)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_n2_' || x, 'ws_nazhir_demo', 'ep_naz_02', 'tb-subuh', 'vn2_' || x, 'vhn2_' || x, 'redirect', 'youtube', 'description',
  strftime('%Y-%m-%dT12:00:00Z', 'now', '-9 days') FROM cn2;

WITH RECURSIVE cn3(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cn3 WHERE x < 18)
INSERT INTO touchpoints (id, workspace_id, episode_id, shortlink_code, visitor_id, visitor_hash, touch_type, utm_source, utm_medium, created_at)
SELECT 'tp_n3_' || x, 'ws_nazhir_demo', 'ep_naz_03', 'wk-prod', 'vn3_' || x, 'vhn3_' || x, 'redirect', 'instagram', 'reel',
  strftime('%Y-%m-%dT12:00:00Z', 'now', '-2 days') FROM cn3;

-- 6. Conversions (waflare leads -> qualified -> midtrans/qris/xendit/stripe paid)
INSERT INTO conversions (
  id, workspace_id, external_id, provider, stage, customer_hash, customer_ref, visitor_id,
  first_touch_episode_id, last_touch_episode_id, utm_source, utm_medium, currency, amount, amount_idr, occurred_at
) VALUES
-- ep-01 (tiktok, vanity high-views, 2 low-ticket Rp150k sales)
('cv_01_l1', 'ws_saif_demo', 'wa_01_1', 'waflare', 'lead', 'ch_01_1', '6281***101', 'vid_01_1', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT15:00:00Z', 'now', '-30 days')),
('cv_01_p1', 'ws_saif_demo', 'qris_01_1', 'qris', 'paid', 'ch_01_1', '6281***101', 'vid_01_1', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'qris', 'IDR', 150000, 150000, strftime('%Y-%m-%dT18:00:00Z', 'now', '-30 days')),
('cv_01_l2', 'ws_saif_demo', 'wa_01_2', 'waflare', 'lead', 'ch_01_2', '6281***102', 'vid_01_2', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT02:00:00Z', 'now', '-28 days')),
('cv_01_p2', 'ws_saif_demo', 'qris_01_2', 'qris', 'paid', 'ch_01_2', '6281***102', 'vid_01_2', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'qris', 'IDR', 150000, 150000, strftime('%Y-%m-%dT05:00:00Z', 'now', '-28 days')),
('cv_01_l3', 'ws_saif_demo', 'wa_01_3', 'waflare', 'lead', 'ch_01_3', '6281***103', 'vid_01_3', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT10:00:00Z', 'now', '-28 days')),
('cv_01_l4', 'ws_saif_demo', 'wa_01_4', 'waflare', 'lead', 'ch_01_4', '6281***104', 'vid_01_4', 'ep_saif_01', 'ep_saif_01', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT11:00:00Z', 'now', '-28 days')),

-- ep-02 (instagram, 3 x Rp650k = Rp1.950.000 within D+3)
('cv_02_l1', 'ws_saif_demo', 'wa_02_1', 'waflare', 'lead', 'ch_02_1', '6281***201', 'vid_02_1', 'ep_saif_02', 'ep_saif_02', 'instagram', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT16:00:00Z', 'now', '-25 days')),
('cv_02_p1', 'ws_saif_demo', 'mid_02_1', 'midtrans', 'paid', 'ch_02_1', '6281***201', 'vid_02_1', 'ep_saif_02', 'ep_saif_02', 'instagram', 'midtrans', 'IDR', 650000, 650000, strftime('%Y-%m-%dT19:00:00Z', 'now', '-25 days')),
('cv_02_p2', 'ws_saif_demo', 'mid_02_2', 'midtrans', 'paid', 'ch_02_2', '6281***202', 'vid_02_2', 'ep_saif_02', 'ep_saif_02', 'instagram', 'midtrans', 'IDR', 650000, 650000, strftime('%Y-%m-%dT04:00:00Z', 'now', '-23 days')),
('cv_02_p3', 'ws_saif_demo', 'xnd_02_3', 'xendit', 'paid', 'ch_02_3', '6281***203', 'vid_02_3', 'ep_saif_02', 'ep_saif_02', 'instagram', 'xendit', 'IDR', 650000, 650000, strftime('%Y-%m-%dT06:00:00Z', 'now', '-23 days')),

-- ep-03 (tiktok VANITY_TRAP: 155k views D+3, 165 clicks, only 1 x Rp150k paid!)
('cv_03_l1', 'ws_saif_demo', 'wa_03_1', 'waflare', 'lead', 'ch_03_1', '6281***301', 'vid_03_1', 'ep_saif_03', 'ep_saif_03', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT16:00:00Z', 'now', '-20 days')),
('cv_03_l2', 'ws_saif_demo', 'wa_03_2', 'waflare', 'lead', 'ch_03_2', '6281***302', 'vid_03_2', 'ep_saif_03', 'ep_saif_03', 'tiktok', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT18:00:00Z', 'now', '-20 days')),
('cv_03_p1', 'ws_saif_demo', 'qris_03_1', 'qris', 'paid', 'ch_03_1', '6281***301', 'vid_03_1', 'ep_saif_03', 'ep_saif_03', 'tiktok', 'qris', 'IDR', 150000, 150000, strftime('%Y-%m-%dT04:00:00Z', 'now', '-18 days')),

-- ep-04 (youtube, 4 x Rp1.250k = Rp5.000.000 within D+3)
('cv_04_q1', 'ws_saif_demo', 'wa_04_1', 'waflare', 'qualified', 'ch_04_1', '6281***401', 'vid_04_1', 'ep_saif_04', 'ep_saif_04', 'youtube', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT15:00:00Z', 'now', '-16 days')),
('cv_04_p1', 'ws_saif_demo', 'xnd_04_1', 'xendit', 'paid', 'ch_04_1', '6281***401', 'vid_04_1', 'ep_saif_04', 'ep_saif_04', 'youtube', 'xendit', 'IDR', 1250000, 1250000, strftime('%Y-%m-%dT19:00:00Z', 'now', '-16 days')),
('cv_04_p2', 'ws_saif_demo', 'xnd_04_2', 'xendit', 'paid', 'ch_04_2', '6281***402', 'vid_04_2', 'ep_saif_04', 'ep_saif_04', 'youtube', 'xendit', 'IDR', 1250000, 1250000, strftime('%Y-%m-%dT03:00:00Z', 'now', '-14 days')),
('cv_04_p3', 'ws_saif_demo', 'mid_04_3', 'midtrans', 'paid', 'ch_04_3', '6281***403', 'vid_04_3', 'ep_saif_04', 'ep_saif_04', 'youtube', 'midtrans', 'IDR', 1250000, 1250000, strftime('%Y-%m-%dT05:00:00Z', 'now', '-14 days')),
('cv_04_p4', 'ws_saif_demo', 'mid_04_4', 'midtrans', 'paid', 'ch_04_4', '6281***404', 'vid_04_4', 'ep_saif_04', 'ep_saif_04', 'youtube', 'midtrans', 'IDR', 1250000, 1250000, strftime('%Y-%m-%dT06:00:00Z', 'now', '-14 days')),

-- ep-05 (linkedin, 4 x Rp1.800k = Rp7.200.000 within D+3)
('cv_05_q1', 'ws_saif_demo', 'wa_05_1', 'waflare', 'qualified', 'ch_05_1', '6281***501', 'vid_05_1', 'ep_saif_05', 'ep_saif_05', 'linkedin', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT15:00:00Z', 'now', '-12 days')),
('cv_05_p1', 'ws_saif_demo', 'xnd_05_1', 'xendit', 'paid', 'ch_05_1', '6281***501', 'vid_05_1', 'ep_saif_05', 'ep_saif_05', 'linkedin', 'xendit', 'IDR', 1800000, 1800000, strftime('%Y-%m-%dT20:00:00Z', 'now', '-12 days')),
('cv_05_p2', 'ws_saif_demo', 'xnd_05_2', 'xendit', 'paid', 'ch_05_2', '6281***502', 'vid_05_2', 'ep_saif_05', 'ep_saif_05', 'linkedin', 'xendit', 'IDR', 1800000, 1800000, strftime('%Y-%m-%dT03:00:00Z', 'now', '-10 days')),
('cv_05_p3', 'ws_saif_demo', 'mid_05_3', 'midtrans', 'paid', 'ch_05_3', '6281***503', 'vid_05_3', 'ep_saif_05', 'ep_saif_05', 'linkedin', 'midtrans', 'IDR', 1800000, 1800000, strftime('%Y-%m-%dT05:00:00Z', 'now', '-10 days')),
('cv_05_p4', 'ws_saif_demo', 'str_05_4', 'stripe', 'paid', 'ch_05_4', 'ce***@saas.id', 'vid_05_4', 'ep_saif_05', 'ep_saif_05', 'linkedin', 'stripe', 'USD', 112.5, 1800000, strftime('%Y-%m-%dT06:00:00Z', 'now', '-10 days')),

-- ep-06 (instagram, 3 x Rp900k = Rp2.700.000 within D+3)
('cv_06_p1', 'ws_saif_demo', 'mid_06_1', 'midtrans', 'paid', 'ch_06_1', '6281***601', 'vid_06_1', 'ep_saif_06', 'ep_saif_06', 'instagram', 'midtrans', 'IDR', 900000, 900000, strftime('%Y-%m-%dT18:00:00Z', 'now', '-8 days')),
('cv_06_p2', 'ws_saif_demo', 'mid_06_2', 'midtrans', 'paid', 'ch_06_2', '6281***602', 'vid_06_2', 'ep_saif_06', 'ep_saif_06', 'instagram', 'midtrans', 'IDR', 900000, 900000, strftime('%Y-%m-%dT03:00:00Z', 'now', '-6 days')),
('cv_06_p3', 'ws_saif_demo', 'qris_06_3', 'qris', 'paid', 'ch_06_3', '6281***603', 'vid_06_3', 'ep_saif_06', 'ep_saif_06', 'instagram', 'qris', 'IDR', 900000, 900000, strftime('%Y-%m-%dT06:00:00Z', 'now', '-6 days')),

-- ep-07 (linkedin BREAKOUT at D+3: 6 x Rp2.000k = Rp12.000.000! Includes multi-touch assists from ep_saif_01/02)
('cv_07_l1', 'ws_saif_demo', 'wa_07_1', 'waflare', 'lead', 'ch_07_1', '6281***701', 'vid_07_1', 'ep_saif_01', 'ep_saif_07', 'linkedin', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT15:00:00Z', 'now', '-4 days')),
('cv_07_q1', 'ws_saif_demo', 'wa_07_1_q', 'waflare', 'qualified', 'ch_07_1', '6281***701', 'vid_07_1', 'ep_saif_01', 'ep_saif_07', 'linkedin', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT16:00:00Z', 'now', '-4 days')),
('cv_07_p1', 'ws_saif_demo', 'xnd_07_1', 'xendit', 'paid', 'ch_07_1', '6281***701', 'vid_07_1', 'ep_saif_01', 'ep_saif_07', 'linkedin', 'xendit', 'IDR', 2000000, 2000000, strftime('%Y-%m-%dT19:00:00Z', 'now', '-4 days')),
('cv_07_p2', 'ws_saif_demo', 'xnd_07_2', 'xendit', 'paid', 'ch_07_2', '6281***702', 'vid_07_2', 'ep_saif_02', 'ep_saif_07', 'linkedin', 'xendit', 'IDR', 2000000, 2000000, strftime('%Y-%m-%dT21:00:00Z', 'now', '-4 days')),
('cv_07_p3', 'ws_saif_demo', 'mid_07_3', 'midtrans', 'paid', 'ch_07_3', '6281***703', 'vid_07_3', 'ep_saif_07', 'ep_saif_07', 'linkedin', 'midtrans', 'IDR', 2000000, 2000000, strftime('%Y-%m-%dT12:00:00Z', 'now', '-2 days')),
('cv_07_p4', 'ws_saif_demo', 'mid_07_4', 'midtrans', 'paid', 'ch_07_4', '6281***704', 'vid_07_4', 'ep_saif_07', 'ep_saif_07', 'linkedin', 'midtrans', 'IDR', 2000000, 2000000, strftime('%Y-%m-%dT14:00:00Z', 'now', '-2 days')),
('cv_07_p5', 'ws_saif_demo', 'qris_07_5', 'qris', 'paid', 'ch_07_5', '6281***705', 'vid_07_5', 'ep_saif_07', 'ep_saif_07', 'linkedin', 'qris', 'IDR', 2000000, 2000000, strftime('%Y-%m-%dT16:00:00Z', 'now', '-2 days')),
('cv_07_p6', 'ws_saif_demo', 'str_07_6', 'stripe', 'paid', 'ch_07_6', 'fo***@founder.id', 'vid_07_6', 'ep_saif_07', 'ep_saif_07', 'linkedin', 'stripe', 'USD', 125, 2000000, strftime('%Y-%m-%dT18:00:00Z', 'now', '-2 days')),

-- nazhir-reach conversions (wakaf QRIS & waflare)
('cv_n1_l1', 'ws_nazhir_demo', 'wa_n1_1', 'waflare', 'lead', 'chn_1', '6285***111', 'vn1_1', 'ep_naz_01', 'ep_naz_01', 'whatsapp', 'waflare', 'IDR', 0, 0, strftime('%Y-%m-%dT14:00:00Z', 'now', '-14 days')),
('cv_n1_p1', 'ws_nazhir_demo', 'qris_n1_1', 'qris', 'paid', 'chn_1', '6285***111', 'vn1_1', 'ep_naz_01', 'ep_naz_01', 'whatsapp', 'qris', 'IDR', 500000, 500000, strftime('%Y-%m-%dT18:00:00Z', 'now', '-14 days')),
('cv_n2_p1', 'ws_nazhir_demo', 'qris_n2_1', 'qris', 'paid', 'chn_2', '6285***222', 'vn2_1', 'ep_naz_02', 'ep_naz_02', 'youtube', 'qris', 'IDR', 1500000, 1500000, strftime('%Y-%m-%dT16:00:00Z', 'now', '-8 days')),
('cv_n3_p1', 'ws_nazhir_demo', 'qris_n3_1', 'qris', 'paid', 'chn_3', '6285***333', 'vn3_1', 'ep_naz_03', 'ep_naz_03', 'instagram', 'qris', 'IDR', 1000000, 1000000, strftime('%Y-%m-%dT15:00:00Z', 'now', '-1 days'));
