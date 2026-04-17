import { describe, it, expect } from "vitest";
import scenarios from "../data/scenarios.json" with { type: "json" };
import { parse } from "../src/parser/index.js";
import { validate } from "../src/validator/index.js";

describe("bundled scenarios", () => {
  for (const scenario of scenarios.scenarios) {
    it(`parses and semantically validates: ${scenario.id}`, () => {
      const { ast, diagnostics } = parse(scenario.query);
      expect(diagnostics).toEqual([]);
      const errors = validate(ast).filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
    });
  }
});
