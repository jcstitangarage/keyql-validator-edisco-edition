import { CstParser, type IToken } from "chevrotain";
import {
  allTokens,
  And,
  Colon,
  ConditionMarker,
  DateTime,
  Equals,
  Greater,
  GreaterEqual,
  Identifier,
  LParen,
  Less,
  LessEqual,
  Minus,
  Near,
  Not,
  NotEqual,
  Number as NumberTok,
  Or,
  Plus,
  QuotedString,
  RParen,
  Range,
  Wildcard,
} from "./tokens.js";

class KeyQLParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: true });
    this.performSelfAnalysis();
  }

  public query = this.RULE("query", () => {
    this.SUBRULE(this.orExpr);
  });

  private orExpr = this.RULE("orExpr", () => {
    this.SUBRULE(this.andExpr);
    this.MANY(() => {
      this.CONSUME(Or);
      this.SUBRULE2(this.andExpr);
    });
  });

  private andExpr = this.RULE("andExpr", () => {
    this.SUBRULE(this.nearExpr);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(And) },
        { ALT: () => this.CONSUME(Plus) },
      ]);
      this.SUBRULE2(this.nearExpr);
    });
  });

  private nearExpr = this.RULE("nearExpr", () => {
    this.SUBRULE(this.juxtaExpr);
    this.MANY(() => {
      this.CONSUME(Near);
      this.OPTION(() => {
        this.CONSUME(LParen);
        this.OPTION2(() => {
          this.CONSUME(Identifier);
          this.CONSUME(Equals);
        });
        this.CONSUME(NumberTok);
        this.CONSUME(RParen);
      });
      this.SUBRULE2(this.juxtaExpr);
    });
  });

  private juxtaExpr = this.RULE("juxtaExpr", () => {
    this.SUBRULE(this.unary);
    this.MANY({
      GATE: () => {
        const next = this.LA(1);
        return (
          next.tokenType !== And &&
          next.tokenType !== Or &&
          next.tokenType !== Near &&
          next.tokenType !== Plus &&
          next.tokenType !== RParen
        );
      },
      DEF: () => this.SUBRULE2(this.unary),
    });
  });

  private unary = this.RULE("unary", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Not);
          this.SUBRULE(this.atom);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Minus);
          this.SUBRULE2(this.atom);
        },
      },
      { ALT: () => this.SUBRULE3(this.atom) },
    ]);
  });

  private atom = this.RULE("atom", () => {
    this.OR([
      { ALT: () => this.CONSUME(ConditionMarker) },
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.orExpr);
          this.CONSUME(RParen);
        },
      },
      { ALT: () => this.SUBRULE(this.primaryMaybeRestricted) },
    ]);
  });

  private primaryMaybeRestricted = this.RULE("primaryMaybeRestricted", () => {
    this.SUBRULE(this.primary);
    this.OPTION(() => this.SUBRULE(this.propertyTail));
  });

  private primary = this.RULE("primary", () => {
    this.OR([
      { ALT: () => this.CONSUME(QuotedString) },
      { ALT: () => this.CONSUME(DateTime) },
      { ALT: () => this.CONSUME(NumberTok) },
      { ALT: () => this.CONSUME(Identifier) },
    ]);
    this.OPTION(() => this.CONSUME(Wildcard));
  });

  private propertyTail = this.RULE("propertyTail", () => {
    this.OR([
      { ALT: () => this.CONSUME(Colon) },
      { ALT: () => this.CONSUME(Equals) },
      { ALT: () => this.CONSUME(NotEqual) },
      { ALT: () => this.CONSUME(LessEqual) },
      { ALT: () => this.CONSUME(GreaterEqual) },
      { ALT: () => this.CONSUME(Less) },
      { ALT: () => this.CONSUME(Greater) },
    ]);
    this.SUBRULE(this.value);
    this.OPTION(() => {
      this.CONSUME(Range);
      this.SUBRULE2(this.value);
    });
  });

  private value = this.RULE("value", () => {
    this.OR([
      { ALT: () => this.CONSUME(QuotedString) },
      { ALT: () => this.CONSUME(DateTime) },
      { ALT: () => this.CONSUME(NumberTok) },
      { ALT: () => this.CONSUME(Identifier) },
    ]);
    this.OPTION(() => this.CONSUME(Wildcard));
  });
}

export const parserInstance = new KeyQLParser();
export const BaseCstVisitor = parserInstance.getBaseCstVisitorConstructor();
export type CstResult = ReturnType<typeof parserInstance.query>;
export type { IToken };
