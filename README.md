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

## Using the app

1. **Pick a template** (12 back-office processes ship built in) or **Open…** a saved
   `.fabsim.json` project.
2. **Click any step** on the canvas to edit durations, arrival rates, gateway shares,
   agent cost, and escalation probability; with nothing selected, the right panel
   edits pool headcount and hourly cost. **Import observed durations (CSV)** fits a
   step's service time to your real data (one number per line, minutes or hours).
3. **Flip steps between Human and Agent** on their cards to build a scenario. Set a
   demand multiplier and an optional SLA target on the shelf below the canvas.
4. **Run** compares baseline vs. scenario: cycle time (with 95% CI), throughput,
   cost per case, SLA attainment, escalations, pool utilization, per-step detail.
5. **▶ Watch** replays the simulation live on the canvas — play/pause, speed from
   6 min/s to 12 h/s, scrubbing, live queue/working counters, and a WIP chart.
6. **Save scenario** names the current setup; **Compare all** tables every saved
   scenario against baseline. **Sensitivity** runs one-at-a-time what-ifs (demand,
   headcounts, escalation rates, durations) and draws a tornado of what moves the
   answer.
7. **Export report (HTML)** produces a self-contained report (print it for PDF);
   **Export results (CSV)** dumps the KPI table for spreadsheets.

Everything is deterministic: the same model, settings, and seed reproduce results
bit-for-bit — change the seed to see different random draws.

## Releases

Push a `v*` tag. GitHub Actions builds a universal macOS `.dmg` and a Windows
NSIS installer and attaches them to a draft GitHub Release. Signing/notarization
secrets are documented in `.github/workflows/release.yml`.
