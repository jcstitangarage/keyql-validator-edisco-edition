import { getCatalog, findProperty } from "../catalog/index.js";
import type { Property, PropertyOperator } from "../catalog/types.js";
import { getSyntheticPool } from "./scenarios.js";

interface ConditionRow {
  id: string;
  propertyName: string;
  operator: PropertyOperator;
  value: string;
}

interface BuilderState {
  keywords: string;
  conditions: ConditionRow[];
}

export interface BuilderHandles {
  setState: (state: Partial<BuilderState>) => void;
  getQuery: () => string;
}

let idCounter = 0;
const nextId = () => `row-${++idCounter}`;

export function initConditionBuilder(params: {
  rowsHost: HTMLElement;
  previewEl: HTMLElement;
  addButton: HTMLButtonElement;
  applyButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  onApply: (query: string) => void;
}): BuilderHandles {
  const catalog = getCatalog();
  const propertyOptions = catalog.properties
    .filter((p) => p.appliesTo.includes("new") || p.appliesTo.includes("classic"))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const defaultProp = "Subject";
  const defaultOp: PropertyOperator = ":";

  const state: BuilderState = {
    keywords: "",
    conditions: [],
  };

  function render(): void {
    params.rowsHost.replaceChildren();
    params.rowsHost.appendChild(renderKeywordsRow());
    for (const row of state.conditions) {
      params.rowsHost.appendChild(renderConditionRow(row));
    }
    updatePreview();
  }

  function renderKeywordsRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "builder-row keyword-row";

    const label = document.createElement("label");
    label.className = "field";
    label.htmlFor = "builder-keywords";
    label.textContent = "Keywords (free text)";

    const input = document.createElement("input");
    input.type = "text";
    input.id = "builder-keywords";
    input.placeholder = "e.g. Tradewinds OR \"Q1 Financials\"";
    input.value = state.keywords;
    input.addEventListener("input", () => {
      state.keywords = input.value;
      updatePreview();
    });

    const cell = document.createElement("div");
    cell.style.gridColumn = "1 / -1";
    cell.appendChild(label);
    cell.appendChild(input);
    row.appendChild(cell);
    return row;
  }

  function renderConditionRow(row: ConditionRow): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "builder-row";

    const propertySelect = document.createElement("select");
    propertySelect.setAttribute("aria-label", "Property");
    for (const p of propertyOptions) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} — ${p.category}`;
      propertySelect.appendChild(opt);
    }
    propertySelect.value = row.propertyName;
    propertySelect.addEventListener("change", () => {
      const prop = findProperty(propertySelect.value);
      row.propertyName = propertySelect.value;
      row.operator = (prop?.operators[0] ?? ":") as PropertyOperator;
      row.value = "";
      render();
    });

    const opSelect = buildOperatorSelect(row);
    const valueEl = buildValueInput(row);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.conditions = state.conditions.filter((c) => c.id !== row.id);
      render();
    });

    wrap.appendChild(propertySelect);
    wrap.appendChild(opSelect);
    wrap.appendChild(valueEl);
    wrap.appendChild(remove);
    return wrap;
  }

  function buildOperatorSelect(row: ConditionRow): HTMLSelectElement {
    const property = findProperty(row.propertyName);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Operator");
    const ops = property?.operators ?? [":"];
    for (const op of ops) {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      select.appendChild(opt);
    }
    select.value = row.operator;
    select.addEventListener("change", () => {
      row.operator = select.value as PropertyOperator;
      updatePreview();
    });
    return select;
  }

  function buildValueInput(row: ConditionRow): HTMLElement {
    const property = findProperty(row.propertyName);
    if (property && property.type === "enum") {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Value");
      const first = document.createElement("option");
      first.value = "";
      first.textContent = "— select —";
      select.appendChild(first);
      const values = resolveEnumValues(property);
      for (const v of values) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      }
      select.value = row.value;
      select.addEventListener("change", () => {
        row.value = select.value;
        updatePreview();
      });
      return select;
    }

    if (property && property.type === "boolean") {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Value");
      for (const v of ["", "true", "false"]) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v || "— select —";
        select.appendChild(opt);
      }
      select.value = row.value;
      select.addEventListener("change", () => {
        row.value = select.value;
        updatePreview();
      });
      return select;
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "0.35rem";
    wrapper.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholderFor(property);
    input.value = row.value;
    input.addEventListener("input", () => {
      row.value = input.value;
      updatePreview();
    });
    wrapper.appendChild(input);

    const suggestion = buildSuggestionButton(property, (value) => {
      input.value = value;
      row.value = value;
      updatePreview();
    });
    if (suggestion) wrapper.appendChild(suggestion);

    return wrapper;
  }

  function buildSuggestionButton(
    property: Property | undefined,
    onPick: (value: string) => void
  ): HTMLElement | null {
    if (!property) return null;
    const suggestions = suggestionsFor(property);
    if (suggestions.length === 0) return null;

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Insert synthetic value");
    select.style.flexShrink = "0";
    select.style.width = "auto";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "samples…";
    select.appendChild(placeholder);
    for (const s of suggestions) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      if (select.value) {
        onPick(select.value);
        select.value = "";
      }
    });
    return select;
  }

  function updatePreview(): void {
    const query = buildQuery();
    if (!query) {
      params.previewEl.classList.add("placeholder");
      params.previewEl.textContent = "(no conditions yet)";
      return;
    }
    params.previewEl.classList.remove("placeholder");
    params.previewEl.textContent = query;
  }

  function buildQuery(): string {
    const parts: string[] = [];
    const kw = state.keywords.trim();
    if (kw) {
      parts.push(needsKeywordParens(kw) ? `(${kw})` : kw);
    }
    for (const row of state.conditions) {
      if (!row.value) continue;
      const property = findProperty(row.propertyName);
      if (!property) continue;
      parts.push(formatCondition(property, row.operator, row.value));
    }
    return parts.join(" AND ");
  }

  function addCondition(): void {
    state.conditions.push({
      id: nextId(),
      propertyName: defaultProp,
      operator: defaultOp,
      value: "",
    });
    render();
  }

  params.addButton.addEventListener("click", () => addCondition());
  params.applyButton.addEventListener("click", () => {
    const query = buildQuery();
    if (query) params.onApply(query);
  });
  params.resetButton.addEventListener("click", () => {
    state.keywords = "";
    state.conditions = [];
    render();
  });

  render();

  return {
    setState: (patch) => {
      if (patch.keywords !== undefined) state.keywords = patch.keywords;
      if (patch.conditions !== undefined) state.conditions = patch.conditions;
      render();
    },
    getQuery: buildQuery,
  };
}

function placeholderFor(property: Property | undefined): string {
  if (!property) return "";
  switch (property.type) {
    case "date":
      return "2025-01-01 or \"this month\"";
    case "number":
      return "e.g. 100000";
    case "recipient":
      return "upn, alias, or \"Display Name\"";
    case "url":
      return "https://contoso.sharepoint.com/sites/…/";
    default:
      return `sample ${property.name} value`;
  }
}

function suggestionsFor(property: Property): string[] {
  const pool = getSyntheticPool();
  switch (property.type) {
    case "recipient":
      return pool.identities.map((i) => i.upn);
    case "date":
      return [
        "today",
        "yesterday",
        "this week",
        "this month",
        "last month",
        "this year",
        "2025-01-01",
        "2025-03-31",
      ];
    case "number":
      return ["100000", "1000000", "10000000"];
    default:
      break;
  }
  const name = property.name.toLowerCase();
  if (name === "subject" || name === "title" || name === "subjecttitle") {
    return pool.subjects;
  }
  if (name === "filename" || name === "fileextension" || name === "filetype") {
    return pool.fileTypes;
  }
  if (name === "author" || name === "createdby" || name === "modifiedby") {
    return pool.identities.map((i) => i.displayName);
  }
  return [];
}

function resolveEnumValues(property: Property): string[] {
  if (property.values) return property.values;
  if (property.valuesRef === "kindValues") return getCatalog().kindValues;
  return [];
}

function formatCondition(
  property: Property,
  operator: PropertyOperator,
  value: string
): string {
  const needsQuote = needsQuoting(value);
  const rendered = needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
  return `${property.name}${operator}${rendered}`;
}

function needsQuoting(value: string): boolean {
  if (value.startsWith('"') && value.endsWith('"')) return false;
  return /\s/.test(value);
}

function needsKeywordParens(kw: string): boolean {
  if (kw.startsWith("(") && kw.endsWith(")")) return false;
  return /\b(AND|OR|NOT|NEAR)\b/.test(kw);
}
