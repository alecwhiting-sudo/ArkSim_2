# FabSim — Business Process Simulation Tool: Build Plan

A desktop application that lets business analysts simulate service-industry and back-office
processes, then model "what happens if we agentify step X" **before** committing to the change.
One TypeScript core codebase, packaged as a native downloadable app for macOS and Windows.

---

## 1. Product Vision

**Who it's for:** business analysts, operations leads, and transformation teams who need to
answer questions like:

- "If an AI agent handles invoice matching, what happens to cycle time and headcount needs?"
- "Where does the queue move to when triage is automated but approvals stay human?"
- "What's the cost per case at 2× volume — human-only vs. hybrid vs. agent-first?"

**What it does:** discrete-event simulation (DES) of end-to-end processes. The analyst draws or
loads a process, assigns **human**, **AI agent**, or **hybrid** execution profiles to each
activity, runs baseline and scenario simulations, and compares KPIs side by side.

**What it is not:** not a BPM execution engine, not an RPA tool, not connected to live systems.
It is a local-first modeling and decision-support tool. No server, no account, no data leaves
the machine.

---

## 2. Built-in Process Template Library

Ship with pre-built, editable templates for the back-office and service processes most likely
to be agentified. Each template includes realistic default volumes, service-time distributions,
staffing, and a marked set of "agentification candidate" steps.

| # | Template | Typical agentifiable steps |
|---|----------|---------------------------|
| 1 | Invoice processing / Accounts payable | Data capture, 2/3-way matching, exception coding |
| 2 | Customer support ticket handling | Triage & routing, first-response drafting, resolution of known issues |
| 3 | Insurance claims processing (FNOL → settlement) | Document intake, coverage check, straight-through adjudication |
| 4 | Loan / credit application processing | Document verification, affordability checks, decision drafting |
| 5 | KYC / customer onboarding & compliance | ID verification, sanctions/PEP screening, risk scoring |
| 6 | Employee onboarding (HR) | Document collection, account provisioning requests, FAQ handling |
| 7 | IT service desk incident management | Categorization, known-error resolution, password/access requests |
| 8 | Order-to-cash | Order validation, credit check, billing exception handling |
| 9 | Procure-to-pay | Requisition validation, PO creation, receipt matching |
| 10 | Contract review & approval | Clause extraction, deviation flagging, first-pass redlining |
| 11 | Expense report processing | Receipt matching, policy compliance check, exception routing |
| 12 | Recruitment screening | CV parsing, screening against criteria, interview scheduling |

Each template is a plain JSON document conforming to the process schema (§4), so templates are
data, not code — analysts can clone and modify them, and new templates can be added without an
app release.

---

## 3. Simulation Model

### 3.1 Core engine: discrete-event simulation

- **Entities (cases):** tickets, invoices, claims, applications — arrive via configurable
  arrival patterns (Poisson, scheduled batches, empirical hourly/weekday profiles).
- **Activities:** steps with service-time distributions (exponential, lognormal, triangular,
  uniform, empirical), routing (probabilistic branches, conditional on case attributes),
  rework loops, and parallel (AND/OR) splits and joins — a pragmatic subset of BPMN, not full
  BPMN 2.0.
- **Resources:** pools with capacity, schedules/shift calendars, hourly cost, and skills
  (which activities they can serve). Queues with priority disciplines (FIFO, priority, SLA-aware).
- **Statistical rigor:** warm-up period exclusion, multiple replications, seeded PRNG for
  exact reproducibility, confidence intervals on every reported KPI.

### 3.2 Modeling agentification — the differentiator

Every activity carries one or more **execution profiles**:

| Parameter | Human profile | AI agent profile |
|-----------|--------------|------------------|
| Service time | Distribution (e.g. lognormal, minutes) | Distribution (typically seconds–minutes) |
| Cost | Hourly rate × time | Cost per case (or per-token proxy) |
| Availability | Shift calendar, breaks, absence | 24/7, optional rate limit / concurrency cap |
| Capacity | Headcount (FTE) | Effectively elastic, or throttled |
| Quality | Error rate → rework loop | Accuracy rate → rework or escalation |
| Escalation | — | % of cases escalated to a human queue |
| Oversight | — | Human review sampling rate (HITL checkpoint) |
| Ramp | Learning curve optional | Confidence-threshold ramp (start conservative) |

Scenario mechanics the engine must support, because they are what analysts actually ask about:

- **Escalation creates new human work.** Agentifying triage doesn't delete the human queue —
  it changes its composition. Escalated cases route to a (possibly smaller, more senior) human
  pool, and the simulation shows whether that pool becomes the new bottleneck.
- **Human-in-the-loop review** as an explicit activity: N% of agent-completed cases queue for
  human review, with its own service time and rejection/rework probability.
- **Hybrid routing:** agent-first with human fallback; or rule-based split (simple cases →
  agent, complex → human) driven by case attributes.
- **Volume/demand scenarios:** what-if on arrival rates (growth, seasonality, backlog burndown).

### 3.3 KPIs and outputs

Per scenario, and as baseline-vs-scenario deltas:

- Cycle time (mean, P50, P90, P95) end-to-end and per activity
- Throughput and WIP over time; queue lengths and wait times per queue
- Cost per case, total cost, cost breakdown (human labor vs. agent usage)
- Resource utilization per pool; implied FTE requirement to hit an SLA target
- SLA attainment %; error/rework volume; escalation volume and its downstream load
- Sensitivity (tornado) analysis: which parameter (agent accuracy, escalation %, arrival rate)
  most moves the headline KPIs — critical because agent performance assumptions are uncertain

---

## 4. Architecture & Tech Stack

### 4.1 One codebase, two desktop targets

**Recommendation: Tauri 2 + React + TypeScript.**

- **Shell:** Tauri 2 (Rust shell, system WebView). Produces native installers — signed/notarized
  `.dmg` (universal binary: Apple Silicon + Intel) for macOS, `.msi`/`.exe` (NSIS) for Windows —
  from one codebase, with ~10 MB binaries and low memory use. Built-in auto-updater and
  filesystem access. The Rust layer stays thin boilerplate (window config, fs, updater); no
  meaningful Rust development is needed.
- **Fallback option:** Electron, if the team wants zero Rust in the toolchain. Same UI and
  engine code would carry over unchanged; cost is ~100 MB+ installers and higher memory. The
  architecture below is deliberately shell-agnostic so this remains a swap, not a rewrite.

### 4.2 Monorepo layout (pnpm workspaces + Turborepo)

```
fabsim/
├── packages/
│   ├── schema/      # Process/scenario JSON schema — zod types, validation,
│   │                #   versioned migrations, JSON Schema export
│   ├── engine/      # Pure-TS discrete-event simulation engine. Zero DOM/Node
│   │                #   dependencies. Deterministic (seeded PCG RNG). Runs in a
│   │                #   Web Worker in the app and headless in Node for tests.
│   ├── templates/   # The process template library (JSON) + template tests
│   ├── ui/          # React component library: canvas, panels, dashboards
│   └── analysis/    # Post-processing: stats, confidence intervals, comparisons,
│                    #   sensitivity runs, report/export generation
├── apps/
│   └── desktop/     # Tauri app: wires ui + engine (in worker) + fs persistence
└── .github/workflows/  # CI + release matrix (macos-latest, windows-latest)
```

The engine being a pure, deterministic, headless package is the load-bearing decision: it makes
the hardest code fully testable without the GUI, keeps simulation off the UI thread, and leaves
the door open to porting hot paths to Rust/WASM later if performance ever demands it (unlikely —
back-office models are small; 10⁵–10⁶ events per replication runs in well under a second in JS).

### 4.3 Key library choices

| Concern | Choice |
|---------|--------|
| Process canvas | React Flow (custom BPMN-ish nodes: activity, gateway, queue, pool) |
| Charts | ECharts (or visx) — histograms, time series, tornado charts |
| State | Zustand + Immer; undo/redo via patch history |
| Validation | zod (single source of truth for types + runtime validation) |
| Persistence | `.fabsim` project files (zipped JSON) via Tauri fs; autosave + recovery |
| RNG | PCG32 seeded generator (own ~50-line implementation, fully deterministic) |
| Testing | Vitest, fast-check (property-based), Playwright (E2E on built app) |

### 4.4 File format & versioning

- A project file bundles: process graph, execution profiles, scenarios, run settings, and
  cached results. Versioned with explicit `schemaVersion`; `schema` package owns migrations so
  old files always open.
- Import/export: CSV import for empirical arrival/service data; export results to CSV/XLSX and
  a shareable PDF/HTML report.

---

## 5. Delivery Approach: Coding with Models, Efficiently

This project is well-shaped for AI-assisted development — but only if the architecture is set
up for it. The plan above is deliberately structured so that most work is contract-bounded and
independently verifiable.

### 5.1 Contract-first, then parallel

**Order of operations:**

1. **Write the contracts first** (highest-value human + top-model work): the process JSON
   schema, the engine's public API (`simulate(model, config) → RunResult`), and the KPI result
   shape. These few hundred lines determine everything downstream.
2. **Then fan out.** With contracts fixed, four work streams proceed in parallel with no
   coordination cost: engine internals, UI components, template authoring, analysis/reporting.
   Each is a separate package with its own tests — ideal for parallel agent sessions or
   subagent workflows, because no two streams edit the same files.

### 5.2 Match model tier to task

| Task type | Model tier | Rationale |
|-----------|-----------|-----------|
| Architecture, schema design, engine core (event loop, resource allocation, statistics) | Top tier (Opus/Fable-class) | Subtle correctness; errors here are expensive and hard to detect |
| Feature implementation against fixed contracts (UI panels, chart components, file I/O) | Mid tier (Sonnet-class) | Well-specified, verifiable by tests and eyeballs |
| Boilerplate, test scaffolding, template JSON authoring, docs | Small tier (Haiku-class) | High volume, low ambiguity, cheap to verify |

Practices that keep token spend low and quality high:

- **`CLAUDE.md` as project memory:** conventions, package boundaries, glossary (case, activity,
  pool, profile, scenario), invariants ("engine is deterministic given a seed", "no DOM imports
  in engine/"). Every session starts aligned instead of re-deriving context.
- **Small, test-gated increments:** one feature per branch/PR, CI must pass. Models are most
  reliable in short, verifiable loops — not thousand-line speculative diffs.
- **Repeatable tasks as skills/prompts:** "add a new distribution", "add a new template",
  "add a KPI panel" become documented recipes so the 12 templates and N chart panels are cheap,
  consistent, delegate-to-small-model work.
- **Prompt caching by default** for long-context sessions over the engine package.

### 5.3 Verification: the engine must be provably right

Simulation output looks plausible even when it's wrong, so correctness cannot rest on review
alone:

- **Analytic oracles:** golden tests comparing engine results on M/M/1 and M/M/c models against
  closed-form queueing theory (Erlang-C wait times, utilization, queue lengths) within
  confidence bounds. This catches subtle event-loop and sampling bugs no human reviewer would.
- **Property-based tests (fast-check):** conservation (cases in = cases out + WIP), no negative
  queues/times, monotonicity (more servers ⇒ no worse waits), and **bit-exact determinism**
  (same seed ⇒ identical results) — which also becomes the regression harness: any engine
  change that alters a golden seeded run must be intentional.
- **Template sanity suite:** every shipped template must simulate without deadlock and produce
  KPIs within a declared plausibility envelope.
- **E2E smoke via Playwright** on the built desktop app: open template → run → see results.

### 5.4 CI/CD and release

- **CI (every PR):** typecheck, lint, unit + property + oracle tests, template suite.
- **Release (tag-triggered):** GitHub Actions matrix — `macos-latest` builds the universal
  `.dmg` (codesigned + notarized with an Apple Developer ID), `windows-latest` builds the
  signed `.msi`/`.exe`. Artifacts attach to a GitHub Release; the Tauri updater feeds
  auto-updates from there.
- Certificates (Apple Developer ID, Windows Authenticode/EV) are the one procurement item with
  lead time — start in Phase 0.

---

## 6. Roadmap

| Phase | Scope | Duration |
|-------|-------|----------|
| **0 — Foundations** | Monorepo, contracts (schema + engine API), engine event loop with M/M/c oracle tests passing, CI green, walking-skeleton Tauri app builds on both OSes. Order signing certs. | ~2 weeks |
| **1 — MVP** | Process canvas (view + edit), human/agent execution profiles, run baseline simulation in worker, results dashboard (cycle time, cost, utilization, queues), 3 templates (invoicing, support tickets, claims), save/open project files. | ~4 weeks |
| **2 — Scenarios & library** | Scenario manager and side-by-side comparison with deltas, escalation/HITL/hybrid routing mechanics, full 12-template library, CSV data import, replications + confidence intervals in UI. | ~4 weeks |
| **3 — Analysis & release polish** | Sensitivity/tornado analysis, demand what-ifs, PDF/HTML report export, XLSX export, auto-updater, signed installers, onboarding tour + docs. **v1.0 release.** | ~4 weeks |

Durations assume a small team working AI-assisted with the parallel-stream approach in §5.1;
streams within phases 1–2 are largely independent.

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Engine correctness bugs producing plausible-but-wrong numbers | Analytic oracles + property tests from day one (§5.3); no engine merge without them |
| Scope creep toward full BPMN | Fixed modeling subset in schema v1; anything else is a template convention, not an engine feature |
| Garbage-in on agent performance assumptions | Sensitivity analysis as a first-class feature; templates ship with sourced default ranges, not point estimates |
| Cross-platform packaging/signing friction | Walking skeleton builds installers on both OSes in Phase 0, not at the end; certs ordered early |
| Simulation performance on large models | Engine in Web Worker (UI never blocks); deterministic engine makes a later Rust/WASM port a drop-in swap if ever needed |

---

## Status (updated 2026-08-15)

- **Phase 0 — done.** Monorepo, schema contracts, deterministic engine with Erlang-C
  oracle + property + golden-pin tests, CI, release pipeline (installers verified
  building on macOS + Windows).
- **Phase 1 — done.** Canvas with human/agent toggles, inspector editing, worker-run
  baseline-vs-scenario comparison, dashboards, `.fabsim.json` save/open.
- **Phase 2 — done.** Live **watch mode** (replay with play/pause/speed/scrub, live
  queue counters, WIP chart) — added beyond the original plan; scenario manager with
  compare-all; demand multiplier; CIs in UI; all 12 templates; CSV import via
  empirical distributions.
- **Phase 3 — done** except auto-updater + signing (blocked on certificates):
  sensitivity/tornado analysis, SLA attainment KPI, HITL review sampling in the
  engine/schema, HTML report + CSV export, first-run tour, user guide.
- **Open items:** code signing + notarization certificates (unblocks auto-updater),
  XLSX export, canvas node add/remove editing, shift calendars, per-case attributes
  for rule-based hybrid routing.
