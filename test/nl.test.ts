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

describe("natural-language translator — core patterns", () => {
  it("translates sender + keyword + relative date", () => {
    const result = translate("emails from Pilar about Tradewinds last month");
    expect(result.keyql).toContain("kind:email");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
    expect(result.keyql).toContain("Tradewinds");
    expect(result.keyql).toContain('sent:"last month"');
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
    expect(result.keyql).toContain('author:"Ann Beebe"');
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

  it("ignores stop words and returns a usable query", () => {
    const result = translate("the emails from Pilar");
    expect(result.keyql).toContain("from:pilarp@contoso.com");
  });

  it("returns empty for empty input", () => {
    const result = translate("");
    expect(result.keyql).toBe("");
  });

  it("handles 'without attachments'", () => {
    const result = translate("emails without attachments");
    expect(result.keyql).toContain("hasattachment:false");
    expectValid(result.keyql);
  });

  it("handles 'high importance'", () => {
    const result = translate("emails high importance");
    expect(result.keyql).toContain("importance:high");
    expectValid(result.keyql);
  });
});

describe("natural-language translator — extended date handling", () => {
  it("accepts US slash dates MM/DD/YYYY", () => {
    const result = translate("emails between 01/01/2022 and 03/31/2022");
    expect(result.keyql).toContain("sent:2022-01-01..2022-03-31");
    expectValid(result.keyql);
  });

  it("handles open-ended '… to date'", () => {
    const result = translate("emails 01/01/2022 to date");
    expect(result.keyql).toContain("sent>=2022-01-01");
    expectValid(result.keyql);
  });

  it("handles '… to today' and '… to now' the same way", () => {
    const today = translate("emails 2024-06-01 to today");
    const now = translate("emails 2024-06-01 to now");
    expect(today.keyql).toContain("sent>=2024-06-01");
    expect(now.keyql).toContain("sent>=2024-06-01");
    expectValid(today.keyql);
    expectValid(now.keyql);
  });

  it("handles year-only 'after YYYY'", () => {
    const result = translate("emails after 2024");
    expect(result.keyql).toContain("sent>2024-12-31");
    expectValid(result.keyql);
  });

  it("handles year-only 'before YYYY'", () => {
    const result = translate("emails before 2024");
    expect(result.keyql).toContain("sent<2024-01-01");
    expectValid(result.keyql);
  });

  it("handles year-only 'since YYYY'", () => {
    const result = translate("emails since 2023");
    expect(result.keyql).toContain("sent>=2023-01-01");
    expectValid(result.keyql);
  });

  it("handles year-only 'in YYYY'", () => {
    const result = translate("emails in 2024");
    expect(result.keyql).toContain("sent:2024-01-01..2024-12-31");
    expectValid(result.keyql);
  });

  it("accepts ISO 'since YYYY-MM-DD'", () => {
    const result = translate("emails since 2025-01-15");
    expect(result.keyql).toContain("sent>=2025-01-15");
    expectValid(result.keyql);
  });
});

describe("natural-language translator — identity substitution", () => {
  it("substitutes an unknown sender with a synthetic identity and flags it", () => {
    const result = translate("emails to Mikey B about pasta, after 2024");
    const substituted = result.steps.filter((s) => s.severity === "substituted");
    expect(substituted.length).toBeGreaterThan(0);
    expect(result.substitutions).toBeGreaterThan(0);
    // The generated KeyQL must never contain the unknown name:
    expect(result.keyql.toLowerCase()).not.toContain("mikey b");
    // But should contain a replaced recipient from the synthetic pool:
    expect(result.keyql).toMatch(/to:[a-z]+@(contoso|fabrikam)\.com/);
    expect(result.keyql).toContain("pasta");
    expect(result.keyql).toContain("sent>2024-12-31");
    expectValid(result.keyql);
  });

  it("real name still produces valid KeyQL (just substituted)", () => {
    const result = translate("emails from John Realname about project");
    expect(result.keyql.toLowerCase()).not.toContain("john realname");
    expect(result.substitutions).toBe(1);
    expectValid(result.keyql);
  });
});
