import type {
  AstNode,
  BooleanNode,
  GroupNode,
  LiteralValue,
  NearNode,
  NotNode,
  PropertyRestrictionNode,
  RangeValue,
  TermNode,
} from "../parser/ast.js";
import { findProperty } from "../catalog/index.js";
import type { Property } from "../catalog/types.js";
import {
  getCorpus,
  identityForms,
  isMail,
  type CorpusItem,
  type DocItem,
  type MailItem,
} from "./corpus.js";
import {
  endOfDayUtc,
  parsePointDate,
  resolveDateIntervalUtc,
  startOfDayUtc,
} from "./dates.js";

export interface EvalResult {
  matched: CorpusItem[];
  totalScanned: number;
}

export function evaluate(ast: AstNode | undefined): EvalResult {
  const corpus = getCorpus();
  if (!ast) return { matched: [], totalScanned: corpus.items.length };
  const matched = corpus.items.filter((item) => match(ast, item));
  return { matched, totalScanned: corpus.items.length };
}

function match(node: AstNode, item: CorpusItem): boolean {
  switch (node.kind) {
    case "boolean":
      return matchBoolean(node, item);
    case "not":
      return !match((node as NotNode).expr, item);
    case "near":
      return match((node as NearNode).left, item) && match((node as NearNode).right, item);
    case "group":
      return match((node as GroupNode).expr, item);
    case "conditionMarker":
      return true;
    case "term":
      return matchTerm(node, item);
    case "property":
      return matchProperty(node, item);
  }
}

function matchBoolean(node: BooleanNode, item: CorpusItem): boolean {
  if (node.op === "AND") return match(node.left, item) && match(node.right, item);
  return match(node.left, item) || match(node.right, item);
}

function matchTerm(node: TermNode, item: CorpusItem): boolean {
  const needle = node.value.value.toLowerCase();
  const wildcard = node.value.wildcard;
  const haystacks = fullTextHaystacks(item);
  return haystacks.some((h) => compareText(h, needle, wildcard, "contains"));
}

function matchProperty(node: PropertyRestrictionNode, item: CorpusItem): boolean {
  const property = findProperty(node.property);
  if (!property) return false;

  if (node.value.kind === "range") {
    return matchRange(property, node.value, item);
  }

  const value = node.value;
  switch (node.op) {
    case ":":
    case "=":
      return matchEqualityOrContains(property, value, item);
    case "<>":
      return !matchEqualityOrContains(property, value, item);
    case "<":
    case ">":
    case "<=":
    case ">=":
      return matchOrdered(property, node.op, value, item);
    case "..":
      return false;
  }
}

function matchOrdered(
  property: Property,
  op: "<" | ">" | "<=" | ">=",
  value: LiteralValue,
  item: CorpusItem
): boolean {
  if (property.type === "date") {
    const itemDate = readDate(property, item);
    if (!itemDate) return false;
    const comparand = resolveDateValue(value);
    if (!comparand) return false;
    const c = typeof comparand === "string" ? undefined : comparand;
    if (!c) return false;
    const ref = op === ">" || op === ">=" ? c.start : c.end;
    return compareNumeric(itemDate.getTime(), op, ref.getTime());
  }
  if (property.type === "number") {
    const itemNum = readNumber(property, item);
    if (itemNum === undefined) return false;
    const comparandNum = Number(value.value);
    if (Number.isNaN(comparandNum)) return false;
    return compareNumeric(itemNum, op, comparandNum);
  }
  return false;
}

function matchEqualityOrContains(
  property: Property,
  value: LiteralValue,
  item: CorpusItem
): boolean {
  const v = value.value;
  switch (property.type) {
    case "date": {
      const itemDate = readDate(property, item);
      if (!itemDate) return false;
      const window = resolveDateValue(value);
      if (!window) return false;
      return itemDate >= window.start && itemDate <= window.end;
    }
    case "number": {
      const itemNum = readNumber(property, item);
      if (itemNum === undefined) return false;
      return itemNum === Number(v);
    }
    case "boolean": {
      const itemBool = readBoolean(property, item);
      if (itemBool === undefined) return false;
      const target = v.toLowerCase() === "true";
      return itemBool === target;
    }
    case "enum": {
      const itemStr = readString(property, item);
      return itemStr ? itemStr.toLowerCase() === v.toLowerCase() : false;
    }
    case "recipient":
      return matchRecipient(property, value, item);
    case "text":
    case "url":
    default: {
      const itemStr = readString(property, item);
      if (!itemStr) return false;
      return compareText(itemStr, v, value.wildcard, "contains");
    }
  }
}

function matchRange(
  property: Property,
  range: RangeValue,
  item: CorpusItem
): boolean {
  if (property.type === "date") {
    const itemDate = readDate(property, item);
    if (!itemDate) return false;
    const start = resolveDateValue(range.from);
    const end = resolveDateValue(range.to);
    if (!start || !end) return false;
    return itemDate >= start.start && itemDate <= end.end;
  }
  if (property.type === "number") {
    const itemNum = readNumber(property, item);
    if (itemNum === undefined) return false;
    const lo = Number(range.from.value);
    const hi = Number(range.to.value);
    return itemNum >= lo && itemNum <= hi;
  }
  return false;
}

function matchRecipient(
  property: Property,
  value: LiteralValue,
  item: CorpusItem
): boolean {
  if (!isMail(item)) return false;
  const candidates = recipientFields(property, item);
  const needle = value.value.toLowerCase();
  const forms = identityForms(needle);
  const tryMatch = (addr: string) => {
    const a = addr.toLowerCase();
    if (a === needle) return true;
    for (const f of forms) if (a === f) return true;
    if (a.includes(needle)) return true;
    return false;
  };
  return candidates.some(tryMatch);
}

function recipientFields(property: Property, item: MailItem): string[] {
  switch (property.name.toLowerCase()) {
    case "from":
    case "sender":
      return [item.from];
    case "to":
      return item.to;
    case "cc":
      return item.cc;
    case "bcc":
      return item.bcc;
    case "recipients":
      return [...item.to, ...item.cc, ...item.bcc];
    case "participants":
      return [item.from, ...item.to, ...item.cc, ...item.bcc];
    case "sharedwithusersowsuser":
      return [];
    default:
      return [];
  }
}

function readString(property: Property, item: CorpusItem): string | undefined {
  const field = mapProperty(property, item);
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return field.join(" ");
  return undefined;
}

function readNumber(property: Property, item: CorpusItem): number | undefined {
  const field = mapProperty(property, item);
  return typeof field === "number" ? field : undefined;
}

function readBoolean(property: Property, item: CorpusItem): boolean | undefined {
  const field = mapProperty(property, item);
  return typeof field === "boolean" ? field : undefined;
}

function readDate(property: Property, item: CorpusItem): Date | undefined {
  const field = mapProperty(property, item);
  if (typeof field !== "string") return undefined;
  return parsePointDate(field);
}

function mapProperty(property: Property, item: CorpusItem): unknown {
  const name = property.name.toLowerCase();
  const itemMail = item as MailItem;
  const itemDoc = item as DocItem;
  switch (name) {
    case "kind":
      return item.kind;
    case "subject":
    case "subjecttitle":
      return (
        (itemMail.subject as string | undefined) ?? (itemDoc.title as string | undefined) ?? ""
      );
    case "title":
      return itemDoc.title ?? itemMail.subject;
    case "from":
    case "sender":
      return itemMail.from;
    case "to":
      return itemMail.to;
    case "cc":
      return itemMail.cc;
    case "bcc":
      return itemMail.bcc;
    case "recipients":
      return [...(itemMail.to ?? []), ...(itemMail.cc ?? []), ...(itemMail.bcc ?? [])];
    case "participants":
      return [
        itemMail.from,
        ...(itemMail.to ?? []),
        ...(itemMail.cc ?? []),
        ...(itemMail.bcc ?? []),
      ];
    case "sent":
      return itemMail.sent;
    case "received":
      return itemMail.received;
    case "hasattachment":
      return itemMail.hasAttachment;
    case "attachmentnames":
      return itemMail.attachmentNames;
    case "importance":
      return itemMail.importance;
    case "isread":
      return itemMail.isRead;
    case "category":
      return itemMail.category;
    case "size":
      return item.kind === "docs" ? itemDoc.size : itemMail.size;
    case "date":
      return item.kind === "docs" ? itemDoc.lastModifiedTime : itemMail.sent;
    case "filename":
      return itemDoc.filename;
    case "fileextension":
    case "filetype":
      return itemDoc.fileExtension;
    case "author":
      return itemDoc.author;
    case "createdby":
      return itemDoc.createdBy;
    case "modifiedby":
      return itemDoc.modifiedBy;
    case "created":
      return itemDoc.created;
    case "lastmodifiedtime":
      return itemDoc.lastModifiedTime;
    case "contenttype":
      return itemDoc.contentType;
    case "detectedlanguage":
      return itemDoc.detectedLanguage;
    default:
      return undefined;
  }
}

function resolveDateValue(value: LiteralValue): { start: Date; end: Date } | undefined {
  if (value.form === "date") {
    const d = parsePointDate(value.value);
    if (!d) return undefined;
    return { start: startOfDayUtc(d), end: endOfDayUtc(d) };
  }
  const interval = resolveDateIntervalUtc(value.value);
  if (interval) return interval;
  const parsed = parsePointDate(value.value);
  if (parsed) return { start: startOfDayUtc(parsed), end: endOfDayUtc(parsed) };
  return undefined;
}

function compareNumeric(
  a: number,
  op: "<" | ">" | "<=" | ">=",
  b: number
): boolean {
  switch (op) {
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
  }
}

function compareText(
  haystack: string,
  needle: string,
  wildcard: boolean,
  mode: "contains" | "equals"
): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (wildcard) {
    return h.includes(n);
  }
  return mode === "equals" ? h === n : h.includes(n);
}

function fullTextHaystacks(item: CorpusItem): string[] {
  if (isMail(item)) {
    return [
      item.subject ?? "",
      item.body ?? "",
      item.from ?? "",
      ...(item.to ?? []),
      ...(item.cc ?? []),
      ...(item.attachmentNames ?? []),
    ];
  }
  const doc = item as DocItem;
  return [doc.filename, doc.title, doc.author, doc.body];
}
