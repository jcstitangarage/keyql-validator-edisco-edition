# KeyQL Validator · eDisco Edition

A static web tool for drafting, validating, and dry-running
**Microsoft Purview eDiscovery** KeyQL queries locally — before filing a
real case.

**Live:** <https://jcstitangarage.github.io/keyql-validator-edisco-edition/>

---

## What it solves

Purview's in-product KeyQL editor lives inside the real eDiscovery
workflow, so experimenting with query syntax means opening a real case.
Teams end up pasting draft queries into notepad, double-checking
property names by hand against Microsoft Learn, and only finding typos
or bad operators once the collection has already run.

This tool is a safe sandbox:

- **Parse and validate KeyQL** against the eDiscovery property catalog
  captured from Microsoft Learn — unknown properties, wrong operators,
  bad date formats, nested quotes, and condition-builder markers are all
  flagged.
- **Dry-run the query** against a small synthetic corpus (mail, Teams,
  documents) to see which items would be scoped before you file a
  real collection.
- **Four ways to build a query** — natural-language input, condition
  builder, scenario templates, or direct editor entry with
  autocompletion.
- **All data is synthetic** — identities are Contoso / Fabrikam demo
  personas. The natural-language translator actively substitutes
  synthetic identities when real names are typed, so the tool can't
  echo real users into a generated query.

## Features

- Syntax-highlighted CodeMirror 6 editor with KeyQL autocompletion
- Chevrotain-backed parser producing a typed AST with error recovery
- Semantic validator driven by a catalog of 62 eDiscovery properties
- Pattern-based natural-language translator (deterministic, no LLM)
  supporting sender/recipient/author, ISO + US slash + year-only dates,
  open-ended ranges ("01/01/2022 to date"), relative intervals (today,
  last month, …), attachments, size, file type, importance, and
  keywords
- Condition builder mirroring the Purview UX, with per-type value
  inputs and synthetic-sample dropdowns
- 10 scenario templates for common eDiscovery search shapes
- Dry-run evaluator that runs the parsed query against a local mock
  corpus
- Inline operator reference covering property operators, Boolean /
  proximity operators, wildcards and shortcuts, and condition-builder
  markers
- Source transparency — every panel links back to the Microsoft Learn
  doc it came from, with the doc's last-updated date and the date this
  tool's catalog was captured from it

## Quick start

Requires **Node 22** or later (Chevrotain 12 uses `Object.groupBy`).

```bash
git clone https://github.com/jcstitangarage/keyql-validator-edisco-edition.git
cd keyql-validator-edisco-edition
npm install

npm run dev        # local dev server on http://localhost:5173
npm test           # Vitest — 60 tests across parser, evaluator, NL, scenarios
npm run build      # production build into dist/
npm run parse -- 'kind:email AND from:pilarp'   # CLI parser for quick checks
```

## Tech stack

| Layer                      | Technology                                                   |
| -------------------------- | ------------------------------------------------------------ |
| Language                   | TypeScript 5 (strict, `noUncheckedIndexedAccess` on)        |
| Build                      | Vite 6 (static output, relative base for GitHub Pages)      |
| Parser                     | [Chevrotain 12](https://github.com/Chevrotain/chevrotain)   |
| Editor                     | [CodeMirror 6](https://codemirror.net/) with a custom `StreamLanguage` + autocomplete |
| Testing                    | Vitest 3                                                     |
| CI / deploy                | GitHub Actions → GitHub Pages                                |

Runtime dependencies are scoped to CodeMirror, Lezer highlight, and
Chevrotain. No React, no backend, no analytics, no external network
traffic at runtime.

## Documentation

- [docs/architecture.md](docs/architecture.md) — module map, data flow,
  parser / validator / evaluator boundaries
- [docs/catalog.md](docs/catalog.md) — the eDiscovery property catalog
  (`data/ediscovery-properties.json`): what's in it, where it came
  from, how to re-capture it when Microsoft updates the docs
- [docs/nl-translator.md](docs/nl-translator.md) — every pattern the
  natural-language translator recognizes, the identity-substitution
  guardrail, and what's explicitly out of scope
- [docs/development.md](docs/development.md) — local dev workflow,
  tests, build, deploy, GPG signing, bumping the catalog
- [docs/security.md](docs/security.md) — security posture, threat
  model, and what the CI audit gate covers

## Security posture

Short version: the app runs entirely in the browser, has no backend,
does no network I/O after load, uses no storage APIs, and never echoes
real identities into generated queries.

- Strict CSP: `script-src 'self'`, no `'unsafe-inline'` or
  `'unsafe-eval'`
- Every DOM write goes through `textContent` / `replaceChildren` /
  `appendChild` — zero `innerHTML`
- No dynamic-string code evaluation, no user-string interpolation into
  runtime-built regular expressions
- `npm audit --audit-level=high` is a gate in CI
- All commits GPG-signed

See [docs/security.md](docs/security.md) for the full threat model and
the list of checks performed.

## Source of truth

The property catalog at
[`data/ediscovery-properties.json`](data/ediscovery-properties.json) is
the authoritative list of searchable properties, operators, enum
values, and syntax rules the tool treats as real. It was captured from
Microsoft Learn on **2026-04-16**.

Synthetic fixtures live at:

- [`data/mock-corpus.json`](data/mock-corpus.json) — the 11-item corpus
  used by the dry-run evaluator
- [`data/scenarios.json`](data/scenarios.json) — scenario templates and
  the synthetic-data chip pool

No real PII is present in any source or fixture.

## License

MIT. Not affiliated with Microsoft. Uses publicly documented KeyQL
syntax and the [MS-KQL Open Specification][ms-kql] (grammar reference
only, no proprietary code).

[ms-kql]: https://learn.microsoft.com/en-us/openspecs/sharepoint_protocols/MS-KQL/3bbf06cd-8fc1-4277-bd92-8661ccd3c9b0
