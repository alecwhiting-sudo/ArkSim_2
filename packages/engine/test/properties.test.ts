import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { simulate } from "../src";
import { mmcModel } from "./helpers";

/**
 * Invariants that must hold for ANY stable single-queue configuration.
 * Kept to few, fast runs — the oracle tests carry the precision burden.
 */
describe("engine invariants", () => {
  const arb = fc.record({
    arrivalRate: fc.double({ min: 1, max: 6, noNaN: true }),
    serviceMean: fc.double({ min: 0.02, max: 0.12, noNaN: true }),
    servers: fc.integer({ min: 1, max: 4 }),
    seed: fc.integer({ min: 0, max: 2 ** 31 }),
  });

  it("conserves cases and never produces negative stats", () => {
    fc.assert(
      fc.property(arb, ({ arrivalRate, serviceMean, servers, seed }) => {
        // Keep utilization < 1 so the run is stable.
        fc.pre((arrivalRate * serviceMean) / servers < 0.95);
        const result = simulate({
          model: mmcModel({ arrivalRate, serviceMean, servers }),
          config: { durationHours: 100, warmupHours: 10, replications: 1, seed },
        });
        const { arrived, completed, inFlight } = result.counts;
        expect(arrived).toBe(completed + inFlight);
        expect(completed).toBeLessThanOrEqual(arrived);
        expect(inFlight).toBeGreaterThanOrEqual(0);
        const pool = result.pools[0]!;
        expect(pool.avgWaitHours).toBeGreaterThanOrEqual(0);
        expect(pool.avgQueueLength).toBeGreaterThanOrEqual(0);
        expect(pool.utilization!).toBeGreaterThanOrEqual(0);
        expect(pool.utilization!).toBeLessThanOrEqual(1);
        expect(result.cycleTimeHours.mean.mean).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 15 },
    );
  });

  it("more servers never makes waits worse", () => {
    const base = { arrivalRate: 5, serviceMean: 0.15, seed: 42 };
    const config = { durationHours: 500, warmupHours: 50, replications: 4, seed: 42 };
    const wait = (servers: number) =>
      simulate({ model: mmcModel({ ...base, servers }), config }).pools[0]!.avgWaitHours;
    expect(wait(2)).toBeGreaterThanOrEqual(wait(3) - 1e-9);
    expect(wait(3)).toBeGreaterThanOrEqual(wait(4) - 1e-9);
  });
});
