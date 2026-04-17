import raw from "../../data/mock-corpus.json" with { type: "json" };

export interface Identity {
  upn: string;
  alias: string;
  displayName: string;
}

export interface MailItem {
  id: string;
  kind: "email" | "im" | "microsoftteams" | string;
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  sent: string;
  received: string;
  hasAttachment: boolean;
  attachmentNames: string[];
  importance: "high" | "medium" | "low" | string;
  isRead: boolean;
  category?: string;
  size: number;
}

export interface DocItem {
  id: string;
  kind: "docs";
  filename: string;
  fileExtension: string;
  title: string;
  author: string;
  createdBy: string;
  modifiedBy: string;
  created: string;
  lastModifiedTime: string;
  size: number;
  contentType: string;
  detectedLanguage: string;
  body: string;
}

export type CorpusItem = MailItem | DocItem;

interface CorpusData {
  meta: { description: string; domains: string[]; generated: string };
  identities: Identity[];
  items: CorpusItem[];
}

const corpus = raw as unknown as CorpusData;

const identityIndex = new Map<string, Identity>();
for (const id of corpus.identities) {
  identityIndex.set(id.upn.toLowerCase(), id);
  identityIndex.set(id.alias.toLowerCase(), id);
  identityIndex.set(id.displayName.toLowerCase(), id);
}

export function getCorpus(): CorpusData {
  return corpus;
}

export function resolveIdentity(needle: string): Identity | undefined {
  return identityIndex.get(needle.toLowerCase());
}

export function identityForms(upn: string): string[] {
  const id = identityIndex.get(upn.toLowerCase());
  if (!id) return [upn.toLowerCase()];
  return [id.upn, id.alias, id.displayName].map((s) => s.toLowerCase());
}

export function isMail(item: CorpusItem): item is MailItem {
  return item.kind !== "docs";
}

export function isDoc(item: CorpusItem): item is DocItem {
  return item.kind === "docs";
}
