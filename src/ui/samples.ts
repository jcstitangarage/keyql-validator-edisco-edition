import { getSyntheticPool } from "./scenarios.js";

export function renderSamples(host: HTMLElement): void {
  const pool = getSyntheticPool();
  host.replaceChildren();

  appendBlock(host, "Synthetic identities", pool.identities.map((id) => id.upn));
  appendBlock(host, "Display names", pool.identities.map((id) => `"${id.displayName}"`));
  appendBlock(host, "Project / keyword terms", pool.keywords);
  appendBlock(host, "Sample subjects", pool.subjects.map((s) => `"${s}"`));
  appendBlock(host, "File types", pool.fileTypes.map((f) => `filetype:${f}`));
  appendBlock(
    host,
    "Relative dates",
    pool.relativeDates.map((d) => (d.includes(" ") ? `"${d}"` : d))
  );
}

function appendBlock(host: HTMLElement, title: string, items: string[]): void {
  const wrapper = document.createElement("div");
  wrapper.className = "samples-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrapper.appendChild(heading);

  const row = document.createElement("div");
  row.className = "chip-row";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = item;
    btn.title = `Click to copy: ${item}`;
    btn.addEventListener("click", () => copyToClipboard(item, btn));
    row.appendChild(btn);
  }

  wrapper.appendChild(row);
  host.appendChild(wrapper);
}

function copyToClipboard(value: string, btn: HTMLButtonElement): void {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // no-op
    }
    ta.remove();
  };

  const flash = () => {
    const prev = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => {
      btn.textContent = prev;
    }, 900);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(flash).catch(() => {
      fallback();
      flash();
    });
    return;
  }
  fallback();
  flash();
}
