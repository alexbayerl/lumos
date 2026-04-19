# Cursor Usage Overlay

A polished Windows desktop overlay for Cursor usage, built with **Tauri 2 + React/TypeScript** and a **Rust backend** that polls `https://cursor.com/api/usage-summary` every 10 seconds by default.

## What this build includes

- Transparent, frameless, always-on-top overlay window
- Moveable glass UI with a custom drag header
- Live polling with **ETag/304** support to avoid unnecessary payload work
- Secure secret handling: stores your `WorkosCursorSessionToken` in **Windows Credential Manager** via the Rust `keyring` crate
- Configurable refresh interval, opacity, compact mode, and always-on-top behavior
- Persistent window position and size via the official Tauri window-state plugin
- Frontend never needs direct access to the saved cookie; the Rust side performs the authenticated request

## Why the app asks for a cookie

Cursor's dashboard endpoint is authenticated. This app expects either:

1. the raw `WorkosCursorSessionToken=...` value, or
2. the entire `Cookie:` header copied from your browser devtools

If you paste the full cookie header, the backend extracts the pieces it needs and stores only the relevant session data.

## Security notes

- The cookie is **not** hardcoded anywhere in the source.
- The cookie is stored in Windows Credential Manager, not in a plaintext JSON config file.
- Non-secret UI preferences are kept in browser-like local storage inside the app.
- Because you pasted a live auth token into chat, it is smart to rotate it after you finish testing.

## Run locally

### Prerequisites

Install the Windows prerequisites for Tauri:

- Node.js LTS
- Rust stable toolchain
- Microsoft C++ Build Tools / Desktop development with C++
- WebView2 runtime if your system does not already have it

### Start dev mode

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm install
npm run tauri build
```

## Suggested next upgrades

- Add a tray icon with show/hide and quit actions
- Add a global shortcut for toggling visibility
- Add a historical sparkline using persisted snapshots
- Add theme presets and pinned compact layouts
- Add an optional read-only team usage section if Cursor exposes it consistently

## Stack choice baked into this project

This implementation assumes the best long-term choice is:

- **Tech stack:** Tauri + React/TypeScript
- **Credential handling:** in-app settings UI backed by Windows Credential Manager / DPAPI-protected storage

