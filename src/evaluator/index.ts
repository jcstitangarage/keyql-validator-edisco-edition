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
  const haystacks = fullTextHaystacks(item);
  return haystacks.some((h) => h.toLowerCase().includes(needle));
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
    const window = resolveDateValue(value);
    if (!window) return false;
    const ref = op === ">" || op === ">=" ? window.start : window.end;
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
      return itemStr.toLowerCase().includes(v.toLowerCase());
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
  if (name === "kind") return item.kind;
  if (name === "size") return item.size;

  if (isMail(item)) {
    return mapMailProperty(name, item);
  }
  return mapDocProperty(name, item);
}

function mapMailProperty(name: string, item: MailItem): unknown {
  switch (name) {
    case "subject":
    case "subjecttitle":
    case "title":
      return item.subject;
    case "from":
    case "sender":
      return item.from;
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
    case "sent":
    case "date":
      return item.sent;
    case "received":
      return item.received;
    case "hasattachment":
      return item.hasAttachment;
    case "attachmentnames":
      return item.attachmentNames;
    case "importance":
      return item.importance;
    case "isread":
      return item.isRead;
    case "category":
      return item.category;
    default:
      return undefined;
  }
}

function mapDocProperty(name: string, item: DocItem): unknown {
  switch (name) {
    case "subject":
    case "subjecttitle":
    case "title":
      return item.title;
    case "author":
    case "createdby":
      return name === "author" ? item.author : item.createdBy;
    case "modifiedby":
      return item.modifiedBy;
    case "created":
      return item.created;
    case "lastmodifiedtime":
    case "date":
      return item.lastModifiedTime;
    case "filename":
      return item.filename;
    case "fileextension":
    case "filetype":
      return item.fileExtension;
    case "contenttype":
      return item.contentType;
    case "detectedlanguage":
      return item.detectedLanguage;
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
