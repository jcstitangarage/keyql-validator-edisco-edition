import { getCatalog } from "../catalog/index.js";

interface SourceLike {
  title: string;
  url?: string;
  docLastUpdated?: string;
  docAuthoredOn?: string;
  docRevision?: string;
  capturedOn?: string;
  appliesTo?: "new" | "classic" | "reference" | "premium";
}

export function renderReferences(host: HTMLElement): void {
  const sources = (getCatalog().meta.sources as unknown as SourceLike[]) ?? [];
  host.replaceChildren();
  for (const src of sources) {
    const li = document.createElement("li");
    li.className = "reference-item";

    const titleLine = document.createElement("div");
    if (src.appliesTo) {
      const badge = document.createElement("span");
      badge.className = `applies ${src.appliesTo}`;
      badge.textContent = src.appliesTo;
      titleLine.appendChild(badge);
    }
    if (src.url) {
      const a = document.createElement("a");
      a.href = src.url;
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      a.textContent = src.title;
      titleLine.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.textContent = src.title;
      titleLine.appendChild(span);
    }
    li.appendChild(titleLine);

    const meta = document.createElement("div");
    meta.className = "captured";
    const parts: string[] = [];
    if (src.docLastUpdated) parts.push(`Doc last updated ${src.docLastUpdated}`);
    if (src.docRevision) parts.push(`Revision ${src.docRevision}`);
    if (src.capturedOn) parts.push(`Captured here ${src.capturedOn}`);
    meta.textContent = parts.join(" · ");
    li.appendChild(meta);

    host.appendChild(li);
  }
}
