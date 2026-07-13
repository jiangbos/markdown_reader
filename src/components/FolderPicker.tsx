import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ChevronRight, FolderIcon } from "./Icons";

interface Props {
  onPick: (path: string) => void;
  onClose: (() => void) | null; // null = cannot dismiss (no folder chosen yet)
}

export default function FolderPicker({ onPick, onClose }: Props) {
  const [current, setCurrent] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [samplePath, setSamplePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef({ buffer: "", at: 0 });
  const [recents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("mdr.recents") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const navigate = async (path?: string) => {
    try {
      const res = await api.browse(path);
      setCurrent(res.path);
      setParent(res.parent);
      setDirs(res.dirs);
      setHighlight(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void api.home().then((info) => setSamplePath(info.sample));
    void navigate();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keyboard navigation: type a folder's first letters to jump to it,
  // arrows to move, → to enter, ← to go up, ⏎ to open the highlighted folder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, dirs.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (parent) void navigate(parent);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (dirs[highlight]) void navigate(dirs[highlight].path);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          if (current) onPick(current);
        } else if (dirs[highlight]) {
          onPick(dirs[highlight].path);
        } else if (current) {
          onPick(current);
        }
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const buffer =
          now - typeRef.current.at < 700 ? typeRef.current.buffer + e.key.toLowerCase() : e.key.toLowerCase();
        typeRef.current = { buffer, at: now };
        const idx = dirs.findIndex((d) => d.name.toLowerCase().startsWith(buffer));
        if (idx >= 0) setHighlight(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirs, highlight, parent, current, onPick]);

  useEffect(() => {
    listRef.current?.querySelector(".picker-row-hi")?.scrollIntoView({ block: "nearest" });
  }, [highlight, dirs]);

  const crumbs = current ? current.split("/").filter(Boolean) : [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal folder-picker">
        <h2>Open folder</h2>
        <p className="modal-hint">
          Type a name to jump to it · <kbd>⏎</kbd> open · <kbd>→</kbd> enter folder · <kbd>←</kbd> go up
        </p>

        {recents.length > 0 && (
          <div className="picker-recents">
            {recents.map((r) => (
              <button key={r} className="recent-chip" title={r} onClick={() => onPick(r)}>
                <FolderIcon size={13} />
                {r.split("/").filter(Boolean).pop()}
              </button>
            ))}
          </div>
        )}

        <div className="picker-crumbs">
          <button className="crumb" onClick={() => void navigate("/")}>
            /
          </button>
          {crumbs.map((c, i) => (
            <button
              key={i}
              className="crumb"
              onClick={() => void navigate("/" + crumbs.slice(0, i + 1).join("/"))}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="picker-list" ref={listRef}>
          {parent && (
            <button className="picker-row" onClick={() => void navigate(parent)}>
              <span className="tree-icon">
                <ChevronRight size={14} />
              </span>
              ..
            </button>
          )}
          {dirs.map((d, i) => (
            <button
              key={d.path}
              className={`picker-row${i === highlight ? " picker-row-hi" : ""}`}
              onDoubleClick={() => onPick(d.path)}
              onClick={() => void navigate(d.path)}
              onMouseMove={() => setHighlight(i)}
            >
              <span className="tree-icon">
                <FolderIcon size={15} />
              </span>
              {d.name}
            </button>
          ))}
          {dirs.length === 0 && <div className="picker-empty">No sub-folders</div>}
        </div>
        {error && <div className="picker-error">{error}</div>}

        <div className="modal-footer">
          {samplePath && (
            <button className="btn-secondary" onClick={() => onPick(samplePath)}>
              Try the sample notes
            </button>
          )}
          <span className="modal-spacer" />
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="btn-primary" disabled={!current} onClick={() => current && onPick(current)}>
            Open “{crumbs[crumbs.length - 1] ?? "/"}”
          </button>
        </div>
      </div>
    </div>
  );
}
