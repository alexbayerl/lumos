# Security policy

## Reporting a vulnerability

If you discover a security issue, **please do not open a public GitHub issue**. Instead, report it privately via:

- GitHub Security Advisories — [Open a draft advisory](https://github.com/alexbayerl/lumos/security/advisories/new)
- Or email the maintainer through the contact link on [github.com/alexbayerl](https://github.com/alexbayerl)

I'll respond within a few days and coordinate a fix and disclosure timeline with you.

## What's in scope

- Code in this repository (`src/`, `src-tauri/`, build/release pipelines)
- The way the app handles your `WorkosCursorSessionToken` (storage, transmission, logging)

## What's out of scope

- Issues in the upstream Cursor service or its API. Report those to Cursor.
- Issues in third-party dependencies — please report upstream first; we'll bump as soon as a fix is published.
- Theoretical issues that require an attacker to already have full access to your Windows user account (e.g., reading DPAPI-protected secrets as your own user). DPAPI by design only protects against _other_ Windows users.

## Hardening notes

- The session token is stored via `keyring` v3 → Windows Credential Manager → DPAPI.
- The token never leaves your machine except in the `Cookie` header of the request to `cursor.com`.
- The Tauri webview has CSP **disabled** in `src-tauri/tauri.conf.json` for development convenience. If you fork and distribute publicly, set `app.security.csp` to a strict policy.
- All HTTP traffic uses `rustls` (no OpenSSL).
