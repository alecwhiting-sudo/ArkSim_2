import type { ProcessNode } from "@fabsim/schema";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMemo } from "react";
import { primaryOf } from "../distribution-util";
import { fmtHours } from "../format";
import { layoutModel } from "../layout";
import { effectiveMode, useFabStore, type ExecutionMode } from "../store";

type FabNodeData = { pnode: ProcessNode; mode: ExecutionMode | null; overridden: boolean };
type FabFlowNode = Node<FabNodeData, "fab">;

function FabNode({ data, selected }: NodeProps<FabFlowNode>) {
  const setOverride = useFabStore((s) => s.setOverride);
  const live = useFabStore((s) => s.watchSnap?.nodes[data.pnode.id]);
  const watching = useFabStore((s) => s.watchSnap !== null);
  const { pnode, mode, overridden } = data;

  const toggle = (next: ExecutionMode) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOverride(pnode.id, next);
  };

  const cls = `fab-node fab-node--${pnode.kind}${selected ? " is-selected" : ""}`;
  return (
    <div className={cls}>
      {pnode.kind !== "source" && <Handle type="target" position={Position.Left} />}
      {pnode.kind !== "sink" && <Handle type="source" position={Position.Right} />}
      <div className="fab-node__kind">{pnode.kind}</div>
      <div className="fab-node__name">{pnode.name}</div>
      {pnode.kind === "source" && (
        <div className="fab-node__meta">{pnode.arrival.ratePerHour}/h arrivals</div>
      )}
      {pnode.kind === "activity" && (
        <>
          <div className="fab-node__meta">
            {mode === "agent"
              ? "AI agent"
              : `${pnode.human.poolId} · ~${fmtHours(primaryDuration(pnode))}`}
          </div>
          {pnode.agent ? (
            <div className="fab-node__toggle" role="group" aria-label="Execution">
              <button
                className={mode === "human" ? "is-on" : ""}
                onClick={toggle("human")}
                type="button"
              >
                Human
              </button>
              <button
                className={mode === "agent" ? "is-on is-agent" : ""}
                onClick={toggle("agent")}
                type="button"
              >
                Agent
              </button>
            </div>
          ) : (
            <div className="fab-node__meta fab-node__meta--dim">human only</div>
          )}
          {overridden && !watching && <div className="fab-node__badge">scenario change</div>}
          {watching && live && (
            <div className="fab-node__live">
              <span className="fab-node__busy">working {live.busy}</span>
              <span className={`fab-node__queue${live.queue > 0 ? " has-queue" : ""}`}>
                queue {live.queue}
              </span>
            </div>
          )}
        </>
      )}
      {pnode.kind === "gateway" && (
        <div className="fab-node__meta">
          {pnode.branches.map((b) => `${Math.round(b.probability * 100)}%`).join(" / ")}
        </div>
      )}
    </div>
  );
}

function primaryDuration(node: Extract<ProcessNode, { kind: "activity" }>): number {
  return primaryOf(node.human.serviceTime);
}

const nodeTypes = { fab: FabNode };

export function Canvas() {
  const model = useFabStore((s) => s.model);
  const overrides = useFabStore((s) => s.overrides);
  const select = useFabStore((s) => s.select);
  const flowing = useFabStore((s) => s.watchPlaying);

  const { nodes, edges } = useMemo(() => {
    const positions = layoutModel(model);
    const nodes: FabFlowNode[] = model.nodes.map((pnode) => ({
      id: pnode.id,
      type: "fab",
      position: positions.get(pnode.id)!,
      data: {
        pnode,
        mode: pnode.kind === "activity" ? effectiveMode(model, overrides, pnode.id) : null,
        overridden: pnode.id in overrides,
      },
    }));
    const edges: Edge[] = [];
    for (const n of model.nodes) {
      if (n.kind === "source" || n.kind === "activity") {
        edges.push({ id: `${n.id}->${n.out}`, source: n.id, target: n.out });
        if (n.kind === "activity" && n.agent?.escalation) {
          edges.push({
            id: `${n.id}-esc`,
            source: n.id,
            target: n.agent.escalation.toNodeId,
            label: `esc ${Math.round(n.agent.escalation.probability * 100)}%`,
            className: "fab-edge--escalation",
            style: { strokeDasharray: "6 4" },
          });
        }
      } else if (n.kind === "gateway") {
        for (const b of n.branches) {
          edges.push({
            id: `${n.id}->${b.to}`,
            source: n.id,
            target: b.to,
            label: `${Math.round(b.probability * 100)}%`,
          });
        }
      }
    }
    // During playback, animate the edges so flow direction reads at a glance.
    return { nodes, edges: edges.map((e) => ({ ...e, animated: flowing })) };
  }, [model, overrides, flowing]);

  return (
    <div className="canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => select(node.id)}
        onPaneClick={() => select(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
