import type { WidgetContext } from '../types';
import { RingGauge } from '../../components/RingGauge';

interface Props {
  ctx: WidgetContext;
  pick: 'auto' | 'api' | 'total';
}

const TITLES: Record<Props['pick'], { eyebrow: string; label: string }> = {
  auto: { eyebrow: 'AUTO MODEL', label: 'Auto' },
  api: { eyebrow: 'API · NAMED', label: 'API' },
  total: { eyebrow: 'TOTAL', label: 'Total' },
};

export function MiniRing({ ctx, pick }: Props) {
  const value =
    pick === 'auto'
      ? ctx.usage.autoPercentUsed
      : pick === 'api'
        ? ctx.usage.apiPercentUsed
        : ctx.usage.totalPercentUsed;

  const { eyebrow, label } = TITLES[pick];
  return (
    <div className={`widget widget-mini-ring pick-${pick}`}>
      <div className="widget-eyebrow">{eyebrow}</div>
      <div className="mini-ring-body">
        <RingGauge label={label} value={value} size={92} decimals={ctx.percentDecimals} />
      </div>
    </div>
  );
}

export const AutoMini = ({ ctx }: { ctx: WidgetContext }) => (
  <MiniRing ctx={ctx} pick="auto" />
);
export const ApiMini = ({ ctx }: { ctx: WidgetContext }) => (
  <MiniRing ctx={ctx} pick="api" />
);
export const TotalMini = ({ ctx }: { ctx: WidgetContext }) => (
  <MiniRing ctx={ctx} pick="total" />
);
