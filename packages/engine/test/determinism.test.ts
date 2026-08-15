import { describe, expect, it } from "vitest";
import { simulate } from "../src";
import { mmcModel } from "./helpers";

describe("determinism", () => {
  const model = mmcModel({ arrivalRate: 6, serviceMean: 0.1, servers: 2 });
  const config = { durationHours: 300, warmupHours: 50, replications: 3, seed: 777 };

  it("same seed produces bit-identical results", () => {
    const a = simulate({ model, config });
    const b = simulate({ model, config });
    expect(b).toEqual(a);
  });

  it("different seeds produce different results", () => {
    const a = simulate({ model, config });
    const b = simulate({ model, config: { ...config, seed: 778 } });
    expect(b.cycleTimeHours.mean.mean).not.toBe(a.cycleTimeHours.mean.mean);
  });

  /**
   * Golden regression pin: any engine change that alters this value changes
   * simulated behavior and must be intentional. Update the pin only alongside
   * a deliberate engine-behavior change, never to "make the test pass".
   */
  it("matches the pinned golden value", () => {
    const result = simulate({ model, config });
    expect(result.cycleTimeHours.mean.mean).toMatchInlineSnapshot(`0.10493952329237836`);
  });
});
