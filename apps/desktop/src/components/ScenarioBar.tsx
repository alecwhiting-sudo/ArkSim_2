import { useFabStore } from "../store";

/**
 * The scenario shelf: demand what-if multiplier, save the current workbench
 * state as a named scenario, recall or delete saved ones.
 */
export function ScenarioBar({
  onCompare,
  onSensitivity,
}: {
  onCompare: () => void;
  onSensitivity: () => void;
}) {
  const multiplier = useFabStore((s) => s.arrivalRateMultiplier);
  const overrideCount = useFabStore((s) => Object.keys(s.overrides).length);
  const saved = useFabStore((s) => s.savedScenarios);
  const running = useFabStore((s) => s.running);
  const slaTarget = useFabStore((s) => s.config.slaTargetHours);
  const setMultiplier = useFabStore((s) => s.setMultiplier);
  const setConfig = useFabStore((s) => s.setConfig);
  const saveScenarioAs = useFabStore((s) => s.saveScenarioAs);
  const applyScenario = useFabStore((s) => s.applyScenario);
  const deleteScenario = useFabStore((s) => s.deleteScenario);

  const save = () => {
    const name = window.prompt(
      "Scenario name",
      overrideCount > 0 ? `Agentify ${overrideCount} steps` : "Scenario",
    );
    if (name?.trim()) saveScenarioAs(name.trim());
  };

  return (
    <div className="scenariobar">
      <label className="scenariobar__field">
        Demand ×
        <input
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={multiplier}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0.1 && v <= 10) setMultiplier(v);
          }}
        />
      </label>
      <label className="scenariobar__field">
        SLA target (h)
        <input
          type="number"
          min={0}
          step={0.5}
          placeholder="—"
          value={slaTarget ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const v = Number(raw);
            setConfig({ slaTargetHours: raw === "" || v <= 0 ? undefined : v });
          }}
        />
      </label>
      <span className="scenariobar__summary">
        {overrideCount > 0
          ? `${overrideCount} step${overrideCount > 1 ? "s" : ""} switched`
          : "no scenario changes"}
        {multiplier !== 1 ? ` · demand ×${multiplier}` : ""}
      </span>
      <button type="button" className="btn btn--small" onClick={save}>
        Save scenario
      </button>
      <button type="button" className="btn btn--small" onClick={onSensitivity} disabled={running}>
        Sensitivity
      </button>
      {saved.length > 0 && <span className="scenariobar__divider" />}
      {saved.map((s) => (
        <span key={s.id} className="scenariochip">
          <button
            type="button"
            className="scenariochip__apply"
            title="Load into workbench"
            onClick={() => applyScenario(s.id)}
          >
            {s.name}
          </button>
          <button
            type="button"
            className="scenariochip__delete"
            aria-label={`Delete scenario ${s.name}`}
            onClick={() => deleteScenario(s.id)}
          >
            ×
          </button>
        </span>
      ))}
      {saved.length > 0 && (
        <button type="button" className="btn btn--small" onClick={onCompare} disabled={running}>
          Compare all ({saved.length + 1})
        </button>
      )}
    </div>
  );
}
