import type { ProcessModel, RunConfig, RunResult } from "@fabsim/schema";
import { fmtHours, fmtMoney, fmtNum, fmtPct } from "./format";
import type { SensitivityResults } from "./sensitivity";

export interface ReportInput {
  model: ProcessModel;
  config: RunConfig;
  baseline: RunResult;
  scenario: RunResult | null;
  compare: { name: string; result: RunResult }[] | null;
  sensitivity: SensitivityResults | null;
  generatedAt: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function kpiRows(label: string, r: RunResult, model: ProcessModel): string {
  const hottest = r.pools
    .filter((p) => p.utilization !== null)
    .reduce(
      (best, p) => (p.utilization! > (best?.utilization ?? -1) ? p : best),
      null as (typeof r.pools)[number] | null,
    );
  const poolName = (id: string) => model.pools.find((p) => p.id === id)?.name ?? id;
  return `<tr>
    <td>${esc(label)}</td>
    <td class="num">${fmtHours(r.cycleTimeHours.mean.mean)}</td>
    <td class="num">${fmtHours(r.cycleTimeHours.p90)}</td>
    <td class="num">${fmtNum(r.throughputPerHour.mean)}/h</td>
    <td class="num">${fmtMoney(r.cost.perCase)}</td>
    <td class="num">${r.slaAttainment !== null ? fmtPct(r.slaAttainment) : "—"}</td>
    <td class="num">${r.counts.escalated || "—"}</td>
    <td class="num">${hottest ? `${esc(poolName(hottest.poolId))} ${fmtPct(hottest.utilization!)}` : "—"}</td>
  </tr>`;
}

/** A self-contained, print-friendly HTML report (print to PDF from the browser). */
export function buildReportHtml(input: ReportInput): string {
  const { model, config, baseline, scenario, compare, sensitivity } = input;
  const rows: string[] = [kpiRows("Baseline", baseline, model)];
  if (scenario) rows.push(kpiRows("Workbench scenario", scenario, model));
  for (const c of compare ?? []) {
    if (c.name !== "Baseline") rows.push(kpiRows(c.name, c.result, model));
  }

  const activityRows = (scenario ?? baseline).activities
    .map((a) => {
      const node = model.nodes.find((n) => n.id === a.activityId);
      return `<tr>
        <td>${esc(node?.kind === "activity" ? node.name : a.activityId)}</td>
        <td>${a.executedAs}</td>
        <td class="num">${fmtHours(a.avgWaitHours)}</td>
        <td class="num">${fmtHours(a.avgServiceHours)}</td>
        <td class="num">${a.escalations || "—"}</td>
        <td class="num">${a.reviews || "—"}</td>
      </tr>`;
    })
    .join("");

  const poolRows = baseline.pools
    .filter((p) => model.pools.some((mp) => mp.id === p.poolId))
    .map((p) => {
      const s = scenario?.pools.find((sp) => sp.poolId === p.poolId);
      const name = model.pools.find((mp) => mp.id === p.poolId)?.name ?? p.poolId;
      return `<tr>
        <td>${esc(name)}</td>
        <td class="num">${p.utilization !== null ? fmtPct(p.utilization) : "—"}</td>
        <td class="num">${s?.utilization != null ? fmtPct(s.utilization) : "—"}</td>
        <td class="num">${fmtHours(p.avgWaitHours)}</td>
        <td class="num">${s ? fmtHours(s.avgWaitHours) : "—"}</td>
      </tr>`;
    })
    .join("");

  const sensRows = (sensitivity?.rows ?? [])
    .slice()
    .sort(
      (a, b) =>
        Math.max(Math.abs(b.lowCycle - sensitivity!.baseCycle), Math.abs(b.highCycle - sensitivity!.baseCycle)) -
        Math.max(Math.abs(a.lowCycle - sensitivity!.baseCycle), Math.abs(a.highCycle - sensitivity!.baseCycle)),
    )
    .map(
      (r) => `<tr>
        <td>${esc(r.label)}</td>
        <td class="num">${esc(r.lowLabel)}: ${fmtHours(r.lowCycle)}</td>
        <td class="num">${esc(r.highLabel)}: ${fmtHours(r.highCycle)}</td>
        <td class="num">${esc(r.lowLabel)}: ${fmtMoney(r.lowCost)}</td>
        <td class="num">${esc(r.highLabel)}: ${fmtMoney(r.highCost)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>FabSim report — ${esc(model.name)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color: #20282b; background: #fff;
         max-width: 60rem; margin: 0 auto; padding: 2rem 1.5rem; font-size: 14px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 2px; } h2 { font-size: 15px; margin: 24px 0 8px; }
  .meta { color: #5c6b6c; font-size: 12.5px; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin: 8px 0 16px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em;
       color: #5c6b6c; padding: 6px 8px; border-bottom: 1px solid #d8dedb; }
  td { padding: 5px 8px; border-bottom: 1px solid #eef2f0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .accent { color: #116b62; } footer { color: #5c6b6c; font-size: 11px; margin-top: 24px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1><span class="accent">FabSim</span> — ${esc(model.name)}</h1>
<p class="meta">Generated ${esc(input.generatedAt)} · simulated ${config.durationHours}h
 (${config.warmupHours}h warm-up) × ${config.replications} replications · seed ${config.seed}${
   config.slaTargetHours ? ` · SLA target ${config.slaTargetHours}h` : ""
 }</p>
${model.description ? `<p class="meta">${esc(model.description)}</p>` : ""}

<h2>Scenario comparison</h2>
<table><thead><tr><th>Scenario</th><th>Cycle time</th><th>P90</th><th>Throughput</th>
<th>Cost/case</th><th>SLA</th><th>Escalated</th><th>Hottest pool</th></tr></thead>
<tbody>${rows.join("")}</tbody></table>

<h2>Resource pools (baseline vs. scenario)</h2>
<table><thead><tr><th>Pool</th><th>Utilization (base)</th><th>Utilization (scen)</th>
<th>Avg wait (base)</th><th>Avg wait (scen)</th></tr></thead>
<tbody>${poolRows}</tbody></table>

<h2>Activities (${scenario ? "scenario" : "baseline"})</h2>
<table><thead><tr><th>Step</th><th>Runs as</th><th>Avg wait</th><th>Avg service</th>
<th>Escalations</th><th>Reviews</th></tr></thead>
<tbody>${activityRows}</tbody></table>

${
  sensitivity
    ? `<h2>Sensitivity (one-at-a-time, cycle time base ${fmtHours(sensitivity.baseCycle)}, cost/case base ${fmtMoney(sensitivity.baseCost)})</h2>
<table><thead><tr><th>Parameter</th><th>Cycle low</th><th>Cycle high</th><th>Cost low</th><th>Cost high</th></tr></thead>
<tbody>${sensRows}</tbody></table>`
    : ""
}
<footer>FabSim — deterministic discrete-event simulation. Same model, settings, and seed reproduce these numbers exactly.</footer>
</body></html>`;
}

export function buildComparisonCsv(
  model: ProcessModel,
  rowsIn: { name: string; result: RunResult }[],
): string {
  const header =
    "scenario,cycle_time_mean_h,cycle_time_p50_h,cycle_time_p90_h,cycle_time_p95_h,throughput_per_h,cost_per_case,sla_attainment,arrived,completed,escalated,reviewed," +
    model.pools.map((p) => `util_${p.id}`).join(",");
  const lines = rowsIn.map(({ name, result }) => {
    const utils = model.pools.map((p) => {
      const pr = result.pools.find((x) => x.poolId === p.id);
      return pr?.utilization != null ? pr.utilization.toFixed(4) : "";
    });
    return [
      JSON.stringify(name),
      result.cycleTimeHours.mean.mean.toFixed(4),
      result.cycleTimeHours.p50.toFixed(4),
      result.cycleTimeHours.p90.toFixed(4),
      result.cycleTimeHours.p95.toFixed(4),
      result.throughputPerHour.mean.toFixed(3),
      result.cost.perCase.toFixed(4),
      result.slaAttainment != null ? result.slaAttainment.toFixed(4) : "",
      result.counts.arrived,
      result.counts.completed,
      result.counts.escalated,
      result.counts.reviewed,
      ...utils,
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
