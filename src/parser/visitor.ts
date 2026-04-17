import type { CstNode, IToken } from "chevrotain";
import { BaseCstVisitor } from "./parser.js";
import type {
  AstNode,
  BooleanNode,
  LiteralValue,
  NearNode,
  NotNode,
  PropertyRestrictionNode,
  RangeValue,
  Span,
  TermNode,
  ConditionMarkerNode,
  GroupNode,
  PropertyOp,
} from "./ast.js";

function spanFromToken(t: IToken): Span {
  return {
    start: t.startOffset,
    end: (t.endOffset ?? t.startOffset) + 1,
  };
}

function spanCover(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  return raw;
}

class AstBuilder extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  query(ctx: { orExpr?: CstNode[] }): AstNode {
    return this.visit(ctx.orExpr!);
  }

  orExpr(ctx: { andExpr: CstNode[] }): AstNode {
    return this.foldBinary(ctx.andExpr, "OR");
  }

  andExpr(ctx: { nearExpr: CstNode[] }): AstNode {
    return this.foldBinary(ctx.nearExpr, "AND");
  }

  nearExpr(ctx: {
    juxtaExpr: CstNode[];
    Number?: IToken[];
  }): AstNode {
    const children = ctx.juxtaExpr.map((n) => this.visit(n) as AstNode);
    if (children.length === 0) throw new Error("empty nearExpr");
    const distances = ctx.Number ?? [];
    let left = children[0]!;
    for (let i = 1; i < children.length; i++) {
      const right = children[i]!;
      const dToken = distances[i - 1];
      const distance = dToken ? parseInt(dToken.image, 10) : 8;
      const near: NearNode = {
        kind: "near",
        left,
        right,
        distance,
        span: spanCover(left.span, right.span),
      };
      left = near;
    }
    return left;
  }

  juxtaExpr(ctx: { unary: CstNode[] }): AstNode {
    const children = ctx.unary.map((n) => this.visit(n) as AstNode);
    if (children.length === 0) throw new Error("empty juxtaExpr");
    let node = children[0]!;
    for (let i = 1; i < children.length; i++) {
      const right = children[i]!;
      const bool: BooleanNode = {
        kind: "boolean",
        op: "JUXTA",
        left: node,
        right,
        span: spanCover(node.span, right.span),
      };
      node = bool;
    }
    return node;
  }

  unary(ctx: { Not?: IToken[]; Minus?: IToken[]; atom: CstNode[] }): AstNode {
    const atom = this.visit(ctx.atom[0]!) as AstNode;
    if (ctx.Not?.[0]) {
      const tok = ctx.Not[0];
      const not: NotNode = {
        kind: "not",
        form: "NOT",
        expr: atom,
        span: spanCover(spanFromToken(tok), atom.span),
      };
      return not;
    }
    if (ctx.Minus?.[0]) {
      const tok = ctx.Minus[0];
      const not: NotNode = {
        kind: "not",
        form: "-",
        expr: atom,
        span: spanCover(spanFromToken(tok), atom.span),
      };
      return not;
    }
    return atom;
  }

  atom(ctx: {
    ConditionMarker?: IToken[];
    LParen?: IToken[];
    RParen?: IToken[];
    orExpr?: CstNode[];
    primaryMaybeRestricted?: CstNode[];
  }): AstNode {
    if (ctx.ConditionMarker?.[0]) {
      const tok = ctx.ConditionMarker[0];
      const node: ConditionMarkerNode = {
        kind: "conditionMarker",
        marker: tok.image as "(c:c)" | "(c:s)",
        span: spanFromToken(tok),
      };
      return node;
    }
    if (ctx.orExpr?.[0]) {
      const inner = this.visit(ctx.orExpr[0]) as AstNode;
      const l = ctx.LParen?.[0];
      const r = ctx.RParen?.[0];
      const span =
        l && r
          ? spanCover(spanFromToken(l), spanFromToken(r))
          : inner.span;
      const group: GroupNode = { kind: "group", expr: inner, span };
      return group;
    }
    return this.visit(ctx.primaryMaybeRestricted![0]!) as AstNode;
  }

  primaryMaybeRestricted(ctx: {
    primary: CstNode[];
    propertyTail?: CstNode[];
  }): AstNode {
    const primary = this.visit(ctx.primary[0]!) as LiteralValue;
    const tail = ctx.propertyTail?.[0];
    if (!tail) {
      const term: TermNode = { kind: "term", value: primary, span: primary.span };
      return term;
    }
    const tailResult = this.visit(tail) as {
      op: PropertyOp | "..";
      opSpan: Span;
      value: LiteralValue | RangeValue;
    };

    if (primary.form !== "bare") {
      return this.synthPropertyRestriction(primary, tailResult);
    }
    return this.synthPropertyRestriction(primary, tailResult);
  }

  primary(ctx: {
    QuotedString?: IToken[];
    DateTime?: IToken[];
    Number?: IToken[];
    Identifier?: IToken[];
    Wildcard?: IToken[];
  }): LiteralValue {
    return this.buildLiteral(ctx);
  }

  propertyTail(ctx: {
    Colon?: IToken[];
    Equals?: IToken[];
    NotEqual?: IToken[];
    Less?: IToken[];
    Greater?: IToken[];
    LessEqual?: IToken[];
    GreaterEqual?: IToken[];
    Range?: IToken[];
    value: CstNode[];
  }): { op: PropertyOp | ".."; opSpan: Span; value: LiteralValue | RangeValue } {
    const opTok =
      ctx.Colon?.[0] ??
      ctx.Equals?.[0] ??
      ctx.NotEqual?.[0] ??
      ctx.LessEqual?.[0] ??
      ctx.GreaterEqual?.[0] ??
      ctx.Less?.[0] ??
      ctx.Greater?.[0]!;
    const firstValue = this.visit(ctx.value[0]!) as LiteralValue;
    if (ctx.Range?.[0] && ctx.value[1]) {
      const secondValue = this.visit(ctx.value[1]) as LiteralValue;
      const range: RangeValue = {
        kind: "range",
        from: firstValue,
        to: secondValue,
        span: spanCover(firstValue.span, secondValue.span),
      };
      return {
        op: "..",
        opSpan: spanFromToken(ctx.Range[0]),
        value: range,
      };
    }
    return {
      op: opTok.image as PropertyOp,
      opSpan: spanFromToken(opTok),
      value: firstValue,
    };
  }

  value(ctx: {
    QuotedString?: IToken[];
    DateTime?: IToken[];
    Number?: IToken[];
    Identifier?: IToken[];
    Wildcard?: IToken[];
  }): LiteralValue {
    return this.buildLiteral(ctx);
  }

  private synthPropertyRestriction(
    primary: LiteralValue,
    tail: { op: PropertyOp | ".."; opSpan: Span; value: LiteralValue | RangeValue }
  ): PropertyRestrictionNode {
    const span = spanCover(primary.span, tail.value.span);
    return {
      kind: "property",
      property: primary.value,
      propertySpan: primary.span,
      op: tail.op,
      opSpan: tail.opSpan,
      value: tail.value,
      span,
    };
  }

  private buildLiteral(ctx: {
    QuotedString?: IToken[];
    DateTime?: IToken[];
    Number?: IToken[];
    Identifier?: IToken[];
    Wildcard?: IToken[];
  }): LiteralValue {
    const tok =
      ctx.QuotedString?.[0] ??
      ctx.DateTime?.[0] ??
      ctx.Number?.[0] ??
      ctx.Identifier?.[0];
    if (!tok) throw new Error("missing value token");
    const wildcardTok = ctx.Wildcard?.[0];
    const form: LiteralValue["form"] = ctx.QuotedString
      ? "quoted"
      : ctx.DateTime
      ? "date"
      : "bare";
    const raw = wildcardTok ? tok.image + wildcardTok.image : tok.image;
    const hasTrailingStar =
      (form === "bare" && tok.image.endsWith("*")) || Boolean(wildcardTok);
    const value = form === "quoted" ? unquote(tok.image) : tok.image.replace(/\*$/, "");
    const baseSpan = spanFromToken(tok);
    const span = wildcardTok
      ? spanCover(baseSpan, spanFromToken(wildcardTok))
      : baseSpan;
    return {
      kind: "value",
      form,
      raw,
      value,
      wildcard: hasTrailingStar,
      span,
    };
  }

  private foldBinary(nodes: CstNode[], op: "AND" | "OR"): AstNode {
    const children = nodes.map((n) => this.visit(n) as AstNode);
    if (children.length === 0) throw new Error("empty binary fold");
    let left = children[0]!;
    for (let i = 1; i < children.length; i++) {
      const right = children[i]!;
      const node: BooleanNode = {
        kind: "boolean",
        op,
        left,
        right,
        span: spanCover(left.span, right.span),
      };
      left = node;
    }
    return left;
  }
}

export const astBuilder = new AstBuilder();
