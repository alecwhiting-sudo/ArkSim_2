import {
  processModelSchema,
  runConfigSchema,
  scenarioSchema,
  type ActivityNode,
  type ProcessModel,
  type ProcessNode,
  type RunConfig,
  type RunResult,
  type Scenario,
} from "@fabsim/schema";
import { sample } from "./distributions";
import { EventHeap } from "./heap";
import { deriveReplicationSeed, Pcg32 } from "./rng";
import { mean, percentile, summarize } from "./stats";

export interface SimulateOptions {
  model: ProcessModel;
  config: RunConfig;
  scenario?: Scenario;
}

interface CaseRec {
  arrivedAt: number;
}

interface PoolState {
  id: string;
  capacity: number; // Infinity for unbounded agent capacity
  hourlyCost: number;
  synthetic: boolean; // true for per-agent-activity pools
  busy: number;
  queue: { caseRec: CaseRec; activity: ActivityNode; enqueuedAt: number }[];
  lastT: number;
  busyIntegral: number;
  queueIntegral: number;
  waits: number[];
}

interface ActivityStats {
  executedAs: "human" | "agent";
  completions: number;
  escalations: number;
  waits: number[];
  services: number[];
}

interface RepStats {
  arrived: number;
  completed: number;
  escalated: number;
  cycleTimes: number[];
  throughput: number;
  humanCost: number;
  agentCost: number;
  pools: Map<string, { utilization: number | null; avgQueueLength: number; avgWait: number }>;
  activities: Map<string, ActivityStats>;
}

/**
 * Run a discrete-event simulation of `model` (with optional scenario overrides)
 * for `config.replications` independent replications.
 *
 * Deterministic: identical inputs (including seed) produce identical results.
 */
export function simulate(opts: SimulateOptions): RunResult {
  const model = processModelSchema.parse(opts.model);
  const config = runConfigSchema.parse(opts.config);
  const scenario = opts.scenario ? scenarioSchema.parse(opts.scenario) : undefined;

  const reps: RepStats[] = [];
  for (let r = 0; r < config.replications; r++) {
    reps.push(runReplication(model, config, scenario, deriveReplicationSeed(config.seed, r)));
  }
  return aggregate(model, config, scenario, reps);
}

function resolveExecution(activity: ActivityNode, scenario?: Scenario): "human" | "agent" {
  const override = scenario?.overrides.find((o) => o.activityId === activity.id);
  const mode = override?.execution ?? activity.execution;
  if (mode === "agent" && !activity.agent) {
    throw new Error(
      `Scenario sets activity "${activity.id}" to agent, but it has no agent profile`,
    );
  }
  return mode;
}

function runReplication(
  model: ProcessModel,
  config: RunConfig,
  scenario: Scenario | undefined,
  seed: bigint,
): RepStats {
  const rng = new Pcg32(seed);
  const { durationHours: end, warmupHours: warmup } = config;
  const window = end - warmup;
  const arrivalMult = scenario?.arrivalRateMultiplier ?? 1;

  const nodesById = new Map<string, ProcessNode>(model.nodes.map((n) => [n.id, n]));

  // Declared human pools plus one synthetic pool per agent-mode activity.
  const pools = new Map<string, PoolState>();
  for (const p of model.pools) {
    pools.set(p.id, {
      id: p.id,
      capacity: p.capacity,
      hourlyCost: p.hourlyCostPerServer,
      synthetic: false,
      busy: 0,
      queue: [],
      lastT: 0,
      busyIntegral: 0,
      queueIntegral: 0,
      waits: [],
    });
  }
  const activityStats = new Map<string, ActivityStats>();
  const resolved = new Map<string, { mode: "human" | "agent"; pool: PoolState }>();
  for (const n of model.nodes) {
    if (n.kind !== "activity") continue;
    const mode = resolveExecution(n, scenario);
    let pool: PoolState;
    if (mode === "human") {
      pool = pools.get(n.human.poolId)!;
    } else {
      pool = {
        id: `agent:${n.id}`,
        capacity: n.agent!.concurrencyLimit ?? Number.POSITIVE_INFINITY,
        hourlyCost: 0,
        synthetic: true,
        busy: 0,
        queue: [],
        lastT: 0,
        busyIntegral: 0,
        queueIntegral: 0,
        waits: [],
      };
      pools.set(pool.id, pool);
    }
    resolved.set(n.id, { mode, pool });
    activityStats.set(n.id, {
      executedAs: mode,
      completions: 0,
      escalations: 0,
      waits: [],
      services: [],
    });
  }

  const heap = new EventHeap();
  let seq = 0;
  const schedule = (t: number, run: () => void) => heap.push({ t, seq: seq++, run });

  let arrived = 0;
  let completed = 0;
  let escalated = 0;
  let agentCost = 0;
  const cycleTimes: number[] = [];

  const advance = (pool: PoolState, t: number) => {
    const t0 = Math.max(pool.lastT, warmup);
    const t1 = Math.min(t, end);
    if (t1 > t0) {
      pool.busyIntegral += pool.busy * (t1 - t0);
      pool.queueIntegral += pool.queue.length * (t1 - t0);
    }
    pool.lastT = t;
  };

  const measured = (c: CaseRec) => c.arrivedAt >= warmup;

  function enter(caseRec: CaseRec, nodeId: string, t: number): void {
    const node = nodesById.get(nodeId)!;
    switch (node.kind) {
      case "activity": {
        const { pool } = resolved.get(node.id)!;
        advance(pool, t);
        if (pool.busy < pool.capacity) {
          startService(caseRec, node, pool, t, t);
        } else {
          pool.queue.push({ caseRec, activity: node, enqueuedAt: t });
        }
        return;
      }
      case "gateway": {
        const r = rng.next();
        let cum = 0;
        for (const b of node.branches) {
          cum += b.probability;
          if (r < cum) {
            enter(caseRec, b.to, t);
            return;
          }
        }
        enter(caseRec, node.branches[node.branches.length - 1]!.to, t);
        return;
      }
      case "sink": {
        completed++;
        if (measured(caseRec)) cycleTimes.push(t - caseRec.arrivedAt);
        return;
      }
      case "source":
        throw new Error(`Case routed into source node "${node.id}"`);
    }
  }

  // Caller must have advance()d the pool to t already.
  function startService(
    caseRec: CaseRec,
    activity: ActivityNode,
    pool: PoolState,
    t: number,
    enqueuedAt: number,
  ): void {
    const stats = activityStats.get(activity.id)!;
    const { mode } = resolved.get(activity.id)!;
    if (measured(caseRec)) {
      const wait = t - enqueuedAt;
      stats.waits.push(wait);
      pool.waits.push(wait);
    }
    pool.busy++;
    const dist = mode === "human" ? activity.human.serviceTime : activity.agent!.serviceTime;
    const serviceTime = sample(dist, rng);
    if (measured(caseRec)) stats.services.push(serviceTime);
    schedule(t + serviceTime, () => {
      advance(pool, t + serviceTime);
      pool.busy--;
      stats.completions += measured(caseRec) ? 1 : 0;
      if (mode === "agent" && measured(caseRec)) {
        agentCost += activity.agent!.costPerCase;
      }
      // Hand the freed server to the next queued case before routing onward.
      if (pool.queue.length > 0 && pool.busy < pool.capacity) {
        const e = pool.queue.shift()!;
        startService(e.caseRec, e.activity, pool, t + serviceTime, e.enqueuedAt);
      }
      let nextId = activity.out;
      const esc = mode === "agent" ? activity.agent!.escalation : undefined;
      if (esc && rng.next() < esc.probability) {
        nextId = esc.toNodeId;
        escalated++;
        stats.escalations += measured(caseRec) ? 1 : 0;
      }
      enter(caseRec, nextId, t + serviceTime);
    });
  }

  for (const node of model.nodes) {
    if (node.kind !== "source") continue;
    const rate = node.arrival.ratePerHour * arrivalMult;
    const scheduleArrival = (t: number) => {
      schedule(t, () => {
        arrived++;
        const caseRec: CaseRec = { arrivedAt: t };
        scheduleArrival(t - Math.log(rng.next()) / rate);
        enter(caseRec, node.out, t);
      });
    };
    scheduleArrival(-Math.log(rng.next()) / rate);
  }

  for (;;) {
    const ev = heap.pop();
    if (!ev || ev.t > end) break;
    ev.run();
  }
  for (const pool of pools.values()) advance(pool, end);

  let humanCost = 0;
  const poolOut = new Map<
    string,
    { utilization: number | null; avgQueueLength: number; avgWait: number }
  >();
  for (const pool of pools.values()) {
    if (!pool.synthetic) humanCost += pool.hourlyCost * pool.busyIntegral;
    poolOut.set(pool.id, {
      utilization: Number.isFinite(pool.capacity)
        ? pool.busyIntegral / (window * pool.capacity)
        : null,
      avgQueueLength: pool.queueIntegral / window,
      avgWait: mean(pool.waits),
    });
  }

  return {
    arrived,
    completed,
    escalated,
    cycleTimes,
    throughput: cycleTimes.length / window,
    humanCost,
    agentCost,
    pools: poolOut,
    activities: activityStats,
  };
}

function aggregate(
  model: ProcessModel,
  config: RunConfig,
  scenario: Scenario | undefined,
  reps: RepStats[],
): RunResult {
  const allCycleTimes = reps.flatMap((r) => r.cycleTimes);
  const totalArrived = reps.reduce((s, r) => s + r.arrived, 0);
  const totalCompleted = reps.reduce((s, r) => s + r.completed, 0);
  const totalEscalated = reps.reduce((s, r) => s + r.escalated, 0);
  const totalHuman = reps.reduce((s, r) => s + r.humanCost, 0);
  const totalAgent = reps.reduce((s, r) => s + r.agentCost, 0);
  const totalCost = totalHuman + totalAgent;
  const measuredCompletions = allCycleTimes.length;

  const poolIds = [...reps[0]!.pools.keys()];
  const activityIds = [...reps[0]!.activities.keys()];

  return {
    scenarioId: scenario?.id ?? null,
    config,
    replications: reps.length,
    counts: {
      arrived: totalArrived,
      completed: totalCompleted,
      inFlight: totalArrived - totalCompleted,
      escalated: totalEscalated,
    },
    cycleTimeHours: {
      mean: summarize(reps.map((r) => mean(r.cycleTimes))),
      p50: percentile(allCycleTimes, 50),
      p90: percentile(allCycleTimes, 90),
      p95: percentile(allCycleTimes, 95),
    },
    throughputPerHour: summarize(reps.map((r) => r.throughput)),
    cost: {
      totalPerReplication: summarize(reps.map((r) => r.humanCost + r.agentCost)),
      perCase: measuredCompletions > 0 ? totalCost / measuredCompletions : 0,
      humanShare: totalCost > 0 ? totalHuman / totalCost : 0,
      agentShare: totalCost > 0 ? totalAgent / totalCost : 0,
    },
    pools: poolIds.map((poolId) => {
      const perRep = reps.map((r) => r.pools.get(poolId)!);
      const utils = perRep.map((p) => p.utilization).filter((u): u is number => u !== null);
      return {
        poolId,
        utilization: utils.length > 0 ? mean(utils) : null,
        avgQueueLength: mean(perRep.map((p) => p.avgQueueLength)),
        avgWaitHours: mean(perRep.map((p) => p.avgWait)),
      };
    }),
    activities: activityIds.map((activityId) => {
      const perRep = reps.map((r) => r.activities.get(activityId)!);
      return {
        activityId,
        executedAs: perRep[0]!.executedAs,
        completions: perRep.reduce((s, a) => s + a.completions, 0),
        escalations: perRep.reduce((s, a) => s + a.escalations, 0),
        avgWaitHours: mean(perRep.flatMap((a) => a.waits)),
        avgServiceHours: mean(perRep.flatMap((a) => a.services)),
      };
    }),
  };
}
