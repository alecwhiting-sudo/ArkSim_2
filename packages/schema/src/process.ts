import { z } from "zod";
import { distributionSchema } from "./distributions";

const id = z.string().min(1);

/** A pool of human resources: capacity in servers (people), cost per server-hour. */
export const poolSchema = z.object({
  id,
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  hourlyCostPerServer: z.number().nonnegative().default(0),
});
export type Pool = z.infer<typeof poolSchema>;

export const humanProfileSchema = z.object({
  poolId: id,
  serviceTime: distributionSchema,
});
export type HumanProfile = z.infer<typeof humanProfileSchema>;

export const agentProfileSchema = z.object({
  serviceTime: distributionSchema,
  /** Marginal cost per case handled by the agent (e.g. inference cost). */
  costPerCase: z.number().nonnegative().default(0),
  /** Max cases the agent processes concurrently. Omit for effectively unbounded. */
  concurrencyLimit: z.number().int().positive().optional(),
  /**
   * After agent completion, this fraction of cases is routed to `toNodeId`
   * (a human queue) instead of the activity's normal `out` edge.
   * Escalation creates new human work — it never just disappears.
   */
  escalation: z
    .object({
      probability: z.number().min(0).max(1),
      toNodeId: id,
    })
    .optional(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const sourceSchema = z.object({
  id,
  kind: z.literal("source"),
  name: z.string().min(1),
  out: id,
  arrival: z.object({
    kind: z.literal("poisson"),
    ratePerHour: z.number().positive(),
  }),
});
export type SourceNode = z.infer<typeof sourceSchema>;

export const activitySchema = z.object({
  id,
  kind: z.literal("activity"),
  name: z.string().min(1),
  out: id,
  /** Which execution profile is active in the baseline. Scenarios can override. */
  execution: z.enum(["human", "agent"]).default("human"),
  human: humanProfileSchema,
  agent: agentProfileSchema.optional(),
});
export type ActivityNode = z.infer<typeof activitySchema>;

export const gatewaySchema = z.object({
  id,
  kind: z.literal("gateway"),
  name: z.string().min(1),
  branches: z
    .array(
      z.object({
        to: id,
        probability: z.number().min(0).max(1),
      }),
    )
    .min(1),
});
export type GatewayNode = z.infer<typeof gatewaySchema>;

export const sinkSchema = z.object({
  id,
  kind: z.literal("sink"),
  name: z.string().min(1),
});
export type SinkNode = z.infer<typeof sinkSchema>;

export const nodeSchema = z.discriminatedUnion("kind", [
  sourceSchema,
  activitySchema,
  gatewaySchema,
  sinkSchema,
]);
export type ProcessNode = z.infer<typeof nodeSchema>;

export const processModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    pools: z.array(poolSchema),
    nodes: z.array(nodeSchema).min(2),
  })
  .superRefine((model, ctx) => {
    const nodeIds = new Set<string>();
    for (const n of model.nodes) {
      if (nodeIds.has(n.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate node id "${n.id}"` });
      }
      nodeIds.add(n.id);
    }
    const poolIds = new Set<string>();
    for (const p of model.pools) {
      if (poolIds.has(p.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate pool id "${p.id}"` });
      }
      poolIds.add(p.id);
    }
    const requireNode = (ref: string, from: string) => {
      if (!nodeIds.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node "${from}" references missing node "${ref}"`,
        });
      }
    };
    let sources = 0;
    let sinks = 0;
    for (const n of model.nodes) {
      if (n.kind === "source") {
        sources++;
        requireNode(n.out, n.id);
      } else if (n.kind === "sink") {
        sinks++;
      } else if (n.kind === "activity") {
        requireNode(n.out, n.id);
        if (!poolIds.has(n.human.poolId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Activity "${n.id}" references missing pool "${n.human.poolId}"`,
          });
        }
        if (n.execution === "agent" && !n.agent) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Activity "${n.id}" has execution "agent" but no agent profile`,
          });
        }
        if (n.agent?.escalation) {
          requireNode(n.agent.escalation.toNodeId, n.id);
        }
      } else if (n.kind === "gateway") {
        let sum = 0;
        for (const b of n.branches) {
          requireNode(b.to, n.id);
          sum += b.probability;
        }
        if (Math.abs(sum - 1) > 1e-9) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Gateway "${n.id}" branch probabilities sum to ${sum}, expected 1`,
          });
        }
      }
    }
    if (sources === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Model needs at least one source" });
    }
    if (sinks === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Model needs at least one sink" });
    }
  });

export type ProcessModel = z.infer<typeof processModelSchema>;
