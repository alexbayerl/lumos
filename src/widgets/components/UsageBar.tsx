import type { WidgetContext } from '../types';
import { formatPercentDetailed } from '../../format';

const numberFormatter = new Intl.NumberFormat();

/**
 * Stacked horizontal bar that shows the API share inside the overall plan
 * usage — making "how much of the spent quota is named-model traffic" obvious.
 */
export function UsageBar({ ctx }: { ctx: WidgetContext }) {
  const { usage, percentDecimals } = ctx;
  const total = Math.max(0, usage.totalPercentUsed);
  const apiPct = Math.min(usage.apiPercentUsed, total);
  const autoPct = Math.max(0, total - apiPct);
  const fmt = (v: number) => formatPercentDetailed(v, percentDecimals);

  return (
    <div className="widget widget-usage-bar">
      <div className="widget-eyebrow">PLAN USAGE</div>
      <div className="bar-headline">
        <span className="bar-headline-value">
          {numberFormatter.format(usage.used)}
        </span>
        <span className="bar-headline-sub">
          of {numberFormatter.format(usage.limit)} ({fmt(total)})
        </span>
      </div>
      <div className="usage-bar-track" aria-label="Usage breakdown">
        <div
          className="usage-bar-seg seg-api"
          style={{ width: `${apiPct}%` }}
          title={`API named: ${fmt(apiPct)}`}
        />
        <div
          className="usage-bar-seg seg-auto"
          style={{ width: `${autoPct}%` }}
          title={`Auto: ${fmt(autoPct)}`}
        />
      </div>
      <div className="usage-bar-legend">
        <span className="legend-item">
          <span className="legend-swatch swatch-api" /> API {fmt(apiPct)}
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-auto" /> Auto {fmt(autoPct)}
        </span>
      </div>
    </div>
  );
}
