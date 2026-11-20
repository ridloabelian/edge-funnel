import type {
  AttributionModel,
  CohortComparison,
  NaturalInsight,
  PlatformFunnelRow,
} from '../types';
import { formatIdr } from '../utils/id';
import {
  buildTrajectoryFromRaw,
  calculateCohortsFromRaw,
  loadWorkspaceRawData,
  type TrajectoryPoint,
  type WorkspaceRawData,
} from './cohort';

export interface FunnelTotals {
  episodes_count: number;
  views: number;
  clicks: number;
  leads: number;
  qualified: number;
  paid: number;
  revenue_idr: number;
  effective_rpm_idr: number;
  click_to_paid_pct: number;
  lead_to_paid_pct: number;
}

export interface WorkspaceDashboardData {
  model: AttributionModel;
  totals: FunnelTotals;
  platforms: PlatformFunnelRow[];
  insights: NaturalInsight[];
  trajectory: TrajectoryPoint[];
  cohorts_d1: CohortComparison[];
  cohorts_d3: CohortComparison[];
  cohorts_d7: CohortComparison[];
}

export function computePlatformFunnelFromRaw(
  raw: WorkspaceRawData,
  model: AttributionModel
): { totals: FunnelTotals; platforms: PlatformFunnelRow[] } {
  const epMap = new Map(raw.episodes.map((ep) => [ep.id, ep]));

  // Latest available snapshot views per episode
  const latestViewsByEp = new Map<string, number>();
  for (const snap of raw.snapshots) {
    latestViewsByEp.set(snap.episode_id, snap.views);
  }

  const clicksByEp = new Map<string, number>();
  for (const tp of raw.touchpoints) {
    clicksByEp.set(tp.episode_id, (clicksByEp.get(tp.episode_id) ?? 0) + 1);
  }

  interface Bucket {
    episodes: Set<string>;
    views: number;
    clicks: number;
    allActors: Set<string>;
    qualActors: Set<string>;
    paid: number;
    revenueIdr: number;
  }

  const buckets = new Map<string, Bucket>();
  const ensureBucket = (platform: string): Bucket => {
    const existing = buckets.get(platform);
    if (existing) return existing;
    const created: Bucket = {
      episodes: new Set<string>(),
      views: 0,
      clicks: 0,
      allActors: new Set<string>(),
      qualActors: new Set<string>(),
      paid: 0,
      revenueIdr: 0,
    };
    buckets.set(platform, created);
    return created;
  };

  for (const ep of raw.episodes) {
    const b = ensureBucket(ep.platform);
    b.episodes.add(ep.id);
    b.views += latestViewsByEp.get(ep.id) ?? 0;
    b.clicks += clicksByEp.get(ep.id) ?? 0;
  }

  for (const conv of raw.conversions) {
    const epId =
      model === 'first_touch' ? conv.first_touch_episode_id : conv.last_touch_episode_id;
    const ep = epId ? epMap.get(epId) : undefined;
    const platform = ep?.platform ?? conv.utm_source ?? 'direct';
    const b = ensureBucket(platform);
    const actor = conv.customer_hash ?? conv.visitor_id ?? conv.id;
    b.allActors.add(actor);
    if (conv.stage === 'qualified' || conv.stage === 'paid') {
      b.qualActors.add(actor);
    }
    if (conv.stage === 'paid') {
      b.paid += 1;
      b.revenueIdr += conv.amount_idr;
    }
  }

  let totalViews = 0;
  let totalClicks = 0;
  let totalLeads = 0;
  let totalQualified = 0;
  let totalPaid = 0;
  let totalRevenue = 0;

  const preliminary = Array.from(buckets.entries()).map(([platform, b]) => {
    const qualified = Math.max(b.paid, b.qualActors.size);
    const leads = Math.max(qualified, b.allActors.size);
    totalViews += b.views;
    totalClicks += b.clicks;
    totalLeads += leads;
    totalQualified += qualified;
    totalPaid += b.paid;
    totalRevenue += b.revenueIdr;
    return {
      platform,
      episodes_count: b.episodes.size,
      views: b.views,
      clicks: b.clicks,
      leads,
      qualified,
      paid: b.paid,
      revenue_idr: b.revenueIdr,
    };
  });

  const platforms: PlatformFunnelRow[] = preliminary
    .map((p) => ({
      ...p,
      views_share_pct: totalViews > 0 ? Number(((p.views / totalViews) * 100).toFixed(1)) : 0,
      clicks_share_pct: totalClicks > 0 ? Number(((p.clicks / totalClicks) * 100).toFixed(1)) : 0,
      revenue_share_pct:
        totalRevenue > 0 ? Number(((p.revenue_idr / totalRevenue) * 100).toFixed(1)) : 0,
      click_to_paid_pct: p.clicks > 0 ? Number(((p.paid / p.clicks) * 100).toFixed(2)) : 0,
      lead_to_paid_pct: p.leads > 0 ? Number(((p.paid / p.leads) * 100).toFixed(2)) : 0,
      effective_rpm_idr: p.views > 0 ? Math.round((p.revenue_idr / p.views) * 1000) : 0,
    }))
    .sort((a, b) => b.revenue_idr - a.revenue_idr || b.views - a.views);

  const totals: FunnelTotals = {
    episodes_count: raw.episodes.length,
    views: totalViews,
    clicks: totalClicks,
    leads: totalLeads,
    qualified: totalQualified,
    paid: totalPaid,
    revenue_idr: totalRevenue,
    effective_rpm_idr: totalViews > 0 ? Math.round((totalRevenue / totalViews) * 1000) : 0,
    click_to_paid_pct: totalClicks > 0 ? Number(((totalPaid / totalClicks) * 100).toFixed(2)) : 0,
    lead_to_paid_pct: totalLeads > 0 ? Number(((totalPaid / totalLeads) * 100).toFixed(2)) : 0,
  };

  return { totals, platforms };
}

/** Generate deterministic Bahasa Indonesia executive insights contrasting vanity reach vs revenue. */
export function generateNaturalInsights(
  platforms: PlatformFunnelRow[],
  cohortsD3: CohortComparison[],
  cohortsD1: CohortComparison[],
  firstTouchPlatforms: PlatformFunnelRow[]
): NaturalInsight[] {
  const insights: NaturalInsight[] = [];

  const withTraffic = platforms.filter((p) => p.clicks > 0 || p.views > 0);
  if (withTraffic.length >= 2) {
    const topTraffic = [...withTraffic].sort(
      (a, b) => b.views - a.views || b.clicks - a.clicks
    )[0];
    const bestRpm = [...withTraffic]
      .filter((p) => p.paid > 0)
      .sort((a, b) => b.effective_rpm_idr - a.effective_rpm_idr)[0];

    if (topTraffic && bestRpm && topTraffic.platform !== bestRpm.platform) {
      const rpmRatio =
        topTraffic.effective_rpm_idr > 0
          ? (bestRpm.effective_rpm_idr / topTraffic.effective_rpm_idr).toFixed(1)
          : '∞';
      insights.push({
        id: 'vanity-vs-revenue',
        severity: 'warning',
        headline: `${topTraffic.platform.toUpperCase()} menyumbang ${topTraffic.clicks_share_pct}% klik & ${topTraffic.views_share_pct}% views, tapi konversi bayar cuma ${topTraffic.click_to_paid_pct}%`,
        detail: `Sebaliknya ${bestRpm.platform.toUpperCase()} hanya butuh ${bestRpm.views.toLocaleString('id-ID')} views namun mencetak konversi bayar ${bestRpm.click_to_paid_pct}% dengan RPM Efektif ${formatIdr(bestRpm.effective_rpm_idr)}/1k views (${rpmRatio}x lebih bernilai daripada ${topTraffic.platform}).`,
        metric_badge: `${rpmRatio}x RPM`,
      });
    }
  }

  const latestD3 = cohortsD3.at(-1);
  if (latestD3 && latestD3.vs_median5 && latestD3.vs_median5.revenue_pct !== null) {
    const revDelta = latestD3.vs_median5.revenue_pct;
    const sign = revDelta >= 0 ? '+' : '';
    const isWin = revDelta >= 15;
    insights.push({
      id: 'cohort-d3-velocity',
      severity: isWin ? 'win' : 'opportunity',
      headline: `Cohort D+3 ${latestD3.episode_code} (${latestD3.platform}): Revenue ${sign}${revDelta}% vs median 5 episode di umur hari ke-3`,
      detail: `Pada umur tayang tepat 72 jam, ${latestD3.episode_code} mengumpulkan ${formatIdr(latestD3.metrics.revenue_idr)} (${latestD3.metrics.paid} paid) dibanding median D+3 historis ${formatIdr(latestD3.vs_median5.median_revenue_idr)}.`,
      metric_badge: `D+3 ${sign}${revDelta}%`,
    });
  } else {
    const latestD1 = cohortsD1.at(-1);
    if (latestD1 && latestD1.vs_prev && latestD1.vs_prev.revenue_pct !== null) {
      const sign = latestD1.vs_prev.revenue_pct >= 0 ? '+' : '';
      insights.push({
        id: 'cohort-d1-velocity',
        severity: 'win',
        headline: `Cohort D+1 ${latestD1.episode_code} bergerak ${sign}${latestD1.vs_prev.revenue_pct}% dibanding ${latestD1.vs_prev.prev_episode_code} di Hari ke-1`,
        detail: `Perbandingan apple-to-apple 24 jam pertama mencatat ${latestD1.metrics.clicks} klik dan ${formatIdr(latestD1.metrics.revenue_idr)} revenue.`,
        metric_badge: `D+1 ${sign}${latestD1.vs_prev.revenue_pct}%`,
      });
    }
  }

  // Detect First-Touch Assist vs Last-Touch Closer shift
  if (platforms.length > 0 && firstTouchPlatforms.length > 0) {
    const ftMap = new Map(firstTouchPlatforms.map((p) => [p.platform, p]));
    let biggestAssistGap = 0;
    let assistPlatform: { platform: string; ftRev: number; ltRev: number } | null = null;
    for (const lt of platforms) {
      const ft = ftMap.get(lt.platform);
      if (!ft) continue;
      const gap = ft.revenue_idr - lt.revenue_idr;
      if (gap > biggestAssistGap) {
        biggestAssistGap = gap;
        assistPlatform = { platform: lt.platform, ftRev: ft.revenue_idr, ltRev: lt.revenue_idr };
      }
    }
    if (assistPlatform && biggestAssistGap > 0) {
      insights.push({
        id: 'first-touch-assist',
        severity: 'attribution',
        headline: `${assistPlatform.platform.toUpperCase()} adalah Top-of-Funnel Assist (+${formatIdr(biggestAssistGap)} kredit First-Touch)`,
        detail: `Pada model First-Touch, ${assistPlatform.platform} memicu ${formatIdr(assistPlatform.ftRev)} pendapatan yang baru ditutup oleh channel lain pada Last-Touch (${formatIdr(assistPlatform.ltRev)}).`,
        metric_badge: 'FIRST-TOUCH ASSIST',
      });
    }
  }

  return insights;
}

export async function buildWorkspaceDashboard(
  db: D1Database,
  workspaceId: string,
  model: AttributionModel = 'last_touch',
  asOfIso = new Date().toISOString()
): Promise<WorkspaceDashboardData> {
  const raw = await loadWorkspaceRawData(db, workspaceId);
  const { totals, platforms } = computePlatformFunnelFromRaw(raw, model);
  const firstTouchSummary =
    model === 'first_touch'
      ? { totals, platforms }
      : computePlatformFunnelFromRaw(raw, 'first_touch');
  const lastTouchSummary =
    model === 'last_touch'
      ? { totals, platforms }
      : computePlatformFunnelFromRaw(raw, 'last_touch');

  const cohorts_d1 = calculateCohortsFromRaw(raw, 1, model, asOfIso);
  const cohorts_d3 = calculateCohortsFromRaw(raw, 3, model, asOfIso);
  const cohorts_d7 = calculateCohortsFromRaw(raw, 7, model, asOfIso);
  const trajectory = buildTrajectoryFromRaw(raw, model, asOfIso);
  const insights = generateNaturalInsights(
    lastTouchSummary.platforms,
    cohorts_d3,
    cohorts_d1,
    firstTouchSummary.platforms
  );

  return {
    model,
    totals,
    platforms,
    insights,
    trajectory,
    cohorts_d1,
    cohorts_d3,
    cohorts_d7,
  };
}
