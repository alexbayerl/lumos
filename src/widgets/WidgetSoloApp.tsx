import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  FetchUsageResult,
  OverlaySettings,
  UsageError,
  UsageSnapshot,
  UsageSummaryResponse,
} from '../types';
import { computeForecast } from '../forecast';
import { loadHistory } from '../history';
import { loadSettings } from '../settings';
import { WIDGET_REGISTRY } from './registry';
import type { WidgetContext, WidgetKind } from './types';

interface Props {
  kind: WidgetKind;
  id: string;
}

/**
 * Minimal app shell rendered when the window is launched with
 * `?widget=KIND&id=ID` query params. Hosts a single widget, gets its data
 * from the same Rust poller as the main window via the shared
 * `usage-updated` / `usage-error` events plus a one-shot `get_last_usage`
 * call for instant first paint.
 *
 * The whole window is draggable (no header bar) and shows a small × in the
 * top-right on hover for closing.
 */
export default function WidgetSoloApp({ kind, id }: Props) {
  const def = WIDGET_REGISTRY[kind];
  // The id is just an instance handle (also used as the window label by Rust).
  // We render it as a data attribute purely so it shows up in DevTools.
  void id;
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [history, setHistory] = useState<UsageSnapshot[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [last, hist] = await Promise.all([
          invoke<FetchUsageResult | null>('get_last_usage'),
          loadHistory().catch(() => [] as UsageSnapshot[]),
        ]);
        if (cancelled) return;
        if (hist) setHistory(hist);
        if (last) {
          setSummary(last.data);
          setLastFetchedAt(last.fetchedAt);
          setFromCache(last.fromCache);
        }
        // Kick a fresh fetch — poller will broadcast to all windows.
        await invoke('force_refresh');
      } catch (err) {
        if (!cancelled) setError(errorToString(err));
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
        const r = event.payload;
        setSummary(r.data);
        setLastFetchedAt(r.fetchedAt);
        setFromCache(r.fromCache);
        setError(null);
      }),
      listen<UsageError>('usage-error', (event) => {
        setError(event.payload.message);
      }),
    ]);
    return () => {
      void unlistenP.then((unlisten) => unlisten.forEach((u) => u()));
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);

  const usage = summary?.individualUsage.plan ?? null;
  const forecast = useMemo(() => {
    if (!summary || !usage) return null;
    return computeForecast({ summary, history });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, history, tick]);

  // Solo windows read settings synchronously at mount and stay in sync with
  // the main window via the `settings-changed` event broadcast from App.tsx,
  // so display prefs like percent precision update live everywhere.
  const [percentDecimals, setPercentDecimals] = useState(
    () => loadSettings().percentDecimals,
  );
  useEffect(() => {
    const p = listen<OverlaySettings>('settings-changed', (event) => {
      setPercentDecimals(event.payload.percentDecimals);
    });
    return () => {
      void p.then((unlisten) => unlisten());
    };
  }, []);

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
      percentDecimals,
    };
  }, [summary, usage, history, forecast, lastFetchedAt, fromCache, tick, percentDecimals]);

  const Component = def.Component;

  return (
    <div
      className="solo-shell"
      data-widget-id={id}
      data-widget-kind={kind}
      onMouseDown={(e) => {
        // Drag from anywhere except interactive controls.
        if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
        void getCurrentWindow().startDragging();
      }}
    >
      {/* Same chrome as the dashboard cells — identical card surface, radius,
          and hover treatment — so a popped-out widget reads as the same
          object as the one on the dashboard, just floating on the desktop. */}
      <div className="widget-frame solo-frame">
        <button
          type="button"
          className="solo-close"
          onClick={() => void getCurrentWindow().close()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Close widget"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="widget-body">
          {ctx ? (
            <Component ctx={ctx} />
          ) : error ? (
            <div className="solo-empty error">{error}</div>
          ) : (
            <div className="solo-empty">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}

// Keep a reference to id for future telemetry hooks.
export const __SOLO_VERSION = 1;
export type { Props as WidgetSoloAppProps };
