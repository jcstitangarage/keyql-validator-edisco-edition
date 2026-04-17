import raw from "../../data/scenarios.json" with { type: "json" };

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  query: string;
}

export interface SyntheticIdentity {
  upn: string;
  displayName: string;
}

interface ScenarioData {
  meta: { description: string; syntheticDomains: string[]; syntheticKeywords: string[] };
  scenarios: Scenario[];
  synthetic: {
    identities: SyntheticIdentity[];
    subjects: string[];
    keywords: string[];
    fileTypes: string[];
    relativeDates: string[];
  };
}

const data = raw as unknown as ScenarioData;
const INITIAL_VISIBLE = 3;
const LOAD_BATCH = 3;

export function getScenarios(): Scenario[] {
  return data.scenarios;
}

export function getSyntheticPool(): ScenarioData["synthetic"] {
  return data.synthetic;
}

export function renderScenarios(
  host: HTMLElement,
  loadMoreButton: HTMLButtonElement | null,
  onSelect: (scenario: Scenario) => void
): void {
  const scenarios = data.scenarios;
  let visible = Math.min(INITIAL_VISIBLE, scenarios.length);

  const draw = () => {
    host.replaceChildren();
    for (const scenario of scenarios.slice(0, visible)) {
      host.appendChild(buildScenarioButton(scenario, onSelect));
    }
    if (!loadMoreButton) return;
    if (visible >= scenarios.length) {
      if (scenarios.length > INITIAL_VISIBLE) {
        loadMoreButton.hidden = false;
        loadMoreButton.textContent = "Collapse list";
        loadMoreButton.dataset["state"] = "expanded";
      } else {
        loadMoreButton.hidden = true;
      }
    } else {
      loadMoreButton.hidden = false;
      const remaining = scenarios.length - visible;
      const nextChunk = Math.min(LOAD_BATCH, remaining);
      loadMoreButton.textContent = `Show ${nextChunk} more (${remaining} remaining)`;
      loadMoreButton.dataset["state"] = "more";
    }
  };

  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      if (loadMoreButton.dataset["state"] === "expanded") {
        visible = Math.min(INITIAL_VISIBLE, scenarios.length);
      } else {
        visible = Math.min(visible + LOAD_BATCH, scenarios.length);
      }
      draw();
    });
  }

  draw();
}

function buildScenarioButton(
  scenario: Scenario,
  onSelect: (scenario: Scenario) => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scenario";
  btn.addEventListener("click", () => onSelect(scenario));

  const title = document.createElement("span");
  title.className = "scenario-title";
  title.textContent = scenario.title;
  btn.appendChild(title);

  const summary = document.createElement("span");
  summary.className = "scenario-summary";
  summary.textContent = scenario.summary;
  btn.appendChild(summary);

  const query = document.createElement("span");
  query.className = "scenario-query";
  query.textContent = scenario.query;
  btn.appendChild(query);

  return btn;
}
