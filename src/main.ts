import "./styles.css";
import { createEditor } from "./editor/setup.js";
import { parse, type ParseDiagnostic } from "./parser/index.js";
import { validate, type Diagnostic } from "./validator/index.js";
import { evaluate } from "./evaluator/index.js";
import type { CorpusItem } from "./evaluator/corpus.js";

const INITIAL_DOC =
  'kind:email AND (from:pilarp OR from:"Garth Fort") AND sent>=2025-01-01 AND sent<=2025-03-31';

const host = mustQuery<HTMLDivElement>("#editor-host");
const diagList = mustQuery<HTMLUListElement>("#diagnostics");
const astOut = mustQuery<HTMLPreElement>("#ast-output");
const matchList = mustQuery<HTMLUListElement>("#matches");
const matchCount = mustQuery<HTMLSpanElement>("#match-count");

createEditor({
  host,
  initialDoc: INITIAL_DOC,
  onChange: (value) => renderFor(value),
});

renderFor(INITIAL_DOC);

function renderFor(source: string): void {
  const { ast, diagnostics: parseDiags } = parse(source);
  const semanticDiags = validate(ast);
  const allDiags = [...parseDiags, ...semanticDiags];
  const hasError = allDiags.some((d) => d.severity === "error");
  renderDiagnostics(allDiags);
  astOut.textContent = ast ? JSON.stringify(ast, null, 2) : "(no AST)";

  if (!ast || hasError) {
    matchList.replaceChildren();
    matchCount.textContent = "—";
    return;
  }

  const { matched, totalScanned } = evaluate(ast);
  matchCount.textContent = `${matched.length} / ${totalScanned}`;
  renderMatches(matched);
}

function renderDiagnostics(items: Array<ParseDiagnostic | Diagnostic>): void {
  diagList.replaceChildren();
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = "No issues detected.";
    diagList.appendChild(li);
    return;
  }
  for (const d of items) {
    const li = document.createElement("li");
    li.className = d.severity === "error" ? "error" : d.severity === "warn" ? "warn" : "ok";
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

function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
