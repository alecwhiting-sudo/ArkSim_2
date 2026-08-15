import {
  simulate,
  simulateTrace,
  type SimulateOptions,
  type TraceResult,
} from "@fabsim/engine";
import type { RunResult } from "@fabsim/schema";

export type WorkerRequest =
  | { id: string; mode: "run"; opts: SimulateOptions }
  | { id: string; mode: "trace"; opts: SimulateOptions };

export type WorkerReply =
  | { id: string; ok: true; mode: "run"; result: RunResult }
  | { id: string; ok: true; mode: "trace"; result: TraceResult }
  | { id: string; ok: false; error: string };

// Simulation runs off the UI thread. Each request carries an id so the main
// thread can match replies (a run issues baseline + scenario in one batch).
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, mode, opts } = e.data;
  try {
    if (mode === "trace") {
      self.postMessage({ id, ok: true, mode, result: simulateTrace(opts) } satisfies WorkerReply);
    } else {
      self.postMessage({ id, ok: true, mode, result: simulate(opts) } satisfies WorkerReply);
    }
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerReply);
  }
};
