import type { RunResult } from "@fabsim/schema";
import { fmtHours, fmtMoney, fmtNum, fmtPct } from "../format";
import { useFabStore } from "../store";


/**
 * Results dashboard: KPI stat tiles with baseline→scenario deltas, per-pool
 * utilization meters, and a per-activity table. Values are always labeled in
 * ink (never color-alone); the meters carry a printed % beside every bar.
 */
export function Dashboard() {
  const baseline = useFabStore((s) => s.baseline);
  const scenario = useFabStore((s) => s.scenario);
  const compare = useFabStore((s) => s.compareResults);
  const stale = useFabStore((s) => s.resultsStale);
  const model = useFabStore((s) => s.model);

  if (!baseline) {
    return (
      <section className="dashboard dashboard--empty">
        <p>
          No results yet — press Run to simulate the baseline and your scenario, or Watch to see
          the process flowing live.
        </p>
      </section>
    );
  }

  const ciHalf = (r: RunResult) =>
    (r.cycleTimeHours.mean.ci95[1] - r.cycleTimeHours.mean.ci95[0]) / 2;

  const declaredPools = new Set(model.pools.map((p) => p.id));

  return (
    <section className="dashboard">
      {stale && (
        <div className="dashboard__stale">Model or scenario changed since this run — re-run to refresh.</div>
      )}
      <div className="tiles">
        <Tile
          label="Cycle time (mean)"
          value={fmtHours(baseline.cycleTimeHours.mean.mean)}
          scenarioValue={scenario ? fmtHours(scenario.cycleTimeHours.mean.mean) : undefined}
          delta={ratio(scenario?.cycleTimeHours.mean.mean, baseline.cycleTimeHours.mean.mean)}
          downIsGood
          sub={`P90 ${fmtHours(baseline.cycleTimeHours.p90)}${scenario ? ` → ${fmtHours(scenario.cycleTimeHours.p90)}` : ""} · ±${fmtHours(ciHalf(scenario ?? baseline))} (95% CI)`}
        />
        <Tile
          label="Throughput"
          value={`${fmtNum(baseline.throughputPerHour.mean)}/h`}
          scenarioValue={scenario ? `${fmtNum(scenario.throughputPerHour.mean)}/h` : undefined}
          delta={ratio(scenario?.throughputPerHour.mean, baseline.throughputPerHour.mean)}
        />
        <Tile
          label="Cost per case"
          value={fmtMoney(baseline.cost.perCase)}
          scenarioValue={scenario ? fmtMoney(scenario.cost.perCase) : undefined}
          delta={ratio(scenario?.cost.perCase, baseline.cost.perCase)}
          downIsGood
          sub={
            scenario
              ? `agent share ${fmtPct(scenario.cost.agentShare)}`
              : `agent share ${fmtPct(baseline.cost.agentShare)}`
          }
        />
        <Tile
          label="Escalated to humans"
          value={String(baseline.counts.escalated)}
          scenarioValue={scenario ? String(scenario.counts.escalated) : undefined}
          sub="cases handed back by agents"
        />
      </div>

      {compare && compare.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3 className="panel__title">Scenario comparison</h3>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Cycle time</th>
                  <th>P90</th>
                  <th>Throughput</th>
                  <th>Cost/case</th>
                  <th>Escalated</th>
                  <th>Hottest pool</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(({ name, result }) => {
                  const hottest = result.pools
                    .filter((p) => p.utilization !== null)
                    .reduce(
                      (best, p) => (p.utilization! > (best?.utilization ?? -1) ? p : best),
                      null as (typeof result.pools)[number] | null,
                    );
                  return (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num">{fmtHours(result.cycleTimeHours.mean.mean)}</td>
                      <td className="num">{fmtHours(result.cycleTimeHours.p90)}</td>
                      <td className="num">{fmtNum(result.throughputPerHour.mean)}/h</td>
                      <td className="num">{fmtMoney(result.cost.perCase)}</td>
                      <td className="num">{result.counts.escalated || "—"}</td>
                      <td className="num">
                        {hottest ? `${poolName(hottest.poolId)} ${fmtPct(hottest.utilization!)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="dashboard__cols">
        <div className="panel">
          <h3 className="panel__title">Pool utilization</h3>
          {baseline.pools
            .filter((p) => declaredPools.has(p.poolId))
            .map((p) => {
              const s = scenario?.pools.find((sp) => sp.poolId === p.poolId);
              return (
                <div key={p.poolId} className="meter-group">
                  <div className="meter-group__name">{poolName(p.poolId)}</div>
                  <Meter label="baseline" value={p.utilization ?? 0} variant="baseline" />
                  {s && <Meter label="scenario" value={s.utilization ?? 0} variant="scenario" />}
                </div>
              );
            })}
        </div>

        <div className="panel">
          <h3 className="panel__title">Activities{scenario ? " (scenario)" : " (baseline)"}</h3>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Runs as</th>
                  <th>Avg wait</th>
                  <th>Avg service</th>
                  <th>Escalations</th>
                </tr>
              </thead>
              <tbody>
                {(scenario ?? baseline).activities.map((a) => (
                  <tr key={a.activityId}>
                    <td>{activityName(a.activityId)}</td>
                    <td>
                      <span className={`chip chip--${a.executedAs}`}>{a.executedAs}</span>
                    </td>
                    <td className="num">{fmtHours(a.avgWaitHours)}</td>
                    <td className="num">{fmtHours(a.avgServiceHours)}</td>
                    <td className="num">{a.escalations > 0 ? a.escalations : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );

  function poolName(id: string): string {
    return model.pools.find((p) => p.id === id)?.name ?? id;
  }
  function activityName(id: string): string {
    const n = model.nodes.find((n) => n.id === id);
    return n?.kind === "activity" ? n.name : id;
  }
}

function ratio(next: number | undefined, base: number): number | null {
  if (next === undefined || !Number.isFinite(next) || base === 0) return null;
  return next / base - 1;
}

function Tile({
  label,
  value,
  scenarioValue,
  delta,
  downIsGood = false,
  sub,
}: {
  label: string;
  value: string;
  scenarioValue?: string;
  delta?: number | null;
  downIsGood?: boolean;
  sub?: string;
}) {
  const good = delta != null && (downIsGood ? delta < 0 : delta > 0);
  return (
    <div className="tile">
      <div className="tile__label">{label}</div>
      <div className="tile__value">
        {scenarioValue ? (
          <>
            <span className="tile__base">{value}</span>
            <span className="tile__arrow" aria-hidden>
              →
            </span>
            {scenarioValue}
          </>
        ) : (
          value
        )}
        {delta != null && (
          <span className={`delta ${good ? "delta--good" : "delta--bad"}`}>
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {sub && <div className="tile__sub">{sub}</div>}
    </div>
  );
}

function Meter({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "baseline" | "scenario";
}) {
  const hot = value > 0.9;
  return (
    <div className="meter">
      <span className="meter__label">{label}</span>
      <span className="meter__track">
        <span
          className={`meter__fill meter__fill--${variant}`}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </span>
      <span className="meter__value">
        {fmtPct(value)}
        {hot && <span className="meter__hot"> ▲ hot</span>}
      </span>
    </div>
  );
}
