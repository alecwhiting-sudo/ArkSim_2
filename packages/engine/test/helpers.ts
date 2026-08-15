import type { ProcessModel } from "@fabsim/schema";

/**
 * A single-queue model: Poisson arrivals -> one activity served by a pool of
 * `servers` -> sink. With exponential service this is exactly M/M/c, for which
 * closed-form results exist — the engine's ground truth.
 */
export function mmcModel(opts: {
  arrivalRate: number;
  serviceMean: number;
  servers: number;
}): ProcessModel {
  return {
    schemaVersion: 1,
    id: "mmc",
    name: "M/M/c test model",
    pools: [
      { id: "pool", name: "Servers", capacity: opts.servers, hourlyCostPerServer: 1 },
    ],
    nodes: [
      {
        id: "src",
        kind: "source",
        name: "Arrivals",
        out: "serve",
        arrival: { kind: "poisson", ratePerHour: opts.arrivalRate },
      },
      {
        id: "serve",
        kind: "activity",
        name: "Service",
        out: "done",
        execution: "human",
        human: {
          poolId: "pool",
          serviceTime: { kind: "exponential", mean: opts.serviceMean },
        },
      },
      { id: "done", kind: "sink", name: "Done" },
    ],
  };
}

/** Erlang-C: exact steady-state results for the M/M/c queue. */
export function erlangC(opts: { arrivalRate: number; serviceMean: number; servers: number }) {
  const lambda = opts.arrivalRate;
  const mu = 1 / opts.serviceMean;
  const c = opts.servers;
  const a = lambda / mu; // offered load in erlangs
  const rho = a / c;
  if (rho >= 1) throw new Error("Unstable queue in oracle");

  let term = 1; // a^k / k!
  let sum = 1; // k = 0
  for (let k = 1; k < c; k++) {
    term *= a / k;
    sum += term;
  }
  const lastTerm = (term * a) / c; // a^c / c!
  const p0 = 1 / (sum + lastTerm / (1 - rho));
  const probWait = (lastTerm / (1 - rho)) * p0; // Erlang-C probability of waiting

  const wq = probWait / (c * mu - lambda); // mean wait in queue (hours)
  const w = wq + 1 / mu; // mean time in system
  const lq = lambda * wq; // mean queue length
  return { utilization: rho, wq, w, lq };
}
