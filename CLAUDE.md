# FabSim

Business process simulation for agentification decisions. Desktop app (macOS +
Windows) built from one TypeScript codebase; Tauri 2 shell. The repository is
named ArkSim_2 for historical reasons — the product is **FabSim**.

Read PLAN.md for the full build plan, roadmap, and rationale.

## Layout

- `packages/schema` — zod contracts: process models, scenarios, run config, result types. The single source of truth; everything else builds against it.
- `packages/engine` — pure-TS discrete-event simulation engine. Headless, deterministic.
- `packages/templates` — shipped process templates (JSON data, not code) + sanity tests.
- `apps/desktop` — Vite + React frontend, engine in a Web Worker, Tauri shell in `src-tauri/`.

## Invariants — do not break

- The engine is **deterministic**: same model + config + seed ⇒ bit-identical results. The only randomness source is `Pcg32`; never use `Math.random()` in engine or schema code.
- No DOM, React, or Node-API imports in `packages/engine` or `packages/schema`. The engine must run headless in Node (tests) and in a Web Worker (app).
- All time values are **hours**; costs are currency units. Don't mix units.
- Engine changes must keep the analytic oracle tests (`packages/engine/test/oracle.test.ts`) passing — they compare against closed-form Erlang-C results and are the ground truth. Never loosen tolerances to make a change pass.
- The pinned golden value in `determinism.test.ts` may only change alongside an intentional engine-behavior change; say so in the commit message.
- Templates must pass the template sanity suite; keep them valid against `processModelSchema`.

## Conventions

- pnpm workspaces + Turborepo. Node ≥ 20. Run everything from the repo root: `pnpm install`, `pnpm run ci` (typecheck + test + build).
- Packages export TypeScript source directly (`main: ./src/index.ts`); there is no per-package build step. Vite/Vitest consume it as-is.
- Glossary: **case** (entity flowing through), **activity** (process step), **pool** (human resource group), **profile** (human/agent execution parameters), **scenario** (named set of overrides vs. baseline), **escalation** (agent handing a case to a human queue).
- Tests: Vitest. `describe`/`it`/`expect` imported explicitly, no globals.
- GitHub Actions: never upload workflow artifacts in CI (storage is metered); release binaries go to GitHub Releases via the tag-triggered release workflow.
