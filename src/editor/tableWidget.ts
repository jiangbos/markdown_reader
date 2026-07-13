import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { EditorState, Range, StateField } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { renderMarkdown } from "../markdown/render";
import { gestureChanged, mdContext, mouseGesture } from "./livePreview";

/**
 * Rendered tables in live preview.
 *
 * Tables span multiple lines, so hiding them needs a block-level replace
 * decoration — and CodeMirror only allows those from state facets/fields,
 * not view plugins. This field tracks table ranges and swaps each table for
 * a rendered HTML widget whenever the selection is outside it; click a
 * rendered table (or select into it) to edit the source.
 */

class TableWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly resolveSrc: (s: string) => string,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.src === this.src;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-widget cm-widget-reveal";
    wrap.innerHTML = renderMarkdown(this.src, this.resolveSrc);
    // Plain clicks reveal the source (handled by the live-preview plugin);
    // stop anchors from navigating the app away.
    wrap.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    });
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

interface TableRange {
  from: number; // expanded to full lines
  to: number;
}

function findTables(state: EditorState): TableRange[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  const tables: TableRange[] = [];
  tree.iterate({
    enter(n): boolean | void {
      if (n.name === "Table") {
        tables.push({
          from: state.doc.lineAt(n.from).from,
          to: state.doc.lineAt(n.to).to,
        });
        return false;
      }
    },
  });
  return tables;
}

function buildDeco(state: EditorState, tables: TableRange[]): DecorationSet {
  const { resolveSrc } = state.facet(mdContext);
  const frozen = state.field(mouseGesture, false) ?? null;
  const caretInside = (t: TableRange) =>
    frozen
      ? [...frozen].some((ln) => {
          const line = state.doc.line(ln);
          return line.to >= t.from && line.from <= t.to;
        })
      : state.selection.ranges.some((r) => r.empty && r.from >= t.from && r.from <= t.to);
  const deco: Range<Decoration>[] = [];
  for (const t of tables) {
    // Only a caret inside the table reveals the source; drag selections keep
    // the rendered widget, and a mouse gesture freezes the pre-click state so
    // the layout stays stable under the pointer.
    const touched = caretInside(t);
    if (!touched) {
      deco.push(
        Decoration.replace({
          widget: new TableWidget(state.sliceDoc(t.from, t.to), resolveSrc),
          block: true,
        }).range(t.from, t.to),
      );
    }
  }
  return Decoration.set(deco, true);
}

export const tableRendering = StateField.define<{ tables: TableRange[]; deco: DecorationSet }>({
  create(state) {
    const tables = findTables(state);
    return { tables, deco: buildDeco(state, tables) };
  },
  update(value, tr) {
    if (tr.docChanged) {
      const tables = findTables(tr.state);
      return { tables, deco: buildDeco(tr.state, tables) };
    }
    if (tr.selection || gestureChanged(tr)) return { tables: value.tables, deco: buildDeco(tr.state, value.tables) };
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});
