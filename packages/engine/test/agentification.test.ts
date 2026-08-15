import type { ProcessModel, Scenario } from "@fabsim/schema";
import { describe, expect, it } from "vitest";
import { simulate } from "../src";

/**
 * The differentiator mechanics: agent execution profiles, scenario overrides,
 * escalation routing to human queues, and agent cost accounting.
 */
const model: ProcessModel = {
  schemaVersion: 1,
  id: "triage",
  name: "Ticket triage",
  pools: [
    { id: "agents-l1", name: "L1 team", capacity: 3, hourlyCostPerServer: 30 },
    { id: "seniors", name: "Senior team", capacity: 2, hourlyCostPerServer: 50 },
  ],
  nodes: [
    {
      id: "src",
      kind: "source",
      name: "Tickets",
      out: "triage",
      arrival: { kind: "poisson", ratePerHour: 10 },
    },
    {
      id: "triage",
      kind: "activity",
      name: "Triage",
      out: "resolve",
      execution: "human",
      human: { poolId: "agents-l1", serviceTime: { kind: "exponential", mean: 0.1 } },
      agent: {
        serviceTime: { kind: "constant", value: 0.002 },
        costPerCase: 0.05,
        escalation: { probability: 0.2, toNodeId: "senior-review" },
      },
    },
    {
      id: "senior-review",
      kind: "activity",
      name: "Senior review of escalations",
      out: "resolve",
      execution: "human",
      human: { poolId: "seniors", serviceTime: { kind: "exponential", mean: 0.15 } },
    },
    {
      id: "resolve",
      kind: "activity",
      name: "Resolve",
      out: "done",
      execution: "human",
      human: { poolId: "agents-l1", serviceTime: { kind: "exponential", mean: 0.12 } },
    },
    { id: "done", kind: "sink", name: "Resolved" },
  ],
};

const config = { durationHours: 500, warmupHours: 50, replications: 4, seed: 99 };

const agentScenario: Scenario = {
  id: "agentify-triage",
  name: "Agentify triage",
  arrivalRateMultiplier: 1,
  overrides: [{ activityId: "triage", execution: "agent" }],
};

describe("agentification mechanics", () => {
  const baseline = simulate({ model, config });
  const agentified = simulate({ model, config, scenario: agentScenario });

  it("baseline runs everything as human, with no escalations or agent cost", () => {
    expect(baseline.counts.escalated).toBe(0);
    expect(baseline.cost.agentShare).toBe(0);
    expect(baseline.activities.find((a) => a.activityId === "triage")!.executedAs).toBe("human");
  });

  it("scenario override switches the activity to agent execution", () => {
    expect(agentified.scenarioId).toBe("agentify-triage");
    expect(agentified.activities.find((a) => a.activityId === "triage")!.executedAs).toBe(
      "agent",
    );
  });

  it("escalations route ~20% of triaged cases into the senior human queue", () => {
    const triage = agentified.activities.find((a) => a.activityId === "triage")!;
    const senior = agentified.activities.find((a) => a.activityId === "senior-review")!;
    const escalationRate = triage.escalations / triage.completions;
    expect(escalationRate).toBeGreaterThan(0.17);
    expect(escalationRate).toBeLessThan(0.23);
    // Escalated work lands on the senior pool — it does not disappear.
    expect(senior.completions).toBeGreaterThan(0);
    expect(Math.abs(senior.completions - triage.escalations)).toBeLessThanOrEqual(
      0.05 * triage.escalations + 20,
    );
  });

  it("agent execution incurs per-case agent cost", () => {
    expect(agentified.cost.agentShare).toBeGreaterThan(0);
    const triage = agentified.activities.find((a) => a.activityId === "triage")!;
    expect(triage.avgServiceHours).toBeLessThan(0.01);
  });

  it("agentifying the bottleneck-feeding step reduces triage waiting to ~zero", () => {
    const baseTriage = baseline.activities.find((a) => a.activityId === "triage")!;
    const agentTriage = agentified.activities.find((a) => a.activityId === "triage")!;
    expect(agentTriage.avgWaitHours).toBeLessThanOrEqual(baseTriage.avgWaitHours);
    expect(agentTriage.avgWaitHours).toBeLessThan(1e-9);
  });

  it("demand what-if: doubling arrivals increases throughput", () => {
    const doubled = simulate({
      model,
      config,
      scenario: { ...agentScenario, id: "x2", arrivalRateMultiplier: 2 },
    });
    expect(doubled.throughputPerHour.mean).toBeGreaterThan(
      1.5 * agentified.throughputPerHour.mean,
    );
  });
});
