import { simulate, type SimulateOptions } from "@fabsim/engine";

// Simulation runs off the UI thread. The main thread sends SimulateOptions,
// the worker replies with a RunResult (or an error message).
self.onmessage = (e: MessageEvent<SimulateOptions>) => {
  try {
    const result = simulate(e.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
