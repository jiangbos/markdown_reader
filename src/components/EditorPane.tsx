import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { api, resolvePath } from "../api";
import { createEditorState } from "../editor/setup";
import { getCachedState, setCachedState, scheduleSave, currentText } from "../docStore";
import { renderMarkdown } from "../markdown/render";
import { getScrollLine, setScrollLine } from "../scrollStore";

interface Props {
  path: string;
  visible: boolean;
  reading: boolean;
  onOpenFile: (path: string, newTab: boolean) => void;
}

function useResolveSrc(path: string) {
  return useMemo(
    () => (src: string) =>
      /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") ? src : api.rawUrl(resolvePath(path, src)),
    [path],
  );
}

/** Source line (0-based) currently at the top of the editor viewport. */
function topVisibleLine(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords({ x: rect.left + 8, y: rect.top + 8 }, false);
  return view.state.doc.lineAt(pos).number - 1;
}

/**
 * Scroll the editor so the remembered top line is back at the top of the view.
 * scrollIntoView resolves against line heights that are still settling right
 * after the view is created, so re-check a few times until the target sticks.
 */
function restoreEditorScroll(view: EditorView, path: string, moveCursor: boolean, isCurrent: () => boolean) {
  const line = getScrollLine(path);
  if (line === undefined || line <= 0) return;
  const doc = view.state.doc;
  const target = Math.min(line, doc.lines - 1);
  const pos = doc.line(target + 1).from;
  const sel = view.state.selection.main;
  if (moveCursor && sel.empty && sel.from === 0) {
    // Fresh view: park the cursor at the restored position so keyboard
    // navigation doesn't jump back to the top of the file.
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start" }) });
  } else {
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
  }
  const verify = (attempt: number) =>
    window.setTimeout(() => {
      if (!isCurrent() || view.scrollDOM.clientHeight === 0) return;
      if (topVisibleLine(view) === target || attempt >= 3) return;
      // Correct against the real rendered position when available; the
      // effect-based scroll can land off-target while heights settle.
      const coords = view.coordsAtPos(pos);
      if (coords) {
        view.scrollDOM.scrollTop += coords.top - view.scrollDOM.getBoundingClientRect().top;
      } else {
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
      }
      verify(attempt + 1);
    }, attempt === 0 ? 80 : 200);
  verify(0);
}

export default function EditorPane({ path, visible, reading, onOpenFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const resolveSrc = useResolveSrc(path);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  // Scroll saves are paused while a restore is converging so the intermediate
  // positions don't overwrite the remembered one.
  const suppressSaveUntil = useRef(0);

  useEffect(() => {
    if (reading) return; // reading mode: no editor instance
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const openLink = (href: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
        window.open(href, "_blank", "noopener");
      } else if (/\.(md|markdown|txt)$/i.test(href)) {
        onOpenFileRef.current(resolvePath(path, decodeURIComponent(href)), false);
      } else {
        window.open(resolveSrc(href), "_blank", "noopener");
      }
    };

    const callbacks = {
      onDocChanged: (content: string) => scheduleSave(path, content),
      onStateChanged: (state: import("@codemirror/state").EditorState) => {
        setCachedState(path, state);
        const text = state.doc.toString();
        setStats({ words: (text.match(/\S+/g) ?? []).length, chars: text.length });
      },
    };

    // Remember the topmost visible line (persisted, shared with reading mode).
    const onScroll = () => {
      const v = viewRef.current;
      if (!v || v.scrollDOM.clientHeight === 0) return; // hidden tab: ignore
      if (Date.now() < suppressSaveUntil.current) return; // restore in progress
      setScrollLine(path, topVisibleLine(v));
    };

    async function init() {
      let state = getCachedState(path);
      if (!state) {
        try {
          const text = await currentText(path);
          if (cancelled) return;
          state = createEditorState(text, { resolveSrc, openLink }, callbacks);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
          return;
        }
      } else {
        // Rebuild with fresh callbacks/context but keep doc + history via cached state
        state = createEditorState(state.doc.toString(), { resolveSrc, openLink }, callbacks);
      }
      if (cancelled || !container) return;
      setError(null);
      const view = new EditorView({ state, parent: container });
      viewRef.current = view;
      const text = state.doc.toString();
      setStats({ words: (text.match(/\S+/g) ?? []).length, chars: text.length });
      if (visible) {
        view.focus();
        suppressSaveUntil.current = Date.now() + 800;
        restoreEditorScroll(view, path, true, () => viewRef.current === view);
      }
      view.scrollDOM.addEventListener("scroll", onScroll);
    }
    void init();

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reading]);

  useEffect(() => {
    if (visible && !reading && viewRef.current) {
      const view = viewRef.current;
      view.focus();
      // display:none may have reset the scroll position; put it back.
      suppressSaveUntil.current = Date.now() + 800;
      restoreEditorScroll(view, path, false, () => viewRef.current === view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reading]);

  return (
    <div className="editor-pane" style={{ display: visible ? undefined : "none" }}>
      {error ? (
        <div className="pane-error">
          <p>Could not open this file.</p>
          <p className="pane-error-detail">{error}</p>
        </div>
      ) : reading ? (
        <ReadingView path={path} visible={visible} resolveSrc={resolveSrc} onOpenFile={onOpenFile} onStats={setStats} />
      ) : (
        <div className="cm-container" ref={containerRef} />
      )}
      <div className="editor-footer">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.chars.toLocaleString()} characters</span>
      </div>
    </div>
  );
}

function ReadingView({
  path,
  visible,
  resolveSrc,
  onOpenFile,
  onStats,
}: {
  path: string;
  visible: boolean;
  resolveSrc: (s: string) => string;
  onOpenFile: (path: string, newTab: boolean) => void;
  onStats: (s: { words: number; chars: number }) => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRaf = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void currentText(path).then((text) => {
      if (cancelled) return;
      setHtml(renderMarkdown(text, resolveSrc));
      onStats({ words: (text.match(/\S+/g) ?? []).length, chars: text.length });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(scrollRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, resolveSrc]);

  // Restore the saved reading position once content is rendered and visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (!visible || html === null || !el) return;
    const line = getScrollLine(path);
    if (line === undefined || line <= 0) return;
    let target: HTMLElement | null = null;
    for (const block of el.querySelectorAll<HTMLElement>("[data-line]")) {
      if (Number(block.dataset.line) > line) break;
      target = block;
    }
    if (target) {
      el.scrollTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    }
  }, [html, visible, path]);

  // Remember the topmost visible block's source line (throttled to a frame).
  const onScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      const el = scrollRef.current;
      if (!el || el.clientHeight === 0) return; // hidden tab: ignore
      const top = el.getBoundingClientRect().top;
      let line = 0;
      for (const block of el.querySelectorAll<HTMLElement>("[data-line]")) {
        if (block.getBoundingClientRect().top > top + 4) break;
        line = Number(block.dataset.line);
      }
      setScrollLine(path, line);
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return;
    e.preventDefault();
    if (/\.(md|markdown|txt)$/i.test(href)) onOpenFile(resolvePath(path, decodeURIComponent(href)), false);
  };

  if (html === null) return <div className="reading-view prose" />;
  return (
    <div className="reading-view" ref={scrollRef} onScroll={onScroll}>
      <div className="prose" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
