import type { WidgetContext } from '../types';
import { RingGauge } from '../../components/RingGauge';
import { formatPercent, formatPercentDetailed } from '../../format';

const numberFormatter = new Intl.NumberFormat();

/**
 * Hero widget for **named-model API usage** — the metric that actually
 * captures Opus / Sonnet / GPT-* spend. Promoted to its own card with the
 * accent color, large ring, absolute counts and the API spend share of total.
 */
export function ApiHero({ ctx }: { ctx: WidgetContext }) {
  const { usage, summary } = ctx;
  const apiPct = usage.apiPercentUsed;
  // API requests roughly = (apiPct / totalPct) * used. Clamp to non-negative.
  const apiShare =
    usage.totalPercentUsed > 0 ? Math.max(0, apiPct / usage.totalPercentUsed) : 0;
  const apiUsed = Math.round(usage.used * apiShare);
  const apiRemainingTotal = Math.max(0, usage.limit - usage.used);

  const message =
    summary.namedModelSelectedDisplayMessage ??
    `Named-model usage at ${formatPercentDetailed(apiPct, ctx.percentDecimals)}`;

  return (
    <div className="widget widget-api-hero">
      <div className="widget-eyebrow priority">
        <span className="priority-dot" /> API · NAMED MODELS
      </div>
      <div className="api-hero-body">
        <div className="api-hero-ring">
          <RingGauge label="API" value={apiPct} size={132} decimals={ctx.percentDecimals} />
        </div>
        <div className="api-hero-stats">
          <div className="api-hero-headline">{message}</div>
          <dl className="api-hero-grid">
            <div>
              <dt>Used (API)</dt>
              <dd>{numberFormatter.format(apiUsed)}</dd>
            </div>
            <div>
              <dt>Plan limit</dt>
              <dd>{numberFormatter.format(usage.limit)}</dd>
            </div>
            <div>
              <dt>Plan headroom</dt>
              <dd>{numberFormatter.format(apiRemainingTotal)}</dd>
            </div>
            <div>
              <dt>Share of total</dt>
              <dd>{formatPercent(apiShare * 100, ctx.percentDecimals)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
