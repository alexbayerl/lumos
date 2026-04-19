import type { WidgetContext } from '../types';

const numberFormatter = new Intl.NumberFormat();

interface Props {
  ctx: WidgetContext;
  pick: 'used' | 'remaining';
}

export function QuickStat({ ctx, pick }: Props) {
  const { usage } = ctx;
  if (pick === 'used') {
    return (
      <div className="widget widget-quick-stat">
        <div className="widget-eyebrow">USED</div>
        <div className="quick-stat-value">{numberFormatter.format(usage.used)}</div>
        <div className="quick-stat-sub">
          incl {numberFormatter.format(usage.breakdown.included)} ·{' '}
          bonus {numberFormatter.format(usage.breakdown.bonus)}
        </div>
      </div>
    );
  }
  return (
    <div className="widget widget-quick-stat">
      <div className="widget-eyebrow">REMAINING</div>
      <div className="quick-stat-value">{numberFormatter.format(usage.remaining)}</div>
      <div className="quick-stat-sub">left this cycle</div>
    </div>
  );
}

export const UsedStat = ({ ctx }: { ctx: WidgetContext }) => (
  <QuickStat ctx={ctx} pick="used" />
);
export const RemainingStat = ({ ctx }: { ctx: WidgetContext }) => (
  <QuickStat ctx={ctx} pick="remaining" />
);
