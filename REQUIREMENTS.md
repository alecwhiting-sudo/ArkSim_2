# FabSim — Cumulative Requirements

This is the implementation-independent record of **what FabSim must do**. It exists so
the app can be re-architected from scratch without re-discovering behavior from code.
Requirements state *observable behavior and guarantees*, not implementation choices —
anything here must survive a rewrite; anything merely "how it happens to be coded today"
does not belong.

**Maintenance rule:** every change that adds, alters, or removes user-visible behavior or
an engine guarantee updates this file **in the same commit** — add new numbered
requirements (never renumber or reuse IDs; mark dead ones *(retired)*), and append a row
to the changelog at the bottom.

---

## 1. Product scope

- **PS-1** FabSim is a decision-support tool for business analysts modeling
  service-industry and back-office processes, specifically to compare a human-run
  baseline against scenarios where selected steps are executed by AI agents
  ("agentification") **before** the real change is made.
- **PS-2** The product is local-first: it runs entirely on the user's machine with no
  server, no account, and no data leaving the device.
- **PS-3** It is a modeling tool, not a BPM/RPA execution engine; it never connects to
  live business systems.
- **PS-4** One core codebase ships as a downloadable desktop app for macOS (universal:
  Apple Silicon + Intel) and Windows.

## 2. Process model (the domain language)

- **PM-1** A process model consists of **nodes** — sources, activities, gateways,
  sinks — connected into a directed graph, plus **resource pools**. All time values are
  **hours**; all money values are unitless currency.
- **PM-2** **Source**: emits cases via a Poisson arrival process with a configurable
  rate (cases/hour). A model may have multiple sources.
- **PM-3** **Activity**: a work step with exactly one outgoing edge, served by a
  resource, taking a random service time drawn from a configurable distribution.
- **PM-4** **Gateway**: probabilistic branch; branch probabilities must sum to 1.
  Routing is decided per case by random draw.
- **PM-5** **Sink**: completes a case; completion timestamps drive cycle-time metrics.
- **PM-6** **Pool**: a human resource group with integer capacity (servers/FTE) and an
  hourly cost per server. Multiple activities may share one pool.
- **PM-7** Supported service-time distributions: constant, uniform(min,max),
  exponential(mean), lognormal(mean, cv — parameterized by mean and coefficient of
  variation, not mu/sigma), triangular(min,mode,max), and **empirical** (a list of
  observed durations sampled uniformly — the CSV-import target).
- **PM-8** Models are validated before use: unique node/pool ids; every referenced node
  and pool exists (including escalation and review targets); gateway probabilities sum
  to 1 (±1e-9); at least one source and one sink; an activity declared to run as agent
  must carry an agent profile. Invalid models are rejected with messages naming the
  offending element.
- **PM-9** Rework loops and escalation back-edges are legal; the graph need not be
  acyclic. Nodes reachable only via escalation/review edges are legal.
- **PM-10** Models carry a `schemaVersion`; files written by older versions must keep
  opening (missing newer fields take defaults).

## 3. Execution profiles & agentification mechanics

- **AG-1** Every activity carries a **human profile** (pool + service-time
  distribution) and optionally an **agent profile**. Each activity has a baseline
  execution mode (`human` or `agent`); agent mode requires an agent profile.
- **AG-2** Agent profile parameters: service-time distribution; **cost per case**;
  optional **concurrency limit** (absent = effectively unbounded capacity, 24/7);
  optional **escalation** (probability + target node); optional **review** (probability
  + target node).
- **AG-3** **Escalation**: after an agent completes a case, with the configured
  probability the case routes to the escalation target (a human queue) instead of the
  activity's normal outgoing edge. Escalated work must visibly load the target pool —
  escalation creates new human work, it never disappears.
- **AG-4** **Human-in-the-loop review**: of the *non-escalated* agent completions, the
  configured fraction routes to the review target (a human review activity whose own
  outgoing edge continues the flow). Order of decision per completion: escalation
  first; review only if not escalated.
- **AG-5** Agent-executed steps draw no capacity from human pools and incur cost per
  completed case (counted for cases arriving after warm-up); human-executed steps incur
  pool hourly cost for time actually worked (busy time × rate).

## 4. Simulation engine

- **ENG-1** The engine is a discrete-event simulation processing events in time order
  with a deterministic tiebreaker for simultaneous events.
- **ENG-2** **Determinism is absolute**: identical model + run settings + seed produce
  bit-identical results, on every platform. The engine has exactly one randomness
  source (a seeded PRNG); wall clock, `Math.random`, and platform entropy are banned.
  Features added later must not change the random stream of models that don't use them.
- **ENG-3** Queueing: each pool serves FIFO across all activities sharing it; a case
  starts service immediately if a server is free, otherwise waits in the pool's queue;
  on completion the freed server takes the longest-waiting queued case.
- **ENG-4** Run settings: duration (hours), warm-up (hours, < duration), replications
  (≥1), master seed, optional SLA target (hours). Replications use independent
  derived seeds; replication 0 of seed S is always the same run regardless of total
  replication count.
- **ENG-5** Warm-up semantics: KPI statistics cover only cases arriving after warm-up
  and time-weighted statistics accumulated after warm-up; raw conservation counts
  (arrived = completed + in-flight) cover the whole run.
- **ENG-6** The engine is headless and UI-free: it must run identically in a browser
  Web Worker (app) and in Node (tests/CLI), and never block the UI thread.
- **ENG-7** **Verification is part of the requirement**: engine results on M/M/1 and
  M/M/c configurations must match closed-form Erlang-C values (utilization, mean wait,
  queue length, time in system) within defined tolerances; conservation and
  monotonicity properties must hold; a pinned golden run detects any unintended
  behavior change. These test obligations transfer to any re-implementation.
- **ENG-8** **Trace mode**: the engine can record every case movement of a single
  replication (arrive, enqueue, start(fromQueue), complete, escalate, exit — each with
  time, case id, node, pool) in chronological order, for replay/visualization.
  Observing a run must not alter its outcome, and the traced replication must be
  identical to replication 0 of a normal run with the same seed.
- **ENG-9** Practical scale: models of ~5–30 nodes simulated for hundreds of hours ×
  ~5 replications must complete interactively (sub-second to a few seconds).

## 5. Scenarios & what-ifs

- **SC-1** A **scenario** is a named set of deltas versus the baseline model:
  per-activity execution overrides (human↔agent) and an arrival-rate multiplier. The
  baseline model itself is never mutated by a scenario.
- **SC-2** The workbench holds one active scenario being edited; users can **save**
  the current state as a named scenario, **recall** it into the workbench, and
  **delete** it. Saved scenarios persist in the project file.
- **SC-3** A run always produces baseline and (if the workbench has changes) scenario
  results in one action, presented as a comparison with deltas.
- **SC-4** The **demand multiplier** is an assumption about the world: it applies to
  the baseline *and* the scenario of the same run (so "at 2× volume, human vs agent"
  is answerable). Saved scenarios capture their own multiplier.
- **SC-5** **Compare all** runs baseline plus every saved scenario and tables headline
  KPIs per scenario (cycle time, P90, throughput, cost/case, escalations, hottest
  pool).
- **SC-6** **Sensitivity analysis**: one-at-a-time perturbation of key parameters
  around the current workbench state — demand ±20%, pool headcounts ±1, agent
  escalation probabilities ±50%, the longest human step durations ±20% — reported as a
  tornado of cycle-time impact (base value marked, both directions labeled with
  values), with cost impact also available. Exact parameter menu may evolve; the
  one-at-a-time tornado form is the requirement.

## 6. Results & KPIs

- **KPI-1** Per run: end-to-end cycle time (mean with 95% confidence interval across
  replications, plus P50/P90/P95 pooled), throughput/hour, counts (arrived, completed,
  in-flight, escalated, reviewed).
- **KPI-2** Cost: total (human labor + agent per-case), cost per completed case, and
  the human/agent split.
- **KPI-3** Per pool: utilization (null/undefined for unbounded agent capacity),
  time-average queue length, mean wait. Per activity: execution mode, completions,
  escalations, reviews, mean wait, mean service.
- **KPI-4** SLA: when a target is set, the share of measured cases completing within it.
- **KPI-5** Every mean reported across replications carries an uncertainty measure
  (95% CI); single-replication runs degrade gracefully.
- **KPI-6** Results are marked **stale** the moment the model, scenario, or settings
  change after a run.

## 7. Watch mode (live visualization)

- **WATCH-1** The user can watch the simulation happen: a bounded window (currently
  first 48 sim-hours) of the current workbench configuration replays on the process
  diagram itself.
- **WATCH-2** Transport controls: play/pause, multiple speeds spanning roughly
  6 sim-minutes/sec to 12 sim-hours/sec, free scrubbing to any time (backward
  included), and a Day/HH:MM sim clock.
- **WATCH-3** During playback each activity shows live "working n" and "queue n"
  counts; a non-empty queue is visually flagged; flow direction is animated.
- **WATCH-4** Live aggregates during playback: arrived, completed, in-progress,
  escalated, and a work-in-progress-over-time chart drawing as the clock advances.
- **WATCH-5** What is watched is the *actual* simulation — the same deterministic run
  the numbers come from, not a cosmetic animation.

## 8. Workbench UI

- **UI-1** The process renders as a left-to-right diagram: distinct visuals for
  source/activity/gateway/sink, gateway branch percentages and dashed escalation edges
  labeled on the diagram, automatic layout.
- **UI-2** Each activity with an agent profile carries an inline Human/Agent toggle;
  flipping it edits the workbench scenario and is visibly badged as a scenario change.
  Activities without an agent profile say so.
- **UI-3** Selecting a node opens an editor for its parameters: arrival rate (source),
  headline duration (activity — a single number that rescales the whole distribution,
  shape preserved), agent cost per case and escalation %, gateway branch shares. With
  nothing selected, pool headcounts and hourly costs are editable. Numeric inputs
  reject invalid values rather than corrupting state.
- **UI-4** **CSV import**: an activity's service time can be fitted to observed data —
  a file with one duration per line (minutes or hours, user-chosen) becomes an
  empirical distribution, labeled with its observation count.
- **UI-5** Run settings (duration, replications, seed), demand multiplier, and SLA
  target are directly editable; errors from any run surface as readable messages.
- **UI-6** A dismissible first-run tour (3 steps: model & toggle → run & compare →
  watch) shows once; dismissal persists locally.
- **UI-7** A simulation in progress never freezes the interface.

## 9. Templates

- **TPL-1** The app ships with editable templates for the 12 back-office processes:
  invoice processing (AP), customer support tickets, insurance claims (FNOL→settle),
  loan/credit applications, KYC onboarding, employee onboarding, IT service desk,
  order-to-cash, procure-to-pay, contract review, expense processing, recruitment
  screening.
- **TPL-2** Templates are **data, not code** (JSON conforming to the process schema);
  adding or editing one requires no application release.
- **TPL-3** Every template carries realistic default volumes/durations/staffing, agent
  profiles with escalation targets on its plausible agentification candidates, and a
  stable baseline (no runaway queues; a pool serving only escalations may idle at 0).
- **TPL-4** A sanity suite gates every shipped template: baseline completes cases with
  plausible KPIs, and the agentify-all scenario runs and shifts cost toward agent
  spend.

## 10. Persistence & exchange

- **PERS-1** A project saves to a single JSON file (`.fabsim.json`) containing: the
  (possibly edited) model, workbench overrides, saved scenarios, demand multiplier,
  and run settings. Opening restores the full workbench.
- **PERS-2** Project files are validated on open; corrupt/invalid files produce a
  clear error, never a half-loaded state. Older files load with defaults for missing
  fields (`fileVersion` governs migrations).
- **PERS-3** **Report export**: a single-file, self-contained HTML report (openable
  anywhere, print-to-PDF ready) containing run metadata, the scenario-comparison
  table, pool and activity tables, and sensitivity results when present.
- **PERS-4** **CSV export**: the KPI table (all compared scenarios, incl. per-pool
  utilizations) as spreadsheet-ready CSV.
- **PERS-5** Results in exports are reproducible: reports state duration, warm-up,
  replications, and seed.

## 11. Non-functional & platform

- **NFR-1** Reproducibility (ENG-2) extends end-to-end: a saved project re-run with
  its stored settings reproduces its numbers exactly.
- **NFR-2** The core simulation and domain contracts must be free of UI and OS
  dependencies (rewritable/portable in isolation); the UI consumes them through typed
  contracts and a single simulate/trace entry point.
- **NFR-3** Ships as native installers: macOS `.dmg` (universal) and Windows NSIS
  `.exe`, built from one codebase by CI on tag or manual dispatch, attached to GitHub
  Releases (release assets, never metered Actions artifacts). Unsigned builds must
  work; signing/notarization activates via secrets without workflow changes.
- **NFR-4** CI gates every change: typecheck, unit + property + oracle tests, template
  sanity suite, and an app build.
- **NFR-5** Interface follows the FabSim design language (ink/teal light theme);
  quantitative displays always print their values as text (color is never the only
  encoding); keyboard focus is visible.

## 12. Known gaps / deferred (not yet requirements)

Auto-update + code signing (blocked on certificates); XLSX export; canvas node
add/remove editing; shift calendars & schedules; per-case attributes and rule-based
hybrid routing; priority/SLA-aware queue disciplines; empirical/scheduled arrival
patterns; per-activity cycle-time breakdown; agent ramp/learning curves.

---

## Changelog

| Date | Change | Requirements affected |
|------|--------|----------------------|
| 2026-08-15 | Initial register covering Phases 0–3 as built: scope, process model, agentification (escalation + HITL review), deterministic DES engine with oracle verification and trace mode, scenarios (saved, compare-all, demand multiplier, sensitivity/tornado), KPIs (incl. SLA, CIs), watch mode, workbench UI (incl. CSV import, tour), 12 templates, project files, HTML/CSV export, platform/CI. | All (PS-1…NFR-5) |
