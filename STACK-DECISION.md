# Recommended architecture

## Recommendation

**Pick B + D**:

- **Tauri + React/TypeScript** for the overlay
- **In-app settings UI** for pasting the session cookie once
- Store the secret in **Windows Credential Manager / DPAPI-backed secure storage**

## Why this beats the other options

### Over PySide6

PySide6 is viable, but for a long-lived polished overlay this Tauri build gives you:

- a more modern packaging and permission model
- a cleaner separation between UI and secret-bearing backend logic
- easier web-style UI iteration for a premium overlay look
- smaller runtime footprint than Electron while still keeping web UI flexibility

### Over Electron

Electron is excellent when you want the widest web-stack familiarity, but it is the least attractive choice here because it bundles Chromium and Node with the app. For a small always-on overlay, that is unnecessary overhead.

### Over WPF / WinUI 3

If you wanted a **pure Windows-native** project above all else, WinUI 3 would be the runner-up. But for this use case the Tauri split is more balanced:

- Rust backend keeps the cookie out of frontend code
- React/TS makes the overlay faster to evolve visually
- Tauri gives you native window controls, transparency, always-on-top, and persisted window state without forcing you into a fully native UI stack

## Credential strategy

The best practical strategy is **not** plaintext config and **not** scraping Chrome's cookie DB on every launch.

Use an in-app settings screen and save the session in Windows Credential Manager. That is more secure than a local config file and much less fragile than auto-extracting browser cookies.
