export type AstNode =
  | BooleanNode
  | NotNode
  | NearNode
  | GroupNode
  | PropertyRestrictionNode
  | TermNode
  | ConditionMarkerNode;

export interface Span {
  start: number;
  end: number;
}

export interface BooleanNode {
  kind: "boolean";
  op: "AND" | "OR" | "JUXTA";
  left: AstNode;
  right: AstNode;
  span: Span;
}

export interface NotNode {
  kind: "not";
  form: "NOT" | "-";
  expr: AstNode;
  span: Span;
}

export interface NearNode {
  kind: "near";
  left: AstNode;
  right: AstNode;
  distance: number;
  span: Span;
}

export interface GroupNode {
  kind: "group";
  expr: AstNode;
  span: Span;
}

export interface ConditionMarkerNode {
  kind: "conditionMarker";
  marker: "(c:c)" | "(c:s)";
  span: Span;
}

export type ValueNode = LiteralValue | RangeValue;

export interface LiteralValue {
  kind: "value";
  form: "bare" | "quoted" | "date";
  raw: string;
  value: string;
  wildcard: boolean;
  span: Span;
}

export interface RangeValue {
  kind: "range";
  from: LiteralValue;
  to: LiteralValue;
  span: Span;
}

export type PropertyOp = ":" | "=" | "<>" | "<" | ">" | "<=" | ">=";

export interface PropertyRestrictionNode {
  kind: "property";
  property: string;
  propertySpan: Span;
  op: PropertyOp | "..";
  opSpan: Span;
  value: ValueNode;
  span: Span;
}

export interface TermNode {
  kind: "term";
  value: LiteralValue;
  span: Span;
}
