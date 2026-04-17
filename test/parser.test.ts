import { describe, it, expect } from "vitest";
import { parse } from "../src/parser/index.js";
import { validate } from "../src/validator/index.js";

describe("parser — simple property restrictions", () => {
  it("parses from:pilarp", () => {
    const { ast, diagnostics } = parse("from:pilarp");
    expect(diagnostics).toEqual([]);
    expect(ast?.kind).toBe("property");
  });

  it("parses a quoted value", () => {
    const { ast, diagnostics } = parse('from:"Pilar Pinilla"');
    expect(diagnostics).toEqual([]);
    expect(ast?.kind).toBe("property");
    if (ast?.kind !== "property") return;
    expect(ast.value.kind).toBe("value");
    if (ast.value.kind !== "value") return;
    expect(ast.value.value).toBe("Pilar Pinilla");
  });

  it("parses an ISO date comparison", () => {
    const { ast, diagnostics } = parse("sent>=2025-01-01");
    expect(diagnostics).toEqual([]);
    expect(ast?.kind).toBe("property");
    if (ast?.kind !== "property") return;
    expect(ast.op).toBe(">=");
    expect(ast.value.kind).toBe("value");
    if (ast.value.kind !== "value") return;
    expect(ast.value.form).toBe("date");
  });

  it("parses a range", () => {
    const { ast, diagnostics } = parse("size:1..1048567");
    expect(diagnostics).toEqual([]);
    if (ast?.kind !== "property") throw new Error("expected property");
    expect(ast.op).toBe("..");
    expect(ast.value.kind).toBe("range");
  });
});

describe("parser — boolean composition", () => {
  it("parses AND", () => {
    const { ast, diagnostics } = parse("kind:email AND from:pilarp");
    expect(diagnostics).toEqual([]);
    expect(ast?.kind).toBe("boolean");
    if (ast?.kind !== "boolean") return;
    expect(ast.op).toBe("AND");
  });

  it("parses OR and NOT", () => {
    const { ast, diagnostics } = parse("kind:email OR kind:im NOT from:spam@example.com");
    expect(diagnostics).toEqual([]);
    expect(ast?.kind).toBe("boolean");
  });

  it("parses parentheses for grouping", () => {
    const { ast, diagnostics } = parse("(kind:email OR kind:im) AND from:pilarp");
    expect(diagnostics).toEqual([]);
    if (ast?.kind !== "boolean") throw new Error("expected boolean");
    expect(ast.op).toBe("AND");
    expect(ast.left.kind).toBe("group");
  });

  it("parses minus exclusion", () => {
    const { ast, diagnostics } = parse("kind:email -from:spam@example.com");
    expect(diagnostics).toEqual([]);
    expect(ast).toBeDefined();
  });

  it("parses NEAR with distance", () => {
    const { ast, diagnostics } = parse("acquisition NEAR(n=3) debt");
    expect(diagnostics).toEqual([]);
    if (ast?.kind !== "near") throw new Error("expected near");
    expect(ast.distance).toBe(3);
  });
});

describe("parser — wildcards and special forms", () => {
  it("parses a prefix wildcard", () => {
    const { ast, diagnostics } = parse("attachmentnames:annual*");
    expect(diagnostics).toEqual([]);
    if (ast?.kind !== "property") throw new Error("expected property");
    if (ast.value.kind !== "value") throw new Error("expected literal value");
    expect(ast.value.wildcard).toBe(true);
  });

  it("flags condition marker (c:c)", () => {
    const { ast, diagnostics } = parse("report(c:c)(date<2025-04-01)");
    expect(diagnostics).toEqual([]);
    const warnings = validate(ast).filter((d) => d.code === "condition-marker");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("validator — semantic checks", () => {
  it("flags unknown properties", () => {
    const { ast } = parse("bogusproperty:value");
    const diags = validate(ast);
    expect(diags.some((d) => d.code === "unknown-property")).toBe(true);
  });

  it("flags wrong operator for text type", () => {
    const { ast } = parse("from<pilarp");
    const diags = validate(ast);
    expect(diags.some((d) => d.code === "operator-type-mismatch")).toBe(true);
  });

  it("flags invalid enum values for kind", () => {
    const { ast } = parse("kind:nonsense");
    const diags = validate(ast);
    expect(diags.some((d) => d.code === "invalid-enum-value")).toBe(true);
  });

  it("accepts valid enum values for kind", () => {
    const { ast } = parse("kind:email");
    const diags = validate(ast);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("flags range on non-numeric property", () => {
    const { ast } = parse("from:pilarp..garthf");
    const diags = validate(ast);
    expect(diags.some((d) => d.code === "range-on-non-numeric")).toBe(true);
  });

  it("accepts date intervals like today", () => {
    const { ast } = parse("lastmodifiedtime:today");
    const diags = validate(ast);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });
});
