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

export function getScenarios(): Scenario[] {
  return data.scenarios;
}

export function getSyntheticPool(): ScenarioData["synthetic"] {
  return data.synthetic;
}

export function renderScenarios(
  host: HTMLElement,
  onSelect: (scenario: Scenario) => void
): void {
  host.replaceChildren();
  for (const scenario of data.scenarios) {
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
    summary.style.color = "var(--fg-muted)";
    summary.style.fontSize = "0.82rem";
    btn.appendChild(summary);

    const query = document.createElement("span");
    query.className = "scenario-query";
    query.textContent = scenario.query;
    btn.appendChild(query);

    host.appendChild(btn);
  }
}
