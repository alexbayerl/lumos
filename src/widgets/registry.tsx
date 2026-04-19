import type { WidgetDef, WidgetInstance, WidgetKind } from './types';
import { ApiHero } from './components/ApiHero';
import { ApiMini, AutoMini, TotalMini } from './components/MiniRing';
import { RingsTrio } from './components/RingsTrio';
import { CycleWidget } from './components/CycleWidget';
import { UsageBar } from './components/UsageBar';
import { ForecastWidget } from './components/ForecastWidget';
import { SparklineWidget } from './components/SparklineWidget';
import { RemainingStat, UsedStat } from './components/QuickStat';

export const WIDGET_REGISTRY: Record<WidgetKind, WidgetDef> = {
  'api-hero': {
    kind: 'api-hero',
    label: 'API Usage (hero)',
    description: 'Large priority card for named-model spend (Opus etc.)',
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
    Component: ApiHero,
  },
  'rings-trio': {
    kind: 'rings-trio',
    label: 'Rings (Auto · API · Total)',
    description: 'Compact 3-ring strip for at-a-glance comparison',
    defaultSize: { w: 12, h: 3 },
    minSize: { w: 6, h: 2 },
    Component: RingsTrio,
  },
  'auto-mini': {
    kind: 'auto-mini',
    label: 'Auto · mini ring',
    description: 'Just the auto-selected model usage',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    Component: AutoMini,
  },
  'api-mini': {
    kind: 'api-mini',
    label: 'API · mini ring',
    description: 'Just the API named-model usage',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    Component: ApiMini,
  },
  'total-mini': {
    kind: 'total-mini',
    label: 'Total · mini ring',
    description: 'Combined plan usage',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    Component: TotalMini,
  },
  forecast: {
    kind: 'forecast',
    label: 'Forecast',
    description: 'Burn rate, projection, recommended daily budget',
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
    Component: ForecastWidget,
  },
  sparkline: {
    kind: 'sparkline',
    label: 'Trend (sparkline)',
    description: 'Recent usage trajectory',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 4, h: 2 },
    Component: SparklineWidget,
  },
  cycle: {
    kind: 'cycle',
    label: 'Billing cycle',
    description: 'Days remaining + cycle progress',
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 4, h: 2 },
    Component: CycleWidget,
  },
  'quick-stat-used': {
    kind: 'quick-stat-used',
    label: 'Used (count)',
    description: 'Absolute units consumed this cycle',
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 3, h: 2 },
    Component: UsedStat,
  },
  'quick-stat-remaining': {
    kind: 'quick-stat-remaining',
    label: 'Remaining (count)',
    description: 'Absolute units left this cycle',
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 3, h: 2 },
    Component: RemainingStat,
  },
  'usage-bar': {
    kind: 'usage-bar',
    label: 'Usage bar (API vs Auto)',
    description: 'Stacked bar showing API share inside total plan usage',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    Component: UsageBar,
  },
};

export const WIDGET_LIST: WidgetDef[] = Object.values(WIDGET_REGISTRY);

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * Default dashboard, optimized to fit comfortably in the default window
 * height while leading with API usage:
 *   row 0   ─ API Hero (full width, big ring, named-model focus)
 *   row 4   ─ Auto · API · Total mini rings (4-col each)
 *   row 7   ─ Usage bar (stacked API vs Auto split)
 *   row 9   ─ Forecast (full width)
 *   row 13  ─ Sparkline (8 col) + Cycle (4 col)
 */
export function buildDefaultLayout(): WidgetInstance[] {
  return [
    { id: uid('api-hero'), kind: 'api-hero', x: 0, y: 0, w: 12, h: 4 },
    { id: uid('auto-mini'), kind: 'auto-mini', x: 0, y: 4, w: 4, h: 3 },
    { id: uid('api-mini'), kind: 'api-mini', x: 4, y: 4, w: 4, h: 3 },
    { id: uid('total-mini'), kind: 'total-mini', x: 8, y: 4, w: 4, h: 3 },
    { id: uid('usage-bar'), kind: 'usage-bar', x: 0, y: 7, w: 12, h: 2 },
    { id: uid('forecast'), kind: 'forecast', x: 0, y: 9, w: 12, h: 4 },
    { id: uid('sparkline'), kind: 'sparkline', x: 0, y: 13, w: 8, h: 2 },
    { id: uid('cycle'), kind: 'cycle', x: 8, y: 13, w: 4, h: 2 },
  ];
}

export function newWidget(kind: WidgetKind, layout: WidgetInstance[]): WidgetInstance {
  const def = WIDGET_REGISTRY[kind];
  // Drop new widgets at the bottom of the current layout, full-width when small.
  const maxY = layout.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  return {
    id: uid(kind),
    kind,
    x: 0,
    y: maxY,
    w: def.defaultSize.w,
    h: def.defaultSize.h,
  };
}

// Bumped from v1 → v2 when the dashboard switched to the compact layout
// (smaller row height, slimmer widget bodies). Old stored layouts no longer
// match the new component sizes so we let the default rebuild on first load.
const STORAGE_KEY = 'cursor-usage-overlay.layout.v2';

export function loadLayout(): WidgetInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultLayout();
    const parsed = JSON.parse(raw) as WidgetInstance[];
    if (!Array.isArray(parsed) || parsed.length === 0) return buildDefaultLayout();
    // Drop entries with unknown kinds (forward-compat: older saved layouts).
    return parsed.filter((w) => w.kind in WIDGET_REGISTRY);
  } catch {
    return buildDefaultLayout();
  }
}

export function saveLayout(layout: WidgetInstance[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export function resetLayout(): WidgetInstance[] {
  const layout = buildDefaultLayout();
  saveLayout(layout);
  return layout;
}
