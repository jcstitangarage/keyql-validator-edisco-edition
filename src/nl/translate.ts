import { getSyntheticPool, type SyntheticIdentity } from "../ui/scenarios.js";

export interface NLStep {
  phrase: string;
  keyql: string;
  explanation: string;
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
}

const KIND_WORDS: Array<{ words: string[]; value: string; label: string }> = [
  { words: ["email", "emails", "mail", "mails", "message", "messages"], value: "email", label: "Exchange mail" },
  { words: ["document", "documents", "doc", "docs", "file", "files"], value: "docs", label: "SharePoint/OneDrive documents" },
  { words: ["teams", "teams chat", "teams chats", "teams message", "teams messages"], value: "microsoftteams", label: "Microsoft Teams" },
  { words: ["im", "ims", "skype", "skype chat", "skype chats"], value: "im", label: "Skype / instant messaging" },
  { words: ["voicemail", "voicemails"], value: "voicemail", label: "voicemail" },
  { words: ["meeting", "meetings"], value: "meetings", label: "meetings" },
];

const RELATIVE_INTERVALS: Record<string, string> = {
  today: "today",
  yesterday: "yesterday",
  "this week": "this week",
  "this month": "this month",
  "last month": "last month",
  "this year": "this year",
  "last year": "last year",
};

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

export function translate(input: string): NLTranslation {
  const steps: NLStep[] = [];
  const warnings: NLWarning[] = [];
  const pool = getSyntheticPool();

  let remaining = ` ${input.trim()} `.replace(/\s+/g, " ");
  const originalTrim = input.trim();
  const parts: string[] = [];

  const consume = (pattern: RegExp, handler: (match: RegExpMatchArray) => void) => {
    const match = remaining.match(pattern);
    if (match) {
      handler(match);
      remaining = (remaining.slice(0, match.index!) + " " + remaining.slice(match.index! + match[0].length)).replace(
        /\s+/g,
        " "
      );
    }
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
        });
        remaining = remaining.replace(pat, " ");
        break;
      }
    }
    if (parts.some((p) => p.startsWith("kind:"))) break;
  }

  // 2. from / sent by
  consume(/\b(?:from|sent by|by\s+sender)\s+([A-Za-z][A-Za-z0-9_.\-@"' ]+?)(?=\s+(?:to|and|about|containing|mentioning|regarding|with|without|larger|bigger|smaller|over|under|since|before|after|between|from|in|last|this|today|yesterday|of|of\s+type|filetype|type|\.docx|\.pdf|\.xlsx|\.pptx)\b|$)/i, (m) => {
    const name = m[1]!.trim().replace(/^["']|["']$/g, "");
    const resolved = resolveIdentity(name, pool.identities);
    if (resolved) {
      parts.push(`from:${formatValue(resolved.upn)}`);
      steps.push({
        phrase: `from ${name}`,
        keyql: `from:${resolved.upn}`,
        explanation: `Matched "${name}" → ${resolved.displayName} (${resolved.upn}).`,
      });
    } else {
      warnings.push({
        phrase: name,
        message: `No synthetic identity matches "${name}". Pick a name from the synthetic data panel so you don't echo a real user.`,
      });
    }
  });

  // 3. to
  consume(/\bto\s+([A-Za-z][A-Za-z0-9_.\-@"' ]+?)(?=\s+(?:and|about|containing|mentioning|regarding|with|without|larger|bigger|smaller|over|under|since|before|after|between|from|in|last|this|today|yesterday|of|of\s+type|filetype|type)\b|$)/i, (m) => {
    const name = m[1]!.trim().replace(/^["']|["']$/g, "");
    const resolved = resolveIdentity(name, pool.identities);
    if (resolved) {
      parts.push(`to:${formatValue(resolved.upn)}`);
      steps.push({
        phrase: `to ${name}`,
        keyql: `to:${resolved.upn}`,
        explanation: `Matched recipient "${name}" → ${resolved.displayName} (${resolved.upn}).`,
      });
    } else {
      warnings.push({
        phrase: name,
        message: `No synthetic identity matches "${name}" as recipient.`,
      });
    }
  });

  // 4. author (for docs): "by X" or "authored by X"
  if (parts.some((p) => p === "kind:docs")) {
    consume(/\b(?:authored by|written by|by)\s+([A-Za-z][A-Za-z0-9_.\-@"' ]+?)(?=\s+(?:and|about|containing|mentioning|regarding|with|without|larger|bigger|smaller|over|under|since|before|after|between|in|last|this|today|yesterday|of|of\s+type|filetype|type)\b|$)/i, (m) => {
      const name = m[1]!.trim().replace(/^["']|["']$/g, "");
      const resolved = resolveIdentity(name, pool.identities);
      if (resolved) {
        parts.push(`author:${formatValue(resolved.displayName)}`);
        steps.push({
          phrase: `by ${name}`,
          keyql: `author:"${resolved.displayName}"`,
          explanation: `For documents, "by" resolves to Author → ${resolved.displayName}.`,
        });
      } else {
        warnings.push({ phrase: name, message: `No synthetic author matches "${name}".` });
      }
    });
  }

  // 5. Attachments
  if (/\b(with attachments?|having attachments?|has attachments?)\b/i.test(remaining)) {
    parts.push("hasattachment:true");
    steps.push({ phrase: "with attachments", keyql: "hasattachment:true", explanation: "Items that include at least one attachment." });
    remaining = remaining.replace(/\b(with attachments?|having attachments?|has attachments?)\b/gi, " ");
  } else if (/\b(without attachments?|no attachments?)\b/i.test(remaining)) {
    parts.push("hasattachment:false");
    steps.push({ phrase: "without attachments", keyql: "hasattachment:false", explanation: "Items with no attachments." });
    remaining = remaining.replace(/\b(without attachments?|no attachments?)\b/gi, " ");
  }

  // 6. Importance
  if (/\b(high|urgent)\s+(importance|priority)\b/i.test(remaining)) {
    parts.push("importance:high");
    steps.push({ phrase: "high importance", keyql: "importance:high", explanation: "High-importance flag." });
    remaining = remaining.replace(/\b(high|urgent)\s+(importance|priority)\b/gi, " ");
  }

  // 7. Size: "larger than N", "over N bytes/KB/MB"
  consume(/\b(?:larger than|bigger than|over)\s+(\d+)\s*(kb|mb|gb|bytes?|b)?\b/i, (m) => {
    const n = parseInt(m[1]!, 10);
    const unit = (m[2] ?? "").toLowerCase();
    const bytes = toBytes(n, unit);
    parts.push(`size>${bytes}`);
    steps.push({ phrase: m[0]!.trim(), keyql: `size>${bytes}`, explanation: `Size greater than ${bytes} bytes.` });
  });
  consume(/\b(?:smaller than|under|less than)\s+(\d+)\s*(kb|mb|gb|bytes?|b)?\b/i, (m) => {
    const n = parseInt(m[1]!, 10);
    const unit = (m[2] ?? "").toLowerCase();
    const bytes = toBytes(n, unit);
    parts.push(`size<${bytes}`);
    steps.push({ phrase: m[0]!.trim(), keyql: `size<${bytes}`, explanation: `Size less than ${bytes} bytes.` });
  });

  // 8. File type
  consume(/\b(?:of type|file ?type|filetype|type)\s+(\w+)\b/i, (m) => {
    const raw = m[1]!.toLowerCase();
    const normalized = FILETYPE_WORDS[raw] ?? raw;
    parts.push(`filetype:${normalized}`);
    steps.push({ phrase: m[0]!.trim(), keyql: `filetype:${normalized}`, explanation: `File type restriction.` });
  });
  // bare ".docx files" / "docx files"
  consume(/\b\.?(docx?|xlsx?|pptx?|pdf|txt)\s+files?\b/i, (m) => {
    const raw = m[1]!.toLowerCase();
    parts.push(`filetype:${raw}`);
    steps.push({ phrase: m[0]!.trim(), keyql: `filetype:${raw}`, explanation: `File type restriction.` });
  });

  // 9. Date ranges
  consume(/\bbetween\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})\b/i, (m) => {
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}:${m[1]}..${m[2]}`;
    parts.push(expr);
    steps.push({ phrase: m[0]!, keyql: expr, explanation: `Inclusive date range on ${datePropKey}.` });
  });
  consume(/\bsince\s+(\d{4}-\d{2}-\d{2})\b/i, (m) => {
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>=${m[1]}`;
    parts.push(expr);
    steps.push({ phrase: m[0]!, keyql: expr, explanation: `${datePropKey} on/after ${m[1]}.` });
  });
  consume(/\bafter\s+(\d{4}-\d{2}-\d{2})\b/i, (m) => {
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}>${m[1]}`;
    parts.push(expr);
    steps.push({ phrase: m[0]!, keyql: expr, explanation: `${datePropKey} after ${m[1]}.` });
  });
  consume(/\bbefore\s+(\d{4}-\d{2}-\d{2})\b/i, (m) => {
    const datePropKey = dateProperty(parts);
    const expr = `${datePropKey}<${m[1]}`;
    parts.push(expr);
    steps.push({ phrase: m[0]!, keyql: expr, explanation: `${datePropKey} before ${m[1]}.` });
  });
  // Relative intervals
  for (const interval of Object.keys(RELATIVE_INTERVALS)) {
    const pat = new RegExp(`\\b${escapeRegex(interval)}\\b`, "i");
    if (pat.test(remaining)) {
      const datePropKey = dateProperty(parts);
      const expr = `${datePropKey}:${interval.includes(" ") ? `"${interval}"` : interval}`;
      parts.push(expr);
      steps.push({ phrase: interval, keyql: expr, explanation: `${datePropKey} within the ${interval} interval.` });
      remaining = remaining.replace(pat, " ");
      break;
    }
  }

  // 10. Keywords: "about X", "containing X", "mentioning X", "regarding X"
  const keywordMatches = Array.from(
    remaining.matchAll(/\b(?:about|containing|mentioning|regarding)\s+("[^"]+"|\S+)/gi)
  );
  for (const m of keywordMatches) {
    const raw = m[1]!.replace(/^["']|["']$/g, "");
    const out = needsQuoting(raw) ? `"${raw}"` : raw;
    parts.push(out);
    steps.push({ phrase: m[0]!, keyql: out, explanation: `Free-text keyword "${raw}" (searches subject+body).` });
    remaining = remaining.replace(m[0]!, " ");
  }

  // Tidy remaining
  remaining = remaining.replace(/\b(with|and|the|a|an)\b/gi, " ").replace(/\s+/g, " ").trim();

  // What's left over: unmatched phrase
  const unmatchedTokens = remaining
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t.toLowerCase()));
  const unmatched = unmatchedTokens.join(" ").trim();
  if (unmatched) {
    warnings.push({
      phrase: unmatched,
      message: `Didn't recognize: "${unmatched}". The translator handles sender/recipient, date windows, file types, attachments, size, and keywords prefixed with "about"/"containing"/"mentioning".`,
    });
  }

  if (parts.length === 0 && originalTrim.length > 0) {
    warnings.push({
      phrase: originalTrim,
      message: "Couldn't translate the request. Try: \"emails from Pilar to Garth about Tradewinds last month with attachments\".",
    });
  }

  return {
    keyql: parts.join(" AND "),
    steps,
    warnings,
    unmatched,
  };
}

function dateProperty(parts: string[]): string {
  if (parts.includes("kind:docs")) return "lastmodifiedtime";
  return "sent";
}

function resolveIdentity(
  needle: string,
  identities: SyntheticIdentity[]
): SyntheticIdentity | undefined {
  const n = needle.trim().toLowerCase();
  if (!n) return undefined;

  for (const id of identities) {
    if (id.upn.toLowerCase() === n) return id;
  }
  for (const id of identities) {
    const alias = id.upn.split("@")[0]!.toLowerCase();
    if (alias === n) return id;
  }
  for (const id of identities) {
    if (id.displayName.toLowerCase() === n) return id;
  }
  for (const id of identities) {
    const firstName = id.displayName.split(/\s+/)[0]!.toLowerCase();
    if (firstName === n) return id;
  }
  for (const id of identities) {
    if (id.displayName.toLowerCase().includes(n)) return id;
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
