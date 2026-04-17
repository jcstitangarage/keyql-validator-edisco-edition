import { translate, type NLTranslation } from "../nl/translate.js";

export interface NLHandles {
  getQuery: () => string;
}

export function initNaturalLanguage(params: {
  input: HTMLInputElement;
  translateButton: HTMLButtonElement;
  applyButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  preview: HTMLElement;
  notes: HTMLUListElement;
  onApply: (query: string) => void;
}): NLHandles {
  let lastTranslation: NLTranslation | undefined;

  const runTranslate = () => {
    const value = params.input.value.trim();
    if (!value) {
      params.preview.classList.add("placeholder");
      params.preview.textContent = "(no translation yet)";
      params.notes.replaceChildren();
      params.applyButton.disabled = true;
      lastTranslation = undefined;
      return;
    }
    const result = translate(value);
    lastTranslation = result;
    renderPreview(result);
    renderNotes(result);
    params.applyButton.disabled = result.keyql.length === 0;
  };

  const renderPreview = (result: NLTranslation) => {
    if (!result.keyql) {
      params.preview.classList.add("placeholder");
      params.preview.textContent = "(translator couldn't produce a query — see notes)";
      return;
    }
    params.preview.classList.remove("placeholder");
    params.preview.textContent = result.keyql;
  };

  const renderNotes = (result: NLTranslation) => {
    params.notes.replaceChildren();
    for (const step of result.steps) {
      const li = document.createElement("li");
      li.className = "nl-note ok";
      const label = document.createElement("span");
      label.className = "nl-phrase";
      label.textContent = step.phrase;
      const arrow = document.createElement("span");
      arrow.className = "nl-arrow";
      arrow.textContent = "→";
      const val = document.createElement("code");
      val.className = "nl-keyql";
      val.textContent = step.keyql;
      const note = document.createElement("span");
      note.className = "nl-desc";
      note.textContent = step.explanation;
      li.appendChild(label);
      li.appendChild(arrow);
      li.appendChild(val);
      li.appendChild(note);
      params.notes.appendChild(li);
    }
    for (const warn of result.warnings) {
      const li = document.createElement("li");
      li.className = "nl-note warn";
      const label = document.createElement("span");
      label.className = "nl-phrase";
      label.textContent = warn.phrase;
      const note = document.createElement("span");
      note.className = "nl-desc";
      note.textContent = warn.message;
      li.appendChild(label);
      li.appendChild(note);
      params.notes.appendChild(li);
    }
  };

  params.translateButton.addEventListener("click", runTranslate);
  params.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runTranslate();
    }
  });
  params.input.addEventListener("input", () => {
    if (!params.input.value.trim()) {
      params.preview.classList.add("placeholder");
      params.preview.textContent = "(no translation yet)";
      params.notes.replaceChildren();
      params.applyButton.disabled = true;
    }
  });
  params.applyButton.addEventListener("click", () => {
    if (lastTranslation?.keyql) params.onApply(lastTranslation.keyql);
  });
  params.clearButton.addEventListener("click", () => {
    params.input.value = "";
    params.preview.classList.add("placeholder");
    params.preview.textContent = "(no translation yet)";
    params.notes.replaceChildren();
    params.applyButton.disabled = true;
    lastTranslation = undefined;
  });

  return {
    getQuery: () => lastTranslation?.keyql ?? "",
  };
}
