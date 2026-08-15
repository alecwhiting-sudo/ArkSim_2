import type { TraceResult } from "@fabsim/engine";
import type { ProcessModel, RunConfig, RunResult, Scenario } from "@fabsim/schema";
import { templates } from "@fabsim/templates";
import { create } from "zustand";
import type { ReplaySnapshot } from "./replay";
import type { SensitivityResults } from "./sensitivity";

export type ExecutionMode = "human" | "agent";

export interface SavedScenario {
  id: string;
  name: string;
  overrides: Record<string, ExecutionMode>;
  arrivalRateMultiplier: number;
}

const defaultConfig: RunConfig = {
  durationHours: 700,
  warmupHours: 100,
  replications: 5,
  seed: 42,
};

export interface FabState {
  templateId: string;
  model: ProcessModel;
  /** Workbench scenario: per-activity execution switches vs. the baseline model. */
  overrides: Record<string, ExecutionMode>;
  /** Demand what-if — applies to baseline AND scenario runs alike. */
  arrivalRateMultiplier: number;
  savedScenarios: SavedScenario[];
  config: RunConfig;
  selectedNodeId: string | null;
  running: boolean;
  error: string | null;
  baseline: RunResult | null;
  scenario: RunResult | null;
  compareResults: { name: string; result: RunResult }[] | null;
  sensResults: SensitivityResults | null;
  /** Bumped whenever the model/overrides change, so results are marked stale. */
  resultsStale: boolean;
  /** Watch mode: the recorded trace and the live replay snapshot. */
  watchTrace: TraceResult | null;
  watchSnap: ReplaySnapshot | null;
  watchPlaying: boolean;

  loadTemplate: (id: string) => void;
  loadProject: (p: {
    model: ProcessModel;
    overrides: Record<string, ExecutionMode>;
    config: RunConfig;
    savedScenarios: SavedScenario[];
    arrivalRateMultiplier: number;
  }) => void;
  updateModel: (fn: (m: ProcessModel) => ProcessModel) => void;
  setOverride: (activityId: string, mode: ExecutionMode) => void;
  setMultiplier: (m: number) => void;
  saveScenarioAs: (name: string) => void;
  applyScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  setConfig: (patch: Partial<RunConfig>) => void;
  select: (nodeId: string | null) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  setResults: (baseline: RunResult, scenario: RunResult | null) => void;
  setCompareResults: (rows: { name: string; result: RunResult }[]) => void;
  setSensResults: (r: SensitivityResults) => void;
  setWatchTrace: (trace: TraceResult | null) => void;
  publishWatch: (snap: ReplaySnapshot, playing: boolean) => void;
}

let scenarioCounter = 0;

export const useFabStore = create<FabState>((set) => ({
  templateId: templates[0]!.id,
  model: templates[0]!,
  overrides: {},
  arrivalRateMultiplier: 1,
  savedScenarios: [],
  config: defaultConfig,
  selectedNodeId: null,
  running: false,
  error: null,
  baseline: null,
  scenario: null,
  compareResults: null,
  sensResults: null,
  resultsStale: false,
  watchTrace: null,
  watchSnap: null,
  watchPlaying: false,

  loadTemplate: (id) => {
    const model = templates.find((t) => t.id === id);
    if (!model) return;
    set({
      templateId: id,
      model,
      overrides: {},
      arrivalRateMultiplier: 1,
      savedScenarios: [],
      selectedNodeId: null,
      baseline: null,
      scenario: null,
      compareResults: null,
      sensResults: null,
      error: null,
      resultsStale: false,
      watchTrace: null,
      watchSnap: null,
      watchPlaying: false,
    });
  },

  loadProject: (p) =>
    set({
      templateId: p.model.id,
      model: p.model,
      overrides: p.overrides,
      arrivalRateMultiplier: p.arrivalRateMultiplier,
      savedScenarios: p.savedScenarios,
      config: p.config,
      selectedNodeId: null,
      baseline: null,
      scenario: null,
      compareResults: null,
      sensResults: null,
      error: null,
      resultsStale: false,
      watchTrace: null,
      watchSnap: null,
      watchPlaying: false,
    }),

  updateModel: (fn) => set((s) => ({ model: fn(s.model), resultsStale: true })),

  setOverride: (activityId, mode) =>
    set((s) => {
      const activity = s.model.nodes.find((n) => n.id === activityId);
      const baselineMode = activity?.kind === "activity" ? activity.execution : "human";
      const overrides = { ...s.overrides };
      if (mode === baselineMode) {
        delete overrides[activityId];
      } else {
        overrides[activityId] = mode;
      }
      return { overrides, resultsStale: true };
    }),

  setMultiplier: (m) => set({ arrivalRateMultiplier: m, resultsStale: true }),

  saveScenarioAs: (name) =>
    set((s) => ({
      savedScenarios: [
        ...s.savedScenarios,
        {
          id: `s${++scenarioCounter}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          name,
          overrides: { ...s.overrides },
          arrivalRateMultiplier: s.arrivalRateMultiplier,
        },
      ],
    })),

  applyScenario: (id) =>
    set((s) => {
      const sc = s.savedScenarios.find((x) => x.id === id);
      if (!sc) return {};
      return {
        overrides: { ...sc.overrides },
        arrivalRateMultiplier: sc.arrivalRateMultiplier,
        resultsStale: true,
      };
    }),

  deleteScenario: (id) =>
    set((s) => ({ savedScenarios: s.savedScenarios.filter((x) => x.id !== id) })),

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch }, resultsStale: true })),
  select: (nodeId) => set({ selectedNodeId: nodeId }),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error, running: false }),
  setResults: (baseline, scenario) =>
    set({ baseline, scenario, running: false, error: null, resultsStale: false }),
  setCompareResults: (rows) =>
    set({ compareResults: rows, running: false, error: null, resultsStale: false }),
  setSensResults: (r) => set({ sensResults: r, running: false, error: null }),
  setWatchTrace: (trace) =>
    set({ watchTrace: trace, watchSnap: null, watchPlaying: false, running: false }),
  publishWatch: (snap, playing) => set({ watchSnap: snap, watchPlaying: playing }),
}));

export function buildScenario(
  overrides: Record<string, ExecutionMode>,
  multiplier: number,
  id = "workbench",
  name = "Workbench scenario",
): Scenario | undefined {
  const entries = Object.entries(overrides);
  if (entries.length === 0 && multiplier === 1) return undefined;
  return {
    id,
    name,
    arrivalRateMultiplier: multiplier,
    overrides: entries.map(([activityId, execution]) => ({ activityId, execution })),
  };
}

/** The mode an activity runs in for the current workbench scenario. */
export function effectiveMode(
  model: ProcessModel,
  overrides: Record<string, ExecutionMode>,
  activityId: string,
): ExecutionMode {
  const override = overrides[activityId];
  if (override) return override;
  const node = model.nodes.find((n) => n.id === activityId);
  return node?.kind === "activity" ? node.execution : "human";
}
