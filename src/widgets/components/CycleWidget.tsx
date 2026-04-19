import type { WidgetContext } from '../types';

const dayMs = 86_400_000;

export function CycleWidget({ ctx }: { ctx: WidgetContext }) {
  const start = new Date(ctx.summary.billingCycleStart).getTime();
  const end = new Date(ctx.summary.billingCycleEnd).getTime();
  const now = Date.now();
  const total = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(now - start, 0), total);
  const elapsedPct = (elapsed / total) * 100;
  const daysLeft = Math.max(0, Math.round((end - now) / dayMs));

  return (
    <div className="widget widget-cycle">
      <div className="widget-eyebrow">CYCLE</div>
      <div className="cycle-stat">
        <span className="cycle-value">{daysLeft}</span>
        <span className="cycle-unit">days left</span>
      </div>
      <div
        className="cycle-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(elapsedPct)}
      >
        <div className="cycle-bar-fill" style={{ width: `${elapsedPct}%` }} />
      </div>
      <div className="cycle-meta">{elapsedPct.toFixed(0)}% of cycle elapsed</div>
    </div>
  );
}
