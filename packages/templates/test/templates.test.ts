import { simulate } from "@fabsim/engine";
import { describe, expect, it } from "vitest";
import { agentifyAllScenario, templates } from "../src";

/**
 * Template sanity suite: every shipped template must validate, simulate
 * without deadlock in both baseline and agentified form, and produce KPIs
 * inside a plausibility envelope.
 */
const config = { durationHours: 300, warmupHours: 50, replications: 3, seed: 2026 };

describe.each(templates.map((t) => [t.id, t] as const))("template %s", (_id, model) => {
  it("baseline simulates and completes cases", () => {
    const result = simulate({ model, config });
    expect(result.counts.completed).toBeGreaterThan(0);
    expect(result.counts.arrived).toBe(result.counts.completed + result.counts.inFlight);
    expect(result.cycleTimeHours.mean.mean).toBeGreaterThan(0);
    expect(result.cycleTimeHours.mean.mean).toBeLessThan(24);
    for (const pool of result.pools) {
      if (pool.utilization !== null) {
        expect(pool.utilization).toBeGreaterThanOrEqual(0);
        expect(pool.utilization).toBeLessThanOrEqual(1);
      }
    }
  });

  it("agentify-all scenario simulates and shifts cost toward agent spend", () => {
    const scenario = agentifyAllScenario(model);
    expect(scenario.overrides.length).toBeGreaterThan(0);
    const baseline = simulate({ model, config });
    const agentified = simulate({ model, config, scenario });
    expect(agentified.counts.completed).toBeGreaterThan(0);
    expect(agentified.cost.agentShare).toBeGreaterThan(0);
    expect(agentified.cost.totalPerReplication.mean).toBeLessThan(
      baseline.cost.totalPerReplication.mean,
    );
  });
});
