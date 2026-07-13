import { useEffect, useRef, useState } from "react";
import { basename } from "../api";
import { CheckIcon, ChevronDownIcon, ExternalLinkIcon, FolderIcon, XIcon } from "./Icons";

interface Props {
  root: string;
  projects: string[];
  onSwitch: (path: string) => void;
  onAddFolder: () => void;
  onRemove: (path: string) => void;
}

export function projectUrl(path: string): string {
  return `${location.pathname}#${encodeURI(path)}`;
}

export default function ProjectSwitcher({ root, projects, onSwitch, onAddFolder, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef({ buffer: "", at: 0 });
  const list = projects.includes(root) ? projects : [root, ...projects];

  useEffect(() => {
    if (open) setIndex(Math.max(0, list.indexOf(root)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    wrapRef.current?.querySelector(".ps-row-hi")?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  const choose = (path: string, e?: { metaKey: boolean; ctrlKey: boolean }) => {
    if (e && (e.metaKey || e.ctrlKey)) {
      window.open(projectUrl(path), "_blank");
      return;
    }
    setOpen(false);
    if (path !== root) onSwitch(path);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (list[index]) choose(list[index], e);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const buffer =
          now - typeRef.current.at < 700 ? typeRef.current.buffer + e.key.toLowerCase() : e.key.toLowerCase();
        typeRef.current = { buffer, at: now };
        const i = list.findIndex((p) => basename(p).toLowerCase().startsWith(buffer));
        if (i >= 0) setIndex(i);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list, index, root]);

  return (
    <div className="project-switcher" ref={wrapRef}>
      <button className="ps-button" title={`${root}\nClick to switch project`} onClick={() => setOpen((v) => !v)}>
        <FolderIcon size={15} />
        <span className="ps-name">{basename(root) || root}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="ps-menu">
          {list.map((p, i) => (
            <div
              key={p}
              className={`ps-row${i === index ? " ps-row-hi" : ""}`}
              title={p}
              onMouseMove={() => setIndex(i)}
              onClick={(e) => choose(p, e)}
            >
              <span className="ps-check">{p === root && <CheckIcon size={13} />}</span>
              <span className="ps-row-name">{basename(p) || p}</span>
              <span className="ps-row-path">{p}</span>
              <span className="ps-row-actions">
                <button
                  title="Open in a new browser tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(projectUrl(p), "_blank");
                  }}
                >
                  <ExternalLinkIcon size={13} />
                </button>
                {p !== root && (
                  <button
                    title="Remove from this list"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(p);
                    }}
                  >
                    <XIcon size={13} />
                  </button>
                )}
              </span>
            </div>
          ))}
          <div className="ps-sep" />
          <button
            className="ps-add"
            onClick={() => {
              setOpen(false);
              onAddFolder();
            }}
          >
            Open another folder…
          </button>
          <div className="ps-hint">Type to jump · ⏎ switch · ⌘⏎ new browser tab</div>
        </div>
      )}
    </div>
  );
}
