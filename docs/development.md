# Development

Local workflow, testing, deployment, and how the various moving parts
connect.

## Prerequisites

- **Node 22+** — Chevrotain 12 uses `Object.groupBy`, which isn't in
  Node 20. `npm install` will warn if the engines check fails.
- **Git** — for the clone. Recent-ish version is fine.
- Optional: GPG key enrolled on your GitHub account if you want your
  commits to show as Verified (the repo is configured to sign on
  every commit locally).

## One-time setup

```bash
git clone https://github.com/jcstitangarage/keyql-validator-edisco-edition.git
cd keyql-validator-edisco-edition
npm install
```

## Everyday commands

| Command                         | What it does                                                |
| ------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                   | Vite dev server at <http://localhost:5173> with HMR.        |
| `npm test`                      | Run Vitest once. CI uses this.                              |
| `npm run test:watch`            | Vitest in watch mode — handy when editing the parser or NL.  |
| `npm run typecheck`             | `tsc --noEmit` with the strict config. No runtime.          |
| `npm run build`                 | Typecheck, then production Vite build into `dist/`.         |
| `npm run preview`               | Serve the production build locally to test the real bundle. |
| `npm run parse -- '<query>'`    | CLI: parse a KeyQL string, print the AST + any diagnostics. |

## Project layout

```
data/                  JSON: eDiscovery catalog, mock corpus, scenarios
src/
  parser/              Chevrotain lexer, parser, visitor, AST types
  validator/           Semantic checks against the catalog
  evaluator/           Dry-run engine over mock corpus
  nl/                  Natural-language translator
  catalog/             Loader + helpers for ediscovery-properties.json
  editor/              CodeMirror 6 setup, language mode, completion
  ui/                  Builder, scenarios, references, NL, samples panels
  main.ts              Thin glue — wires DOM hosts to UI modules
  meta.ts              Build-time constants (commit, build time)
test/
  parser.test.ts       Grammar golden tests
  evaluator.test.ts    Dry-run semantics
  nl.test.ts           NL translator coverage
  scenarios.test.ts    Every bundled scenario must parse+validate clean
index.html             Entry point with strict CSP meta
vite.config.ts         Base path, build defines, Vitest config
tsconfig.json          Strict, ES2022, bundler resolution
.github/workflows/     CI + Pages deploy
```

See [architecture.md](architecture.md) for a visual of how these
layers talk.

## Testing

Four test files, ~60 tests total.

- `parser.test.ts` — one test per grammar production plus a few
  error-recovery cases.
- `evaluator.test.ts` — integration-style tests: parse → validate →
  evaluate → assert which corpus items match. Keeps the AST and
  evaluator honest together.
- `nl.test.ts` — one test per NL pattern. Every generated KeyQL is
  round-tripped through the parser + validator; a green test means the
  output is syntactically valid and semantically known.
- `scenarios.test.ts` — locks every bundled scenario. Any catalog
  change that breaks an existing scenario query shows up here.

When you add a new grammar rule, operator, NL pattern, or evaluator
branch, add at least one test. Round-trip tests (where possible) are
the cheapest safety net.

## The CLI

`npm run parse -- '<query>'` runs `src/cli.ts` via `tsx`. It prints the
AST as JSON and any diagnostics, and exits non-zero on errors. Handy
for quick shell checks:

```bash
npm run parse -- 'kind:email AND from:pilarp AND sent>=2025-01-01'
echo $?    # 0
```

## Catalog updates

The eDiscovery property catalog at
[`data/ediscovery-properties.json`](../data/ediscovery-properties.json)
is the single source of truth for what counts as a valid KeyQL query.
It's hand-maintained from Microsoft Learn.

See [catalog.md](catalog.md) for the full refresh procedure.

## Adding a scenario template

1. Add an entry to `data/scenarios.json` under `scenarios[]` — pick an
   `id` slug, a plain-English `title`, a one-line `summary`, and a
   `query` using identities from the synthetic pool (also in
   `scenarios.json` under `synthetic.identities`).
2. Run `npm test`. The scenarios test will refuse to let you commit a
   query that doesn't parse+validate clean.
3. The UI picks it up automatically on next reload — no code changes
   needed.

## Adding an NL pattern

1. Add the regex + handler in `src/nl/translate.ts`. Follow the
   convention: use `consume(pattern, handler)` which both matches and
   strips the matched text from `remaining`.
2. Add the pattern to the documented grammar in
   [nl-translator.md](nl-translator.md).
3. Add at least one round-trip test in `test/nl.test.ts` that asserts
   both the generated KeyQL shape and that `expectValid()` passes.
4. If your pattern introduces a new boundary word (e.g. "through" as a
   date range separator), add it to `BOUNDARY_WORDS` so identity
   captures don't swallow it.

## Adding a parser feature

Usually you only need to edit:

- `src/parser/tokens.ts` — add tokens in the correct priority order
- `src/parser/parser.ts` — add the grammar production
- `src/parser/visitor.ts` — build the AST node
- `src/parser/ast.ts` — the node type
- `src/validator/index.ts` — any new semantic rule + diagnostic code
- `test/parser.test.ts` — golden tests

After self-analysis-impacting changes, re-run tests; Chevrotain will
error at startup if the grammar has ambiguities.

## Commit discipline

- Every commit is GPG-signed (local repo has `commit.gpgsign=true`).
- `pre-commit` isn't currently wired — run `npm run typecheck && npm
  test` yourself before pushing.
- Commit messages: one-line summary + bullet body. No
  `Co-Authored-By` trailers unless actually co-authoring with another
  human.

## Deployment

Pushing to `main` kicks off
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) which:

1. Checks out at the pushed commit.
2. Sets up Node 22 with npm cache.
3. `npm ci` — install from the lockfile exactly.
4. `npm audit --audit-level=high --omit=dev` — fail the build if any
   production dependency has a high-or-critical advisory.
5. `npm run typecheck && npm test` — fail on any TS error or test
   failure.
6. `npm run build` — produce `dist/`.
7. Uploads `dist/` via `actions/upload-pages-artifact`.
8. Deploys via `actions/deploy-pages` with OIDC.

Average run time: ~30-40 seconds.

The live site is at
<https://jcstitangarage.github.io/keyql-validator-edisco-edition/>.
Deploys are immutable per commit — rolling back is just reverting the
commit and pushing again.

## Troubleshooting

**`Object.groupBy is not a function` on `npm test`**
You're on Node 20 or below. Upgrade to Node 22 LTS.

**Autocompletion in the editor shows no suggestions**
The catalog JSON isn't being served. Check `data/ediscovery-properties.json`
is present and that the import resolves — Vite imports JSON via
`with { type: "json" }`.

**CI fails at `npm audit`**
A transitive dep now has a high-severity advisory. Run `npm audit` locally
to see which one, then `npm update <pkg>` or `npm install <pkg>@latest`
and commit the lockfile change.

**CodeMirror editor renders but syntax highlighting is blank**
Check `src/editor/language.ts` — the `StreamLanguage` may have errored
silently during build. Run `npm run build` and look for Vite warnings.
