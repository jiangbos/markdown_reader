import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { FileIcon } from "./Icons";

interface Props {
  root: string;
  onPick: (path: string, newTab: boolean) => void;
  onClose: () => void;
}

/** Simple subsequence fuzzy match; lower score = better. */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 0 : 3; // contiguous runs are cheap
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === " " || t[ti - 1] === "-") score -= 2;
      lastMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // prefer matches in the file name over the directory part
  const nameStart = t.lastIndexOf("/") + 1;
  if (t.slice(nameStart).includes(q[0])) score -= 1;
  return score + t.length * 0.01;
}

export default function QuickSwitcher({ root, onPick, onClose }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.files(root).then((res) => setFiles(res.files));
    inputRef.current?.focus();
  }, [root]);

  const results = useMemo(() => {
    if (!query.trim()) return files.slice(0, 60);
    const scored: { file: string; score: number }[] = [];
    for (const f of files) {
      const s = fuzzyScore(query.trim(), f);
      if (s !== null) scored.push({ file: f, score: s });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 60).map((s) => s.file);
  }, [files, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(".switcher-row-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const pick = (file: string, newTab: boolean) => {
    onPick(`${root}/${file}`.replace(/\/+/g, "/"), newTab);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[index]) pick(results[index], e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop switcher-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="switcher">
        <input
          ref={inputRef}
          className="switcher-input"
          placeholder="Jump to a file…  (↩ open · ⌘↩ open in new tab)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="switcher-list" ref={listRef}>
          {results.map((f, i) => (
            <div
              key={f}
              className={`switcher-row${i === index ? " switcher-row-active" : ""}`}
              onMouseMove={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(f, e.metaKey || e.ctrlKey);
              }}
            >
              <FileIcon size={14} />
              <span className="switcher-name">{f.split("/").pop()?.replace(/\.(md|markdown)$/i, "")}</span>
              <span className="switcher-path">{f}</span>
            </div>
          ))}
          {results.length === 0 && <div className="picker-empty">No matching files</div>}
        </div>
      </div>
    </div>
  );
}
