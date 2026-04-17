import {
  StreamLanguage,
  LanguageSupport,
  HighlightStyle,
  syntaxHighlighting,
  type StreamParser,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface State {
  afterIdentifier: boolean;
}

const KEYWORDS = new Set(["AND", "OR", "NOT", "NEAR"]);

const keyQLStreamParser: StreamParser<State> = {
  name: "keyql",
  startState(): State {
    return { afterIdentifier: false };
  },
  token(stream, state) {
    if (stream.eatSpace()) return null;

    if (stream.match(/\(c:[cs]\)/)) {
      state.afterIdentifier = false;
      return "meta";
    }

    if (stream.match(/"([^"\\]|\\.)*"/)) {
      state.afterIdentifier = false;
      return "string";
    }

    if (stream.match(/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?/)) {
      state.afterIdentifier = false;
      return "literal";
    }

    if (stream.match(/\.\./)) {
      state.afterIdentifier = false;
      return "operator";
    }

    if (stream.match(/<>|<=|>=|[:=<>+\-*()]/)) {
      state.afterIdentifier = false;
      return "operator";
    }

    const wordMatch = stream.match(
      /[A-Za-z_][A-Za-z0-9_@/\-]*(\.(?!\.)[A-Za-z0-9_@/\-]+)*\*?/
    );
    if (wordMatch) {
      const word = (wordMatch as RegExpMatchArray)[0] ?? "";
      if (KEYWORDS.has(word)) {
        state.afterIdentifier = false;
        return "keyword";
      }
      if (stream.peek() === ":" || stream.peek() === "=" || stream.peek() === "<" || stream.peek() === ">") {
        state.afterIdentifier = true;
        return "typeName";
      }
      if (state.afterIdentifier) {
        state.afterIdentifier = false;
        return "literal";
      }
      state.afterIdentifier = false;
      return "variableName";
    }

    if (stream.match(/\d+/)) {
      state.afterIdentifier = false;
      return "number";
    }

    stream.next();
    return null;
  },
};

const streamLang = StreamLanguage.define(keyQLStreamParser);

export const keyQLHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "#0b5cad", fontWeight: "600" },
  { tag: t.keyword, color: "#7b1fa2", fontWeight: "700" },
  { tag: t.operator, color: "#6b6b6b" },
  { tag: t.string, color: "#1b7a3a" },
  { tag: t.literal, color: "#a04000" },
  { tag: t.number, color: "#a04000" },
  { tag: t.meta, color: "#b00020", fontStyle: "italic" },
  { tag: t.name, color: "#1a1a1a" },
]);

export const keyQLDarkHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "#6eb6ff", fontWeight: "600" },
  { tag: t.keyword, color: "#ce93d8", fontWeight: "700" },
  { tag: t.operator, color: "#9a9a9a" },
  { tag: t.string, color: "#81c784" },
  { tag: t.literal, color: "#ffb74d" },
  { tag: t.number, color: "#ffb74d" },
  { tag: t.meta, color: "#ff6b6b", fontStyle: "italic" },
  { tag: t.name, color: "#e6e6e6" },
]);

export function keyQLLanguage(): LanguageSupport {
  return new LanguageSupport(streamLang, [syntaxHighlighting(keyQLHighlightStyle)]);
}
