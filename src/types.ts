export interface UsageBreakdown {
  included: number;
  bonus: number;
  total: number;
}

export interface PlanUsage {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
  breakdown: UsageBreakdown;
  autoPercentUsed: number;
  apiPercentUsed: number;
  totalPercentUsed: number;
}

export interface OnDemandUsage {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface IndividualUsage {
  plan: PlanUsage;
  onDemand: OnDemandUsage;
}

export interface UsageSummaryResponse {
  billingCycleStart: string;
  billingCycleEnd: string;
  membershipType: string;
  limitType: string | null;
  isUnlimited: boolean;
  autoModelSelectedDisplayMessage?: string | null;
  namedModelSelectedDisplayMessage?: string | null;
  individualUsage: IndividualUsage;
  teamUsage: Record<string, unknown>;
}

export interface FetchUsageResult {
  data: UsageSummaryResponse;
  etag?: string | null;
  fetchedAt: string;
  fromCache: boolean;
  status: number;
}

export interface UsageError {
  message: string;
  status?: number | null;
  auth?: boolean;
}

export type ThemeId = 'aurora' | 'mono' | 'sunset' | 'emerald' | 'violet';

/** Material Design 3 (default) vs legacy glass + Mica tint themes */
export type FrameStyle = 'md3' | 'glass';

/**
 * How precise the percentage labels inside ring gauges (and other
 * percentage chips) should render.
 *  - 'auto' = legacy behaviour (1 decimal below 10%, integer above)
 *  - 0..3   = fixed decimal count, useful for users who want to track
 *             sub-percent movement live (e.g. "12.27%" instead of "12%")
 */
export type PercentPrecision = 'auto' | 0 | 1 | 2 | 3;

export interface OverlaySettings {
  refreshIntervalSec: number;
  opacity: number;
  compactMode: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  frameStyle: FrameStyle;
  theme: ThemeId;
  autostart: boolean;
  showSparkline: boolean;
  showForecast: boolean;
  /** Decimal precision for percent displays (rings, hero, header). */
  percentDecimals: PercentPrecision;
}

export interface UsageSnapshot {
  /** epoch ms */
  t: number;
  /** absolute units used */
  used: number;
  /** plan limit at the time */
  limit: number;
}

export interface Forecast {
  /** units per hour, weighted blend of recent + cycle average */
  burnRatePerHour: number;
  /** units per day */
  burnRatePerDay: number;
  /** ISO date when limit will be hit at current rate, or null if never within cycle */
  exhaustsAt: string | null;
  /** hours until exhausted, or null */
  hoursUntilExhausted: number | null;
  /** projected % at end of cycle */
  projectedPctAtCycleEnd: number;
  /** units that should be your daily budget to land exactly on 100% at cycle end */
  recommendedDailyBudget: number;
  /** "ahead" | "ontrack" | "behind" relative to ideal pace */
  pace: 'ahead' | 'ontrack' | 'behind';
  /** difference between actual % used and ideal %, positive means burning too fast */
  paceDeltaPct: number;
  /** confidence 0..1, scales with sample density */
  confidence: number;
  /** human label e.g. "in 12 days" or "after cycle" */
  exhaustsLabel: string;
  /**
   * If the limit will be hit *before* the cycle ends, how many ms earlier
   * than the cycle end. 0 when the limit will not be hit within the cycle.
   * Used to show "5d 3h early" instead of meaningless ">100% capped" values.
   */
  msEarlyBeforeCycle: number;
}
