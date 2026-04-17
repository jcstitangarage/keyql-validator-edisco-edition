import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

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
      keymap.of([...defaultKeymap, ...historyKeymap]),
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
