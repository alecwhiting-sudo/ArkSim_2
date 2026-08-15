import { z } from "zod";

/** Simulation run settings. All times in hours. */
export const runConfigSchema = z
  .object({
    durationHours: z.number().positive(),
    /** Stats are only collected for cases arriving after the warm-up. */
    warmupHours: z.number().nonnegative().default(0),
    replications: z.number().int().min(1).max(1000).default(1),
    /** Master seed. Same model + config + seed => bit-identical results. */
    seed: z.number().int().nonnegative(),
  })
  .refine((c) => c.warmupHours < c.durationHours, {
    message: "warmupHours must be less than durationHours",
  });

export type RunConfig = z.infer<typeof runConfigSchema>;
