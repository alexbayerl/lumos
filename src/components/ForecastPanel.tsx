import type { Forecast } from '../types';
import { humanizeDuration, paceLabel } from '../forecast';

interface Props {
  forecast: Forecast;
  remaining: number;
}

const numberFormatter = new Intl.NumberFormat();

export function ForecastPanel({ forecast, remaining }: Props) {
  const projTone =
    forecast.projectedPctAtCycleEnd >= 100
      ? 'danger'
      : forecast.projectedPctAtCycleEnd >= 85
        ? 'warn'
        : 'ok';

  // When the forecast says we'll blow past the limit before cycle end, the
  // raw projected % becomes uninformative (capped at 999%). Surface the
  // *time* by which we'll be early instead — much more actionable.
  const overshoot = forecast.msEarlyBeforeCycle > 0;
  const projection = overshoot
    ? {
        label: 'Limit hit',
        value: humanizeDuration(forecast.msEarlyBeforeCycle),
        sub: 'before cycle ends',
      }
    : {
        label: 'Projected end',
        value: `${forecast.projectedPctAtCycleEnd.toFixed(0)}%`,
        sub: 'at cycle end',
      };

  return (
    <section className={`forecast-panel tone-${projTone}`}>
      <header className="forecast-header">
        <div>
          <div className="forecast-eyebrow">Forecast</div>
          <div className="forecast-headline">
            Runs out <span className="forecast-strong">{forecast.exhaustsLabel}</span>
          </div>
        </div>
        <div className={`pace-pill pace-${forecast.pace}`}>
          {paceLabel(forecast.pace)}
          <span className="pace-delta">
            {forecast.paceDeltaPct >= 0 ? '+' : ''}
            {forecast.paceDeltaPct.toFixed(1)}%
          </span>
        </div>
      </header>

      <div className="forecast-grid">
        <Stat
          label="Burn rate"
          value={`${formatRate(forecast.burnRatePerHour)}/h`}
          sub={`${formatRate(forecast.burnRatePerDay)}/day`}
        />
        <Stat label={projection.label} value={projection.value} sub={projection.sub} />
        <Stat
          label="Daily budget"
          value={`${formatRate(forecast.recommendedDailyBudget)}`}
          sub="to stay at 100%"
        />
        <Stat
          label="Headroom"
          value={numberFormatter.format(remaining)}
          sub={`confidence ${(forecast.confidence * 100).toFixed(0)}%`}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="forecast-stat">
      <div className="forecast-stat-label">{label}</div>
      <div className="forecast-stat-value">{value}</div>
      <div className="forecast-stat-sub">{sub}</div>
    </div>
  );
}

function formatRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return numberFormatter.format(Math.round(value));
}
