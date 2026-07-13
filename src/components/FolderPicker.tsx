import { useEffect, useState } from "react";
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

  const crumbs = current ? current.split("/").filter(Boolean) : [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal folder-picker">
        <h2>Open folder</h2>
        <p className="modal-hint">Choose the folder that holds your markdown notes.</p>

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

        <div className="picker-list">
          {parent && (
            <button className="picker-row" onClick={() => void navigate(parent)}>
              <span className="tree-icon">
                <ChevronRight size={14} />
              </span>
              ..
            </button>
          )}
          {dirs.map((d) => (
            <button key={d.path} className="picker-row" onDoubleClick={() => onPick(d.path)} onClick={() => void navigate(d.path)}>
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
