import type { ProcessModel, ProcessNode } from "@fabsim/schema";

export interface NodePosition {
  x: number;
  y: number;
}

/** Forward edges of a node (escalation edges included — they route cases too). */
export function outgoing(node: ProcessNode): string[] {
  switch (node.kind) {
    case "source":
      return [node.out];
    case "activity": {
      const targets = [node.out];
      if (node.agent?.escalation) targets.push(node.agent.escalation.toNodeId);
      return targets;
    }
    case "gateway":
      return node.branches.map((b) => b.to);
    case "sink":
      return [];
  }
}

const COL_WIDTH = 260;
const ROW_HEIGHT = 150;

/**
 * Simple left-to-right layered layout: rank = BFS depth from the sources.
 * Rework/escalation back-edges simply draw backwards, which reads fine for
 * the process sizes FabSim targets. Good enough until a manual-layout editor.
 */
export function layoutModel(model: ProcessModel): Map<string, NodePosition> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const rank = new Map<string, number>();
  const queue: string[] = [];

  for (const n of model.nodes) {
    if (n.kind === "source") {
      rank.set(n.id, 0);
      queue.push(n.id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const next of outgoing(node)) {
      if (!rank.has(next)) {
        rank.set(next, rank.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  // Anything unreachable still gets drawn, in a trailing column.
  const maxRank = Math.max(0, ...rank.values());
  for (const n of model.nodes) {
    if (!rank.has(n.id)) rank.set(n.id, maxRank + 1);
  }

  const perRankIndex = new Map<number, number>();
  const rankCounts = new Map<number, number>();
  for (const n of model.nodes) {
    const r = rank.get(n.id)!;
    rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  }
  const maxCount = Math.max(...rankCounts.values());

  const positions = new Map<string, NodePosition>();
  for (const n of model.nodes) {
    const r = rank.get(n.id)!;
    const i = perRankIndex.get(r) ?? 0;
    perRankIndex.set(r, i + 1);
    const count = rankCounts.get(r)!;
    // Center each column vertically against the tallest column.
    const yOffset = ((maxCount - count) * ROW_HEIGHT) / 2;
    positions.set(n.id, { x: r * COL_WIDTH, y: yOffset + i * ROW_HEIGHT });
  }
  return positions;
}
