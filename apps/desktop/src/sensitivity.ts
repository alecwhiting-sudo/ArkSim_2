import type { ActivityNode, ProcessModel, Scenario } from "@fabsim/schema";
import { primaryOf, scaleDistribution } from "./distribution-util";
import { buildScenario, effectiveMode, type ExecutionMode } from "./store";

/**
 * One-at-a-time sensitivity: each parameter is pushed down and up around the
 * current workbench state, everything else held fixed. The tornado shows which
 * assumptions actually move the answer — critical because agent performance
 * numbers are usually guesses.
 */
export interface SensitivityParam {
  key: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  apply: (dir: -1 | 1) => { model: ProcessModel; scenario: Scenario | undefined };
}

export interface SensitivityRow {
  key: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  lowCycle: number;
  highCycle: number;
  lowCost: number;
  highCost: number;
}

export interface SensitivityResults {
  baseCycle: number;
  baseCost: number;
  rows: SensitivityRow[];
}

function mapActivity(
  model: ProcessModel,
  id: string,
  fn: (a: ActivityNode) => ActivityNode,
): ProcessModel {
  return {
    ...model,
    nodes: model.nodes.map((n) => (n.kind === "activity" && n.id === id ? fn(n) : n)),
  };
}

export function buildSensitivityParams(
  model: ProcessModel,
  overrides: Record<string, ExecutionMode>,
  multiplier: number,
): SensitivityParam[] {
  const params: SensitivityParam[] = [];
  const scenarioFor = (m: number) => buildScenario(overrides, m, "sens", "Sensitivity");

  params.push({
    key: "demand",
    label: "Demand (arrival rate)",
    lowLabel: "×0.8",
    highLabel: "×1.2",
    apply: (dir) => ({ model, scenario: scenarioFor(multiplier * (dir < 0 ? 0.8 : 1.2)) }),
  });

  for (const pool of model.pools.slice(0, 3)) {
    params.push({
      key: `pool:${pool.id}`,
      label: `${pool.name} headcount`,
      lowLabel: "−1",
      highLabel: "+1",
      apply: (dir) => ({
        model: {
          ...model,
          pools: model.pools.map((p) =>
            p.id === pool.id ? { ...p, capacity: Math.max(1, p.capacity + dir) } : p,
          ),
        },
        scenario: scenarioFor(multiplier),
      }),
    });
  }

  const agentActivities = model.nodes.filter(
    (n): n is ActivityNode =>
      n.kind === "activity" &&
      effectiveMode(model, overrides, n.id) === "agent" &&
      n.agent?.escalation !== undefined,
  );
  for (const a of agentActivities.slice(0, 3)) {
    params.push({
      key: `esc:${a.id}`,
      label: `${a.name} escalation rate`,
      lowLabel: "−50%",
      highLabel: "+50%",
      apply: (dir) => ({
        model: mapActivity(model, a.id, (act) => ({
          ...act,
          agent: {
            ...act.agent!,
            escalation: {
              ...act.agent!.escalation!,
              probability: Math.min(1, act.agent!.escalation!.probability * (dir < 0 ? 0.5 : 1.5)),
            },
          },
        })),
        scenario: scenarioFor(multiplier),
      }),
    });
  }

  const humanActivities = model.nodes
    .filter(
      (n): n is ActivityNode =>
        n.kind === "activity" && effectiveMode(model, overrides, n.id) === "human",
    )
    .sort((x, y) => primaryOf(y.human.serviceTime) - primaryOf(x.human.serviceTime))
    .slice(0, 3);
  for (const a of humanActivities) {
    params.push({
      key: `svc:${a.id}`,
      label: `${a.name} duration`,
      lowLabel: "−20%",
      highLabel: "+20%",
      apply: (dir) => ({
        model: mapActivity(model, a.id, (act) => ({
          ...act,
          human: {
            ...act.human,
            serviceTime: scaleDistribution(act.human.serviceTime, dir < 0 ? 0.8 : 1.2),
          },
        })),
        scenario: scenarioFor(multiplier),
      }),
    });
  }

  return params;
}
