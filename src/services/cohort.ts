import type {
  AttributionModel,
  CohortComparison,
  CohortDay,
  CohortMetricBlock,
  ConversionRow,
  EpisodeRow,
  MetricSnapshotRow,
  TouchpointRow,
} from '../types';
import { addDaysIso } from '../utils/id';

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return (left + right) / 2;
}

export function pctDelta(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return Number((((current - baseline) / baseline) * 100).toFixed(1));
}

function resolveSnapshotAtAge(
  snapshots: MetricSnapshotRow[],
  ageDays: CohortDay
): MetricSnapshotRow | null {
  const candidates = snapshots.filter((s) => s.age_days <= ageDays);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.age_days - a.age_days);
  return candidates[0] ?? null;
}

function buildMetricsAtCutoff(
  episode: EpisodeRow,
  ageDays: CohortDay,
  snapshots: MetricSnapshotRow[],
  touchpoints: TouchpointRow[],
  conversions: ConversionRow[],
  model: AttributionModel
): { cutoffAt: string; block: CohortMetricBlock } {
  const cutoffAt = addDaysIso(episode.published_at, ageDays);
  const cutoffMs = Date.parse(cutoffAt);
  const snap = resolveSnapshotAtAge(snapshots, ageDays);

  const views = snap?.views ?? 0;
  const likes = snap?.likes ?? 0;
  const comments = snap?.comments ?? 0;
  const shares = snap?.shares ?? 0;
  const followers_gained = snap?.followers_gained ?? 0;

  let clicks = 0;
  for (const tp of touchpoints) {
    if (tp.episode_id !== episode.id) continue;
    const tpMs = Date.parse(tp.created_at);
    if (tpMs <= cutoffMs) clicks += 1;
  }

  const attributed: ConversionRow[] = [];
  for (const conv of conversions) {
    const epId =
      model === 'first_touch' ? conv.first_touch_episode_id : conv.last_touch_episode_id;
    if (epId !== episode.id) continue;
    const convMs = Date.parse(conv.occurred_at);
    if (convMs <= cutoffMs) attributed.push(conv);
  }

  let paid = 0;
  let revenueIdr = 0;
  const allActors = new Set<string>();
  const qualifiedOrPaidActors = new Set<string>();

  for (const conv of attributed) {
    const actor = conv.customer_hash ?? conv.visitor_id ?? conv.id;
    allActors.add(actor);
    if (conv.stage === 'qualified' || conv.stage === 'paid') {
      qualifiedOrPaidActors.add(actor);
    }
    if (conv.stage === 'paid') {
      paid += 1;
      revenueIdr += conv.amount_idr;
    }
  }

  const qualified = Math.max(paid, qualifiedOrPaidActors.size);
  const leads = Math.max(qualified, allActors.size);
  const effective_rpm_idr = views > 0 ? Math.round((revenueIdr / views) * 1000) : 0;
  const click_to_paid_pct = clicks > 0 ? Number(((paid / clicks) * 100).toFixed(2)) : 0;
  const lead_to_paid_pct = leads > 0 ? Number(((paid / leads) * 100).toFixed(2)) : 0;

  return {
    cutoffAt,
    block: {
      views,
      likes,
      comments,
      shares,
      followers_gained,
      clicks,
      leads,
      qualified,
      paid,
      revenue_idr: revenueIdr,
      effective_rpm_idr,
      click_to_paid_pct,
      lead_to_paid_pct,
    },
  };
}

function classifyCohortVerdict(
  block: CohortMetricBlock,
  vsMedian: CohortComparison['vs_median5']
): CohortComparison['verdict'] {
  if (!vsMedian) {
    if (block.views >= 50_000 && block.click_to_paid_pct < 2) return 'VANITY_TRAP';
    return 'ON_PACE';
  }
  if (
    vsMedian.views_pct !== null &&
    vsMedian.views_pct >= 20 &&
    vsMedian.rpm_pct !== null &&
    vsMedian.rpm_pct <= -30
  ) {
    return 'VANITY_TRAP';
  }
  if (
    (vsMedian.revenue_pct !== null && vsMedian.revenue_pct >= 30) ||
    (vsMedian.rpm_pct !== null && vsMedian.rpm_pct >= 30)
  ) {
    return 'BREAKOUT';
  }
  if (vsMedian.revenue_pct !== null && vsMedian.revenue_pct >= 10) {
    return 'OUTPERFORMING';
  }
  if (vsMedian.revenue_pct !== null && vsMedian.revenue_pct <= -25) {
    return 'LAGGING';
  }
  return 'ON_PACE';
}

export interface WorkspaceRawData {
  episodes: EpisodeRow[];
  snapshots: MetricSnapshotRow[];
  touchpoints: TouchpointRow[];
  conversions: ConversionRow[];
}

/** Load raw telemetry rows for a single workspace cleanly in 4 scoped D1 queries. */
export async function loadWorkspaceRawData(
  db: D1Database,
  workspaceId: string
): Promise<WorkspaceRawData> {
  const [epRes, snapRes, tpRes, convRes] = await Promise.all([
    db
      .prepare('SELECT * FROM episodes WHERE workspace_id = ? ORDER BY published_at ASC')
      .bind(workspaceId)
      .all<EpisodeRow>(),
    db
      .prepare('SELECT * FROM metric_snapshots WHERE workspace_id = ? ORDER BY age_days ASC')
      .bind(workspaceId)
      .all<MetricSnapshotRow>(),
    db
      .prepare('SELECT * FROM touchpoints WHERE workspace_id = ? ORDER BY created_at ASC')
      .bind(workspaceId)
      .all<TouchpointRow>(),
    db
      .prepare('SELECT * FROM conversions WHERE workspace_id = ? ORDER BY occurred_at ASC')
      .bind(workspaceId)
      .all<ConversionRow>(),
  ]);

  return {
    episodes: epRes.results,
    snapshots: snapRes.results,
    touchpoints: tpRes.results,
    conversions: convRes.results,
  };
}

/**
 * Compute apple-to-apple Same-Age Cohort comparisons (`D+1`, `D+3`, or `D+7`).
 * Each episode is evaluated strictly using cumulative clicks, conversions, and snapshots
 * up to `published_at + day * 24h`, then compared against the previous eligible episode
 * and the rolling 5-episode median at the exact same age window.
 */
export function calculateCohortsFromRaw(
  raw: WorkspaceRawData,
  day: CohortDay,
  model: AttributionModel = 'last_touch',
  asOfIso = new Date().toISOString()
): CohortComparison[] {
  const asOfMs = Date.parse(asOfIso);
  const snapshotsByEp = new Map<string, MetricSnapshotRow[]>();

  for (const snap of raw.snapshots) {
    const arr = snapshotsByEp.get(snap.episode_id) ?? [];
    arr.push(snap);
    snapshotsByEp.set(snap.episode_id, arr);
  }

  const eligibleBase: Array<{
    episode: EpisodeRow;
    cutoffAt: string;
    block: CohortMetricBlock;
  }> = [];

  for (const ep of raw.episodes) {
    const snaps = snapshotsByEp.get(ep.id) ?? [];
    const cutoffMs = Date.parse(ep.published_at) + day * 86_400_000;
    const hasExactSnapshot = snaps.some((s) => s.age_days === day);

    if (asOfMs < cutoffMs && !hasExactSnapshot) {
      continue;
    }

    const { cutoffAt, block } = buildMetricsAtCutoff(
      ep,
      day,
      snaps,
      raw.touchpoints,
      raw.conversions,
      model
    );
    eligibleBase.push({ episode: ep, cutoffAt, block });
  }

  const results: CohortComparison[] = [];
  for (let i = 0; i < eligibleBase.length; i++) {
    const curr = eligibleBase[i];
    if (!curr) continue;

    const prev = i > 0 ? eligibleBase[i - 1] ?? null : null;
    const vs_prev: CohortComparison['vs_prev'] = prev
      ? {
          prev_episode_code: prev.episode.episode_code,
          views_pct: pctDelta(curr.block.views, prev.block.views),
          clicks_pct: pctDelta(curr.block.clicks, prev.block.clicks),
          paid_pct: pctDelta(curr.block.paid, prev.block.paid),
          revenue_pct: pctDelta(curr.block.revenue_idr, prev.block.revenue_idr),
          rpm_pct: pctDelta(curr.block.effective_rpm_idr, prev.block.effective_rpm_idr),
        }
      : null;

    const priorWindow = eligibleBase.slice(Math.max(0, i - 5), i);
    let vs_median5: CohortComparison['vs_median5'] = null;
    if (priorWindow.length > 0) {
      const medianViews = Math.round(computeMedian(priorWindow.map((w) => w.block.views)));
      const medianClicks = Math.round(computeMedian(priorWindow.map((w) => w.block.clicks)));
      const medianPaid = Number(computeMedian(priorWindow.map((w) => w.block.paid)).toFixed(1));
      const medianRevenue = Math.round(
        computeMedian(priorWindow.map((w) => w.block.revenue_idr))
      );
      const medianRpm = Math.round(
        computeMedian(priorWindow.map((w) => w.block.effective_rpm_idr))
      );

      vs_median5 = {
        sample_size: priorWindow.length,
        median_views: medianViews,
        median_clicks: medianClicks,
        median_paid: medianPaid,
        median_revenue_idr: medianRevenue,
        median_rpm_idr: medianRpm,
        views_pct: pctDelta(curr.block.views, medianViews),
        clicks_pct: pctDelta(curr.block.clicks, medianClicks),
        paid_pct: pctDelta(curr.block.paid, medianPaid),
        revenue_pct: pctDelta(curr.block.revenue_idr, medianRevenue),
        rpm_pct: pctDelta(curr.block.effective_rpm_idr, medianRpm),
      };
    }

    results.push({
      episode_id: curr.episode.id,
      episode_code: curr.episode.episode_code,
      title: curr.episode.title,
      platform: curr.episode.platform,
      campaign: curr.episode.campaign,
      published_at: curr.episode.published_at,
      age_days: day,
      cutoff_at: curr.cutoffAt,
      metrics: curr.block,
      vs_prev,
      vs_median5,
      verdict: classifyCohortVerdict(curr.block, vs_median5),
    });
  }

  return results;
}

export async function computeSameAgeCohorts(
  db: D1Database,
  workspaceId: string,
  day: CohortDay,
  model: AttributionModel = 'last_touch',
  asOfIso = new Date().toISOString()
): Promise<CohortComparison[]> {
  const raw = await loadWorkspaceRawData(db, workspaceId);
  return calculateCohortsFromRaw(raw, day, model, asOfIso);
}

export interface TrajectoryPoint {
  day: CohortDay;
  latest_episode_code: string | null;
  latest_revenue_idr: number;
  prev_revenue_idr: number;
  median5_revenue_idr: number;
  latest_views: number;
  latest_rpm_idr: number;
}

export function buildTrajectoryFromRaw(
  raw: WorkspaceRawData,
  model: AttributionModel,
  asOfIso = new Date().toISOString()
): TrajectoryPoint[] {
  const days: CohortDay[] = [1, 3, 7];
  return days.map((day) => {
    const cohorts = calculateCohortsFromRaw(raw, day, model, asOfIso);
    const latest = cohorts.at(-1) ?? null;
    const prev = cohorts.length >= 2 ? cohorts.at(-2) ?? null : null;
    return {
      day,
      latest_episode_code: latest?.episode_code ?? null,
      latest_revenue_idr: latest?.metrics.revenue_idr ?? 0,
      prev_revenue_idr: prev?.metrics.revenue_idr ?? 0,
      median5_revenue_idr: latest?.vs_median5?.median_revenue_idr ?? 0,
      latest_views: latest?.metrics.views ?? 0,
      latest_rpm_idr: latest?.metrics.effective_rpm_idr ?? 0,
    };
  });
}
