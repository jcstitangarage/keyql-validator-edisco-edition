import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import {
  allowedValuesForProperty,
  findProperty,
  getCatalog,
  knownPropertyNames,
} from "../catalog/index.js";

const BOOLEAN_OPS: Completion[] = [
  { label: "AND", type: "keyword", detail: "All terms must match", boost: 5 },
  { label: "OR", type: "keyword", detail: "Any term matches", boost: 5 },
  { label: "NOT", type: "keyword", detail: "Exclude matching items", boost: 3 },
  { label: "NEAR", type: "keyword", detail: "Proximity (free-text only)", boost: 1 },
];

const PROP_OP_VALUE_RE =
  /(?:^|[\s()])([A-Za-z_][A-Za-z0-9_]*)(:|=|<>|<=|>=|<|>)([^\s()]*)$/;
const PROP_ONLY_RE = /(?:^|[\s()])([A-Za-z_][A-Za-z0-9_]*)$/;

export function keyQLCompletions(context: CompletionContext): CompletionResult | null {
  const before = context.state.sliceDoc(0, context.pos);
  const valueContext = before.match(PROP_OP_VALUE_RE);
  if (valueContext) {
    const propName = valueContext[1]!;
    const partial = valueContext[3] ?? "";
    const property = findProperty(propName);
    if (property) {
      const values = allowedValuesForProperty(property);
      if (values) {
        const from = context.pos - partial.length;
        return {
          from,
          options: values.map((v) => ({
            label: v,
            type: "enum",
            detail: property.name,
          })),
          validFor: /^[A-Za-z0-9_.\-@]*$/,
        };
      }
    }
  }

  const propOnly = before.match(PROP_ONLY_RE);
  if (propOnly) {
    const word = propOnly[1]!;
    const property = findProperty(word);
    if (property) {
      const nextChar = context.state.sliceDoc(context.pos, context.pos + 1);
      if (nextChar === "" || /[\s)]/.test(nextChar)) {
        return {
          from: context.pos,
          options: property.operators.map((op) => ({
            label: op,
            type: "operator",
            detail: operatorDetail(op),
            apply: op,
          })),
        };
      }
    }
  }

  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const catalog = getCatalog();
  const properties = knownPropertyNames().map<Completion>((name) => {
    const p = catalog.properties.find((prop) => prop.name === name)!;
    return {
      label: name,
      type: "property",
      detail: `${p.category} · ${p.type}`,
      info: p.description,
      apply: `${name}:`,
    };
  });

  return {
    from: word.from,
    options: [...properties, ...BOOLEAN_OPS],
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
  };
}

function operatorDetail(op: string): string {
  const spec = getCatalog().propertyOperators.find((o) => o.op === op);
  return spec?.description ?? "";
}
