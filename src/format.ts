import type { PercentPrecision } from './types';

/**
 * Single source of truth for rendering percentage values across rings,
 * the hero card, the header, and the usage bar. Keeping this in one place
 * means the user-configured `percentDecimals` setting affects everything
 * consistently — no per-component drift.
 *
 * - `auto`: legacy behaviour. Below 10% we keep one decimal so values like
 *   2.6% don't collapse to "3%"; at or above 10% we drop decimals because
 *   the trailing digit usually adds noise more than information.
 * - `0..3`: fixed decimal count for users who want to track sub-percent
 *   movement live (the API summary endpoint reports four decimals).
 *
 * Values are clamped to [0, 100] for display so an over-quota account
 * (apiPercentUsed > 100) renders as "100%" rather than alarming-looking
 * "127.83%" inside a gauge that visually caps at full.
 */
export function formatPercent(
  value: number,
  precision: PercentPrecision = 'auto',
  options: { suffix?: string; clamp?: boolean } = {},
): string {
  const { suffix = '%', clamp = false } = options;
  if (!Number.isFinite(value)) return `0${suffix}`;
  const v = clamp ? Math.max(0, Math.min(100, value)) : value;
  if (precision === 'auto') {
    const decimals = Math.abs(v) < 10 ? 1 : 0;
    return `${v.toFixed(decimals)}${suffix}`;
  }
  return `${v.toFixed(precision)}${suffix}`;
}

/**
 * Helper for the bar legend / hero secondary text where we want at least
 * one decimal regardless of the auto rule, but still respect a higher
 * user-chosen precision.
 */
export function formatPercentDetailed(
  value: number,
  precision: PercentPrecision = 'auto',
): string {
  if (precision === 'auto') return formatPercent(value, 2);
  return formatPercent(value, precision);
}
