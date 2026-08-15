import type { TraceEvent } from "@fabsim/engine";

export interface NodeLive {
  queue: number;
  busy: number;
}

export interface ReplaySnapshot {
  time: number;
  arrived: number;
  completed: number;
  escalated: number;
  wip: number;
  nodes: Record<string, NodeLive>;
  /** WIP over time, sampled on a fixed grid, for the live chart. */
  series: { t: number; wip: number }[];
}

const SAMPLE_HOURS = 0.1;

/**
 * Deterministic replay of a trace: advance to any sim-time and read the state
 * of every queue/server. Scrubbing backwards resets and re-applies (a full
 * replay of ~100k events is milliseconds).
 */
export class Replay {
  private idx = 0;
  private time = 0;
  private arrived = 0;
  private completed = 0;
  private escalated = 0;
  private nodes: Record<string, NodeLive> = {};
  private series: { t: number; wip: number }[] = [];
  private nextSample = 0;

  constructor(
    private readonly events: TraceEvent[],
    readonly durationHours: number,
    private readonly nodeIds: string[],
  ) {
    this.reset();
  }

  private reset(): void {
    this.idx = 0;
    this.time = 0;
    this.arrived = 0;
    this.completed = 0;
    this.escalated = 0;
    this.nodes = {};
    for (const id of this.nodeIds) this.nodes[id] = { queue: 0, busy: 0 };
    this.series = [{ t: 0, wip: 0 }];
    this.nextSample = SAMPLE_HOURS;
  }

  advanceTo(t: number): ReplaySnapshot {
    const clamped = Math.max(0, Math.min(t, this.durationHours));
    if (clamped < this.time) this.reset();
    while (this.idx < this.events.length && this.events[this.idx]!.t <= clamped) {
      const e = this.events[this.idx]!;
      while (e.t >= this.nextSample) {
        this.series.push({ t: this.nextSample, wip: this.arrived - this.completed });
        this.nextSample += SAMPLE_HOURS;
      }
      this.apply(e);
      this.idx++;
    }
    while (clamped >= this.nextSample) {
      this.series.push({ t: this.nextSample, wip: this.arrived - this.completed });
      this.nextSample += SAMPLE_HOURS;
    }
    this.time = clamped;
    return this.snapshot();
  }

  private apply(e: TraceEvent): void {
    const node = this.nodes[e.nodeId];
    switch (e.kind) {
      case "arrive":
        this.arrived++;
        break;
      case "enqueue":
        if (node) node.queue++;
        break;
      case "start":
        if (node) {
          node.busy++;
          if (e.fromQueue) node.queue--;
        }
        break;
      case "complete":
        if (node) node.busy--;
        break;
      case "escalate":
        this.escalated++;
        break;
      case "exit":
        this.completed++;
        break;
    }
  }

  snapshot(): ReplaySnapshot {
    return {
      time: this.time,
      arrived: this.arrived,
      completed: this.completed,
      escalated: this.escalated,
      wip: this.arrived - this.completed,
      nodes: { ...this.nodes },
      series: this.series,
    };
  }
}

/** "Day 3 · 14:36" from decimal sim-hours. */
export function formatClock(hours: number): string {
  const day = Math.floor(hours / 24) + 1;
  const h = Math.floor(hours % 24);
  const m = Math.floor((hours % 1) * 60);
  return `Day ${day} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
