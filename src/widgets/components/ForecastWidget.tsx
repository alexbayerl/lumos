import type { WidgetContext } from '../types';
import { ForecastPanel } from '../../components/ForecastPanel';

export function ForecastWidget({ ctx }: { ctx: WidgetContext }) {
  if (!ctx.forecast) {
    return (
      <div className="widget widget-forecast empty">
        <div className="widget-eyebrow">FORECAST</div>
        <div className="widget-empty-text">Collecting samples…</div>
      </div>
    );
  }
  return (
    <div className="widget widget-forecast">
      <ForecastPanel forecast={ctx.forecast} remaining={ctx.usage.remaining} />
    </div>
  );
}
