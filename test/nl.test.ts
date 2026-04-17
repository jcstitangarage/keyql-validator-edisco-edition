import { describe, it, expect } from "vitest";
import { translate } from "../src/nl/translate.js";
import { parse } from "../src/parser/index.js";
import { validate } from "../src/validator/index.js";

function expectValid(keyql: string): void {
  const { ast, diagnostics } = parse(keyql);
  expect(diagnostics).toEqual([]);
  const errs = validate(ast).filter((d) => d.severity === "error");
  expect(errs).toEqual([]);
}

describe("natural-language translator", () => {
  it("translates sender + keyword + relative date", () => {
    const result = translate("emails from Pilar about Tradewinds last month");
    expect(result.keyql).toContain("kind:email");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
    expect(result.keyql).toContain("Tradewinds");
    expect(result.keyql).toContain("sent:\"last month\"");
    expectValid(result.keyql);
  });

  it("translates sender + recipient + attachment", () => {
    const result = translate("emails from Pilar to Garth with attachments");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
    expect(result.keyql).toContain("to:garthf@contoso.com");
    expect(result.keyql).toContain("hasattachment:true");
    expectValid(result.keyql);
  });

  it("translates document author with file type", () => {
    const result = translate("documents by Ann Beebe of type xlsx");
    expect(result.keyql).toContain("kind:docs");
    expect(result.keyql).toContain("author:\"Ann Beebe\"");
    expect(result.keyql).toContain("filetype:xlsx");
    expectValid(result.keyql);
  });

  it("translates size comparison with MB", () => {
    const result = translate("emails larger than 1 MB");
    expect(result.keyql).toContain("size>1048576");
    expectValid(result.keyql);
  });

  it("translates ISO date range", () => {
    const result = translate("emails between 2025-01-01 and 2025-03-31");
    expect(result.keyql).toContain("sent:2025-01-01..2025-03-31");
    expectValid(result.keyql);
  });

  it("warns on unknown identity without echoing it into the query", () => {
    const result = translate("emails from John Realname about project");
    expect(result.warnings.some((w) => /John Realname/i.test(w.phrase))).toBe(true);
    expect(result.keyql).not.toContain("John Realname");
  });

  it("recognizes Teams kind", () => {
    const result = translate("teams chats from Pilar");
    expect(result.keyql).toContain("kind:microsoftteams");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
    expectValid(result.keyql);
  });

  it("uses lastmodifiedtime for document date ranges", () => {
    const result = translate("documents by Ann between 2025-01-01 and 2025-03-31");
    expect(result.keyql).toContain("kind:docs");
    expect(result.keyql).toContain("lastmodifiedtime:2025-01-01..2025-03-31");
    expectValid(result.keyql);
  });

  it("ignores stop words and surfaces unmatched remainder", () => {
    const result = translate("the emails from Pilar");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
  });

  it("empty input returns empty", () => {
    const result = translate("");
    expect(result.keyql).toBe("");
  });
});
