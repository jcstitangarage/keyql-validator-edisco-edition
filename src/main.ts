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
import { initConditionBuilder } from "./ui/conditionBuilder.js";
import { BUILD_TIME, BUILD_COMMIT, REPO_URL, REPO_COMMIT_URL, formatBuildDate } from "./meta.js";

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
  onApply: (query) => setEditorContents(query),
});

renderScenarios(scenarioList, (scenario) => setEditorContents(scenario.query));
renderReferences(referencesList);
renderSamples(samplesContainer);
renderPageMeta();
renderFor(INITIAL_DOC);

function renderPageMeta(): void {
  const built = formatBuildDate(BUILD_TIME);
  pageMeta.replaceChildren();
  pageMeta.appendChild(
    textNode(`Catalog captured 2026-04-16 from Microsoft Learn.`)
  );
  pageMeta.appendChild(textNode(`Page built ${built} · commit `));
  const link = document.createElement("a");
  link.href = REPO_COMMIT_URL;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = BUILD_COMMIT;
  pageMeta.appendChild(link);

  buildInfo.textContent = `Built ${built} · commit ${BUILD_COMMIT}`;
  repoLink.href = REPO_URL;
}

function textNode(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function setEditorContents(query: string): void {
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: query },
  });
  editorView.focus();
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
