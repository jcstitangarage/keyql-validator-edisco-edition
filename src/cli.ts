import { parse } from "./parser/index.js";
import { validate } from "./validator/index.js";

const source = process.argv.slice(2).join(" ").trim();

if (!source) {
  console.error("usage: npm run parse -- 'from:pilarp AND kind:email'");
  process.exit(2);
}

const { ast, diagnostics: parseDiags } = parse(source);
const semanticDiags = validate(ast);
const all = [...parseDiags, ...semanticDiags];

if (ast) {
  console.log(JSON.stringify(ast, null, 2));
}
if (all.length > 0) {
  console.log("");
  for (const d of all) {
    const code = "code" in d ? ` (${d.code})` : "";
    console.log(`${d.severity.toUpperCase()}${code} [${d.start}..${d.end}]: ${d.message}`);
  }
}

process.exit(all.some((d) => d.severity === "error") ? 1 : 0);
