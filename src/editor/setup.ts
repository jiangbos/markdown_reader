import { EditorState, EditorSelection } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { livePreview, mdContext, type MdContext } from "./livePreview";
import { tableRendering } from "./tableWidget";
import { mdHighlightStyle } from "./highlight";
import { matchEvent } from "../keys";

/** Wrap/unwrap the current selection (or word) with an inline mark like ** or *. */
function toggleWrap(marker: string) {
  return (view: EditorView): boolean => {
    const changes = view.state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        // expand to word under cursor
        const word = view.state.wordAt(from);
        if (word) {
          from = word.from;
          to = word.to;
        }
      }
      const len = marker.length;
      const before = view.state.sliceDoc(Math.max(0, from - len), from);
      const after = view.state.sliceDoc(to, to + len);
      const inner = view.state.sliceDoc(from, to);
      if (before === marker && after === marker) {
        // unwrap outer markers
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(from - len, to - len),
        };
      }
      if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length >= len * 2) {
        return {
          changes: [
            { from, to: from + len },
            { from: to - len, to },
          ],
          range: EditorSelection.range(from, to - len * 2),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + len, to + len),
      };
    });
    view.dispatch(changes, { scrollIntoView: true, userEvent: "input" });
    return true;
  };
}

export interface EditorCallbacks {
  onDocChanged: (content: string) => void;
  onStateChanged: (state: EditorState) => void;
}

export function createEditorState(doc: string, ctx: MdContext, cb: EditorCallbacks): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      indentUnit.of("  "),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(mdHighlightStyle),
      livePreview(),
      tableRendering,
      placeholder("Start writing…"),
      mdContext.of(ctx),
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "on", autocapitalize: "sentences" }),
      // Formatting shortcuts resolve through the live keybinding config, so
      // remapping them in Settings applies to already-open editors.
      EditorView.domEventHandlers({
        keydown(e, view) {
          const action = matchEvent(e);
          if (action === "bold") {
            toggleWrap("**")(view);
            e.preventDefault();
            return true;
          }
          if (action === "italic") {
            toggleWrap("*")(view);
            e.preventDefault();
            return true;
          }
          return false;
        },
      }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of((update) => {
        cb.onStateChanged(update.state);
        if (update.docChanged) cb.onDocChanged(update.state.doc.toString());
      }),
    ],
  });
}
