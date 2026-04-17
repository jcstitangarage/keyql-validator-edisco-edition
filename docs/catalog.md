# The eDiscovery property catalog

File: [`data/ediscovery-properties.json`](../data/ediscovery-properties.json)

The catalog is the single source of truth for what the tool considers
a valid eDiscovery KeyQL query. The parser doesn't know or care about
property semantics; the validator, autocompletion, condition builder,
and operator legend all read from this JSON. That means refreshing the
catalog is usually the only step needed when Microsoft updates the
eDiscovery docs.

## What's in it

```
meta                     (sources, notes, captured-on dates)
booleanOperators         (AND, OR, NOT, NEAR)
propertyOperators        (:, =, <>, <, >, <=, >=, ..)
conditionBuilderOperators (After, Before, Between, Contains any of, ...)
wildcards                (prefix only; suffix/infix/substring unsupported)
dateFormats              (ISO formats accepted by eDiscovery)
dateIntervals            (today, yesterday, this week, this month, ...)
kindValues               (email, docs, microsoftteams, im, voicemail, ...)
specialCharacters        (reserved chars that must be quoted)
recipientExpansion       (how recipient queries expand under the hood)
properties               (62 entries — the main list)
limits                   (4000-char / 2048-char query size ceilings)
searchTips               (short list of eDiscovery-specific gotchas)
```

Every property entry looks like this:

```json
{
  "name": "From",
  "category": "mail",
  "type": "recipient",
  "operators": [":", "=", "<>"],
  "description": "Sender of an email message. Accepts UPN, alias, or display name.",
  "examples": ["from:pilarp@contoso.com", "from:\"Pilar Pinilla\""],
  "recipientExpansion": true,
  "appliesTo": ["classic", "new"]
}
```

Fields:

| Field                    | Meaning                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `name`                   | Canonical property name (case-insensitive when queried).           |
| `category`               | `mail` / `document` / `common` / `contact` — drives UI grouping.   |
| `type`                   | `text` / `recipient` / `date` / `number` / `boolean` / `enum` / `url`.|
| `operators`              | Operators Microsoft documents as valid for this property.          |
| `values` / `valuesRef`   | Enum value list (inline or by reference to `kindValues`).          |
| `recipientExpansion`     | If `true`, eDiscovery expands UPN → alias, display name, LegacyExchangeDN. |
| `appliesTo`              | Which eDiscovery experience exposes this property.                 |
| `premium`                | `true` for eDiscovery Premium-only conditions.                     |
| `aliases`                | Alternate spellings — e.g. `"Last modified"` for `LastModifiedTime`.|
| `examples`               | Copy-paste-ready query fragments used in the condition builder samples. |

## Where the data came from

The catalog was captured on **2026-04-16** from five Microsoft Learn /
Open Specifications sources. The full list is in the catalog's
`meta.sources` array and is rendered live in the "Official references"
sidebar of the app.

| Source                                             | Doc last updated | What we pull from it                                     |
| -------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| Use the condition builder (new experience)         | 2026-04-13       | Property list, condition operators, conditions for premium |
| Use KeyQL to create search queries (new)           | 2026-04-13       | Editor behavior, autocomplete / value-suggestion shape   |
| Keyword queries and search conditions (21Vianet)   | 2026-03-16       | Classic property list, recipient expansion, examples     |
| KeyQL syntax reference (SharePoint dev)            | 2025-10-01       | Operators, date formats, wildcards, grouping rules       |
| [MS-KQL] protocol specification                    | 2022-02-15       | Formal grammar reference (Open Specifications Promise)   |

## Refreshing the catalog

Microsoft updates the eDiscovery docs regularly. When they do:

1. Check the `meta.sources[].docLastUpdated` entries in the JSON
   against the current MS Learn pages. The "Official references" panel
   in the deployed app surfaces these dates on page load so the drift
   is visible.
2. For each changed page, read the diff. The common changes are:
   - New property appearing (e.g. a Premium-only condition)
   - Existing property getting a new operator or new enum value
   - A property getting deprecated (marked with a banner on the page)
3. Edit `data/ediscovery-properties.json` to match:
   - New property → add a new entry in `properties[]`, include
     `appliesTo`, `type`, `operators`, at least one `example`
   - Changed operator → update the `operators` array on the entry
   - New enum value → update `values` (or `kindValues` for `Kind`)
   - Deprecation → keep the entry for backwards-compat but remove the
     experience from `appliesTo`, or delete if truly gone
4. Update `meta.sources[]`:
   - Bump `capturedOn` to today's date
   - Update each page's `docLastUpdated` to match the current page's
     `updated_at` frontmatter
5. Run the scenarios round-trip test — it re-parses and re-validates
   every bundled scenario, catching any catalog change that breaks an
   existing query shape:

   ```bash
   npm test
   ```

6. If you added a new property type or a new operator symbol, you may
   also need to teach:
   - `src/parser/tokens.ts` (new operator symbol)
   - `src/parser/parser.ts` (new grammar production)
   - `src/validator/index.ts` (any new semantic rule)
   - `src/evaluator/index.ts` (matching logic for the new type)

   For additive property changes, none of these usually need edits.

## What's intentionally not in the catalog

The tool is scoped to the eDiscovery surface. The catalog intentionally
omits properties that SharePoint Search exposes but eDiscovery does
not honor — `ManagedProperties`, `XRANK` tuning parameters, and the
long tail of SharePoint managed-property plumbing. If you see a
property in the MS-KQL spec but not in the catalog, that's why.

## Checking the catalog renders correctly

Open the running app, expand the **Operator reference** panel inside
the Condition Builder. If every operator grouping, every enum dropdown
(Kind, Importance, Category, HasAttachment), and every recipient
sample matches what Microsoft Learn currently shows, the refresh is
complete.
