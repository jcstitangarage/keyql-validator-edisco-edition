import { KeyQLLexer } from "./tokens.js";
import { parserInstance } from "./parser.js";
import { astBuilder } from "./visitor.js";
import type { AstNode } from "./ast.js";

export interface ParseDiagnostic {
  severity: "error";
  message: string;
  start: number;
  end: number;
}

export interface ParseResult {
  ast: AstNode | undefined;
  diagnostics: ParseDiagnostic[];
}

export function parse(source: string): ParseResult {
  const diagnostics: ParseDiagnostic[] = [];

  if (source.trim().length === 0) {
    return { ast: undefined, diagnostics: [] };
  }

  const lexed = KeyQLLexer.tokenize(source);
  for (const err of lexed.errors) {
    diagnostics.push({
      severity: "error",
      message: `Lex error: ${err.message}`,
      start: err.offset,
      end: err.offset + (err.length ?? 1),
    });
  }

  parserInstance.input = lexed.tokens;
  const cst = parserInstance.query();

  for (const err of parserInstance.errors) {
    const tok = err.token;
    const start = tok?.startOffset ?? 0;
    const end = (tok?.endOffset ?? start) + 1;
    diagnostics.push({
      severity: "error",
      message: `Parse error: ${err.message}`,
      start,
      end,
    });
  }

  if (diagnostics.length > 0) {
    return { ast: undefined, diagnostics };
  }

  const ast = astBuilder.visit(cst) as AstNode;
  return { ast, diagnostics };
}

export type { AstNode } from "./ast.js";
