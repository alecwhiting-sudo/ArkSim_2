import { processModelSchema, type ProcessModel, type Scenario } from "@fabsim/schema";
import customerSupport from "../templates/customer-support.json";
import insuranceClaims from "../templates/insurance-claims.json";
import invoiceProcessing from "../templates/invoice-processing.json";

/** All shipped templates, validated at load time. Templates are data, not code. */
export const templates: ProcessModel[] = [
  invoiceProcessing,
  customerSupport,
  insuranceClaims,
].map((t) => processModelSchema.parse(t));

export function templateById(id: string): ProcessModel {
  const t = templates.find((m) => m.id === id);
  if (!t) throw new Error(`Unknown template "${id}"`);
  return t;
}

/**
 * A ready-made demonstration scenario per template: switch every activity
 * that has an agent profile over to agent execution.
 */
export function agentifyAllScenario(model: ProcessModel): Scenario {
  return {
    id: `${model.id}:agentify-all`,
    name: "Agentify all candidate steps",
    arrivalRateMultiplier: 1,
    overrides: model.nodes
      .filter((n) => n.kind === "activity" && n.agent !== undefined)
      .map((n) => ({ activityId: n.id, execution: "agent" as const })),
  };
}
