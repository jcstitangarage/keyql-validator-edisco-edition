import "./styles.css";
import { createEditor } from "./editor/setup.js";
import { parse, type ParseDiagnostic } from "./parser/index.js";
import { validate, type Diagnostic } from "./validator/index.js";

const INITIAL_DOC =
  'from:"pilarp@contoso.com" AND kind:email AND sent>=2025-01-01 AND sent<=2025-03-31';

const host = mustQuery<HTMLDivElement>("#editor-host");
const diagList = mustQuery<HTMLUListElement>("#diagnostics");
const astOut = mustQuery<HTMLPreElement>("#ast-output");

createEditor({
  host,
  initialDoc: INITIAL_DOC,
  onChange: (value) => renderFor(value),
});

renderFor(INITIAL_DOC);

function renderFor(source: string): void {
  const { ast, diagnostics: parseDiags } = parse(source);
  const semanticDiags = validate(ast);
  renderDiagnostics([...parseDiags, ...semanticDiags]);
  astOut.textContent = ast ? JSON.stringify(ast, null, 2) : "(no AST)";
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

function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
