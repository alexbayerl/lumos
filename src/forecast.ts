import type { Forecast, UsageSnapshot, UsageSummaryResponse } from './types';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface ForecastInput {
  summary: UsageSummaryResponse;
  history: UsageSnapshot[];
  /** epoch ms, defaults to Date.now(); pass to make pure */
  now?: number;
}

/**
 * Pattern-aware forecast that blends:
 *  - cycle average burn (since cycle start)
 *  - recent burn (last 24h, then last 6h) with higher weight
 *
 * Falls back gracefully when there's no history yet.
 */
export function computeForecast({ summary, history, now = Date.now() }: ForecastInput): Forecast {
  const plan = summary.individualUsage.plan;
  const used = plan.used;
  const limit = Math.max(plan.limit, 1);
  const cycleStart = new Date(summary.billingCycleStart).getTime();
  const cycleEnd = new Date(summary.billingCycleEnd).getTime();
  const cycleDurationMs = Math.max(cycleEnd - cycleStart, HOUR_MS);
  const elapsedMs = Math.max(now - cycleStart, HOUR_MS);
  const remainingMs = Math.max(cycleEnd - now, 0);
  const remainingUnits = Math.max(limit - used, 0);

  const cycleRatePerHour = (used / elapsedMs) * HOUR_MS;

  const recentRate24h = rateBetween(history, now - DAY_MS, now);
  const recentRate6h = rateBetween(history, now - 6 * HOUR_MS, now);

  const recentBlend = blend(recentRate6h, recentRate24h, 0.6);
  const blended = blend(recentBlend, cycleRatePerHour, 0.65);
  const burnRatePerHour = clampNonNeg(blended);
  const burnRatePerDay = burnRatePerHour * 24;

  const hoursUntilExhausted =
    burnRatePerHour > 0 ? remainingUnits / burnRatePerHour : null;

  let exhaustsAt: string | null = null;
  let exhaustsLabel = 'After cycle';
  let msEarlyBeforeCycle = 0;
  if (hoursUntilExhausted !== null) {
    const exhaustMs = now + hoursUntilExhausted * HOUR_MS;
    if (exhaustMs <= cycleEnd) {
      exhaustsAt = new Date(exhaustMs).toISOString();
      exhaustsLabel = humanizeDuration(exhaustMs - now);
      msEarlyBeforeCycle = Math.max(cycleEnd - exhaustMs, 0);
    } else if (used >= limit) {
      exhaustsAt = new Date(now).toISOString();
      exhaustsLabel = 'Limit reached';
      msEarlyBeforeCycle = Math.max(cycleEnd - now, 0);
    }
  }

  const projectedUnitsAtCycleEnd =
    used + burnRatePerHour * (remainingMs / HOUR_MS);
  const projectedPctAtCycleEnd = clampPct((projectedUnitsAtCycleEnd / limit) * 100);

  const remainingDays = Math.max(remainingMs / DAY_MS, 1 / 24);
  const recommendedDailyBudget = Math.max(remainingUnits / remainingDays, 0);

  const idealPct = (elapsedMs / cycleDurationMs) * 100;
  const actualPct = (used / limit) * 100;
  const paceDeltaPct = actualPct - idealPct;
  const pace: Forecast['pace'] =
    paceDeltaPct < -3 ? 'ahead' : paceDeltaPct > 3 ? 'behind' : 'ontrack';

  const sampleSpanH = history.length > 1
    ? (history[history.length - 1]!.t - history[0]!.t) / HOUR_MS
    : 0;
  const confidence = clamp01(
    (Math.min(sampleSpanH, 24) / 24) * 0.6 + Math.min(history.length, 60) / 60 * 0.4,
  );

  return {
    burnRatePerHour,
    burnRatePerDay,
    exhaustsAt,
    hoursUntilExhausted,
    projectedPctAtCycleEnd,
    recommendedDailyBudget,
    pace,
    paceDeltaPct,
    confidence,
    exhaustsLabel,
    msEarlyBeforeCycle,
  };
}

/**
 * Compute units/hour from history snapshots between [from, to].
 * Returns NaN if insufficient samples, the caller decides fallback.
 */
function rateBetween(history: UsageSnapshot[], from: number, to: number): number {
  if (history.length < 2) return NaN;
  const inWindow = history.filter((s) => s.t >= from && s.t <= to);
  if (inWindow.length < 2) return NaN;
  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const dtH = (last.t - first.t) / HOUR_MS;
  if (dtH <= 0) return NaN;
  const delta = last.used - first.used;
  return delta / dtH;
}

function blend(primary: number, fallback: number, primaryWeight: number): number {
  if (Number.isFinite(primary) && Number.isFinite(fallback)) {
    return primary * primaryWeight + fallback * (1 - primaryWeight);
  }
  if (Number.isFinite(primary)) return primary;
  if (Number.isFinite(fallback)) return fallback;
  return 0;
}

function clampNonNeg(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(999, v));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function humanizeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hours = min / 60;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = hours / 24;
  if (days < 14) {
    const d = Math.floor(days);
    const h = Math.round((days - d) * 24);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  return `${Math.round(days)}d`;
}

export function paceLabel(pace: Forecast['pace']): string {
  switch (pace) {
    case 'ahead':
      return 'Under pace';
    case 'behind':
      return 'Over pace';
    default:
      return 'On pace';
  }
}
