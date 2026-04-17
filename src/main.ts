import "./styles.css";
import { EditorView } from "@codemirror/view";
import { createEditor } from "./editor/setup.js";
import { parse, type ParseDiagnostic } from "./parser/index.js";
import { validate, type Diagnostic } from "./validator/index.js";
import { evaluate } from "./evaluator/index.js";
import type { CorpusItem } from "./evaluator/corpus.js";
import {
  renderScenarios,
  getScenarios,
  type Scenario,
} from "./ui/scenarios.js";
import { renderReferences } from "./ui/references.js";
import { renderSamples } from "./ui/samples.js";
import {
  initConditionBuilder,
  renderOperatorLegend,
} from "./ui/conditionBuilder.js";
import { initNaturalLanguage } from "./ui/nl.js";
import {
  BUILD_TIME,
  BUILD_COMMIT,
  CATALOG_URL,
  REPO_URL,
  REPO_COMMIT_URL,
  formatBuildDate,
} from "./meta.js";

const initialScenario: Scenario | undefined = getScenarios()[0];
const INITIAL_DOC = initialScenario?.query ?? "";

const editorHost = must<HTMLDivElement>("#editor-host");
const diagList = must<HTMLUListElement>("#diagnostics");
const astOut = must<HTMLPreElement>("#ast-output");
const matchList = must<HTMLUListElement>("#matches");
const matchCount = must<HTMLSpanElement>("#match-count");
const scenarioList = must<HTMLDivElement>("#scenario-list");
const referencesList = must<HTMLUListElement>("#references-list");
const samplesContainer = must<HTMLDivElement>("#samples-container");
const builderRows = must<HTMLDivElement>("#builder-rows");
const builderPreview = must<HTMLDivElement>("#builder-preview");
const builderAdd = must<HTMLButtonElement>("#builder-add-condition");
const builderApply = must<HTMLButtonElement>("#builder-apply");
const builderReset = must<HTMLButtonElement>("#builder-reset");
const operatorLegendList = must<HTMLUListElement>("#operator-legend-list");
const scenarioLoadMore = must<HTMLButtonElement>("#scenario-load-more");
const editorStatus = must<HTMLSpanElement>("#editor-status");
const nlInput = must<HTMLInputElement>("#nl-input");
const nlTranslate = must<HTMLButtonElement>("#nl-translate");
const nlApply = must<HTMLButtonElement>("#nl-apply");
const nlClear = must<HTMLButtonElement>("#nl-clear");
const nlPreview = must<HTMLDivElement>("#nl-preview");
const nlNotes = must<HTMLUListElement>("#nl-notes");
const pageMeta = must<HTMLDivElement>("#page-meta");
const buildInfo = must<HTMLSpanElement>("#build-info");
const repoLink = must<HTMLAnchorElement>("#repo-link");

const editorView: EditorView = createEditor({
  host: editorHost,
  initialDoc: INITIAL_DOC,
  onChange: (value) => renderFor(value),
});

initConditionBuilder({
  rowsHost: builderRows,
  previewEl: builderPreview,
  addButton: builderAdd,
  applyButton: builderApply,
  resetButton: builderReset,
  onApply: (query) => setEditorContents(query, "applied from condition builder"),
});

initNaturalLanguage({
  input: nlInput,
  translateButton: nlTranslate,
  applyButton: nlApply,
  clearButton: nlClear,
  preview: nlPreview,
  notes: nlNotes,
  onApply: (query) => setEditorContents(query, "applied from natural language"),
});

renderOperatorLegend(operatorLegendList);
renderScenarios(scenarioList, scenarioLoadMore, (scenario) => {
  setEditorContents(scenario.query, `loaded scenario: ${scenario.title}`);
});
renderReferences(referencesList);
renderSamples(samplesContainer);
renderPageMeta();
renderFor(INITIAL_DOC);

function renderPageMeta(): void {
  const built = formatBuildDate(BUILD_TIME);
  pageMeta.replaceChildren();

  const catalogSpan = document.createElement("span");
  catalogSpan.appendChild(document.createTextNode("Catalog captured 2026-04-16 from Microsoft Learn — "));
  const catalogLink = document.createElement("a");
  catalogLink.href = CATALOG_URL;
  catalogLink.target = "_blank";
  catalogLink.rel = "noreferrer noopener";
  catalogLink.textContent = "view catalog JSON";
  catalogSpan.appendChild(catalogLink);
  pageMeta.appendChild(catalogSpan);

  const buildSpan = document.createElement("span");
  buildSpan.appendChild(document.createTextNode(`Page built ${built} · commit `));
  const commitLink = document.createElement("a");
  commitLink.href = REPO_COMMIT_URL;
  commitLink.target = "_blank";
  commitLink.rel = "noreferrer noopener";
  commitLink.textContent = BUILD_COMMIT;
  buildSpan.appendChild(commitLink);
  pageMeta.appendChild(buildSpan);

  buildInfo.textContent = `Built ${built} · commit ${BUILD_COMMIT}`;
  repoLink.href = REPO_URL;
}

function setEditorContents(query: string, statusMessage?: string): void {
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: query },
  });
  editorView.focus();
  requestAnimationFrame(() => {
    const editorPanel = document.getElementById("editor-panel");
    (editorPanel ?? editorHost).scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    editorHost.classList.remove("flash");
    requestAnimationFrame(() => editorHost.classList.add("flash"));
    setTimeout(() => editorHost.classList.remove("flash"), 900);
  });
  if (statusMessage) {
    editorStatus.textContent = statusMessage;
    setTimeout(() => {
      if (editorStatus.textContent === statusMessage) editorStatus.textContent = "";
    }, 3500);
  }
}

function renderFor(source: string): void {
  const { ast, diagnostics: parseDiags } = parse(source);
  const semanticDiags = validate(ast);
  const allDiags = [...parseDiags, ...semanticDiags];
  const hasError = allDiags.some((d) => d.severity === "error");
  renderDiagnostics(allDiags, source.trim().length === 0);
  astOut.textContent = ast ? JSON.stringify(ast, null, 2) : "(no AST)";

  if (!ast || hasError) {
    matchList.replaceChildren();
    matchCount.textContent = source.trim().length === 0 ? "" : "—";
    return;
  }

  const { matched, totalScanned } = evaluate(ast);
  matchCount.textContent = `${matched.length} / ${totalScanned} items`;
  renderMatches(matched);
}

function renderDiagnostics(
  items: Array<ParseDiagnostic | Diagnostic>,
  empty: boolean
): void {
  diagList.replaceChildren();
  if (empty) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = "Type a query, pick a scenario, or build one below.";
    diagList.appendChild(li);
    return;
  }
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = "✓ Query is valid.";
    diagList.appendChild(li);
    return;
  }
  for (const d of items) {
    const li = document.createElement("li");
    li.className =
      d.severity === "error" ? "error" : d.severity === "warn" ? "warn" : "ok";
    const where = `[${d.start}..${d.end}]`;
    const code = "code" in d ? ` (${d.code})` : "";
    li.textContent = `${d.severity.toUpperCase()}${code} ${where}: ${d.message}`;
    diagList.appendChild(li);
  }
}

function renderMatches(items: CorpusItem[]): void {
  matchList.replaceChildren();
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = "No matches in the synthetic corpus.";
    matchList.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "match";
    li.appendChild(labeledSpan("id", item.id));
    li.appendChild(labeledSpan("kind", item.kind));
    if ("subject" in item) li.appendChild(labeledSpan("subject", item.subject));
    if ("filename" in item) li.appendChild(labeledSpan("file", item.filename));
    if ("from" in item) li.appendChild(labeledSpan("from", item.from));
    if ("author" in item) li.appendChild(labeledSpan("author", item.author));
    matchList.appendChild(li);
  }
}

function labeledSpan(label: string, value: string): HTMLSpanElement {
  const wrapper = document.createElement("span");
  wrapper.className = "match-field";
  const l = document.createElement("span");
  l.className = "match-label";
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "match-value";
  v.textContent = value;
  wrapper.appendChild(l);
  wrapper.appendChild(v);
  return wrapper;
}

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
