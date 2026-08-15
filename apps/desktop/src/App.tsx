import type { RunResult } from "@fabsim/schema";
import { templates } from "@fabsim/templates";
import { useCallback, useEffect, useRef } from "react";
import { Canvas } from "./components/Canvas";
import { Dashboard } from "./components/Dashboard";
import { Inspector } from "./components/Inspector";
import { ScenarioBar } from "./components/ScenarioBar";
import { WatchPanel } from "./components/WatchPanel";
import { downloadProject, openProjectFile } from "./persistence";
import { buildScenario, useFabStore } from "./store";
import type { WorkerReply, WorkerRequest } from "./worker";

/** Watch mode replays a bounded window so playback stays snappy. */
const WATCH_HOURS = 48;

export function App() {
  const templateId = useFabStore((s) => s.templateId);
  const config = useFabStore((s) => s.config);
  const running = useFabStore((s) => s.running);
  const error = useFabStore((s) => s.error);
  const watching = useFabStore((s) => s.watchTrace !== null);
  const overrideCount = useFabStore((s) => Object.keys(s.overrides).length);
  const loadTemplate = useFabStore((s) => s.loadTemplate);
  const loadProject = useFabStore((s) => s.loadProject);
  const setConfig = useFabStore((s) => s.setConfig);
  const setRunning = useFabStore((s) => s.setRunning);
  const setError = useFabStore((s) => s.setError);
  const setResults = useFabStore((s) => s.setResults);
  const setCompareResults = useFabStore((s) => s.setCompareResults);
  const setWatchTrace = useFabStore((s) => s.setWatchTrace);

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const run = useCallback(() => {
    const w = workerRef.current;
    if (!w || useFabStore.getState().running) return;
    const { model, config, overrides, arrivalRateMultiplier } = useFabStore.getState();
    // The demand multiplier is an assumption about the world, so it applies to
    // the baseline too; only the execution overrides are the "scenario".
    const baselineScenario = buildScenario({}, arrivalRateMultiplier, "baseline", "Baseline");
    const scenario =
      Object.keys(overrides).length > 0
        ? buildScenario(overrides, arrivalRateMultiplier)
        : undefined;
    setRunning(true);

    const results = new Map<string, RunResult>();
    const expected = scenario ? 2 : 1;
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (!e.data.ok) {
        setError(e.data.error);
        return;
      }
      if (e.data.mode !== "run") return;
      results.set(e.data.id, e.data.result);
      if (results.size === expected) {
        setResults(results.get("baseline")!, results.get("scenario") ?? null);
      }
    };
    w.postMessage({
      id: "baseline",
      mode: "run",
      opts: { model, config, scenario: baselineScenario },
    } satisfies WorkerRequest);
    if (scenario) {
      w.postMessage({
        id: "scenario",
        mode: "run",
        opts: { model, config, scenario },
      } satisfies WorkerRequest);
    }
  }, [setError, setResults, setRunning]);

  const compareAll = useCallback(() => {
    const w = workerRef.current;
    if (!w || useFabStore.getState().running) return;
    const { model, config, savedScenarios, arrivalRateMultiplier } = useFabStore.getState();
    setRunning(true);

    const jobs: { id: string; name: string }[] = [{ id: "baseline", name: "Baseline" }];
    const results = new Map<string, RunResult>();
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (!e.data.ok) {
        setError(e.data.error);
        return;
      }
      if (e.data.mode !== "run") return;
      results.set(e.data.id, e.data.result);
      if (results.size === jobs.length) {
        setCompareResults(jobs.map((j) => ({ name: j.name, result: results.get(j.id)! })));
      }
    };
    w.postMessage({
      id: "baseline",
      mode: "run",
      opts: { model, config, scenario: buildScenario({}, arrivalRateMultiplier, "baseline", "Baseline") },
    } satisfies WorkerRequest);
    for (const s of savedScenarios) {
      jobs.push({ id: s.id, name: s.name });
      w.postMessage({
        id: s.id,
        mode: "run",
        opts: {
          model,
          config,
          scenario: buildScenario(s.overrides, s.arrivalRateMultiplier, s.id, s.name),
        },
      } satisfies WorkerRequest);
    }
  }, [setCompareResults, setError, setRunning]);

  const watch = useCallback(() => {
    const w = workerRef.current;
    if (!w || useFabStore.getState().running) return;
    const { model, config, overrides, arrivalRateMultiplier } = useFabStore.getState();
    setRunning(true);
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (!e.data.ok) {
        setError(e.data.error);
        return;
      }
      if (e.data.mode === "trace") setWatchTrace(e.data.result);
    };
    w.postMessage({
      id: "trace",
      mode: "trace",
      opts: {
        model,
        config: {
          durationHours: Math.min(WATCH_HOURS, config.durationHours),
          warmupHours: 0,
          replications: 1,
          seed: config.seed,
        },
        scenario: buildScenario(overrides, arrivalRateMultiplier),
      },
    } satisfies WorkerRequest);
  }, [setError, setRunning, setWatchTrace]);

  const save = useCallback(() => {
    const { model, overrides, config, savedScenarios, arrivalRateMultiplier } =
      useFabStore.getState();
    downloadProject({ model, overrides, config, savedScenarios, arrivalRateMultiplier });
  }, []);

  const open = useCallback(() => {
    openProjectFile(
      (p) => loadProject(p),
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
        <button type="button" className="btn" onClick={watch} disabled={running}>
          {watching ? "Re-watch" : "▶ Watch"}
        </button>
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

      <ScenarioBar onCompare={compareAll} />
      {watching ? <WatchPanel /> : <Dashboard />}
    </div>
  );
}
