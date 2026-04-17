import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { bracketMatching } from "@codemirror/language";
import { keyQLLanguage } from "./language.js";
import { keyQLCompletions } from "./completion.js";

export interface EditorOptions {
  host: HTMLElement;
  initialDoc?: string;
  onChange: (value: string) => void;
}

export function createEditor(options: EditorOptions): EditorView {
  const { host, initialDoc = "", onChange } = options;

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      keyQLLanguage(),
      autocompletion({ override: [keyQLCompletions], closeOnBlur: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { fontFamily: "inherit" },
      }),
    ],
  });

  return new EditorView({ state, parent: host });
}
