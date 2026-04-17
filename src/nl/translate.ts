import { getSyntheticPool, type SyntheticIdentity } from "../ui/scenarios.js";

export type NLNoteSeverity = "ok" | "substituted" | "warn";

export interface NLStep {
  phrase: string;
  keyql: string;
  explanation: string;
  severity: NLNoteSeverity;
}

export interface NLWarning {
  phrase: string;
  message: string;
}

export interface NLTranslation {
  keyql: string;
  steps: NLStep[];
  warnings: NLWarning[];
  unmatched: string;
  substitutions: number;
}

const KIND_WORDS: Array<{ words: string[]; value: string; label: string }> = [
  { words: ["email", "emails", "mail", "mails", "message", "messages"], value: "email", label: "Exchange mail" },
  { words: ["document", "documents", "doc", "docs", "file", "files"], value: "docs", label: "SharePoint/OneDrive documents" },
  { words: ["teams", "teams chat", "teams chats", "teams message", "teams messages"], value: "microsoftteams", label: "Microsoft Teams" },
  { words: ["im", "ims", "skype", "skype chat", "skype chats"], value: "im", label: "Skype / instant messaging" },
  { words: ["voicemail", "voicemails"], value: "voicemail", label: "voicemail" },
  { words: ["meeting", "meetings"], value: "meetings", label: "meetings" },
];

const RELATIVE_INTERVALS = [
  "today",
  "yesterday",
  "this week",
  "this month",
  "last month",
  "this year",
  "last year",
];

const FILETYPE_WORDS: Record<string, string> = {
  docx: "docx",
  doc: "doc",
  pdf: "pdf",
  pdfs: "pdf",
  xlsx: "xlsx",
  xls: "xls",
  pptx: "pptx",
  ppt: "ppt",
  txt: "txt",
  word: "docx",
  excel: "xlsx",
  powerpoint: "pptx",
};

const STOP_WORDS = new Set(["the", "a", "an", "about", "regarding", "re"]);

// Shared boundary used for stopping greedy identity captures. Any keyword that
// starts a different clause should appear here.
const BOUNDARY_WORDS = [
  "to",
  "from",
  "and",
  "about",
  "containing",
  "mentioning",
  "regarding",
  "with",
  "without",
  "larger",
  "bigger",
  "smaller",
  "over",
  "under",
  "since",
  "before",
  "after",
  "between",
  "in",
  "last",
  "this",
  "today",
  "yesterday",
  "of",
  "type",
  "filetype",
];
const BOUNDARY_REGEX = `(?:${BOUNDARY_WORDS.join("|")}|\\.docx|\\.pdf|\\.xlsx|\\.pptx)`;

const DATE_LITERAL = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}\/\d{1,2}\/\d{1,2})`;

export function translate(input: string): NLTranslation {
  const steps: NLStep[] = [];
  const warnings: NLWarning[] = [];
  const pool = getSyntheticPool();
  const identityIndex = buildIdentityIndex(pool.identities);

  let remaining = ` ${input.trim()} `.replace(/\s+/g, " ");
  const originalTrim = input.trim();
  const parts: string[] = [];
  let substitutionCursor = 0;

  const consume = (pattern: RegExp, handler: (match: RegExpMatchArray) => void) => {
    const match = remaining.match(pattern);
    if (match && match.index !== undefined) {
      handler(match);
      remaining = (
        remaining.slice(0, match.index) +
        " " +
        remaining.slice(match.index + match[0].length)
      ).replace(/\s+/g, " ");
    }
  };

  const addIdentityCondition = (
    property: "from" | "to" | "author",
    rawName: string,
    phrase: string
  ) => {
    const resolved = resolveIdentity(rawName, identityIndex);
    if (resolved) {
      const valueText =
        property === "author" ? resolved.displayName : resolved.upn;
      parts.push(`${property}:${formatValue(valueText)}`);
      steps.push({
        phrase,
        keyql: `${property}:${valueText}`,
        explanation: `Matched "${rawName}" → ${resolved.displayName} (${resolved.upn}).`,
        severity: "ok",
      });
      return;
    }
    const fallback = pool.identities[substitutionCursor % pool.identities.length]!;
    substitutionCursor += 1;
    const valueText = property === "author" ? fallback.displayName : fallback.upn;
    parts.push(`${property}:${formatValue(valueText)}`);
    steps.push({
      phrase,
      keyql: `${property}:${valueText}`,
      explanation: `"${rawName}" isn't in the synthetic pool — substituted ${fallback.displayName} (${fallback.upn}). Pick a synthetic identity from the sidebar to change this.`,
      severity: "substituted",
    });
  };

  // 1. Kind
  for (const kind of KIND_WORDS) {
    for (const word of kind.words) {
      const pat = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      if (pat.test(remaining)) {
        parts.push(`kind:${kind.value}`);
        steps.push({
          phrase: word,
          keyql: `kind:${kind.value}`,
          explanation: `Recognized "${word}" as ${kind.label}.`,
          severity: "ok",
        });
        remaining = remaining.replace(pat, " ");
        break;
      }
    }
    if (parts.some((p) => p.startsWith("kind:"))) break;
  }

  // 1a. Pre-pass for "<date> to <date|today|now>" so the identity "to" pattern
  // below doesn't mis-capture "to date"/"to today"/"to now".
  consume(
    new RegExp(
      String.raw`\b(${DATE_LITERAL})\s+to\s+(${DATE_LITERAL}|date|today|now)\b`,
      "i"
    ),
    (m) => {
      const start = normalizeDate(m[1]!);
      const endRaw = m[2]!.toLowerCase();
      const endIsOpen = endRaw === "date" || endRaw === "today" || endRaw === "now";
      const end = endIsOpen ? undefined : normalizeDate(m[2]!);
      if (!start) return;
      const datePropKey = dateProperty(parts);
      if (end) {
        const expr = `${datePropKey}:${start}..${end}`;
        parts.push(expr);
        steps.push({
          phrase: m[0]!,
          keyql: expr,
          explanation: `Inclusive date range on ${datePropKey}.`,
          severity: "ok",
        });
      } else {
        const expr = `${datePropKey}>=${start}`;
        parts.push(expr);
        steps.push({
          phrase: m[0]!,
          keyql: expr,
          explanation: `${datePropKey} on/after ${start} (open-ended — "to ${endRaw}").`,
          severity: "ok",
        });
      }
    }
  );

  // 2. from / sent by
  consume(identityPattern(["from", "sent by", "by\\s+sender"]), (m) => {
    const name = m[1]!.trim().replace(/^["']|["']$/g, "");
    addIdentityCondition("from", name, `from ${name}`);
  });

  // 3. to
  consume(identityPattern(["to"]), (m) => {
    const name = m[1]!.trim().replace(/^["']|["']$/g, "");
    addIdentityCondition("to", name, `to ${name}`);
  });

  // 4. author (for docs): "by X" or "authored by X"
  if (parts.some((p) => p === "kind:docs")) {
    consume(identityPattern(["authored by", "written by", "by"]), (m) => {
      const name = m[1]!.trim().replace(/^["']|["']$/g, "");
      addIdentityCondition("author", name, `by ${name}`);
    });
  }

  // 5. Attachments
  if (/\b(with attachments?|having attachments?|has attachments?)\b/i.test(remaining)) {
    parts.push("hasattachment:true");
    steps.push({
      phrase: "with attachments",
      keyql: "hasattachment:true",
      explanation: "Items that include at least one attachment.",
      severity: "ok",
    });
    remaining = remaining.replace(/\b(with attachments?|having attachments?|has attachments?)\b/gi, " ");
  } else if (/\b(without attachments?|no attachments?)\b/i.test(remaining)) {
    parts.push("hasattachment:false");
    steps.push({
      phrase: "without attachments",
      keyql: "hasattachment:false",
      explanation: "Items with no attachments.",
      severity: "ok",
    });
    remaining = remaining.replace(/\b(without attachments?|no attachments?)\b/gi, " ");
  }

  // 6. Importance
  if (/\b(high|urgent)\s+(importance|priority)\b/i.test(remaining)) {
    parts.push("importance:high");
    steps.push({
      phrase: "high importance",
      keyql: "importance:high",
      explanation: "High-importance flag.",
      severity: "ok",
    });
    remaining = remaining.replace(/\b(high|urgent)\s+(importance|priority)\b/gi, " ");
  }

  // 7. Size: "larger than N", "over N bytes/KB/MB"
  consume(/\b(?:larger than|bigger than|over)\s+(\d+)\s*(kb|mb|gb|bytes?|b)?\b/i, (m) => {
    const n = parseInt(m[1]!, 10);
    const unit = (m[2] ?? "").toLowerCase();
    const bytes = toBytes(n, unit);
    parts.push(`size>${bytes}`);
    steps.push({
      phrase: m[0]!.trim(),
      keyql: `size>${bytes}`,
      explanation: `Size greater than ${bytes} bytes.`,
      severity: "ok",
    });
  });
  consume(/\b(?:smaller than|under|less than)\s+(\d+)\s*(kb|mb|gb|bytes?|b)?\b/i, (m) => {
    const n = parseInt(m[1]!, 10);
    const unit = (m[2] ?? "").toLowerCase();
    const bytes = toBytes(n, unit);
    parts.push(`size<${bytes}`);
    steps.push({
      phrase: m[0]!.trim(),
      keyql: `size<${bytes}`,
      explanation: `Size less than ${bytes} bytes.`,
      severity: "ok",
    });
  });

  // 8. File type
  consume(/\b(?:of type|file ?type|filetype|type)\s+(\w+)\b/i, (m) => {
    const raw = m[1]!.toLowerCase();
    const normalized = FILETYPE_WORDS[raw] ?? raw;
    parts.push(`filetype:${normalized}`);
    steps.push({
      phrase: m[0]!.trim(),
      keyql: `filetype:${normalized}`,
      explanation: `File type restriction.`,
      severity: "ok",
    });
  });
  consume(/\b\.?(docx?|xlsx?|pptx?|pdf|txt)\s+files?\b/i, (m) => {
    const raw = m[1]!.toLowerCase();
    parts.push(`filetype:${raw}`);
    steps.push({
      phrase: m[0]!.trim(),
      keyql: `filetype:${raw}`,
      explanation: `File type restriction.`,
      severity: "ok",
    });
  });

  // 9. Date ranges (must run before single-date "after/before/since" patterns)

  // "<date> to <date|date|today|now>"  — accepts ISO, US slash, or YYYY/MM/DD
  consume(
    new RegExp(
      String.raw`\b(${DATE_LITERAL})\s+to\s+(${DATE_LITERAL}|date|today|now)\b`,
      "i"
    ),
    (m) => {
      const start = normalizeDate(m[1]!);
      const endRaw = m[2]!.toLowerCase();
      const endIsOpen = endRaw === "date" || endRaw === "today" || endRaw === "now";
      const end = endIsOpen ? undefined : normalizeDate(m[2]!);
      if (!start) return;
      const datePropKey = dateProperty(parts);
      if (end) {
        const expr = `${datePropKey}:${start}..${end}`;
        parts.push(expr);
        steps.push({
          phrase: m[0]!,
          keyql: expr,
          explanation: `Inclusive date range on ${datePropKey}.`,
          severity: "ok",
        });
      } else {
        const expr = `${datePropKey}>=${start}`;
        parts.push(expr);
        steps.push({
          phrase: m[0]!,
          keyql: expr,
          explanation: `${datePropKey} on/after ${start} (open-ended — "to ${endRaw}").`,
          severity: "ok",
        });
      }
    }
  );

  // "between <date> and <date>"  (ISO, slash, or year)
  consume(
    new RegExp(
      String.raw`\bbetween\s+(${DATE_LITERAL})\s+and\s+(${DATE_LITERAL})\b`,
      "i"
    ),
    (m) => {
      const start = normalizeDate(m[1]!);
      const end = normalizeDate(m[2]!);
      if (!start || !end) return;
      const datePropKey = dateProperty(parts);
      const expr = `${datePropKey}:${start}..${end}`;
      parts.push(expr);
      steps.push({
        phrase: m[0]!,
        keyql: expr,
        explanation: `Inclusive date range on ${datePropKey}.`,
        severity: "ok",
      });
    }
  );

  // "since <date>"
  consume(new RegExp(String.raw`\bsince\s+(${DATE_LITERAL})\b`, "i"), (m) => {
    const d = normalizeDate(m[1]!);
    if (!d) return;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>=${d}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} on/after ${d}.`,
      severity: "ok",
    });
  });

  // "after <date>"
  consume(new RegExp(String.raw`\bafter\s+(${DATE_LITERAL})\b`, "i"), (m) => {
    const d = normalizeDate(m[1]!);
    if (!d) return;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>${d}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} after ${d}.`,
      severity: "ok",
    });
  });

  // "before <date>"
  consume(new RegExp(String.raw`\bbefore\s+(${DATE_LITERAL})\b`, "i"), (m) => {
    const d = normalizeDate(m[1]!);
    if (!d) return;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}<${d}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} before ${d}.`,
      severity: "ok",
    });
  });

  // Year-only: "in YYYY"
  consume(/\bin\s+(\d{4})\b/i, (m) => {
    const year = m[1]!;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}:${start}..${end}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} within ${year}.`,
      severity: "ok",
    });
  });

  // Year-only: "after YYYY"
  consume(/\bafter\s+(\d{4})(?!\d|-|\/)\b/i, (m) => {
    const year = m[1]!;
    const boundary = `${year}-12-31`;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>${boundary}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} after end of ${year}.`,
      severity: "ok",
    });
  });

  // Year-only: "before YYYY"
  consume(/\bbefore\s+(\d{4})(?!\d|-|\/)\b/i, (m) => {
    const year = m[1]!;
    const boundary = `${year}-01-01`;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}<${boundary}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} before start of ${year}.`,
      severity: "ok",
    });
  });

  // Year-only: "since YYYY"
  consume(/\bsince\s+(\d{4})(?!\d|-|\/)\b/i, (m) => {
    const year = m[1]!;
    const boundary = `${year}-01-01`;
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>=${boundary}`;
    parts.push(expr);
    steps.push({
      phrase: m[0]!,
      keyql: expr,
      explanation: `${datePropKey} on/after start of ${year}.`,
      severity: "ok",
    });
  });

  // Relative intervals (today, this month, etc.)
  for (const interval of RELATIVE_INTERVALS) {
    const pat = new RegExp(`\\b${escapeRegex(interval)}\\b`, "i");
    if (pat.test(remaining)) {
      const datePropKey = dateProperty(parts);
      const expr = `${datePropKey}:${interval.includes(" ") ? `"${interval}"` : interval}`;
      parts.push(expr);
      steps.push({
        phrase: interval,
        keyql: expr,
        explanation: `${datePropKey} within the ${interval} interval.`,
        severity: "ok",
      });
      remaining = remaining.replace(pat, " ");
      break;
    }
  }

  // 10. Keywords: "about X", "containing X", "mentioning X", "regarding X"
  const keywordMatches = Array.from(
    remaining.matchAll(/\b(?:about|containing|mentioning|regarding)\s+("[^"]+"|\S+)/gi)
  );
  for (const m of keywordMatches) {
    const raw = m[1]!
      .replace(/^["']|["']$/g, "")
      .replace(/[.,;:!?]+$/g, "");
    if (!raw) continue;
    const out = needsQuoting(raw) ? `"${raw}"` : raw;
    parts.push(out);
    steps.push({
      phrase: m[0]!,
      keyql: out,
      explanation: `Free-text keyword "${raw}" (searches subject + body).`,
      severity: "ok",
    });
    remaining = remaining.replace(m[0]!, " ");
  }

  // Tidy remaining
  remaining = remaining.replace(/\b(with|and|the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();

  const unmatchedTokens = remaining
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t.toLowerCase()));
  const unmatched = unmatchedTokens.join(" ").trim();
  if (unmatched) {
    warnings.push({
      phrase: unmatched,
      message: `Didn't recognize: "${unmatched}". The translator handles sender/recipient, date windows (ISO, MM/DD/YYYY, year-only, or "… to date"), file types, attachments, size, and keywords prefixed with "about"/"containing"/"mentioning".`,
    });
  }

  if (parts.length === 0 && originalTrim.length > 0) {
    warnings.push({
      phrase: originalTrim,
      message: 'Couldn\'t translate the request. Try: "emails from Pilar to Garth about Tradewinds last month with attachments".',
    });
  }

  return {
    keyql: parts.join(" AND "),
    steps,
    warnings,
    unmatched,
    substitutions: substitutionCursor,
  };
}

function identityPattern(verbs: string[]): RegExp {
  const verb = verbs.join("|");
  return new RegExp(
    String.raw`\b(?:${verb})\s+([A-Za-z][A-Za-z0-9_.\-@"' ]+?)(?=\s+${BOUNDARY_REGEX}\b|$)`,
    "i"
  );
}

function dateProperty(parts: string[]): string {
  if (parts.includes("kind:docs")) return "lastmodifiedtime";
  return "sent";
}

function buildIdentityIndex(identities: SyntheticIdentity[]): Map<string, SyntheticIdentity> {
  const map = new Map<string, SyntheticIdentity>();
  for (const id of identities) {
    map.set(id.upn.toLowerCase(), id);
    map.set(id.upn.split("@")[0]!.toLowerCase(), id);
    map.set(id.displayName.toLowerCase(), id);
    const firstName = id.displayName.split(/\s+/)[0]!.toLowerCase();
    if (!map.has(firstName)) map.set(firstName, id);
  }
  return map;
}

function resolveIdentity(
  needle: string,
  index: Map<string, SyntheticIdentity>
): SyntheticIdentity | undefined {
  const n = needle.trim().toLowerCase();
  if (!n) return undefined;
  const direct = index.get(n);
  if (direct) return direct;
  for (const [key, id] of index) {
    if (key.includes(n) || n.includes(key)) return id;
  }
  return undefined;
}

function normalizeDate(raw: string): string | undefined {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const usSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usSlash) {
    const mm = usSlash[1]!.padStart(2, "0");
    const dd = usSlash[2]!.padStart(2, "0");
    return `${usSlash[3]}-${mm}-${dd}`;
  }
  const isoSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlash) {
    const mm = isoSlash[2]!.padStart(2, "0");
    const dd = isoSlash[3]!.padStart(2, "0");
    return `${isoSlash[1]}-${mm}-${dd}`;
  }
  return undefined;
}

function toBytes(n: number, unit: string): number {
  switch (unit) {
    case "kb":
      return n * 1024;
    case "mb":
      return n * 1024 * 1024;
    case "gb":
      return n * 1024 * 1024 * 1024;
    default:
      return n;
  }
}

function formatValue(value: string): string {
  return needsQuoting(value) ? `"${value}"` : value;
}

function needsQuoting(value: string): boolean {
  return /\s/.test(value);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
