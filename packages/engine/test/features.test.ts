import type { ProcessModel } from "@fabsim/schema";
import { describe, expect, it } from "vitest";
import { Pcg32, sample, simulate } from "../src";

describe("empirical distribution", () => {
  it("samples only observed values, uniformly-ish", () => {
    const rng = new Pcg32(7n);
    const values = [0.1, 0.2, 0.7];
    const counts = new Map<number, number>();
    for (let i = 0; i < 3000; i++) {
      const v = sample({ kind: "empirical", values }, rng);
      expect(values).toContain(v);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const v of values) {
      expect(counts.get(v)! / 3000).toBeGreaterThan(0.25);
      expect(counts.get(v)! / 3000).toBeLessThan(0.42);
    }
  });
});

const hitlModel: ProcessModel = {
  schemaVersion: 1,
  id: "hitl",
  name: "HITL test",
  pools: [
    { id: "humans", name: "Humans", capacity: 3, hourlyCostPerServer: 40 },
    { id: "reviewers", name: "Reviewers", capacity: 2, hourlyCostPerServer: 50 },
  ],
  nodes: [
    {
      id: "src",
      kind: "source",
      name: "In",
      out: "work",
      arrival: { kind: "poisson", ratePerHour: 10 },
    },
    {
      id: "work",
      kind: "activity",
      name: "Work",
      out: "done",
      execution: "agent",
      human: { poolId: "humans", serviceTime: { kind: "exponential", mean: 0.2 } },
      agent: {
        serviceTime: { kind: "constant", value: 0.002 },
        costPerCase: 0.05,
        escalation: { probability: 0.1, toNodeId: "review" },
        review: { probability: 0.25, toNodeId: "review" },
      },
    },
    {
      id: "review",
      kind: "activity",
      name: "Human review",
      out: "done",
      execution: "human",
      human: { poolId: "reviewers", serviceTime: { kind: "exponential", mean: 0.08 } },
    },
    { id: "done", kind: "sink", name: "Out" },
  ],
};

describe("human-in-the-loop review sampling", () => {
  const result = simulate({
    model: hitlModel,
    config: { durationHours: 500, warmupHours: 50, replications: 4, seed: 11 },
  });

  it("routes ~25% of non-escalated agent completions to the review queue", () => {
    const work = result.activities.find((a) => a.activityId === "work")!;
    const reviewRate = work.reviews / (work.completions - work.escalations);
    expect(reviewRate).toBeGreaterThan(0.21);
    expect(reviewRate).toBeLessThan(0.29);
    expect(result.counts.reviewed).toBeGreaterThan(0);
  });

  it("reviewed and escalated cases both land on the reviewer pool", () => {
    const work = result.activities.find((a) => a.activityId === "work")!;
    const review = result.activities.find((a) => a.activityId === "review")!;
    const expected = work.escalations + work.reviews;
    expect(Math.abs(review.completions - expected)).toBeLessThanOrEqual(0.02 * expected + 20);
  });

  it("is deterministic with review sampling active", () => {
    const again = simulate({
      model: hitlModel,
      config: { durationHours: 500, warmupHours: 50, replications: 4, seed: 11 },
    });
    expect(again).toEqual(result);
  });
});

describe("SLA attainment", () => {
  const model = hitlModel;
  it("reports the share of cases completing within the target", () => {
    const config = { durationHours: 300, warmupHours: 30, replications: 3, seed: 5 };
    const loose = simulate({ model, config: { ...config, slaTargetHours: 100 } });
    const tight = simulate({ model, config: { ...config, slaTargetHours: 0.0001 } });
    const none = simulate({ model, config });
    expect(loose.slaAttainment).toBe(1);
    expect(tight.slaAttainment).toBeLessThan(0.5);
    expect(none.slaAttainment).toBeNull();
  });
});
