import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import type {
  FetchUsageResult,
  OverlaySettings,
  UsageError,
  UsageSnapshot,
  UsageSummaryResponse,
} from './types';
import { loadSettings, saveSettings } from './settings';
import { formatPercentDetailed } from './format';
import { computeForecast } from './forecast';
import { loadHistory, recordSnapshot } from './history';
import { SettingsPanel } from './components/SettingsPanel';
import { WidgetGrid } from './widgets/WidgetGrid';
import { AddWidgetMenu } from './widgets/AddWidgetMenu';
import {
  loadLayout,
  newWidget,
  resetLayout,
  saveLayout,
} from './widgets/registry';
import {
  closePopOut,
  loadPopOuts,
  restorePopOuts,
  savePopOuts,
  type PopOutDescriptor,
} from './widgets/popouts';
import type { WidgetContext, WidgetInstance, WidgetKind } from './widgets/types';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelative(value: string): string {
  const diffSec = (Date.now() - new Date(value).getTime()) / 1000;
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  return formatDate(value);
}

export default function App() {
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings());
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSessionCookie, setHasSessionCookie] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [history, setHistory] = useState<UsageSnapshot[]>([]);
  const [tick, setTick] = useState(0);
  const [layout, setLayoutState] = useState<WidgetInstance[]>(() => loadLayout());
  const [editMode, setEditMode] = useState(false);
  const [popouts, setPopouts] = useState<PopOutDescriptor[]>(() => loadPopOuts());
  const recordingRef = useRef<Promise<void> | null>(null);

  // Persist UI prefs + apply window-level prefs
  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.frame = settings.frameStyle;
    document.documentElement.dataset.theme = settings.theme;
    if (settings.frameStyle === 'glass') {
      document.documentElement.style.setProperty('--tint', settings.opacity.toFixed(3));
    } else {
      document.documentElement.style.removeProperty('--tint');
    }
    void getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
    void invoke('set_click_through', { enabled: settings.clickThrough });
    void invoke('set_poll_interval', { secs: settings.refreshIntervalSec });
    // Broadcast to popout windows so display prefs (e.g. percent decimals)
    // stay in sync without requiring the user to reopen them.
    void emit('settings-changed', settings);
  }, [settings]);

  // Persist layout
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  // Persist popouts list
  useEffect(() => {
    savePopOuts(popouts);
  }, [popouts]);

  // On first mount, recreate any popped-out widgets the user had open last
  // session (best-effort — failures are silently dropped).
  useEffect(() => {
    void restorePopOuts(loadPopOuts());
  }, []);

  // When a popped-out window is closed (user clicks ✕), Rust emits
  // `popout-closed` with the widget id so we can drop it from the list.
  useEffect(() => {
    const unlistenP = listen<string>('popout-closed', (event) => {
      const id = event.payload;
      setPopouts((prev) => prev.filter((p) => p.id !== id));
    });
    return () => {
      void unlistenP.then((u) => u());
    };
  }, []);

  // Bootstrap
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [hasCookie, autostart, hist] = await Promise.all([
          invoke<boolean>('has_session_cookie'),
          isAutostartEnabled().catch(() => false),
          loadHistory(),
        ]);
        if (cancelled) return;
        setHasSessionCookie(hasCookie);
        setHistory(hist);
        setSettings((prev) => ({ ...prev, autostart }));
        if (!hasCookie) {
          setLoading(false);
          setSettingsOpen(true);
          return;
        }
        await invoke('force_refresh');
      } catch (err) {
        if (!cancelled) {
          setError(errorToString(err));
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
    const unlistenP = Promise.all([
      listen<FetchUsageResult>('usage-updated', (event) => {
        const result = event.payload;
        setSummary(result.data);
        setLastFetchedAt(result.fetchedAt);
        setFromCache(result.fromCache);
        setError(null);
        setLoading(false);
        setHasSessionCookie(true);
        if (!recordingRef.current) {
          recordingRef.current = (async () => {
            try {
              setHistory((prev) => {
                void recordSnapshot(prev, result.fetchedAt, result.data).then((next) =>
                  setHistory(next),
                );
                return prev;
              });
            } finally {
              recordingRef.current = null;
            }
          })();
        }
      }),
      listen<UsageError>('usage-error', (event) => {
        setError(event.payload.message);
        setLoading(false);
        if (event.payload.auth) setSettingsOpen(true);
      }),
      listen<void>('open-settings', () => setSettingsOpen(true)),
    ]);
    return () => {
      void unlistenP.then((unlisten) => unlisten.forEach((u) => u()));
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const usage = summary?.individualUsage.plan ?? null;
  const forecast = useMemo(() => {
    if (!summary || !usage) return null;
    return computeForecast({ summary, history });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, history, tick]);

  const updatedLabel = lastFetchedAt ? formatRelative(lastFetchedAt) : '—';

  const ctx: WidgetContext | null = useMemo(() => {
    if (!summary || !usage) return null;
    return {
      summary,
      usage,
      history,
      forecast,
      lastFetchedAt,
      fromCache,
      tick,
      percentDecimals: settings.percentDecimals,
    };
  }, [summary, usage, history, forecast, lastFetchedAt, fromCache, tick, settings.percentDecimals]);

  function handleAddWidget(kind: WidgetKind): void {
    setLayoutState((prev) => [...prev, newWidget(kind, prev)]);
  }
  function handleRemoveWidget(id: string): void {
    setLayoutState((prev) => prev.filter((w) => w.id !== id));
    if (popouts.some((p) => p.id === id)) {
      void closePopOut(id);
    }
  }
  function handleResetLayout(): void {
    setLayoutState(resetLayout());
  }
  // Drag-to-detach reports the descriptor of the freshly-spawned popout so
  // we can persist it and reflect the state in the dashboard.
  function handlePopOut(descriptor: PopOutDescriptor): void {
    setPopouts((prev) => {
      const filtered = prev.filter((p) => p.id !== descriptor.id);
      return [...filtered, descriptor];
    });
  }

  const poppedOutIds = useMemo(() => new Set(popouts.map((p) => p.id)), [popouts]);

  return (
    <div className={`app-shell ${settings.compactMode ? 'compact' : ''}`}>
      <div className="app-surface">
        <header
          className="overlay-header"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
            void getCurrentWindow().startDragging();
          }}
        >
          <div className="header-text">
            <div className="eyebrow">
              {summary?.membershipType?.toUpperCase() ?? 'CURSOR'} ·{' '}
              {summary?.limitType ?? 'usage'}
            </div>
            <div className="title">
              {usage
                ? `API ${formatPercentDetailed(usage.apiPercentUsed, settings.percentDecimals)}`
                : 'Setup required'}
            </div>
            <div className="subtitle">
              {usage
                ? `Total ${formatPercentDetailed(usage.totalPercentUsed, settings.percentDecimals)} · ${updatedLabel}${
                    fromCache ? ' · cached (304)' : ''
                  }`
                : 'Paste your session in Settings'}
            </div>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className={`icon-button ${editMode ? 'is-active' : ''}`}
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? 'Lock layout' : 'Edit layout (drag/resize widgets)'}
              aria-label="Edit layout"
            >
              {editMode ? '🔒' : '⊞'}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void invoke('force_refresh')}
              disabled={!hasSessionCookie}
              title="Refresh now"
              aria-label="Refresh"
            >
              ↻
            </button>
            <button
              type="button"
              className={`icon-button ${settingsOpen ? 'is-active' : ''}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="Settings"
              aria-label="Settings"
            >
              ⚙
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void getCurrentWindow().hide()}
              title="Hide overlay (Ctrl+Alt+U to toggle)"
              aria-label="Hide"
            >
              –
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void getCurrentWindow().close()}
              title="Quit Cursor Usage Overlay"
              aria-label="Quit"
            >
              ✕
            </button>
          </div>
        </header>

        {editMode && (
          <div className="edit-bar" role="toolbar" aria-label="Layout editor">
            <span className="edit-bar-hint">
              Drag to rearrange · resize from the corner · ✕ removes ·{' '}
              <strong>pull a widget out of this window to detach it onto your desktop</strong>
            </span>
            <div className="edit-bar-actions">
              <AddWidgetMenu onAdd={handleAddWidget} />
              <button type="button" className="button" onClick={handleResetLayout}>
                Reset
              </button>
            </div>
          </div>
        )}

        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            hasSessionCookie={hasSessionCookie}
            onCookieSaved={async () => {
              setHasSessionCookie(true);
              setSettingsOpen(false);
              await invoke('force_refresh');
            }}
            onCookieCleared={() => {
              setHasSessionCookie(false);
              setSummary(null);
              setError(null);
            }}
          />
        )}

        {loading ? (
          <section className="status-panel">Loading…</section>
        ) : error ? (
          <section className="status-panel error">
            <div className="status-title">Could not refresh</div>
            <div>{error}</div>
            <button
              className="button"
              type="button"
              onClick={() => void invoke('force_refresh')}
              style={{ marginTop: 12 }}
            >
              Retry
            </button>
          </section>
        ) : ctx ? (
          <WidgetGrid
            layout={layout}
            setLayout={setLayoutState}
            ctx={ctx}
            editable={editMode}
            onRemove={handleRemoveWidget}
            onPopOut={handlePopOut}
            poppedOutIds={poppedOutIds}
          />
        ) : (
          <section className="status-panel">Paste your session cookie to begin.</section>
        )}
      </div>
    </div>
  );
}

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}
