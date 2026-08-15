import type { ProcessModel, RunConfig, RunResult, Scenario } from "@fabsim/schema";
import { templates } from "@fabsim/templates";
import { create } from "zustand";

export type ExecutionMode = "human" | "agent";

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
  config: RunConfig;
  selectedNodeId: string | null;
  running: boolean;
  error: string | null;
  baseline: RunResult | null;
  scenario: RunResult | null;
  /** Bumped whenever the model/overrides change, so results are marked stale. */
  resultsStale: boolean;

  loadTemplate: (id: string) => void;
  loadProject: (model: ProcessModel, overrides: Record<string, ExecutionMode>, config: RunConfig) => void;
  updateModel: (fn: (m: ProcessModel) => ProcessModel) => void;
  setOverride: (activityId: string, mode: ExecutionMode) => void;
  setConfig: (patch: Partial<RunConfig>) => void;
  select: (nodeId: string | null) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  setResults: (baseline: RunResult, scenario: RunResult | null) => void;
}

export const useFabStore = create<FabState>((set) => ({
  templateId: templates[0]!.id,
  model: templates[0]!,
  overrides: {},
  config: defaultConfig,
  selectedNodeId: null,
  running: false,
  error: null,
  baseline: null,
  scenario: null,
  resultsStale: false,

  loadTemplate: (id) => {
    const model = templates.find((t) => t.id === id);
    if (!model) return;
    set({
      templateId: id,
      model,
      overrides: {},
      selectedNodeId: null,
      baseline: null,
      scenario: null,
      error: null,
      resultsStale: false,
    });
  },

  loadProject: (model, overrides, config) =>
    set({
      templateId: model.id,
      model,
      overrides,
      config,
      selectedNodeId: null,
      baseline: null,
      scenario: null,
      error: null,
      resultsStale: false,
    }),

  updateModel: (fn) => set((s) => ({ model: fn(s.model), resultsStale: true })),

  setOverride: (activityId, mode) =>
    set((s) => {
      const activity = s.model.nodes.find((n) => n.id === activityId);
      const baselineMode =
        activity?.kind === "activity" ? activity.execution : "human";
      const overrides = { ...s.overrides };
      if (mode === baselineMode) {
        delete overrides[activityId];
      } else {
        overrides[activityId] = mode;
      }
      return { overrides, resultsStale: true };
    }),

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch }, resultsStale: true })),
  select: (nodeId) => set({ selectedNodeId: nodeId }),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error, running: false }),
  setResults: (baseline, scenario) =>
    set({ baseline, scenario, running: false, error: null, resultsStale: false }),
}));

export function scenarioFromOverrides(
  overrides: Record<string, ExecutionMode>,
): Scenario | undefined {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return undefined;
  return {
    id: "workbench",
    name: "Workbench scenario",
    arrivalRateMultiplier: 1,
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
