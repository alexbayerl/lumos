<div align="center">

# Lumos

**A beautiful, native-feeling Windows desktop overlay for live [Cursor](https://cursor.com) plan usage — with predictive forecasts and tear-off widgets you can drop anywhere on your desktop.**

[![Release](https://img.shields.io/github/v/release/alexbayerl/lumos?style=flat-square&color=7c8cff)](https://github.com/alexbayerl/lumos/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/alexbayerl/lumos/total?style=flat-square&color=7c8cff)](https://github.com/alexbayerl/lumos/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square&logo=windows&logoColor=white)](#install)

</div>

---

## Why

The official Cursor dashboard tells you _what_ you've used. It doesn't tell you, at a glance, while you're working, _how fast_ you're burning through your quota — or _when_ you'll run out at the current pace. This overlay does, in ~12 MB of memory and ~0% CPU when idle.

## Highlights

- 🪟 **Native frameless window** — Mica/Acrylic blur on Windows 11, true rounded corners via DWM, optional always-on-top
- 📊 **Modular widget dashboard** — drag, resize, add, remove. Built on `react-grid-layout`
- 🪄 **Tear-off widgets** — grab any widget and **pull it out of the window** to detach it as its own floating Mica desktop widget. No "pop out" button needed
- 🔮 **Predictive forecasts** — blends recent + cycle-average burn rate; shows when you'll hit the limit ("Limit hit 5d 3h before cycle ends" instead of meaningless "999%")
- ⚡ **Live polling with ETag/304** — refresh every 10 s by default; the Rust backend short-circuits the body when nothing changed
- 🔢 **Configurable precision** — Auto / 0 / 1 / 2 / 3 decimals; flows through every ring, hero, header, and bar, with live cross-window sync to popouts
- 🔒 **Secret hygiene** — your `WorkosCursorSessionToken` is stored in **Windows Credential Manager (DPAPI)**, never in a plaintext config
- 🎨 **Two looks** — Material Design 3 dark by default, optional Glass theme with color presets
- 🎛️ **System integration** — tray icon, global hotkey (`Ctrl+Alt+U`), Start-with-Windows, persisted window state, taskbar entry, full quit on `✕`
- 📈 **Local history & sparkline** — last 14 days of snapshots stored in app data

## Screenshots

> _Add screenshots / GIFs to `docs/media/` and reference them here. Suggested set:_
> - `dashboard.png` — main overlay with all widgets
> - `tear-off.gif` — dragging a widget onto the desktop
> - `forecast.png` — forecast widget close-up
> - `themes.png` — MD3 vs Glass

<!--
<p align="center">
  <img src="docs/media/dashboard.png" alt="Main dashboard" width="540"/>
  <br/>
  <img src="docs/media/tear-off.gif" alt="Drag a widget to the desktop" width="540"/>
</p>
-->

## Install

### From a release (recommended)

1. Grab the latest **NSIS installer** (`.exe`) or **MSI** from the [Releases page](https://github.com/alexbayerl/lumos/releases/latest).
2. Run it (per-user install — no admin needed).
3. Launch **Cursor Usage Overlay** from the Start menu.
4. On first launch, paste your session cookie (see below) into the **Account** tab. The overlay starts polling immediately.

### From source

See [Develop locally](#develop-locally).

## How to get your Cursor session cookie

The overlay needs to authenticate to `https://cursor.com/api/usage-summary` on your behalf. There is no public Cursor API for this yet, so we use the same browser session you already have:

1. Open [cursor.com/dashboard/spending](https://cursor.com/dashboard/spending) in any browser where you're signed in.
2. Open DevTools → **Network** → click the `usage-summary` request → **Headers** → copy the entire `Cookie` header.
3. In the overlay, open **Settings → Account** and paste it. Save.

The backend extracts only the `WorkosCursorSessionToken` value and stores it in Windows Credential Manager via the `keyring` crate. Nothing is written to disk in plaintext.

> **If you ever rotate / sign out**, click _Clear session_ and paste a fresh one. Cursor sessions currently last several weeks.

## Develop locally

### Prerequisites

- **Node.js** ≥ 18.18 (LTS recommended)
- **Rust** stable toolchain (`rustup default stable`)
- **Microsoft C++ Build Tools** with the _Desktop development with C++_ workload
- **WebView2 Runtime** (preinstalled on Windows 11; on Windows 10 install the [Evergreen Bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/))

### Run

```bash
git clone https://github.com/alexbayerl/lumos.git
cd cursor-usage-overlay
npm install
npm run tauri dev
```

### Build a release bundle

```bash
npm install
npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/`:

- `nsis/Cursor Usage Overlay_<version>_x64-setup.exe`
- `msi/Cursor Usage Overlay_<version>_x64_en-US.msi`

### Add a Start menu shortcut without installing

If you've built the app yourself and just want fast launch via **Win+S → "Cursor Usage Overlay"** without going through the NSIS installer, run:

```powershell
pwsh ./scripts/install-start-menu.ps1            # Start menu only
pwsh ./scripts/install-start-menu.ps1 -Desktop   # ...plus a Desktop icon
pwsh ./scripts/install-start-menu.ps1 -Uninstall # remove the shortcuts later
```

The shortcut points straight at `src-tauri/target/release/cursor_usage_overlay.exe` and uses the app's amber-gauge icon. Per-user only — no admin rights needed.

## Architecture in one screen

```
                ┌──────────────────────────────────────────────────┐
                │              Tauri 2 (Rust)  ─ src-tauri          │
                │                                                   │
   ┌─────────┐  │  ┌──────────────┐    ┌──────────────────────┐   │
   │ Cursor  │◀─┼──┤ reqwest      │◀───┤ Polling loop (tokio) │   │
   │ API     │  │  │ +ETag cache  │    │  · expo-backoff      │   │
   └─────────┘  │  └──────┬───────┘    │  · single-flight     │   │
                │         │             └──────────┬───────────┘   │
                │         │   keyring ─ DPAPI      │ emit          │
                │         ▼                        ▼               │
                │  Windows Credential       tauri events           │
                │  Manager (cookie)         · usage-updated        │
                │                           · usage-error          │
                │                           · popout-closed        │
                └────────────────────────────────┬─────────────────┘
                                                 │
                ┌────────────────────────────────┼─────────────────┐
                │       React + TypeScript  ─ src                  │
                │                                                  │
                │  WidgetGrid (react-grid-layout)                  │
                │   ├─ ApiHero · MiniRing × 3 · UsageBar           │
                │   ├─ Forecast · Sparkline · Cycle · QuickStat    │
                │   └─ Drag-to-detach → spawns popout windows      │
                │      (each popout is just `?widget=KIND&id=ID`)  │
                └──────────────────────────────────────────────────┘
```

## Tech stack

| Layer            | Choice                                                       |
| ---------------- | ------------------------------------------------------------ |
| Shell            | [Tauri 2](https://v2.tauri.app)                              |
| UI               | React 18 + TypeScript, Material Design 3 tokens              |
| Layout           | [`react-grid-layout`](https://github.com/react-grid-layout/react-grid-layout) v1 |
| Window FX        | `window-vibrancy` (Mica/Acrylic) + Win32 DWM rounded corners |
| HTTP             | `reqwest` with `rustls-tls`, gzip, brotli, ETag/304          |
| Secret store     | `keyring` v3 (Windows Credential Manager / DPAPI)            |
| Persistence      | `tauri-plugin-store` + `tauri-plugin-window-state`           |
| OS integration   | Tray icon, global shortcut, autostart, single-instance       |

## Security & privacy

- The session token is **never** committed, logged, or written to a plaintext config.
- Storage is Windows Credential Manager via DPAPI — only your Windows user can decrypt it.
- All HTTP traffic goes directly to `cursor.com` from your machine. There is no backend, no telemetry, no analytics.
- The overlay's webview has CSP disabled by default for dev ergonomics; if you fork for distribution to a wider audience, tighten `app.security.csp` in `src-tauri/tauri.conf.json`.

## Roadmap

- [ ] Per-monitor tear-off snap targets
- [ ] Optional team-usage section (when Cursor exposes it stably)
- [ ] Notifications when projected exhaustion crosses a threshold
- [ ] macOS port (Tauri makes this mostly free; Mica → Vibrancy translation needed)
- [ ] Screenshots / preview GIFs in the README

## Contributing

PRs and issues welcome. For non-trivial changes, please open an issue first to discuss the approach.

```bash
# Lint + typecheck
npm run build      # tsc --noEmit happens here

# Run dev with hot reload
npm run tauri dev
```

## Author

**Alexander Bayerl**
- GitHub — [@alexbayerl](https://github.com/alexbayerl)
- LinkedIn — [Alexander Bayerl](https://www.linkedin.com/in/alexander-b-645b23108/)

## License

[MIT](LICENSE) © Alexander Bayerl
