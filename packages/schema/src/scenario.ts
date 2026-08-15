import { z } from "zod";

/**
 * A scenario is a named set of deltas applied on top of a process model's
 * baseline: which activities run as agents, and demand what-ifs.
 */
export const scenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Multiplies every source's arrival rate (demand what-if). */
  arrivalRateMultiplier: z.number().positive().default(1),
  overrides: z
    .array(
      z.object({
        activityId: z.string().min(1),
        execution: z.enum(["human", "agent"]),
      }),
    )
    .default([]),
});

export type Scenario = z.infer<typeof scenarioSchema>;
