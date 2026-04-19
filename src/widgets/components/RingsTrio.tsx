import type { WidgetContext } from '../types';
import { RingGauge } from '../../components/RingGauge';

/** Ultra-compact 3-ring strip — Auto / API / Total side-by-side. */
export function RingsTrio({ ctx }: { ctx: WidgetContext }) {
  const { usage, percentDecimals } = ctx;
  return (
    <div className="widget widget-rings-trio">
      <div className="trio-cell">
        <RingGauge label="Auto" value={usage.autoPercentUsed} size={68} decimals={percentDecimals} />
      </div>
      <div className="trio-cell trio-emph">
        <RingGauge label="API" value={usage.apiPercentUsed} size={76} decimals={percentDecimals} />
      </div>
      <div className="trio-cell">
        <RingGauge label="Total" value={usage.totalPercentUsed} size={68} decimals={percentDecimals} />
      </div>
    </div>
  );
}
