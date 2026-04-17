import { describe, it, expect } from "vitest";
import { parse } from "../src/parser/index.js";
import { evaluate } from "../src/evaluator/index.js";

function run(query: string): string[] {
  const { ast } = parse(query);
  return evaluate(ast).matched.map((m) => m.id);
}

describe("evaluator — corpus queries", () => {
  it("matches all emails with kind:email", () => {
    const ids = run("kind:email");
    expect(ids).toContain("m001");
    expect(ids).toContain("m002");
    expect(ids).not.toContain("m005");
    expect(ids).not.toContain("d001");
  });

  it("matches documents by filetype", () => {
    const ids = run("kind:docs AND filetype:docx");
    expect(ids).toEqual(["d002"]);
  });

  it("expands recipient alias to UPN and display name", () => {
    expect(run("from:pilarp")).toContain("m001");
    expect(run('from:"Pilar Pinilla"')).toContain("m001");
    expect(run("from:pilarp@contoso.com")).toContain("m001");
  });

  it("handles numeric comparison on size", () => {
    const big = run("size>100000");
    expect(big).toContain("m001");
    expect(big).toContain("d001");
    expect(big).not.toContain("m002");
  });

  it("handles date range on sent", () => {
    const q1 = run("sent>=2025-01-01 AND sent<=2025-03-31");
    expect(q1).toContain("m001");
    expect(q1).toContain("m005");
    expect(q1).not.toContain("m007");
  });

  it("handles date range via ..", () => {
    const ids = run("sent:2025-02-01..2025-02-28");
    expect(ids).toContain("m001");
    expect(ids).toContain("m006");
    expect(ids).not.toContain("m004");
  });

  it("AND narrows; OR broadens", () => {
    const and = run("kind:email AND from:pilarp");
    expect(and).toEqual(["m001", "m006"].filter((_) => and.includes(_)));
    const or = run("kind:im OR kind:microsoftteams");
    expect(or).toContain("m005");
    expect(or).toContain("m006");
  });

  it("NOT excludes (eDiscovery requires explicit AND, since space=OR)", () => {
    const ids = run("kind:email AND NOT from:noreply@example.com");
    expect(ids).not.toContain("m007");
    expect(ids).toContain("m001");
  });

  it("grouping with parentheses", () => {
    const ids = run("(kind:email OR kind:im) AND from:garthf");
    expect(ids).toContain("m002");
    expect(ids).toContain("m003");
    expect(ids).toContain("m005");
  });

  it("free-text search against subject+body", () => {
    const ids = run("tradewinds");
    expect(ids).toContain("m001");
    expect(ids).toContain("m005");
    expect(ids).toContain("d001");
    expect(ids).toContain("d003");
  });

  it("boolean property equality", () => {
    const hasAtt = run("hasattachment:true");
    expect(hasAtt).toContain("m001");
    expect(hasAtt).not.toContain("m002");
    const notRead = run("isread:false");
    expect(notRead).toContain("m004");
    expect(notRead).toContain("m007");
  });

  it("participants covers from/to/cc/bcc", () => {
    const ids = run("participants:annb@contoso.com");
    expect(ids).toContain("m001");
    expect(ids).toContain("m003");
    expect(ids).toContain("m004");
    expect(ids).toContain("m006");
  });
});
