import { describe, expect, it } from "vitest";
import { simulate, simulateTrace } from "../src";
import { mmcModel } from "./helpers";

const model = mmcModel({ arrivalRate: 6, serviceMean: 0.2, servers: 1 }); // rho=1.2: queues WILL form
const config = { durationHours: 50, warmupHours: 0, replications: 1, seed: 321 };

describe("simulateTrace", () => {
  const trace = simulateTrace({ model, config });

  it("is deterministic", () => {
    expect(simulateTrace({ model, config })).toEqual(trace);
  });

  it("emits chronologically ordered events", () => {
    for (let i = 1; i < trace.events.length; i++) {
      expect(trace.events[i]!.t).toBeGreaterThanOrEqual(trace.events[i - 1]!.t);
    }
  });

  it("replays to consistent, non-negative queue and busy counts", () => {
    let queue = 0;
    let busy = 0;
    let arrived = 0;
    let exited = 0;
    let starts = 0;
    let enqueues = 0;
    for (const e of trace.events) {
      switch (e.kind) {
        case "arrive":
          arrived++;
          break;
        case "enqueue":
          enqueues++;
          queue++;
          break;
        case "start":
          starts++;
          busy++;
          if (e.fromQueue) queue--;
          break;
        case "complete":
          busy--;
          break;
        case "exit":
          exited++;
          break;
      }
      expect(queue).toBeGreaterThanOrEqual(0);
      expect(busy).toBeGreaterThanOrEqual(0);
      expect(busy).toBeLessThanOrEqual(1); // single server
    }
    expect(arrived).toBeGreaterThan(0);
    expect(enqueues).toBeGreaterThan(0); // overloaded queue must actually queue
    expect(exited).toBeLessThanOrEqual(arrived);
    expect(starts).toBeLessThanOrEqual(arrived);
    // Everything still in the system at the end is queue + in service + routing.
    expect(arrived - exited).toBeGreaterThanOrEqual(queue + busy);
  });

  it("matches the counts of the first replication of a normal run", () => {
    const run = simulate({ model, config });
    const arrives = trace.events.filter((e) => e.kind === "arrive").length;
    const exits = trace.events.filter((e) => e.kind === "exit").length;
    expect(arrives).toBe(run.counts.arrived);
    expect(exits).toBe(run.counts.completed);
  });

  it("observing a run does not change simulate results (golden unaffected)", () => {
    const before = simulate({ model, config });
    simulateTrace({ model, config });
    const after = simulate({ model, config });
    expect(after).toEqual(before);
  });
});
