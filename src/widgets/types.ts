import type { ComponentType } from 'react';
import type {
  Forecast,
  PercentPrecision,
  PlanUsage,
  UsageSnapshot,
  UsageSummaryResponse,
} from '../types';

/**
 * Every widget is rendered with the same context. Widgets read what they need
 * and ignore the rest. Adding new widgets only requires:
 *   1. Authoring a component that takes WidgetContext.
 *   2. Adding an entry to WIDGET_REGISTRY.
 *   3. (Optional) Adding it to the default layout.
 */
export interface WidgetContext {
  summary: UsageSummaryResponse;
  usage: PlanUsage;
  history: UsageSnapshot[];
  forecast: Forecast | null;
  /** ISO timestamp of last successful fetch, for "Updated x ago" labels */
  lastFetchedAt: string | null;
  /** True if last response was a 304 from the cache */
  fromCache: boolean;
  /** Monotonically incremented every few seconds so widgets refresh "x ago" */
  tick: number;
  /** User-configured decimal precision for every percentage display */
  percentDecimals: PercentPrecision;
}

export type WidgetKind =
  | 'api-hero'
  | 'rings-trio'
  | 'auto-mini'
  | 'api-mini'
  | 'total-mini'
  | 'forecast'
  | 'sparkline'
  | 'cycle'
  | 'quick-stat-used'
  | 'quick-stat-remaining'
  | 'usage-bar';

export interface WidgetDef {
  kind: WidgetKind;
  label: string;
  description: string;
  /** Default size in grid units (12-col grid, ~36px row). */
  defaultSize: { w: number; h: number };
  /** Hard floor below which the widget doesn't render properly. */
  minSize: { w: number; h: number };
  Component: ComponentType<{ ctx: WidgetContext }>;
}

/**
 * One placed widget in the user's dashboard layout. The id is what
 * react-grid-layout uses internally; we keep it unique even across multiple
 * instances of the same kind so users could (later) add the same widget twice.
 */
export interface WidgetInstance {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
}
