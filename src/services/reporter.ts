import type { WorkspaceRow } from '../types';
import { formatIdr, generateId } from '../utils/id';
import { buildWorkspaceDashboard } from './insights';

export interface ReportDispatchResult {
  workspace_slug: string;
  report_text: string;
  waflare_status: 'sent' | 'dry_run' | 'failed';
  telegram_status: 'sent' | 'dry_run' | 'failed';
}

/** Build a crisp plain-text / Markdown executive digest ready for WhatsApp & Telegram. */
export async function buildCohortReportText(db: D1Database, ws: WorkspaceRow): Promise<string> {
  const dash = await buildWorkspaceDashboard(db, ws.id, 'last_touch');
  const latestD3 = dash.cohorts_d3.at(-1);
  const latestD1 = dash.cohorts_d1.at(-1);
  const topPlatform = dash.platforms[0];
  const topInsight = dash.insights[0];

  const lines: string[] = [
    `*EDGE-FUNNEL DIGEST — ${ws.name}* (\`${ws.slug}\`)`,
    `Ringkasan Funnel: ${dash.totals.views.toLocaleString('id-ID')} views | ${dash.totals.clicks.toLocaleString('id-ID')} klik | ${dash.totals.leads} lead | ${dash.totals.paid} paid`,
    `Total Revenue: *${formatIdr(dash.totals.revenue_idr)}* | RPM Efektif: *${formatIdr(dash.totals.effective_rpm_idr)}*/1k`,
  ];

  if (topPlatform) {
    lines.push(
      `Top Closer: *${topPlatform.platform.toUpperCase()}* (${topPlatform.click_to_paid_pct}% click-to-paid, ${formatIdr(topPlatform.revenue_idr)})`
    );
  }

  if (latestD3) {
    const delta =
      latestD3.vs_median5?.revenue_pct !== null && latestD3.vs_median5?.revenue_pct !== undefined
        ? `${latestD3.vs_median5.revenue_pct >= 0 ? '+' : ''}${latestD3.vs_median5.revenue_pct}% vs median-5`
        : 'baseline awal';
    lines.push(
      `Cohort D+3 Terbaru (\`${latestD3.episode_code}\`): ${formatIdr(latestD3.metrics.revenue_idr)} (${delta}) [${latestD3.verdict}]`
    );
  } else if (latestD1) {
    lines.push(
      `Cohort D+1 Terbaru (\`${latestD1.episode_code}\`): ${formatIdr(latestD1.metrics.revenue_idr)} (${latestD1.metrics.paid} paid)`
    );
  }

  if (topInsight) {
    lines.push(`Insight Utama: ${topInsight.headline}.`);
  }

  return lines.join('\n');
}

async function logReportDelivery(
  db: D1Database,
  workspaceId: string,
  channel: 'waflare' | 'telegram' | 'preview',
  status: 'sent' | 'dry_run' | 'failed',
  payloadText: string,
  errorMessage?: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO report_deliveries (id, workspace_id, channel, status, payload_text, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(generateId('rep', 12), workspaceId, channel, status, payloadText, errorMessage ?? null)
    .run();
}

/** Format and send (or dry-run log) the workspace digest to WhatsApp (`waflare`) & Telegram. */
export async function dispatchWorkspaceReport(
  db: D1Database,
  ws: WorkspaceRow,
  fetcher: typeof fetch = fetch
): Promise<ReportDispatchResult> {
  const reportText = await buildCohortReportText(db, ws);

  let waflareStatus: 'sent' | 'dry_run' | 'failed' = 'dry_run';
  if (ws.waflare_api_url && ws.report_wa_recipient) {
    try {
      const resp = await fetcher(ws.waflare_api_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(ws.waflare_api_token ? { authorization: `Bearer ${ws.waflare_api_token}` } : {}),
        },
        body: JSON.stringify({
          to: ws.report_wa_recipient,
          text: reportText,
          workspace: ws.slug,
        }),
      });
      waflareStatus = resp.ok ? 'sent' : 'failed';
      await logReportDelivery(
        db,
        ws.id,
        'waflare',
        waflareStatus,
        reportText,
        resp.ok ? undefined : `HTTP ${resp.status}`
      );
    } catch (err) {
      waflareStatus = 'failed';
      await logReportDelivery(
        db,
        ws.id,
        'waflare',
        'failed',
        reportText,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  } else {
    await logReportDelivery(db, ws.id, 'waflare', 'dry_run', reportText);
  }

  let telegramStatus: 'sent' | 'dry_run' | 'failed' = 'dry_run';
  if (ws.telegram_bot_token && ws.telegram_chat_id) {
    try {
      const tgUrl = `https://api.telegram.org/bot${ws.telegram_bot_token}/sendMessage`;
      const resp = await fetcher(tgUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: ws.telegram_chat_id,
          text: reportText,
          parse_mode: 'Markdown',
        }),
      });
      telegramStatus = resp.ok ? 'sent' : 'failed';
      await logReportDelivery(
        db,
        ws.id,
        'telegram',
        telegramStatus,
        reportText,
        resp.ok ? undefined : `HTTP ${resp.status}`
      );
    } catch (err) {
      telegramStatus = 'failed';
      await logReportDelivery(
        db,
        ws.id,
        'telegram',
        'failed',
        reportText,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  } else {
    await logReportDelivery(db, ws.id, 'telegram', 'dry_run', reportText);
  }

  return {
    workspace_slug: ws.slug,
    report_text: reportText,
    waflare_status: waflareStatus,
    telegram_status: telegramStatus,
  };
}
