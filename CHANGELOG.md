# Changelog

All notable changes to **Cursor Usage Overlay** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Default theme is now **Glass** (tinted Mica + color presets); Material Design 3 is the secondary option. Existing users keep whatever they already had selected.

## [0.1.0] — 2026-04-19

Initial public release.

### Added

- Tauri 2 + React shell with the **Glass dark theme** as default (tinted Mica + color presets) and **Material Design 3** as a solid-surface alternative.
- Live polling of `https://cursor.com/api/usage-summary` every 10 s with ETag/304 caching and exponential backoff.
- Modular widget dashboard built on `react-grid-layout`:
  - API Usage hero, mini rings (Auto/API/Total), rings trio
  - Usage bar (API vs Auto split)
  - Forecast (burn rate, projection, daily budget)
  - Sparkline, billing cycle, quick stats
- **Drag-to-detach tear-off widgets** — grab any widget on the dashboard, pull it past the main window's edge, and it pops out as an independent Mica-blurred floating desktop window. Popouts persist across launches and use the same MD3 card chrome as the dashboard cell, just floating, with the kind label hidden so 100% of the surface belongs to the data.
- **Configurable percentage precision** (Auto / 0 / 1 / 2 / 3 decimals) that flows through every ring gauge, the API hero, the header, and the usage bar. Live cross-window sync — change precision in the main window and every popped-out ring updates instantly.
- Predictive forecast that surfaces "limit hit X before cycle ends" instead of meaningless capped percentages.
- Secure session storage via Windows Credential Manager / DPAPI (`keyring` v3).
- Native window chrome: Mica/Acrylic blur, DWM-rounded corners, frameless transparent window, taskbar entry, full quit on `✕`.
- Tray icon, global hotkey (`Ctrl+Alt+U`), Start-with-Windows, persisted window state, single-instance enforcement.
- Local 14-day usage history with sparkline.
- Brand-coherent app icon (amber gauge on MD3 surface) regenerated for every Windows / iOS / Android target via the Tauri icon pipeline.
- Optional `scripts/install-start-menu.ps1` for adding a per-user Start menu / Desktop shortcut to a locally-built exe without going through the NSIS installer.
- Author / link block in **Settings → About** with GitHub and LinkedIn.
- GitHub release machinery: CI workflow (typecheck + clippy), Windows release workflow (NSIS + MSI bundles attached to draft release), issue and PR templates, Dependabot, security policy, contributing guide, EditorConfig.

[Unreleased]: https://github.com/alexbayerl/cursor-usage-overlay/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alexbayerl/cursor-usage-overlay/releases/tag/v0.1.0
