import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WidgetSoloApp from './widgets/WidgetSoloApp';
import { WIDGET_REGISTRY } from './widgets/registry';
import { loadSettings } from './settings';
import type { WidgetKind } from './widgets/types';
import './styles.css';
import './theme-tokens.css';
import './widgets.css';

/**
 * Apply the user's theme to <html> as early as possible (before React mounts)
 * so every window — including popped-out solo widgets — paints its first
 * frame with the right MD3/glass tokens, never lavender browser defaults.
 *
 * The main dashboard's settings effect later keeps these in sync when the
 * user changes themes; popped-out windows pick up changes on next launch.
 */
function applyInitialTheme(): void {
  try {
    const s = loadSettings();
    const root = document.documentElement;
    root.dataset.frame = s.frameStyle;
    root.dataset.theme = s.theme;
    if (s.frameStyle === 'glass') {
      root.style.setProperty('--tint', s.opacity.toFixed(3));
    }
  } catch {
    // Last-resort fallback so we never render token-less.
    document.documentElement.dataset.frame = 'md3';
    document.documentElement.dataset.theme = 'aurora';
  }
}
applyInitialTheme();

/**
 * The same JS bundle is loaded by every Tauri window. The main dashboard
 * window has no query params; popped-out widget windows carry
 * `?widget=<kind>&id=<id>` and we render only that widget.
 */
function Root() {
  const params = new URLSearchParams(window.location.search);
  const kindParam = params.get('widget');
  const idParam = params.get('id');

  if (kindParam && idParam && kindParam in WIDGET_REGISTRY) {
    document.documentElement.dataset.solo = 'true';
    return <WidgetSoloApp kind={kindParam as WidgetKind} id={idParam} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
