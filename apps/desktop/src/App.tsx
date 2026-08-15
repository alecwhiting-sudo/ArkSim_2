import type { RunResult } from "@fabsim/schema";
import { templates } from "@fabsim/templates";
import { useCallback, useEffect, useRef } from "react";
import { Canvas } from "./components/Canvas";
import { Dashboard } from "./components/Dashboard";
import { Inspector } from "./components/Inspector";
import { downloadProject, openProjectFile } from "./persistence";
import { scenarioFromOverrides, useFabStore } from "./store";
import type { WorkerReply, WorkerRequest } from "./worker";

export function App() {
  const templateId = useFabStore((s) => s.templateId);
  const config = useFabStore((s) => s.config);
  const running = useFabStore((s) => s.running);
  const error = useFabStore((s) => s.error);
  const overrideCount = useFabStore((s) => Object.keys(s.overrides).length);
  const loadTemplate = useFabStore((s) => s.loadTemplate);
  const loadProject = useFabStore((s) => s.loadProject);
  const setConfig = useFabStore((s) => s.setConfig);
  const setRunning = useFabStore((s) => s.setRunning);
  const setError = useFabStore((s) => s.setError);
  const setResults = useFabStore((s) => s.setResults);

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const run = useCallback(() => {
    const w = workerRef.current;
    if (!w || useFabStore.getState().running) return;
    const { model, config, overrides } = useFabStore.getState();
    const scenario = scenarioFromOverrides(overrides);
    setRunning(true);

    const results = new Map<string, RunResult>();
    const expected = scenario ? 2 : 1;
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (!e.data.ok) {
        setError(e.data.error);
        return;
      }
      results.set(e.data.id, e.data.result);
      if (results.size === expected) {
        setResults(results.get("baseline")!, results.get("scenario") ?? null);
      }
    };
    w.postMessage({ id: "baseline", opts: { model, config } } satisfies WorkerRequest);
    if (scenario) {
      w.postMessage({ id: "scenario", opts: { model, config, scenario } } satisfies WorkerRequest);
    }
  }, [setError, setResults, setRunning]);

  const save = useCallback(() => {
    const { model, overrides, config } = useFabStore.getState();
    downloadProject({ model, overrides, config });
  }, []);

  const open = useCallback(() => {
    openProjectFile(
      (p) => loadProject(p.model, p.overrides, p.config),
      (msg) => setError(`Could not open project: ${msg}`),
    );
  }, [loadProject, setError]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">FabSim</div>
        <label className="topbar__field">
          Template
          <select value={templateId} onChange={(e) => loadTemplate(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={open}>
          Open…
        </button>
        <button type="button" className="btn" onClick={save}>
          Save
        </button>
        <div className="topbar__spacer" />
        <label className="topbar__field">
          Sim hours
          <input
            type="number"
            min={10}
            step={50}
            value={config.durationHours}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > config.warmupHours) setConfig({ durationHours: v });
            }}
          />
        </label>
        <label className="topbar__field">
          Replications
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={config.replications}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= 50) setConfig({ replications: v });
            }}
          />
        </label>
        <label className="topbar__field">
          Seed
          <input
            type="number"
            min={0}
            step={1}
            value={config.seed}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 0) setConfig({ seed: v });
            }}
          />
        </label>
        <button type="button" className="btn btn--primary" onClick={run} disabled={running}>
          {running
            ? "Simulating…"
            : overrideCount > 0
              ? `Run baseline vs. scenario (${overrideCount})`
              : "Run baseline"}
        </button>
      </header>

      {error && (
        <div className="errorbar" role="alert">
          {error}
        </div>
      )}

      <main className="workbench">
        <Canvas />
        <Inspector />
      </main>

      <Dashboard />
    </div>
  );
}
