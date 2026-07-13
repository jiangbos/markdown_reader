import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { EditorState, Facet, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * Obsidian-style live preview.
 *
 * Lines the cursor/selection touches show raw markdown source; everywhere
 * else, formatting marks are hidden and some constructs are replaced with
 * widgets (checkboxes, images, horizontal rules), so the document reads as
 * rendered markdown while staying fully editable in place.
 */

export interface MdContext {
  /** Resolve a (possibly relative) image src to a URL the browser can load. */
  resolveSrc: (src: string) => string;
  /** Handle activation (cmd/ctrl+click) of a link. */
  openLink: (href: string) => void;
}

export const mdContext = Facet.define<MdContext, MdContext>({
  combine: (values) =>
    values[0] ?? {
      resolveSrc: (s: string) => s,
      openLink: (h: string) => window.open(h, "_blank", "noopener"),
    },
});

// ---- widgets -----------------------------------------------------------------

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }
  ignoreEvent() {
    return false;
  }
}
const BULLET = new BulletWidget();

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-checkbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", "Toggle task");
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class HRWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-hr-widget cm-widget-reveal";
    wrap.appendChild(document.createElement("hr"));
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}
const HR = new HRWidget();

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-widget cm-widget-reveal";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt;
    img.onerror = () => wrap.classList.add("cm-image-error");
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

class CodeLangWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(other: CodeLangWidget) {
    return other.lang === this.lang;
  }
  toDOM() {
    const chip = document.createElement("span");
    chip.className = "cm-code-lang cm-widget-reveal";
    chip.textContent = this.lang || "code";
    return chip;
  }
  ignoreEvent() {
    return false;
  }
}

// ---- decoration builder --------------------------------------------------------

const HEADING_RE = /^(ATXHeading|SetextHeading)([1-6])$/;

function frontmatterEnd(state: EditorState): number {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text !== "---") return 0;
  const max = Math.min(doc.lines, 100);
  for (let i = 2; i <= max; i++) {
    const line = doc.line(i);
    if (line.text === "---" || line.text === "...") return line.to;
  }
  return 0;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const ctx = state.facet(mdContext);
  const deco: Range<Decoration>[] = [];

  // Lines touched by any selection show raw source.
  const activeLines = new Set<number>();
  for (const r of state.selection.ranges) {
    const from = doc.lineAt(r.from).number;
    const to = doc.lineAt(r.to).number;
    for (let i = from; i <= to; i++) activeLines.add(i);
  }
  const lineActive = (pos: number) => activeLines.has(doc.lineAt(pos).number);
  const spanActive = (from: number, to: number) => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let i = a; i <= b; i++) if (activeLines.has(i)) return true;
    return false;
  };
  const hide = (from: number, to: number) => {
    if (to > from) deco.push(Decoration.replace({}).range(from, to));
  };
  const lineClass = (pos: number, cls: string) =>
    deco.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from));

  // YAML frontmatter: style as metadata, skip markdown decoration inside.
  const fmEnd = frontmatterEnd(state);
  if (fmEnd > 0) {
    const last = doc.lineAt(fmEnd).number;
    for (let i = 1; i <= last; i++)
      lineClass(
        doc.line(i).from,
        "cm-line-frontmatter" +
          (i === 1 ? " cm-line-frontmatter-first" : "") +
          (i === last ? " cm-line-frontmatter-last" : ""),
      );
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node): boolean | void {
        if (node.to <= fmEnd) return false; // inside frontmatter

        const name = node.name;
        const heading = HEADING_RE.exec(name);
        if (heading) {
          lineClass(node.from, `cm-line-heading cm-line-h${heading[2]}`);
          return;
        }

        switch (name) {
          case "HeaderMark": {
            const parent = node.node.parent;
            if (!parent) return;
            if (parent.name.startsWith("ATXHeading")) {
              if (!lineActive(node.from)) {
                const line = doc.lineAt(node.from);
                // hide "#…# " including the following space
                hide(node.from, Math.min(node.to + 1, line.to));
              }
            } else if (parent.name.startsWith("SetextHeading")) {
              // underline ("===" / "---") line
              if (!spanActive(parent.from, parent.to)) {
                const line = doc.lineAt(node.from);
                hide(line.from, line.to);
              }
            }
            return;
          }

          case "EmphasisMark":
          case "StrikethroughMark":
          case "SuperscriptMark":
          case "SubscriptMark":
            if (!lineActive(node.from)) hide(node.from, node.to);
            return;

          case "Escape":
            if (!lineActive(node.from)) hide(node.from, node.from + 1);
            return;

          case "InlineCode":
            deco.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
            return;

          case "CodeMark": {
            const parent = node.node.parent;
            if (parent?.name === "InlineCode" && !lineActive(node.from)) hide(node.from, node.to);
            return;
          }

          case "Link": {
            const n = node.node;
            const marks = n.getChildren("LinkMark");
            const url = n.getChild("URL");
            if (!url || marks.length < 2) return; // malformed / reference link: leave raw
            const textFrom = marks[0].to;
            const textTo = marks[1].from;
            const href = state.sliceDoc(url.from, url.to);
            if (textTo > textFrom) {
              deco.push(
                Decoration.mark({
                  class: "cm-md-link",
                  attributes: { "data-href": href, title: `${href}  (⌘+click to open)` },
                }).range(textFrom, textTo),
              );
              if (!spanActive(n.from, n.to)) {
                hide(n.from, textFrom);
                hide(textTo, n.to);
              }
            }
            return false;
          }

          case "URL": {
            // Bare autolinks (GFM) that are not part of a [text](url) link
            const parent = node.node.parent;
            if (parent?.name === "Link" || parent?.name === "Image") return;
            const href = state.sliceDoc(node.from, node.to);
            deco.push(
              Decoration.mark({
                class: "cm-md-link",
                attributes: { "data-href": href, title: "⌘+click to open" },
              }).range(node.from, node.to),
            );
            return;
          }

          case "Image": {
            const n = node.node;
            if (!spanActive(n.from, n.to)) {
              const url = n.getChild("URL");
              if (!url) return false;
              const src = state.sliceDoc(url.from, url.to);
              const marks = n.getChildren("LinkMark");
              const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
              deco.push(
                Decoration.replace({ widget: new ImageWidget(ctx.resolveSrc(src), alt) }).range(n.from, n.to),
              );
            }
            return false;
          }

          case "FencedCode": {
            const n = node.node;
            const first = doc.lineAt(n.from);
            const last = doc.lineAt(n.to);
            const closed = n.getChildren("CodeMark").length >= 2;
            for (let i = first.number; i <= last.number; i++) {
              lineClass(
                doc.line(i).from,
                "cm-line-code" +
                  (i === first.number ? " cm-line-code-first" : "") +
                  (i === last.number && closed ? " cm-line-code-last" : ""),
              );
            }
            if (closed && !spanActive(n.from, n.to) && last.number > first.number) {
              const info = n.getChild("CodeInfo");
              const lang = info ? state.sliceDoc(info.from, info.to) : "";
              deco.push(
                Decoration.replace({ widget: new CodeLangWidget(lang) }).range(first.from, first.to),
              );
              hide(last.from, last.to);
            }
            return false;
          }

          case "Blockquote": {
            const n = node.node;
            const a = doc.lineAt(n.from).number;
            const b = doc.lineAt(n.to).number;
            for (let i = a; i <= b; i++) lineClass(doc.line(i).from, "cm-line-quote");
            return;
          }

          case "QuoteMark":
            if (!lineActive(node.from)) {
              const after = doc.sliceString(node.to, node.to + 1);
              hide(node.from, after === " " ? node.to + 1 : node.to);
            }
            return;

          case "ListMark": {
            if (lineActive(node.from)) return;
            const n = node.node;
            const sibling = n.nextSibling;
            if (sibling?.name === "Task") {
              // "- [ ]" — hide the bullet, the checkbox widget replaces the marker
              hide(node.from, Math.min(node.to + 1, doc.lineAt(node.from).to));
            } else if (n.parent?.parent?.name === "BulletList" || n.parent?.name === "BulletList") {
              deco.push(Decoration.replace({ widget: BULLET }).range(node.from, node.to));
            } else {
              deco.push(Decoration.mark({ class: "cm-list-num" }).range(node.from, node.to));
            }
            return;
          }

          case "Task": {
            const n = node.node;
            const marker = n.getChild("TaskMarker");
            if (marker && /x/i.test(state.sliceDoc(marker.from, marker.to))) {
              const start = Math.min(marker.to + 1, n.to);
              if (n.to > start)
                deco.push(Decoration.mark({ class: "cm-task-done" }).range(start, n.to));
            }
            return;
          }

          case "TaskMarker":
            if (!lineActive(node.from)) {
              const checked = /x/i.test(state.sliceDoc(node.from, node.to));
              deco.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to));
            }
            return;

          case "HorizontalRule": {
            if (!lineActive(node.from)) {
              const line = doc.lineAt(node.from);
              deco.push(Decoration.replace({ widget: HR }).range(line.from, line.to));
            }
            return false;
          }

          case "Table": {
            const n = node.node;
            const a = doc.lineAt(n.from).number;
            const b = doc.lineAt(n.to).number;
            for (let i = a; i <= b; i++) lineClass(doc.line(i).from, "cm-line-table");
            return;
          }
        }
      },
    });
  }

  return Decoration.set(deco, true);
}

// ---- interaction ---------------------------------------------------------------

function toggleTask(view: EditorView, pos: number) {
  const text = view.state.doc.sliceString(pos, pos + 3);
  const m = /^\[( |x|X)\]$/.exec(text);
  if (!m) return;
  view.dispatch({
    changes: { from: pos + 1, to: pos + 2, insert: m[1] === " " ? "x" : " " },
  });
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as HTMLElement;
        if (target.classList.contains("cm-task-checkbox")) {
          const pos = view.posAtDOM(target);
          toggleTask(view, pos);
          event.preventDefault();
          return true;
        }
        const link = target.closest(".cm-md-link") as HTMLElement | null;
        if (link?.dataset.href && (event.metaKey || event.ctrlKey)) {
          view.state.facet(mdContext).openLink(link.dataset.href);
          event.preventDefault();
          return true;
        }
        const widget = target.closest(".cm-widget-reveal");
        if (widget) {
          const pos = view.posAtDOM(widget);
          view.dispatch({ selection: { anchor: pos } });
          view.focus();
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  },
);

export function livePreview() {
  return [plugin];
}
