import { simulate, type SimulateOptions } from "@fabsim/engine";

export interface WorkerRequest {
  id: string;
  opts: SimulateOptions;
}

export type WorkerReply =
  | { id: string; ok: true; result: ReturnType<typeof simulate> }
  | { id: string; ok: false; error: string };

// Simulation runs off the UI thread. Each request carries an id so the main
// thread can match replies (a run issues baseline + scenario in one batch).
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, opts } = e.data;
  try {
    const result = simulate(opts);
    self.postMessage({ id, ok: true, result } satisfies WorkerReply);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerReply);
  }
};
