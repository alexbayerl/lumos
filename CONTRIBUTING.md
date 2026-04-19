# Contributing

Thanks for considering a contribution! This is a small, opinionated app, so a little coordination saves everyone time.

## Before you start work

- For non-trivial changes, **open an issue first** so we can agree on the approach. Tiny fixes (typos, obvious bugs) can go straight to a PR.
- Search existing issues and PRs first.
- Be aware this is a Windows-first project. macOS / Linux ports are welcome but need to be self-contained (no behavior regressions on Windows).

## Local setup

See the [README](README.md#develop-locally) for prerequisites. TL;DR:

```bash
npm install
npm run tauri dev
```

## Project layout

```
src/                      React + TypeScript UI
src/widgets/              Widget framework (registry, grid, components)
src/components/           Shared UI building blocks
src-tauri/src/lib.rs      Rust backend: polling, secret store, window mgmt
src-tauri/tauri.conf.json App config (windows, bundling, security)
.github/workflows/        CI + release pipelines
```

## Code style

- TypeScript: strict mode is on. Don't suppress with `any` or `// @ts-ignore` without an explanation.
- React: function components + hooks. Co-locate styles in `src/styles.css` / `src/widgets.css` — there's no CSS-in-JS dep.
- Rust: standard `cargo fmt` + `cargo clippy --all-targets`. Errors should bubble as `Result<T, String>` from Tauri commands so the frontend can display them.
- Comments explain **why**, not what. The README's architecture diagram is the canonical view of how the pieces connect.

## Adding a new widget

1. Create a component in `src/widgets/components/YourWidget.tsx` that takes `{ ctx: WidgetContext }`.
2. Add an entry to `WIDGET_REGISTRY` in `src/widgets/registry.tsx` with a kind, label, default size, and min size.
3. Add the kind to the `WidgetKind` union in `src/widgets/types.ts`.
4. Optionally add it to `buildDefaultLayout` if it should appear by default.
5. Style under `/* ── Widget: YourWidget ─── */` in `src/widgets.css`.

That's it — drag-to-detach, persistence, and edit-mode wiring all work for free.

## Submitting

1. Branch from `main`.
2. Make focused commits; the message style is `<area>: <imperative summary>` (e.g. `widgets: shrink api hero ring to 108px`).
3. Run `npm run build` and `cargo check` from `src-tauri/` before pushing.
4. Open a PR using the template; include a screenshot for any UI change.

## Releases

Maintainers tag with `vX.Y.Z` on `main`. The release workflow builds the NSIS + MSI bundles and attaches them to a draft GitHub Release for review.
