import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LogicalPosition, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { disable as disableAutostart, enable as enableAutostart } from '@tauri-apps/plugin-autostart';
import type {
  FrameStyle,
  OverlaySettings,
  PercentPrecision,
  ThemeId,
} from '../types';
import { FRAME_OPTIONS, THEME_OPTIONS, clampNumber } from '../settings';
import { formatPercent } from '../format';

const PRECISION_OPTIONS: { id: PercentPrecision; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: '1 decimal under 10%, integer above' },
  { id: 0, label: '0', hint: 'Integer only — e.g. 13%' },
  { id: 1, label: '0.0', hint: 'One decimal — e.g. 12.3%' },
  { id: 2, label: '0.00', hint: 'Two decimals — e.g. 12.27%' },
  { id: 3, label: '0.000', hint: 'Three decimals — full API precision' },
];
import { clearHistory } from '../history';

type Tab = 'display' | 'behavior' | 'account' | 'about';

// Vite injects this from package.json at build time so the About panel never
// drifts from the actual installed version.
const APP_VERSION =
  (import.meta as ImportMeta & { env: { PACKAGE_VERSION?: string } }).env
    .PACKAGE_VERSION ?? '0.1.0';

interface Props {
  settings: OverlaySettings;
  setSettings: (next: OverlaySettings) => void;
  hasSessionCookie: boolean;
  onCookieSaved: () => Promise<void>;
  onCookieCleared: () => void;
}

export function SettingsPanel({
  settings,
  setSettings,
  hasSessionCookie,
  onCookieSaved,
  onCookieCleared,
}: Props) {
  const [tab, setTab] = useState<Tab>(hasSessionCookie ? 'display' : 'account');
  const [cookieInput, setCookieInput] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function patch(p: Partial<OverlaySettings>) {
    setSettings({ ...settings, ...p });
  }

  async function snapToCorner(corner: 'tl' | 'tr' | 'bl' | 'br') {
    const monitor = await currentMonitor();
    if (!monitor) return;
    const win = getCurrentWindow();
    const size = await win.outerSize();
    const scale = monitor.scaleFactor;
    const margin = 16;
    const physMonW = monitor.size.width;
    const physMonH = monitor.size.height;
    let physX = monitor.position.x + margin * scale;
    let physY = monitor.position.y + margin * scale;
    if (corner === 'tr' || corner === 'br') {
      physX = monitor.position.x + physMonW - size.width - margin * scale;
    }
    if (corner === 'bl' || corner === 'br') {
      physY = monitor.position.y + physMonH - size.height - margin * scale;
    }
    await win.setPosition(new LogicalPosition(physX / scale, physY / scale));
  }

  async function saveCookie() {
    if (!cookieInput.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await invoke('save_session_cookie', { rawInput: cookieInput });
      setCookieInput('');
      setStatus({ kind: 'ok', text: 'Saved to Windows Credential Manager.' });
      await onCookieSaved();
      setTab('display');
    } catch (err) {
      setStatus({ kind: 'err', text: errorToString(err) });
    } finally {
      setBusy(false);
    }
  }

  async function clearCookie() {
    setBusy(true);
    setStatus(null);
    try {
      await invoke('clear_session_cookie');
      onCookieCleared();
      setStatus({ kind: 'ok', text: 'Saved session removed.' });
      setTab('account');
    } catch (err) {
      setStatus({ kind: 'err', text: errorToString(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutostart(next: boolean) {
    patch({ autostart: next });
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
    } catch (err) {
      setStatus({ kind: 'err', text: `Autostart: ${errorToString(err)}` });
    }
  }

  return (
    <section className="settings-panel">
      <nav className="settings-tabs">
        {(['display', 'behavior', 'account', 'about'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`settings-tab ${tab === t ? 'is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {labelForTab(t)}
          </button>
        ))}
      </nav>

      {tab === 'display' && (
        <div className="settings-body">
          <label className="field-label">
            Appearance system
            <div className="frame-style-row" role="group" aria-label="Appearance system">
              {FRAME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`frame-style-btn ${settings.frameStyle === opt.id ? 'is-active' : ''}`}
                  onClick={() => patch({ frameStyle: opt.id as FrameStyle })}
                  title={opt.hint}
                >
                  <span className="frame-style-label">{opt.label}</span>
                  <span className="frame-style-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          </label>

          {settings.frameStyle === 'glass' && (
            <label className="field-label">
              Glass color theme
              <div className="theme-grid">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`theme-swatch theme-${opt.id} ${settings.theme === opt.id ? 'is-active' : ''}`}
                    onClick={() => patch({ theme: opt.id as ThemeId })}
                    aria-label={opt.label}
                    title={opt.label}
                  >
                    <span className="theme-swatch-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </label>
          )}

          {settings.frameStyle === 'glass' && (
            <label className="field-label">
              Tint strength ({Math.round(settings.opacity * 100)}%)
              <input
                type="range"
                min={40}
                max={100}
                value={Math.round(settings.opacity * 100)}
                onChange={(e) =>
                  patch({ opacity: clampNumber(Number(e.target.value) / 100, 0.4, 1, settings.opacity) })
                }
              />
            </label>
          )}

          {settings.frameStyle === 'md3' && (
            <p className="settings-copy" style={{ margin: 0 }}>
              <strong>Material Design 3</strong> dark theme: solid surface containers, legible type (Roboto), filled
              / outlined buttons, and standard tonal elevation. Switch to <strong>Glass</strong> for the previous
              tinted look and accent palettes.
            </p>
          )}

          <label className="field-label">
            Percentage precision
            <div className="precision-row" role="group" aria-label="Percentage precision">
              {PRECISION_OPTIONS.map((opt) => (
                <button
                  key={String(opt.id)}
                  type="button"
                  className={`precision-btn ${settings.percentDecimals === opt.id ? 'is-active' : ''}`}
                  onClick={() => patch({ percentDecimals: opt.id })}
                  title={opt.hint}
                  aria-pressed={settings.percentDecimals === opt.id}
                >
                  <span className="precision-label">{opt.label}</span>
                  <span className="precision-preview">
                    {formatPercent(12.2719, opt.id)}
                  </span>
                </button>
              ))}
            </div>
            <span className="field-hint">
              Applies to every ring gauge and percentage chip — main dashboard
              and popped-out widgets — for tracking sub-percent changes live.
            </span>
          </label>

          <div className="settings-grid toggles">
            <Toggle
              label="Compact mode"
              checked={settings.compactMode}
              onChange={(compactMode) => patch({ compactMode })}
            />
            <Toggle
              label="Show sparkline"
              checked={settings.showSparkline}
              onChange={(showSparkline) => patch({ showSparkline })}
            />
            <Toggle
              label="Show forecast"
              checked={settings.showForecast}
              onChange={(showForecast) => patch({ showForecast })}
            />
          </div>

          <div className="snap-row">
            <span className="snap-label">Snap to corner</span>
            <div className="snap-buttons">
              <button type="button" className="button" onClick={() => snapToCorner('tl')}>↖</button>
              <button type="button" className="button" onClick={() => snapToCorner('tr')}>↗</button>
              <button type="button" className="button" onClick={() => snapToCorner('bl')}>↙</button>
              <button type="button" className="button" onClick={() => snapToCorner('br')}>↘</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'behavior' && (
        <div className="settings-body">
          <label className="field-label">
            Refresh interval (sec)
            <input
              className="text-input"
              type="number"
              min={5}
              max={300}
              value={settings.refreshIntervalSec}
              onChange={(e) =>
                patch({
                  refreshIntervalSec: clampNumber(
                    Number(e.target.value),
                    5,
                    300,
                    settings.refreshIntervalSec,
                  ),
                })
              }
            />
          </label>

          <div className="settings-grid toggles">
            <Toggle
              label="Always on top"
              checked={settings.alwaysOnTop}
              onChange={(alwaysOnTop) => patch({ alwaysOnTop })}
            />
            <Toggle
              label="Click-through"
              checked={settings.clickThrough}
              onChange={(clickThrough) => patch({ clickThrough })}
            />
            <Toggle
              label="Start with Windows"
              checked={settings.autostart}
              onChange={toggleAutostart}
            />
          </div>

          <p className="settings-hint">
            Hotkey: <code>Ctrl+Alt+U</code> toggles the overlay.
            Click-through lets clicks pass through; turn it off to interact again.
          </p>
        </div>
      )}

      {tab === 'account' && (
        <div className="settings-body">
          <p className="settings-copy">
            Paste either your full <code>Cookie</code> header or just the
            <code> WorkosCursorSessionToken</code> value. The secret is stored only in
            Windows Credential Manager — never in a config file.
          </p>
          <label className="field-label">
            Cursor session
            <textarea
              className="text-input cookie-input"
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              placeholder="WorkosCursorSessionToken=user_… or full Cookie header"
              spellCheck={false}
            />
          </label>
          <div className="settings-actions">
            <button
              type="button"
              className="button primary"
              onClick={saveCookie}
              disabled={busy || !cookieInput.trim()}
            >
              Save session
            </button>
            <button
              type="button"
              className="button"
              onClick={clearCookie}
              disabled={busy || !hasSessionCookie}
            >
              Clear session
            </button>
            <button
              type="button"
              className="button"
              onClick={async () => {
                await clearHistory();
                setStatus({ kind: 'ok', text: 'Local usage history cleared.' });
              }}
            >
              Clear history
            </button>
          </div>
          {status && (
            <div className={`inline-status ${status.kind === 'err' ? 'is-error' : ''}`}>
              {status.text}
            </div>
          )}
        </div>
      )}

      {tab === 'about' && (
        <div className="settings-body about-body">
          <div className="about-header">
            <div className="about-title">Cursor Usage Overlay</div>
            <div className="about-meta">
              v{APP_VERSION} · Tauri 2 · React · Rust
            </div>
          </div>

          <ul className="about-list">
            <li>Polls <code>/api/usage-summary</code> every {settings.refreshIntervalSec}s with ETag caching</li>
            <li>Cookie stored in Windows Credential Manager (DPAPI)</li>
            <li>Predictive forecast blends recent + cycle-average burn rate</li>
            <li>History saved to local app data store, max 14 days</li>
          </ul>

          <div className="about-author">
            <div className="about-author-line">
              <span className="about-author-eyebrow">Made by</span>
              <span className="about-author-name">Alexander Bayerl</span>
            </div>
            <div className="about-author-links">
              <a
                className="icon-link"
                href="https://github.com/alexbayerl"
                target="_blank"
                rel="noreferrer"
                title="GitHub · alexbayerl"
                aria-label="GitHub profile"
              >
                <GitHubIcon />
                <span>GitHub</span>
              </a>
              <a
                className="icon-link"
                href="https://www.linkedin.com/in/alexander-b-645b23108/"
                target="_blank"
                rel="noreferrer"
                title="LinkedIn · Alexander Bayerl"
                aria-label="LinkedIn profile"
              >
                <LinkedInIcon />
                <span>LinkedIn</span>
              </a>
            </div>
          </div>

          <div className="about-links">
            <a
              className="about-link"
              href="https://github.com/alexbayerl/lumos"
              target="_blank"
              rel="noreferrer"
            >
              Source &amp; releases ↗
            </a>
            <a
              className="about-link"
              href="https://github.com/alexbayerl/lumos/issues/new"
              target="_blank"
              rel="noreferrer"
            >
              Report an issue ↗
            </a>
            <a
              className="about-link"
              href="https://cursor.com/dashboard/spending"
              target="_blank"
              rel="noreferrer"
            >
              Open Cursor dashboard ↗
            </a>
          </div>

          <div className="about-license">MIT License · © {new Date().getFullYear()} Alexander Bayerl</div>
        </div>
      )}
    </section>
  );
}

function labelForTab(t: Tab): string {
  switch (t) {
    case 'display':
      return 'Display';
    case 'behavior':
      return 'Behavior';
    case 'account':
      return 'Account';
    case 'about':
      return 'About';
  }
}

function Toggle({
  checked,
  onChange,
  label,
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

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}

// Brand-mark SVGs — drawn at 24×24 view, sized via CSS. Inline to avoid
// network requests, font icon packs, and keep the bundle minimal.

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.94 10.94 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45C23.21 24 24 23.23 24 22.28V1.72C24 .77 23.21 0 22.22 0Z" />
    </svg>
  );
}
