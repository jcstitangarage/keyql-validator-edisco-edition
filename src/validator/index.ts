import type { AstNode, PropertyRestrictionNode, ValueNode } from "../parser/ast.js";
import {
  allowedValuesForProperty,
  findProperty,
  getCatalog,
  operatorAllowedForProperty,
} from "../catalog/index.js";
import type { PropertyOperator } from "../catalog/types.js";

export interface Diagnostic {
  severity: "error" | "warn" | "info";
  message: string;
  start: number;
  end: number;
  code: string;
}

export function validate(ast: AstNode | undefined): Diagnostic[] {
  if (!ast) return [];
  const out: Diagnostic[] = [];
  walk(ast, out);
  return out;
}

function walk(node: AstNode, out: Diagnostic[]): void {
  switch (node.kind) {
    case "boolean":
      walk(node.left, out);
      walk(node.right, out);
      if (node.op === "JUXTA") {
        out.push({
          severity: "warn",
          code: "implicit-juxtaposition",
          message:
            "Adjacent terms without an explicit AND/OR behave like OR in eDiscovery. Make the intent explicit.",
          start: node.span.start,
          end: node.span.end,
        });
      }
      return;
    case "not":
      walk(node.expr, out);
      return;
    case "near":
      walk(node.left, out);
      walk(node.right, out);
      return;
    case "group":
      walk(node.expr, out);
      return;
    case "conditionMarker":
      out.push({
        severity: "warn",
        code: "condition-marker",
        message: `${node.marker} is inserted by the condition builder and should not appear in manually authored queries.`,
        start: node.span.start,
        end: node.span.end,
      });
      return;
    case "term":
      validateLiteral(node.value, out);
      return;
    case "property":
      validateProperty(node, out);
      return;
  }
}

function validateProperty(node: PropertyRestrictionNode, out: Diagnostic[]): void {
  const property = findProperty(node.property);
  if (!property) {
    out.push({
      severity: "error",
      code: "unknown-property",
      message: `Unknown property "${node.property}". Not in the eDiscovery catalog.`,
      start: node.propertySpan.start,
      end: node.propertySpan.end,
    });
    return;
  }

  const op = node.op as PropertyOperator;
  if (!operatorAllowedForProperty(property, op)) {
    out.push({
      severity: "error",
      code: "operator-type-mismatch",
      message: `Operator "${op}" is not allowed on ${property.name} (type ${property.type}).`,
      start: node.opSpan.start,
      end: node.opSpan.end,
    });
  }

  validateValue(node, property.type, out);
  validateEnumValue(node, property, out);
}

function validateValue(
  node: PropertyRestrictionNode,
  type: string,
  out: Diagnostic[]
): void {
  if (node.value.kind === "range") {
    if (type !== "date" && type !== "number") {
      out.push({
        severity: "error",
        code: "range-on-non-numeric",
        message: `Range (..) is only valid for date and number properties; ${node.property} is ${type}.`,
        start: node.value.span.start,
        end: node.value.span.end,
      });
    }
    validateLiteral(node.value.from, out);
    validateLiteral(node.value.to, out);
    return;
  }

  validateLiteral(node.value, out);

  if (type === "date" && node.value.form !== "date") {
    const catalog = getCatalog();
    const literalValue = node.value.value.toLowerCase();
    const intervalMatch = catalog.dateIntervals.some(
      (i) => i.keyword === literalValue
    );
    if (!intervalMatch && !isIsoLikeDate(node.value.value)) {
      out.push({
        severity: "warn",
        code: "non-iso-date",
        message: `"${node.value.value}" is not an ISO date or recognized interval (today, yesterday, this week, …).`,
        start: node.value.span.start,
        end: node.value.span.end,
      });
    }
  }

  if (type === "number" && node.value.form === "bare" && !/^\d+$/.test(node.value.value)) {
    out.push({
      severity: "error",
      code: "non-numeric-value",
      message: `${node.property} expects a number, got "${node.value.value}".`,
      start: node.value.span.start,
      end: node.value.span.end,
    });
  }
}

function validateEnumValue(
  node: PropertyRestrictionNode,
  property: Parameters<typeof allowedValuesForProperty>[0],
  out: Diagnostic[]
): void {
  if (node.value.kind !== "value") return;
  const allowed = allowedValuesForProperty(property);
  if (!allowed || property.type !== "enum") return;
  const normalized = node.value.value.toLowerCase();
  const match = allowed.some((v) => v.toLowerCase() === normalized);
  if (!match) {
    out.push({
      severity: "error",
      code: "invalid-enum-value",
      message: `"${node.value.value}" is not a valid ${property.name} value. Expected one of: ${allowed.join(", ")}.`,
      start: node.value.span.start,
      end: node.value.span.end,
    });
  }
}

function validateLiteral(node: ValueNode, out: Diagnostic[]): void {
  if (node.kind === "range") return;
  if (node.form === "quoted" && node.raw.includes('""')) {
    out.push({
      severity: "error",
      code: "nested-quotes",
      message: "Nested quotation marks are not supported.",
      start: node.span.start,
      end: node.span.end,
    });
  }
}

function isIsoLikeDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/.test(s);
}

export { findProperty };
