import { z } from "zod";

/**
 * Service-time / duration distributions. All time values are in HOURS.
 * `lognormal` is parameterized by mean and coefficient of variation (cv),
 * which is how analysts think about task times ("about 9 minutes, quite
 * variable"), not by mu/sigma.
 */
export const distributionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), value: z.number().nonnegative() }),
  z.object({
    kind: z.literal("uniform"),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  }),
  z.object({ kind: z.literal("exponential"), mean: z.number().positive() }),
  z.object({
    kind: z.literal("lognormal"),
    mean: z.number().positive(),
    cv: z.number().positive(),
  }),
  z.object({
    kind: z.literal("triangular"),
    min: z.number().nonnegative(),
    mode: z.number().nonnegative(),
    max: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("empirical"),
    /** Observed durations in hours (e.g. imported from a CSV); sampled uniformly. */
    values: z.array(z.number().nonnegative()).min(1).max(50000),
  }),
]);

export type Distribution = z.infer<typeof distributionSchema>;
