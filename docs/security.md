# Security posture

## Threat model

The app is a static client-side page with no backend, no auth, no
state persistence, and no network I/O after load. The realistic threat
surface is narrow:

1. A user pastes a malicious KeyQL string into the editor and causes
   the page to execute something it shouldn't.
2. A supply-chain compromise injects malicious code via one of our
   dependencies.
3. A user copies a scenario / sample / generated KeyQL containing a
   real identity into a real eDiscovery case (a workflow leak, not a
   code leak).

The first is addressed by a strict CSP plus uniformly safe DOM writes.
The second is addressed by a small, well-known dependency surface and
a CI `npm audit` gate. The third is addressed by enforcing
synthetic-only fixtures and a translator that refuses to echo real
identities.

## What the app does not do

- No outbound HTTP — no `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, or `navigator.sendBeacon`
- No browser storage APIs — no `localStorage`, `sessionStorage`,
  `indexedDB`, or service workers
- No analytics, tracking pixels, or third-party scripts
- No dynamic-string code evaluation anywhere in the bundle
- No user-string interpolation into runtime-built regular expressions
- No raw-HTML DOM writes (no string-based injection APIs). Every DOM
  mutation uses `textContent`, `createElement` + `appendChild`, or
  `replaceChildren`
- No writing of user input into URL `href` or `src` attributes — the
  only `<a href>` assignments in the codebase target compile-time
  constants (the repo URL and MS Learn catalog URLs)

## Content-Security-Policy

Declared via meta in [`index.html`](../index.html):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self';
base-uri 'self';
form-action 'none';
object-src 'none';
frame-ancestors 'none';
```

Notes:

- `script-src 'self'` — no inline, no `eval`. Vite's production build
  emits a single ES module + CSS; the page has zero inline script
  tags.
- `style-src 'self' 'unsafe-inline'` — required because CodeMirror
  injects its theme as inline `<style>` blocks at runtime. This is the
  documented accepted tradeoff for CodeMirror 6.
- `connect-src 'self'` — even though the app never calls `fetch`, this
  locks it down defensively.
- `frame-ancestors 'none'` is ignored when CSP is delivered via meta
  (CSP3 §2.2.3). GitHub Pages can't set response headers, so there's
  no way to enforce frame-busting at the CSP layer. Given the app has
  no auth and no state, clickjacking impact is nil.

## Input handling

Three input paths feed the parser:

| Path                               | Treatment                                           |
| ---------------------------------- | --------------------------------------------------- |
| CodeMirror editor (free text)     | Parsed by Chevrotain. Emits diagnostics, never evaluates. |
| Natural-language input              | Regex-matched against a fixed pattern set, then emitted via parser. Identity substrings matched against the synthetic pool only. |
| Condition-builder form              | Programmatic construction; user values go through `needsQuoting()` and get stringified. |

Every output path to the DOM uses `textContent`, `createElement` +
`appendChild`, or `replaceChildren`. This was verified by grepping
the entire source tree for the common raw-HTML sinks: **zero matches**.

Regex patterns in the NL translator are linear-time (flat character
classes, no nested quantifiers, no overlapping alternation). Not
susceptible to ReDoS.

Catalog and identity lookups use `Map<string, ...>`, not plain
objects, so `"__proto__"` and `"constructor"` strings behave as regular
keys. No prototype-pollution surface.

## Identity leak protection

The project scope rule forbids real PII in source, fixtures, docs,
or commits. The fixtures we ship use canonical Microsoft demo personas
on `contoso.com` and `fabrikam.com`, plus `noreply@example.com` (IANA
reserved).

The natural-language translator enforces the same rule at runtime: if
a user types a name that isn't in the synthetic pool, the translator
substitutes a synthetic identity and flags the substitution in the
UI — it never emits the unknown name into the generated KeyQL. This
is asserted by a test (`test/nl.test.ts`) so regressing the guardrail
fails CI.

## Clipboard usage

`src/ui/samples.ts` copies synthetic chip values to the clipboard via
`navigator.clipboard.writeText`, with a transient-textarea fallback
for older browsers that don't have the async clipboard API. All
values copied are bundled synthetic strings — no user-input
pass-through. The fallback textarea is created and immediately removed
from the DOM after the copy.

## CI / deploy pipeline

- Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
- Triggers: `push` to `main`, `workflow_dispatch` (no inputs).
  No `pull_request_target`, no `issue_comment`, no forks-can-trigger.
- Permissions scoped at workflow level: `contents: read`, `pages:
  write`, `id-token: write`. `id-token: write` is the documented
  requirement for `actions/deploy-pages@v4`'s OIDC.
- Actions are first-party (`actions/*`) and pinned to major tags
  (`@v4`, `@v5`, `@v3`). SHA-pinning would be stricter; acceptable
  for a first-party public Pages deploy with no secrets.
- No `${{ github.event.* }}` used inside `run:` steps → no command
  injection surface.
- `npm audit --audit-level=high --omit=dev` is a gate on every build.

## Dependencies

Runtime:

- `@codemirror/autocomplete`, `@codemirror/commands`,
  `@codemirror/language`, `@codemirror/state`, `@codemirror/view` —
  Marijn Haverbeke's CodeMirror 6 (well-established)
- `@lezer/highlight` — same author, peer dep of `@codemirror/language`
- `chevrotain` — Shahar Soel's parser library, 12.x line

Dev:

- `vite`, `vitest`, `typescript`, `tsx`, `@types/node` — all
  first-rank

All 150-ish resolved dependencies in `package-lock.json` come from
`registry.npmjs.org`. No git tarballs, no mirrors. `npm audit` clean.

## Reporting a concern

This is a hobby / internal-test tool, not a production product. If
you find something concerning, open an issue in the repo — or, if
it's a credential-type leak, email the maintainer directly first.

## Checks we do not currently do

- SHA-pinning of GitHub Actions
- Subresource Integrity (SRI) for any CDN assets (we ship no CDN
  assets, so moot today)
- Formal third-party penetration test
- Signed package provenance

None of these are likely to be proportionate for a static demo tool
with no secrets and no backend, but they're the next steps if the
project grows beyond that.
