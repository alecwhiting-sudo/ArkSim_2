import { describe, expect, it } from "vitest";
import { simulate } from "../src";
import { erlangC, mmcModel } from "./helpers";

/**
 * Golden oracle tests: the engine's output on M/M/1 and M/M/c models must
 * match closed-form queueing theory. These catch subtle event-loop, queueing,
 * and sampling bugs that code review cannot.
 */

const config = {
  durationHours: 2000,
  warmupHours: 200,
  replications: 8,
  seed: 12345,
};

function check(opts: { arrivalRate: number; serviceMean: number; servers: number }) {
  const oracle = erlangC(opts);
  const result = simulate({ model: mmcModel(opts), config });

  const pool = result.pools.find((p) => p.poolId === "pool")!;
  const relErr = (sim: number, exact: number) => Math.abs(sim - exact) / exact;

  expect(relErr(pool.utilization!, oracle.utilization)).toBeLessThan(0.03);
  expect(relErr(result.cycleTimeHours.mean.mean, oracle.w)).toBeLessThan(0.05);
  expect(relErr(pool.avgWaitHours, oracle.wq)).toBeLessThan(0.08);
  expect(relErr(pool.avgQueueLength, oracle.lq)).toBeLessThan(0.08);
  expect(relErr(result.throughputPerHour.mean, opts.arrivalRate)).toBeLessThan(0.03);
}

describe("engine vs. Erlang-C analytic oracle", () => {
  it("matches M/M/1 (rho = 0.67)", () => {
    check({ arrivalRate: 4, serviceMean: 1 / 6, servers: 1 });
  });

  it("matches M/M/3 (rho = 0.83)", () => {
    check({ arrivalRate: 10, serviceMean: 0.25, servers: 3 });
  });

  it("matches M/M/2 under light load (rho = 0.3)", () => {
    check({ arrivalRate: 3, serviceMean: 0.2, servers: 2 });
  });
});
