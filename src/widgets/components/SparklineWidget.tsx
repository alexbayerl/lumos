import type { WidgetContext } from '../types';
import { Sparkline } from '../../components/Sparkline';

function summarizeSpan(history: WidgetContext['history']): string {
  if (history.length < 2) return '—';
  const ms = history[history.length - 1]!.t - history[0]!.t;
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 48) return `${hours.toFixed(0)}h`;
  return `${(hours / 24).toFixed(0)}d`;
}

export function SparklineWidget({ ctx }: { ctx: WidgetContext }) {
  return (
    <div className="widget widget-sparkline">
      <div className="widget-row">
        <div className="widget-eyebrow">TREND</div>
        <div className="widget-eyebrow muted">last {summarizeSpan(ctx.history)}</div>
      </div>
      <div className="sparkline-host">
        <Sparkline data={ctx.history} />
      </div>
    </div>
  );
}
