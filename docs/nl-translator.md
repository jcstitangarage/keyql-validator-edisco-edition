# Natural-language translator

Module: [`src/nl/translate.ts`](../src/nl/translate.ts)

The NL panel lets a user type something like
`emails from Pilar to Garth about Tradewinds last month with attachments`
and get back a KeyQL query plus a per-phrase breakdown of what was
recognized.

The translator is **pattern-based and deterministic** — it does not
call any model, does not send data anywhere, and does not need a key.
Every phrase either matches one of the documented patterns below or is
surfaced as an "unrecognized" warning. That determinism is a deliberate
design choice: an eDiscovery query builder that can hallucinate
properties is worse than one that admits ignorance.

## Supported patterns

### Kind

| English                                                 | KeyQL                  |
| ------------------------------------------------------- | ---------------------- |
| `email(s)`, `mail(s)`, `message(s)`                     | `kind:email`           |
| `document(s)`, `doc(s)`, `file(s)`                      | `kind:docs`            |
| `teams`, `teams chat(s)`, `teams message(s)`            | `kind:microsoftteams`  |
| `im`, `ims`, `skype`, `skype chat(s)`                   | `kind:im`              |
| `voicemail(s)`                                          | `kind:voicemail`       |
| `meeting(s)`                                            | `kind:meetings`        |

### Sender / recipient / author

| English                                   | KeyQL                                       |
| ----------------------------------------- | ------------------------------------------- |
| `from X`, `sent by X`, `by sender X`      | `from:<resolved>`                           |
| `to X`                                    | `to:<resolved>`                             |
| `by X` (only when `kind:docs` is present) | `author:"<display name>"`                   |
| `authored by X`, `written by X`           | `author:"<display name>"`                   |

`X` is matched against the synthetic-identity pool:

1. Exact UPN (`pilarp@contoso.com`)
2. Alias (`pilarp`)
3. Display name (`Pilar Pinilla`)
4. First name (`Pilar`)
5. Substring in either direction

If none match, the translator **substitutes** the next identity from
the pool (rotating for multiple unknowns in one input) and emits a
**substituted** note in orange. The unknown name is never echoed into
the generated KeyQL — that guardrail is asserted by tests. This keeps
the tool usable as a scratchpad without risking a real identity
leaking into a draft query.

### Dates

The translator accepts dates in three formats:

| Format          | Example                   |
| --------------- | ------------------------- |
| ISO             | `2025-03-31`              |
| US slash        | `03/31/2025`              |
| Year-only       | `2025`                    |

Combined with these verbs:

| English                                            | KeyQL                                    |
| -------------------------------------------------- | ---------------------------------------- |
| `between <d1> and <d2>`                            | `sent:<d1>..<d2>` (ISO-normalized)       |
| `<d1> to <d2>`                                     | `sent:<d1>..<d2>`                        |
| `<d1> to date`, `<d1> to today`, `<d1> to now`     | `sent>=<d1>` (open-ended)                |
| `since <d>`                                        | `sent>=<d>`                              |
| `after <d>`                                        | `sent><d>`                               |
| `before <d>`                                       | `sent<<d>`                               |
| `in YYYY`                                          | `sent:YYYY-01-01..YYYY-12-31`            |
| `after YYYY`                                       | `sent>YYYY-12-31`                        |
| `before YYYY`                                      | `sent<YYYY-01-01`                        |
| `since YYYY`                                       | `sent>=YYYY-01-01`                       |
| `today`, `yesterday`, `this week`, `this month`, `last month`, `this year`, `last year` | `sent:<interval>` |

If the query is about documents (`kind:docs` was recognized), all of
the above use `lastmodifiedtime` instead of `sent`.

### Size

| English                                            | KeyQL                   |
| -------------------------------------------------- | ----------------------- |
| `larger than N`, `bigger than N`, `over N`         | `size>N` (bytes)        |
| `smaller than N`, `under N`, `less than N`         | `size<N`                |

Size units are normalized to bytes:

| Unit    | Multiplier      |
| ------- | --------------- |
| `b`, `bytes` | 1             |
| `kb`    | 1,024           |
| `mb`    | 1,048,576       |
| `gb`    | 1,073,741,824   |

### File types

| English                                                   | KeyQL               |
| --------------------------------------------------------- | ------------------- |
| `of type docx`, `file type xlsx`, `filetype pdf`          | `filetype:<ext>`    |
| `.docx files`, `docx files`, `word files`, `excel files`  | `filetype:<ext>`    |

`word` / `excel` / `powerpoint` / `pdf` / `txt` are all normalized to
the canonical extension.

### Attachments

| English                                     | KeyQL                  |
| ------------------------------------------- | ---------------------- |
| `with attachments`, `has attachments`       | `hasattachment:true`   |
| `without attachments`, `no attachments`     | `hasattachment:false`  |

### Importance

| English                                    | KeyQL                |
| ------------------------------------------ | -------------------- |
| `high importance`, `urgent priority`       | `importance:high`    |

### Keywords

| English                                        | KeyQL                              |
| ---------------------------------------------- | ---------------------------------- |
| `about X`, `containing X`, `mentioning X`, `regarding X` | `X` as a free-text term |

Quoted phrases are preserved. Trailing punctuation (`,`, `.`, `;`,
`:`, `!`, `?`) is stripped before emitting the term to avoid lex
errors.

## Combining multiple patterns

Every recognized pattern appends one condition to the KeyQL via `AND`.
The translator tries patterns in this order:

1. Kind
2. Date ranges (pre-pass, so `01/01/2022 to date` isn't mis-parsed as a
   recipient)
3. `from` / `sent by`
4. `to`
5. `author` (only if `kind:docs`)
6. Attachments
7. Importance
8. Size
9. File type
10. Single-anchor dates (`since` / `after` / `before` / year-only /
    relative intervals)
11. Keywords (`about` / `containing` / `mentioning` / `regarding`)

Each successful match removes that fragment from the remaining input.
Anything left over is reported as an "unmatched" warning so the user
knows it was ignored.

## Output shape

```ts
interface NLTranslation {
  keyql: string;               // AND-joined conditions
  steps: NLStep[];             // per-phrase explanations
  warnings: NLWarning[];       // unmatched phrases, guidance
  unmatched: string;           // any leftover tokens
  substitutions: number;       // count of unknown names substituted
}

interface NLStep {
  phrase: string;              // the user's phrase
  keyql: string;               // what it translated to
  explanation: string;
  severity: "ok" | "substituted" | "warn";
}
```

The UI renders `ok` steps in green, `substituted` in orange, and
warnings in yellow. The user can then hit **Apply to editor** to push
the translated KeyQL into CodeMirror, where it parses, validates, and
dry-runs like any other query.

## What's explicitly not supported

- **General English.** There is no part-of-speech tagger. "Anything
  from last week that Garth sent me" won't parse; use the documented
  verbs (`emails from Garth last week`).
- **Multiple senders / recipients in one phrase.** `from Pilar or
  Garth` picks only Pilar. Use the condition builder for compound
  recipient lists.
- **Conditional logic beyond AND.** The translator only emits
  AND-joined conditions. If you want `(kind:email OR kind:im)`, type
  it in the editor.
- **Boolean negation.** `not from X` doesn't translate; use the
  condition builder or type `NOT from:X` directly.
- **Subject phrase matching.** `emails with subject "Q1 Financials"`
  isn't a recognized pattern — use `about "Q1 Financials"` for a
  free-text hit.

If you find a phrasing that would be obviously useful and is missing,
an issue or PR adding the pattern is welcome. Each new pattern should
come with a test that round-trips through parse + validate so it can't
silently produce invalid KeyQL.
