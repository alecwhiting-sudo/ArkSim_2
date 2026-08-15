import type { ProcessModel, ProcessNode } from "@fabsim/schema";
import { parseDurationsCsv, pickCsvFile } from "../csv";
import { primaryOf, withPrimary } from "../distribution-util";
import { effectiveMode, useFabStore } from "../store";

function replaceNode(model: ProcessModel, id: string, next: ProcessNode): ProcessModel {
  return { ...model, nodes: model.nodes.map((n) => (n.id === id ? next : n)) };
}

function NumberField({
  label,
  value,
  onCommit,
  step = 0.01,
  min = 0,
  suffix,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          type="number"
          value={Number(value.toPrecision(6))}
          step={step}
          min={min}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min) onCommit(v);
          }}
        />
        {suffix && <span className="field__suffix">{suffix}</span>}
      </span>
    </label>
  );
}

export function Inspector() {
  const model = useFabStore((s) => s.model);
  const overrides = useFabStore((s) => s.overrides);
  const selectedNodeId = useFabStore((s) => s.selectedNodeId);
  const updateModel = useFabStore((s) => s.updateModel);

  const node = model.nodes.find((n) => n.id === selectedNodeId);

  return (
    <aside className="inspector">
      {node ? <NodeEditor key={node.id} node={node} /> : <PoolsEditor />}
      {!node && (
        <p className="inspector__hint">
          Select a step on the canvas to edit it. Flip Human/Agent on a step to build the
          scenario, then Run.
        </p>
      )}
    </aside>
  );

  function NodeEditor({ node }: { node: ProcessNode }) {
    switch (node.kind) {
      case "source":
        return (
          <section>
            <h2 className="inspector__title">{node.name}</h2>
            <NumberField
              label="Arrival rate"
              value={node.arrival.ratePerHour}
              step={0.5}
              suffix="cases/h"
              onCommit={(v) =>
                v > 0 &&
                updateModel((m) =>
                  replaceNode(m, node.id, {
                    ...node,
                    arrival: { ...node.arrival, ratePerHour: v },
                  }),
                )
              }
            />
          </section>
        );
      case "activity": {
        const mode = effectiveMode(model, overrides, node.id);
        return (
          <section>
            <h2 className="inspector__title">{node.name}</h2>
            <p className="inspector__meta">
              Runs as <strong>{mode}</strong> in the current scenario
              {node.id in overrides ? " (scenario change)" : ""}.
            </p>
            <h3 className="inspector__sub">Human profile — pool {node.human.poolId}</h3>
            <NumberField
              label={`Typical duration (${node.human.serviceTime.kind}${
                node.human.serviceTime.kind === "empirical"
                  ? `, ${node.human.serviceTime.values.length} obs`
                  : ""
              })`}
              value={primaryOf(node.human.serviceTime)}
              suffix="h"
              onCommit={(v) =>
                v > 0 &&
                updateModel((m) =>
                  replaceNode(m, node.id, {
                    ...node,
                    human: { ...node.human, serviceTime: withPrimary(node.human.serviceTime, v) },
                  }),
                )
              }
            />
            <button
              type="button"
              className="btn btn--small"
              onClick={() =>
                pickCsvFile((text, filename) => {
                  const raw = parseDurationsCsv(text);
                  if (raw.length === 0) {
                    window.alert(`No numeric durations found in ${filename}.`);
                    return;
                  }
                  const minutes = window.confirm(
                    `Imported ${raw.length} durations from ${filename}.\n\nOK = values are MINUTES, Cancel = values are HOURS.`,
                  );
                  const values = minutes ? raw.map((v) => v / 60) : raw;
                  updateModel((m) =>
                    replaceNode(m, node.id, {
                      ...node,
                      human: { ...node.human, serviceTime: { kind: "empirical", values } },
                    }),
                  );
                })
              }
            >
              Import observed durations (CSV)…
            </button>
            {node.agent ? (
              <>
                <h3 className="inspector__sub">Agent profile</h3>
                <NumberField
                  label={`Duration (${node.agent.serviceTime.kind})`}
                  value={primaryOf(node.agent.serviceTime)}
                  step={0.001}
                  suffix="h"
                  onCommit={(v) =>
                    v > 0 &&
                    updateModel((m) =>
                      replaceNode(m, node.id, {
                        ...node,
                        agent: {
                          ...node.agent!,
                          serviceTime: withPrimary(node.agent!.serviceTime, v),
                        },
                      }),
                    )
                  }
                />
                <NumberField
                  label="Cost per case"
                  value={node.agent.costPerCase}
                  suffix="$"
                  onCommit={(v) =>
                    updateModel((m) =>
                      replaceNode(m, node.id, {
                        ...node,
                        agent: { ...node.agent!, costPerCase: v },
                      }),
                    )
                  }
                />
                {node.agent.escalation && (
                  <NumberField
                    label={`Escalation to ${node.agent.escalation.toNodeId}`}
                    value={node.agent.escalation.probability * 100}
                    step={1}
                    suffix="%"
                    onCommit={(v) =>
                      v <= 100 &&
                      updateModel((m) =>
                        replaceNode(m, node.id, {
                          ...node,
                          agent: {
                            ...node.agent!,
                            escalation: { ...node.agent!.escalation!, probability: v / 100 },
                          },
                        }),
                      )
                    }
                  />
                )}
              </>
            ) : (
              <p className="inspector__meta">No agent profile — this step stays human.</p>
            )}
          </section>
        );
      }
      case "gateway":
        return (
          <section>
            <h2 className="inspector__title">{node.name}</h2>
            {node.branches.map((b, i) => (
              <NumberField
                key={b.to}
                label={`→ ${b.to}`}
                value={b.probability * 100}
                step={1}
                suffix="%"
                onCommit={(v) =>
                  v <= 100 &&
                  updateModel((m) =>
                    replaceNode(m, node.id, {
                      ...node,
                      branches: node.branches.map((br, j) =>
                        j === i ? { ...br, probability: v / 100 } : br,
                      ),
                    }),
                  )
                }
              />
            ))}
            <p className="inspector__meta">Branch shares must sum to 100% to run.</p>
          </section>
        );
      case "sink":
        return (
          <section>
            <h2 className="inspector__title">{node.name}</h2>
            <p className="inspector__meta">Cases completing here count toward cycle time.</p>
          </section>
        );
    }
  }

  function PoolsEditor() {
    return (
      <section>
        <h2 className="inspector__title">Resource pools</h2>
        {model.pools.map((pool) => (
          <div key={pool.id} className="inspector__pool">
            <h3 className="inspector__sub">{pool.name}</h3>
            <NumberField
              label="Headcount"
              value={pool.capacity}
              step={1}
              min={1}
              suffix="FTE"
              onCommit={(v) =>
                Number.isInteger(v) &&
                v >= 1 &&
                updateModel((m) => ({
                  ...m,
                  pools: m.pools.map((p) => (p.id === pool.id ? { ...p, capacity: v } : p)),
                }))
              }
            />
            <NumberField
              label="Cost per person-hour"
              value={pool.hourlyCostPerServer}
              step={1}
              suffix="$"
              onCommit={(v) =>
                updateModel((m) => ({
                  ...m,
                  pools: m.pools.map((p) =>
                    p.id === pool.id ? { ...p, hourlyCostPerServer: v } : p,
                  ),
                }))
              }
            />
          </div>
        ))}
      </section>
    );
  }
}
