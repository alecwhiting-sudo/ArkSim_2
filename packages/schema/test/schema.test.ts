import { describe, expect, it } from "vitest";
import { processModelSchema, runConfigSchema } from "../src";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const validModel = {
  schemaVersion: 1,
  id: "m",
  name: "Minimal",
  pools: [{ id: "p", name: "Pool", capacity: 1, hourlyCostPerServer: 10 }],
  nodes: [
    {
      id: "src",
      kind: "source",
      name: "In",
      out: "a",
      arrival: { kind: "poisson", ratePerHour: 1 },
    },
    {
      id: "a",
      kind: "activity",
      name: "Work",
      out: "end",
      human: { poolId: "p", serviceTime: { kind: "exponential", mean: 0.5 } },
    },
    { id: "end", kind: "sink", name: "Out" },
  ],
};

describe("processModelSchema", () => {
  it("accepts a valid model and applies defaults", () => {
    const parsed = processModelSchema.parse(validModel);
    const activity = parsed.nodes.find((n) => n.id === "a");
    expect(activity?.kind === "activity" && activity.execution).toBe("human");
  });

  it("rejects a dangling edge", () => {
    const bad = clone(validModel);
    (bad.nodes[1] as { out: string }).out = "nowhere";
    expect(() => processModelSchema.parse(bad)).toThrow(/missing node .*nowhere/);
  });

  it("rejects a missing pool reference", () => {
    const bad = clone(validModel);
    (bad.nodes[1] as { human: { poolId: string } }).human.poolId = "ghost";
    expect(() => processModelSchema.parse(bad)).toThrow(/missing pool .*ghost/);
  });

  it("rejects agent execution without an agent profile", () => {
    const bad = clone(validModel);
    (bad.nodes[1] as { execution?: string }).execution = "agent";
    expect(() => processModelSchema.parse(bad)).toThrow(/no agent profile/);
  });

  it("rejects gateway probabilities that do not sum to 1", () => {
    const bad = clone(validModel);
    bad.nodes.splice(2, 0, {
      id: "g",
      kind: "gateway",
      name: "Split",
      branches: [
        { to: "end", probability: 0.5 },
        { to: "a", probability: 0.4 },
      ],
    } as never);
    expect(() => processModelSchema.parse(bad)).toThrow(/sum to 0.9/);
  });
});

describe("runConfigSchema", () => {
  it("rejects warm-up longer than the run", () => {
    expect(() =>
      runConfigSchema.parse({ durationHours: 10, warmupHours: 10, replications: 1, seed: 1 }),
    ).toThrow(/warmupHours/);
  });
});
