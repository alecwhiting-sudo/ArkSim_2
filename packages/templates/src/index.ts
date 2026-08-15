import { processModelSchema, type ProcessModel, type Scenario } from "@fabsim/schema";
import contractReview from "../templates/contract-review.json";
import customerSupport from "../templates/customer-support.json";
import employeeOnboarding from "../templates/employee-onboarding.json";
import expenseProcessing from "../templates/expense-processing.json";
import insuranceClaims from "../templates/insurance-claims.json";
import invoiceProcessing from "../templates/invoice-processing.json";
import itServiceDesk from "../templates/it-service-desk.json";
import kycOnboarding from "../templates/kyc-onboarding.json";
import loanProcessing from "../templates/loan-processing.json";
import orderToCash from "../templates/order-to-cash.json";
import procureToPay from "../templates/procure-to-pay.json";
import recruitmentScreening from "../templates/recruitment-screening.json";

/** All shipped templates, validated at load time. Templates are data, not code. */
export const templates: ProcessModel[] = [
  invoiceProcessing,
  customerSupport,
  insuranceClaims,
  loanProcessing,
  kycOnboarding,
  employeeOnboarding,
  itServiceDesk,
  orderToCash,
  procureToPay,
  contractReview,
  expenseProcessing,
  recruitmentScreening,
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
