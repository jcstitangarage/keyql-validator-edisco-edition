# Purview KeyQL Tester — Project Guardrails

A proof-of-concept tool that lets eDiscovery administrators **draft, validate, and dry-run KeyQL queries before filing actual eDiscovery cases** in Microsoft Purview. The goal is to catch syntax errors and likely-wrong queries early, outside the real eDiscovery workflow.

## Scope

- **eDiscovery KeyQL only.** Support the subset of Keyword Query Language that the Purview eDiscovery condition builder and KeyQL editor accept. Do **not** reimplement the full SharePoint KQL surface (XRANK, synonym operators, managed-property plumbing, relevance tuning, etc.).
- **Both experiences covered:**
  - New eDiscovery (`purview.microsoft.com`) — the post-2025-08-31 experience
  - Classic eDiscovery (21Vianet / reference) — for parity
- **No execution against production tenants.** Dry-run only, against a local mock corpus. If we later wire up real Graph / Compliance Search endpoints, it is gated behind an explicit opt-in with the user's own credentials.

## Non-goals

- No relevance scoring — eDiscovery doesn't use it.
- No full SharePoint search frontend replacement.
- No storage or transmission of tenant content, PII, or credentials.
- No model training on query history.

## Security rules (non-negotiable)

1. **No sketchy tools.** All runtime dependencies must be well-known, actively maintained, and from reputable publishers. Prefer the platform's standard library first. When a dep is needed: established OSS (MIT / Apache-2.0 / BSD), recent releases, reasonable weekly downloads, no known CVEs. No packages from unknown authors, no typosquat-prone names, no obscure `curl | sh` installers, no pre-release/beta as a hard dep.
2. **No secrets in the repo.** No tokens, tenant IDs, mailbox addresses, PII, or real user data in source, fixtures, docs, or commits. Sample/fixture data uses `contoso.com`, `fabrikam.com`, or obviously synthetic identifiers.
3. **No telemetry / no phone-home.** The tool runs locally. It must not send query content, property names, or usage data to any third party. If we later add optional telemetry, it is opt-in, documented, and never transmits query bodies.
4. **Treat pasted queries as untrusted input.** The parser produces an AST; downstream code consumes the AST only. Do not pass user-supplied strings to dynamic code execution, shell commands, or SQL/KQL execution paths without structured escaping.
5. **Output-encode everything rendered.** The editor UI displays user-entered KeyQL via DOM textContent or framework binding — never via raw HTML injection.
6. **Safe defaults.** Strict Content-Security-Policy for any web UI. No inline scripts. No remote fonts/scripts from CDNs unless vetted and pinned by SRI hash.
7. **Dependency hygiene.** Lockfile committed. `npm audit` / equivalent clean on main. Dependabot/Renovate enabled. Audit any `postinstall` scripts before adding a dep.
8. **Microsoft IP respected.** We implement against the published [MS-KQL] Open Specification (downloaded PDFs in `SharePointProtocols/`) and public Microsoft Learn docs. We do not decompile, scrape, or replicate proprietary Purview UI assets, icons, or autocomplete endpoints.

## What to build (in order)

1. **Property catalog** (`data/ediscovery-properties.json`) — authoritative list of searchable properties, operators, types, enum values, examples. **(Step 1 — in progress.)**
2. **Grammar + parser** — a KeyQL parser scoped to the eDiscovery subset, producing an AST. Chevrotain (TS, in-code grammar, good error recovery) is the leading candidate.
3. **Semantic validator** — walks the AST against the property catalog: unknown properties, wrong operator for type, bad date formats, nested quotes, unbalanced parens, disallowed special characters, `(c:c)` misuse in manual queries.
4. **Editor UI** — Monaco or CodeMirror 6 with our language definition, wired to the catalog for completion and to the validator for diagnostics.
5. **Condition-builder view** — bidirectional AST ↔ structured form.
6. **Dry-run evaluator** — runs the AST against a local mock corpus of synthetic emails/docs and shows which items would match.

## Reference material (local)

- `SharePointProtocols/[MS-KQL].pdf` — formal MS-KQL grammar spec. Authoritative; cite it in parser comments when mirroring its productions.
- Microsoft Learn docs are the source of truth for the **eDiscovery-specific** property list — not all MS-KQL properties apply to eDiscovery.

## House style

- No code comments unless a constraint/invariant is non-obvious.
- Small, focused modules. The parser, the catalog, the validator, and the UI should each be independently testable.
- Tests over docs: if a grammar rule matters, there's a test for it.
