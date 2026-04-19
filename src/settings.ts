import type { FrameStyle, OverlaySettings, PercentPrecision, ThemeId } from './types';

const STORAGE_KEY = 'cursor-usage-overlay.settings.v3';

export const DEFAULT_SETTINGS: OverlaySettings = {
  refreshIntervalSec: 10,
  // glass: panel tint alpha. MD3: reused as surface “weight” (container emphasis)
  opacity: 0.78,
  compactMode: false,
  alwaysOnTop: true,
  clickThrough: false,
  frameStyle: 'md3',
  theme: 'aurora',
  autostart: false,
  showSparkline: true,
  showForecast: true,
  percentDecimals: 'auto',
};

const VALID_THEMES: ThemeId[] = ['aurora', 'mono', 'sunset', 'emerald', 'violet'];
const VALID_PRECISIONS: PercentPrecision[] = ['auto', 0, 1, 2, 3];

function normalizePrecision(value: unknown): PercentPrecision {
  if (value === 'auto') return 'auto';
  if (typeof value === 'number' && VALID_PRECISIONS.includes(value as PercentPrecision)) {
    return value as PercentPrecision;
  }
  return 'auto';
}

export function loadSettings(): OverlaySettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  const legacy = localStorage.getItem('cursor-usage-overlay.settings.v2');
  const source = raw ?? legacy;
  if (!source) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(source) as Partial<OverlaySettings>;
    const frameStyle: FrameStyle =
      parsed.frameStyle === 'glass' ? 'glass' : 'md3';
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      frameStyle,
      refreshIntervalSec: clampNumber(parsed.refreshIntervalSec, 5, 300, 10),
      opacity: clampNumber(parsed.opacity, 0.4, 1, frameStyle === 'md3' ? 1 : 0.78),
      theme: VALID_THEMES.includes(parsed.theme as ThemeId)
        ? (parsed.theme as ThemeId)
        : 'aurora',
      percentDecimals: normalizePrecision(parsed.percentDecimals),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: OverlaySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'mono', label: 'Mono' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'violet', label: 'Violet' },
];

export const FRAME_OPTIONS: { id: FrameStyle; label: string; hint: string }[] = [
  { id: 'md3', label: 'Material 3', hint: 'Solid surfaces, MD tokens, best readability' },
  { id: 'glass', label: 'Glass', hint: 'Tinted glass + your color theme' },
];
