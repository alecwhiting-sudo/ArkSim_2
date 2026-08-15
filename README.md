# FabSim

Simulate service-industry and back-office processes — and model what changes
when steps are handed to AI agents — before making the change. A local-first
desktop app for business analysts, for macOS and Windows, built from one
TypeScript codebase.

See [PLAN.md](PLAN.md) for the full build plan.

## Quick start

```bash
pnpm install
pnpm run ci        # typecheck + tests (incl. queueing-theory oracles) + build
```

Run the desktop app in dev (requires Rust for the Tauri shell):

```bash
cd apps/desktop
pnpm tauri dev
```

Or just the web frontend without the shell:

```bash
cd apps/desktop
pnpm dev
```

## Releases

Push a `v*` tag. GitHub Actions builds a universal macOS `.dmg` and a Windows
NSIS installer and attaches them to a draft GitHub Release. Signing/notarization
secrets are documented in `.github/workflows/release.yml`.
