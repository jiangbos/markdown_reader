import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { api, resolvePath } from "../api";
import { createEditorState } from "../editor/setup";
import { getCachedState, setCachedState, scheduleSave, currentText } from "../docStore";
import { renderMarkdown } from "../markdown/render";

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

export default function EditorPane({ path, visible, reading, onOpenFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const resolveSrc = useResolveSrc(path);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;

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
      if (visible) view.focus();
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
    if (visible && !reading) viewRef.current?.focus();
  }, [visible, reading]);

  return (
    <div className="editor-pane" style={{ display: visible ? undefined : "none" }}>
      {error ? (
        <div className="pane-error">
          <p>Could not open this file.</p>
          <p className="pane-error-detail">{error}</p>
        </div>
      ) : reading ? (
        <ReadingView path={path} resolveSrc={resolveSrc} onOpenFile={onOpenFile} onStats={setStats} />
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
  resolveSrc,
  onOpenFile,
  onStats,
}: {
  path: string;
  resolveSrc: (s: string) => string;
  onOpenFile: (path: string, newTab: boolean) => void;
  onStats: (s: { words: number; chars: number }) => void;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void currentText(path).then((text) => {
      if (cancelled) return;
      setHtml(renderMarkdown(text, resolveSrc));
      onStats({ words: (text.match(/\S+/g) ?? []).length, chars: text.length });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, resolveSrc]);

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
    <div className="reading-view">
      <div className="prose" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
