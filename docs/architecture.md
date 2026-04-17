# Architecture

How the pieces fit together. The codebase is deliberately small —
around 2,000 lines of TypeScript — and every module has a single
responsibility.

```
+-----------------------+
|    index.html + CSP   |   single static entrypoint
+----------+------------+
           |
           v
+----------+----------------------------------------------------+
|                         src/main.ts                           |
|   - wires DOM hosts to UI modules                             |
|   - owns the "set editor contents, scroll, flash" behavior    |
+--+-----+-------+--------+---------+-------------+-------------+
   |     |       |        |         |             |
   v     v       v        v         v             v
  NL   builder  scen.  samples  references    editor (CM6)
   |     |       |                              |
   +-----+-------+------------------------------+
                 |
                 v
            parser  ->  validator  ->  evaluator
             (AST)      (Diag[])       (matches[])
                 ^
                 |
         data/ediscovery-properties.json   (catalog)
         data/scenarios.json               (templates + synthetic pool)
         data/mock-corpus.json             (dry-run corpus)
```

## Layers

### 1. Data layer — `data/`

Three JSON files, all generated from Microsoft Learn or hand-authored
synthetic content.

| File                              | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `ediscovery-properties.json`      | The property / operator / enum catalog.          |
| `scenarios.json`                  | 10 canned scenario templates + synthetic pool.   |
| `mock-corpus.json`                | 11 synthetic items used by the evaluator.        |

See [catalog.md](catalog.md) for how the catalog is sourced and how to
refresh it when MS docs change.

### 2. Parser — `src/parser/`

Built on [Chevrotain 12](https://github.com/Chevrotain/chevrotain).

| File               | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `tokens.ts`        | Lexer. Identifier, DateTime, QuotedString, operators, keywords.|
| `parser.ts`        | Grammar with error recovery enabled.                          |
| `visitor.ts`       | CST → typed AST (`AstNode` in `ast.ts`).                      |
| `ast.ts`           | AST type definitions.                                         |
| `index.ts`         | Public `parse(source)` returning `{ ast, diagnostics }`.     |

The grammar covers the eDiscovery subset of KeyQL:

- Boolean composition (`AND` / `OR` / implicit juxtaposition, `NOT`,
  `-` / `+` shortcuts)
- Property restrictions with operators `:`, `=`, `<>`, `<`, `>`, `<=`,
  `>=`, and range `..`
- Free-text terms, quoted phrases, prefix wildcards
- Proximity: `NEAR(n)` / `NEAR(n=N)`
- Grouping parentheses
- Condition-builder markers `(c:c)` and `(c:s)` as distinct tokens so
  we can warn on them

Production-grade SharePoint KQL features that the eDiscovery surface
doesn't reliably use (`XRANK`, `WORDS()`, managed-property plumbing,
relevance tuning) are intentionally omitted.

### 3. Catalog — `src/catalog/`

Thin wrapper over the JSON. Exposes:

- `getCatalog()` — the raw object
- `findProperty(name)` — case-insensitive, alias-aware lookup backed by
  a `Map<string, Property>`
- `operatorAllowedForProperty(property, op)` — intersection of the
  property's allowed operators and the operator spec's supported types
- `allowedValuesForProperty(property)` — resolves enum values

### 4. Validator — `src/validator/`

Walks the AST and emits `Diagnostic[]`. Rules:

| Code                       | Severity | Triggers                                            |
| -------------------------- | -------- | --------------------------------------------------- |
| `unknown-property`         | error    | Property not in the catalog                         |
| `operator-type-mismatch`   | error    | Operator not allowed for this property type         |
| `range-on-non-numeric`     | error    | `..` used on text/enum/boolean/recipient            |
| `invalid-enum-value`       | error    | Enum property with value outside its allowed set    |
| `non-numeric-value`        | error    | Bare non-digit passed where a number is expected    |
| `nested-quotes`            | error    | `""` inside a quoted phrase                         |
| `condition-marker`         | warn     | `(c:c)` / `(c:s)` in a manually written query       |
| `implicit-juxtaposition`   | warn     | Two terms adjacent without explicit AND/OR          |
| `non-iso-date`             | warn     | Date value that isn't ISO and isn't a known interval|

### 5. Evaluator — `src/evaluator/`

Dry-run engine that runs the AST against `mock-corpus.json`.

- `corpus.ts` — loads the corpus and builds a reverse-index from
  identity forms (UPN, alias, display name) back to identity records
- `dates.ts` — parses ISO points and resolves relative keywords
  (`today`, `this month`, …) to UTC day windows
- `index.ts` — the `match(node, item)` dispatcher, with separate
  `mapMailProperty` and `mapDocProperty` helpers gated on `isMail(item)`

For recipient properties, matching tries UPN equality, then alias,
display name, first name, and finally substring — simulating Purview's
recipient-expansion behavior enough to make the dry run representative.

### 6. Natural-language translator — `src/nl/`

Pure TS module, deterministic, no LLM. Input is a string, output is
`{ keyql, steps, warnings, substitutions, unmatched }`.

See [nl-translator.md](nl-translator.md) for the full pattern list.

### 7. UI — `src/ui/` and `src/editor/`

| File                            | Responsibility                                  |
| ------------------------------- | ----------------------------------------------- |
| `editor/setup.ts`               | CodeMirror 6 view assembly                      |
| `editor/language.ts`            | `StreamLanguage` mode for syntax highlighting   |
| `editor/completion.ts`          | Catalog-driven `CompletionSource`               |
| `ui/scenarios.ts`               | Scenario list with load-more                    |
| `ui/conditionBuilder.ts`        | Property/operator/value row UI + KeyQL preview  |
| `ui/nl.ts`                      | Wires the NL input/translate/apply flow         |
| `ui/samples.ts`                 | Synthetic-data chips with clipboard copy        |
| `ui/references.ts`              | MS Learn sources panel                          |

`main.ts` is the thin glue: queries DOM hosts, initializes each UI
module, and owns the `setEditorContents(query, statusMessage)` action
that all three input paths (scenarios, builder, NL) share.

## Data flow — a user typing a query

```
keystroke
   |
   v
CodeMirror updateListener
   |
   v  (string)
main.ts: renderFor(source)
   |
   +-- parse(source)     --> { ast, diagnostics[] }
   |
   +-- validate(ast)     --> diagnostics[]
   |
   +-- evaluate(ast)     --> { matched[], totalScanned }
   |
   v
DOM: diagnostics list, AST view, matches list
```

Every frame is a pure function of the source string — no hidden state
between keystrokes. That's what makes the app so cheap to reason about.

## Data flow — user clicking a scenario

```
click on scenario button
   |
   v
renderScenarios onSelect(scenario)
   |
   v
setEditorContents(scenario.query, `loaded scenario: ${title}`)
   |
   +-- editorView.dispatch({ changes })   // replace doc
   +-- scroll editor into view, flash border
   +-- badge beside "Query editor" shows the scenario title
   |
   v
updateListener fires -> renderFor(newSource)  (same flow as typing)
```

The NL panel and condition builder both converge on
`setEditorContents` as the single write path.

## Build & deploy

- **Dev:** `npm run dev` — Vite with HMR.
- **Build:** `npm run build` — TypeScript strict check, then Vite
  production build into `dist/` (sourcemaps on). Emits a single ES
  module + CSS with relative asset paths (`base: "./"`) so it works at
  any GitHub Pages sub-path.
- **CI:** `.github/workflows/pages.yml` on every push to `main` — node
  22, `npm ci`, `npm audit --audit-level=high --omit=dev`, typecheck,
  test, build, deploy via the official `actions/deploy-pages@v4` job.

Build-time `define`s (in `vite.config.ts`) stamp `__BUILD_TIME__` and
`__BUILD_COMMIT__` into the bundle so the page can show the deploy
date and link to the source commit on GitHub.
