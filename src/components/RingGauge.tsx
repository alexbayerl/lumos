import { formatPercent } from '../format';
import type { PercentPrecision } from '../types';

interface Props {
  label: string;
  value: number;
  size?: number;
  /** Decimal precision for the centre label. Defaults to legacy 'auto'. */
  decimals?: PercentPrecision;
}

export function RingGauge({ label, value, size = 104, decimals = 'auto' }: Props) {
  const pct = clamp(value, 0, 100);
  const radius = (size - 16) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
  const gradientId = `ring-grad-${label.toLowerCase().replace(/\s+/g, '-')}`;
  // Use the actual (possibly >100) value for screen readers so the
  // a11y label remains truthful even when the gauge is visually capped.
  const a11yValue = Number.isFinite(value) ? value : 0;

  return (
    <div className={`ring-card tone-${tone}`}>
      <svg
        className="ring"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-label={`${label} ${formatPercent(a11yValue, decimals)}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-from)" />
            <stop offset="100%" stopColor="var(--ring-to)" />
          </linearGradient>
        </defs>
        <circle
          className="ring-track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={8}
        />
        <circle
          className="ring-progress"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          stroke={`url(#${gradientId})`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">{formatPercent(value, decimals, { clamp: true })}</div>
        <div className="ring-label">{label}</div>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
