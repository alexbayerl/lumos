import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FetchUsageResult, OverlaySettings, UsageSummaryResponse } from './types';

const STORAGE_KEY = 'cursor-usage-overlay.settings.v1';

const defaultSettings: OverlaySettings = {
  refreshIntervalSec: 10,
  opacity: 0.96,
  compactMode: false,
  alwaysOnTop: true
};

function loadSettings(): OverlaySettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<OverlaySettings>;
    return {
      ...defaultSettings,
      ...parsed,
      refreshIntervalSec: clampNumber(parsed.refreshIntervalSec, 5, 300, 10),
      opacity: clampNumber(parsed.opacity, 0.55, 1, 0.96)
    };
  } catch {
    return defaultSettings;
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function percentToDisplay(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function toPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function RingGauge({ label, value }: { label: string; value: number }) {
  const pct = toPercent(value);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="ring-card">
      <svg className="ring" viewBox="0 0 84 84" aria-hidden="true">
        <circle className="ring-track" cx="42" cy="42" r={radius} />
        <circle
          className="ring-progress"
          cx="42"
          cy="42"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">{percentToDisplay(pct)}</div>
        <div className="ring-label">{label}</div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`toggle ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  );
}

export default function App() {
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings());
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSessionCookie, setHasSessionCookie] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [cookieStatus, setCookieStatus] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.style.setProperty('--overlay-opacity', settings.opacity.toString());
    void getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
  }, [settings]);

  const usage = summary?.individualUsage.plan;
  const titleMessage = summary?.autoModelSelectedDisplayMessage ?? 'Live Cursor usage';
  const subtitleMessage = summary?.namedModelSelectedDisplayMessage ?? 'API usage overview';

  async function refresh(forceSpinner = false) {
    if (forceSpinner) {
      setRefreshing(true);
    }

    try {
      const result = await invoke<FetchUsageResult>('fetch_usage_summary');
      setSummary(result.data);
      setLastFetchedAt(result.fetchedAt);
      setFromCache(result.fromCache);
      setError(null);
      setHasSessionCookie(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const hasCookie = await invoke<boolean>('has_session_cookie');
        if (cancelled) return;
        setHasSessionCookie(hasCookie);
        if (!hasCookie) {
          setLoading(false);
          setSettingsOpen(true);
          return;
        }
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasSessionCookie) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, settings.refreshIntervalSec * 1000);

    return () => window.clearInterval(timer);
  }, [hasSessionCookie, settings.refreshIntervalSec]);

  const cycleLabel = useMemo(() => {
    if (!summary) return '—';
    return `${formatDate(summary.billingCycleStart)} → ${formatDate(summary.billingCycleEnd)}`;
  }, [summary]);

  async function saveCookie() {
    setCookieStatus(null);
    try {
      await invoke('save_session_cookie', { rawInput: cookieInput });
      setCookieInput('');
      setHasSessionCookie(true);
      setCookieStatus('Securely saved in Windows Credential Manager.');
      setSettingsOpen(false);
      await refresh(true);
    } catch (err) {
      setCookieStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearCookie() {
    setCookieStatus(null);
    try {
      await invoke('clear_session_cookie');
      setHasSessionCookie(false);
      setSummary(null);
      setError(null);
      setSettingsOpen(true);
      setCookieStatus('Saved session removed.');
    } catch (err) {
      setCookieStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={`app-shell ${settings.compactMode ? 'compact' : ''}`}>
      <div className="glass-panel">
        <header className="overlay-header" onMouseDown={() => void getCurrentWindow().startDragging()}>
          <div>
            <div className="eyebrow">Cursor Usage Overlay</div>
            <div className="title">{summary?.membershipType?.toUpperCase() ?? 'SETUP REQUIRED'}</div>
          </div>
          <div className="header-actions" onMouseDown={(e) => e.stopPropagation()}>
            <button className="icon-button" type="button" onClick={() => void refresh(true)} disabled={refreshing || !hasSessionCookie}>
              ↻
            </button>
            <button className="icon-button" type="button" onClick={() => setSettingsOpen((v) => !v)}>
              ⚙
            </button>
          </div>
        </header>

        {settingsOpen ? (
          <section className="settings-panel">
            <div className="settings-title">Settings</div>
            <p className="settings-copy">
              Paste either the full <code>Cookie</code> header or just the <code>WorkosCursorSessionToken</code> value.
              The secret is stored only in Windows Credential Manager.
            </p>
            <label className="field-label">
              Cursor session cookie
              <textarea
                className="text-input cookie-input"
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                placeholder="WorkosCursorSessionToken=... or full Cookie header"
              />
            </label>
            <div className="settings-grid">
              <label className="field-label">
                Refresh interval (sec)
                <input
                  className="text-input"
                  type="number"
                  min={5}
                  max={300}
                  value={settings.refreshIntervalSec}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      refreshIntervalSec: clampNumber(Number(e.target.value), 5, 300, current.refreshIntervalSec)
                    }))
                  }
                />
              </label>
              <label className="field-label">
                Opacity ({Math.round(settings.opacity * 100)}%)
                <input
                  type="range"
                  min={55}
                  max={100}
                  value={Math.round(settings.opacity * 100)}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      opacity: clampNumber(Number(e.target.value) / 100, 0.55, 1, current.opacity)
                    }))
                  }
                />
              </label>
            </div>

            <div className="settings-grid toggles">
              <Toggle
                checked={settings.compactMode}
                onChange={(compactMode) => setSettings((current) => ({ ...current, compactMode }))}
                label="Compact mode"
              />
              <Toggle
                checked={settings.alwaysOnTop}
                onChange={(alwaysOnTop) => setSettings((current) => ({ ...current, alwaysOnTop }))}
                label="Always on top"
              />
            </div>

            <div className="settings-actions">
              <button className="button primary" type="button" onClick={saveCookie} disabled={!cookieInput.trim()}>
                Save session
              </button>
              <button className="button" type="button" onClick={clearCookie} disabled={!hasSessionCookie}>
                Clear session
              </button>
            </div>
            {cookieStatus ? <div className="inline-status">{cookieStatus}</div> : null}
          </section>
        ) : null}

        {loading ? (
          <section className="status-panel">Loading…</section>
        ) : error ? (
          <section className="status-panel error">
            <div className="status-title">Could not refresh</div>
            <div>{error}</div>
          </section>
        ) : summary && usage ? (
          <>
            <section className="hero-row">
              <div className="hero-copy">
                <div className="hero-title">{titleMessage}</div>
                <div className="hero-subtitle">{subtitleMessage}</div>
                <div className="hero-meta">
                  Cycle: {cycleLabel}
                  {lastFetchedAt ? ` • Updated ${formatDate(lastFetchedAt)}` : ''}
                  {fromCache ? ' • 304 / cached' : ''}
                </div>
              </div>
              <div className="badge-stack">
                <span className="pill">{summary.limitType ?? 'user'}</span>
                <span className="pill accent">{summary.isUnlimited ? 'Unlimited' : 'Metered'}</span>
              </div>
            </section>

            <section className="ring-grid">
              <RingGauge label="Auto" value={usage.autoPercentUsed} />
              <RingGauge label="API" value={usage.apiPercentUsed} />
              <RingGauge label="Total" value={usage.totalPercentUsed} />
            </section>

            <section className="metrics-grid">
              <MetricCard title="Used" value={formatNumber(usage.used)} sub="Included plan usage" />
              <MetricCard title="Remaining" value={formatNumber(usage.remaining)} sub="Left this cycle" />
              <MetricCard title="Limit" value={formatNumber(usage.limit)} sub="Current plan ceiling" />
              <MetricCard title="Breakdown" value={formatNumber(usage.breakdown.total)} sub={`Included ${formatNumber(usage.breakdown.included)} • Bonus ${formatNumber(usage.breakdown.bonus)}`} />
            </section>
          </>
        ) : (
          <section className="status-panel">Paste your session cookie to begin.</section>
        )}
      </div>
    </div>
  );
}
