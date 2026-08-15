import {
  processModelSchema,
  runConfigSchema,
  type ProcessModel,
  type RunConfig,
} from "@fabsim/schema";
import { z } from "zod";
import type { ExecutionMode, SavedScenario } from "./store";

const savedScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  overrides: z.record(z.enum(["human", "agent"])).default({}),
  arrivalRateMultiplier: z.number().positive().default(1),
});

const projectFileSchema = z.object({
  app: z.literal("fabsim"),
  fileVersion: z.literal(1),
  model: processModelSchema,
  overrides: z.record(z.enum(["human", "agent"])).default({}),
  config: runConfigSchema,
  savedScenarios: z.array(savedScenarioSchema).default([]),
  arrivalRateMultiplier: z.number().positive().default(1),
});

export interface ProjectFile {
  model: ProcessModel;
  overrides: Record<string, ExecutionMode>;
  config: RunConfig;
  savedScenarios: SavedScenario[];
  arrivalRateMultiplier: number;
}

export function serializeProject(p: ProjectFile): string {
  return JSON.stringify(
    {
      app: "fabsim",
      fileVersion: 1,
      model: p.model,
      overrides: p.overrides,
      config: p.config,
      savedScenarios: p.savedScenarios,
      arrivalRateMultiplier: p.arrivalRateMultiplier,
    },
    null,
    2,
  );
}

export function parseProject(text: string): ProjectFile {
  const parsed = projectFileSchema.parse(JSON.parse(text));
  return {
    model: parsed.model,
    overrides: parsed.overrides,
    config: parsed.config,
    savedScenarios: parsed.savedScenarios,
    arrivalRateMultiplier: parsed.arrivalRateMultiplier,
  };
}

/** Save via a download — works in the browser and in the Tauri webview. */
export function downloadProject(p: ProjectFile): void {
  const blob = new Blob([serializeProject(p)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.model.id}.fabsim.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openProjectFile(onLoad: (p: ProjectFile) => void, onError: (msg: string) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.fabsim.json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onLoad(parseProject(await file.text()));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };
  input.click();
}
