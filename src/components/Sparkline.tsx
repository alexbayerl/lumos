import { useMemo } from 'react';
import type { UsageSnapshot } from '../types';

interface Props {
  data: UsageSnapshot[];
  width?: number;
  height?: number;
}

/** Compact SVG area sparkline of usage % over time. */
export function Sparkline({ data, width = 220, height = 56 }: Props) {
  const path = useMemo(() => buildPath(data, width, height), [data, width, height]);

  if (data.length < 2) {
    return (
      <div className="sparkline empty" style={{ width, height }}>
        Collecting data…
      </div>
    );
  }

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Usage trend"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill="url(#spark-fill)" />
      <path
        d={path.line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function buildPath(
  data: UsageSnapshot[],
  width: number,
  height: number,
): { line: string; area: string } {
  if (data.length === 0) return { line: '', area: '' };

  const pts = data.map((s) => ({
    t: s.t,
    pct: Math.max(0, Math.min(100, s.limit > 0 ? (s.used / s.limit) * 100 : 0)),
  }));
  const minT = pts[0]!.t;
  const maxT = pts[pts.length - 1]!.t;
  const tSpan = Math.max(maxT - minT, 1);
  const minPct = Math.min(...pts.map((p) => p.pct));
  const maxPct = Math.max(...pts.map((p) => p.pct));
  const pSpan = Math.max(maxPct - minPct, 1);

  const padY = 4;
  const usableH = height - padY * 2;

  const xy = pts.map((p) => {
    const x = ((p.t - minT) / tSpan) * width;
    const y = padY + usableH - ((p.pct - minPct) / pSpan) * usableH;
    return { x, y };
  });

  const line = xy
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
  return { line, area };
}
