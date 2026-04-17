import { createToken, Lexer } from "chevrotain";

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t\n\r]+/,
  group: Lexer.SKIPPED,
});

export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });

export const ConditionMarker = createToken({
  name: "ConditionMarker",
  pattern: /\(c:[cs]\)/,
});

export const Range = createToken({ name: "Range", pattern: /\.\./ });

export const GreaterEqual = createToken({ name: "GreaterEqual", pattern: />=/ });
export const LessEqual = createToken({ name: "LessEqual", pattern: /<=/ });
export const NotEqual = createToken({ name: "NotEqual", pattern: /<>/ });
export const Equals = createToken({ name: "Equals", pattern: /=/ });
export const Greater = createToken({ name: "Greater", pattern: />/ });
export const Less = createToken({ name: "Less", pattern: /</ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });

export const DateTime = createToken({
  name: "DateTime",
  pattern: /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,7})?Z?)?/,
});

export const QuotedString = createToken({
  name: "QuotedString",
  pattern: /"([^"\\]|\\.)*"/,
});

const IdentifierPattern =
  /[A-Za-z_][A-Za-z0-9_@/\-]*(\.(?!\.)[A-Za-z0-9_@/\-]+)*\*?/;

export const Identifier = createToken({
  name: "Identifier",
  pattern: IdentifierPattern,
});

const keyword = (name: string, image: string) =>
  createToken({
    name,
    pattern: new RegExp(image),
    longer_alt: Identifier,
  });

export const And = keyword("And", "AND");
export const Or = keyword("Or", "OR");
export const Not = keyword("Not", "NOT");
export const Near = keyword("Near", "NEAR");

export const Wildcard = createToken({ name: "Wildcard", pattern: /\*/ });

export const Number = createToken({
  name: "Number",
  pattern: /\d+/,
  longer_alt: Identifier,
});

export const allTokens = [
  WhiteSpace,
  ConditionMarker,
  LParen,
  RParen,
  Range,
  GreaterEqual,
  LessEqual,
  NotEqual,
  Equals,
  Greater,
  Less,
  Colon,
  Plus,
  Minus,
  QuotedString,
  DateTime,
  And,
  Or,
  Not,
  Near,
  Number,
  Identifier,
  Wildcard,
];

export const KeyQLLexer = new Lexer(allTokens, {
  positionTracking: "full",
  ensureOptimizations: false,
});
