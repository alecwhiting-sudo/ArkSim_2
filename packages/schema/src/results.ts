import type { RunConfig } from "./run";

/** Mean with spread across replications; ci95 is the 95% confidence interval. */
export interface SummaryStat {
  mean: number;
  sd: number;
  ci95: [number, number];
}

export interface PoolResult {
  poolId: string;
  /** null for unbounded (agent) capacity, where utilization is undefined. */
  utilization: number | null;
  avgQueueLength: number;
  avgWaitHours: number;
}

export interface ActivityResult {
  activityId: string;
  /** Executed as human or agent in this run (after scenario overrides). */
  executedAs: "human" | "agent";
  completions: number;
  escalations: number;
  /** Cases sampled for human-in-the-loop review after agent completion. */
  reviews: number;
  avgWaitHours: number;
  avgServiceHours: number;
}

export interface RunResult {
  scenarioId: string | null;
  config: RunConfig;
  replications: number;
  /**
   * Totals across all replications. `arrived`/`completed` count every case;
   * KPI stats below only cover cases arriving after the warm-up.
   */
  counts: {
    arrived: number;
    completed: number;
    inFlight: number;
    escalated: number;
    reviewed: number;
  };
  /** Share of measured cases completing within slaTargetHours; null if no target set. */
  slaAttainment: number | null;
  /** End-to-end cycle time in hours. Percentiles pooled across replications. */
  cycleTimeHours: {
    mean: SummaryStat;
    p50: number;
    p90: number;
    p95: number;
  };
  throughputPerHour: SummaryStat;
  cost: {
    /** Per replication measurement window; mean across replications. */
    totalPerReplication: SummaryStat;
    perCase: number;
    humanShare: number;
    agentShare: number;
  };
  pools: PoolResult[];
  activities: ActivityResult[];
}
