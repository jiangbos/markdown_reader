import { useCallback, useEffect, useRef, useState } from "react";
import { api, basename, type Entry } from "../api";
import ProjectSwitcher from "./ProjectSwitcher";
import {
  ChevronRight,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PanelLeftIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "./Icons";

interface Props {
  root: string;
  projects: string[];
  activePath: string | null;
  onFileClick: (path: string) => void;
  onFileDoubleClick: (path: string) => void;
  onChangeFolder: () => void;
  onSwitchProject: (path: string) => void;
  onRemoveProject: (path: string) => void;
  onCollapse: () => void;
  onOpenSwitcher: () => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
}

function loadExpanded(root: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(`mdr.expanded:${root}`) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

interface MenuState {
  x: number;
  y: number;
  entry: Entry;
}

export default function Sidebar({
  root,
  projects,
  activePath,
  onFileClick,
  onFileDoubleClick,
  onChangeFolder,
  onSwitchProject,
  onRemoveProject,
  onCollapse,
  onOpenSwitcher,
  onRenamed,
  onDeleted,
}: Props) {
  const [dirs, setDirs] = useState<ReadonlyMap<string, Entry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(root));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (path: string) => {
    try {
      const { entries } = await api.list(path);
      setDirs((prev) => {
        const next = new Map(prev);
        next.set(path, entries);
        return next;
      });
    } catch (err) {
      console.error("Failed to list", path, err);
    }
  }, []);

  useEffect(() => {
    setDirs(new Map());
    const exp = loadExpanded(root);
    setExpanded(exp);
    setRenaming(null);
    setMenu(null);
    void loadDir(root);
    for (const dir of exp) if (dir.startsWith(root)) void loadDir(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const updateExpanded = (fn: (prev: Set<string>) => Set<string>) => {
    setExpanded((prev) => {
      const next = fn(prev);
      localStorage.setItem(`mdr.expanded:${root}`, JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => {
      setMenu(null);
      setConfirmingDelete(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      const input = renameRef.current;
      input.focus();
      const dot = input.value.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    }
  }, [renaming]);

  const toggleDir = (path: string) => {
    updateExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        if (!dirs.has(path)) void loadDir(path);
      }
      return next;
    });
  };

  const refresh = () => {
    void loadDir(root);
    for (const dir of expanded) void loadDir(dir);
  };

  const createEntry = async (dir: string, type: "file" | "folder") => {
    try {
      const { path } = await api.create(dir, type);
      if (dir !== root) updateExpanded((prev) => new Set(prev).add(dir));
      await loadDir(dir);
      if (type === "file") onFileClick(path);
      setRenaming(path);
    } catch (err) {
      console.error("Create failed:", err);
    }
  };

  const commitRename = async (entry: string, name: string) => {
    setRenaming(null);
    const oldName = basename(entry);
    if (!name || name === oldName || /[/\\]/.test(name)) return;
    try {
      const { to } = await api.rename(entry, name);
      const parent = entry.slice(0, entry.lastIndexOf("/"));
      await loadDir(parent);
      onRenamed(entry, to);
    } catch (err) {
      console.error("Rename failed:", err);
      alertBanner(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const deleteEntry = async (entry: Entry) => {
    setMenu(null);
    setConfirmingDelete(false);
    try {
      await api.remove(entry.path);
      const parent = entry.path.slice(0, entry.path.lastIndexOf("/"));
      await loadDir(parent);
      onDeleted(entry.path);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const openMenu = (e: React.MouseEvent, entry: Entry) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingDelete(false);
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  function renderRows(dir: string, level: number): JSX.Element[] {
    const entries = dirs.get(dir);
    if (!entries) return [];
    return entries.flatMap((entry) => {
      const indent = { paddingLeft: `${10 + level * 14}px` };
      const isRenaming = renaming === entry.path;
      const nameEl = isRenaming ? (
        <input
          ref={renameRef}
          className="rename-input"
          defaultValue={entry.name}
          onBlur={(e) => void commitRename(entry.path, e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              (e.target as HTMLInputElement).value = entry.name;
              (e.target as HTMLInputElement).blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tree-name">{entry.type === "file" ? entry.name.replace(/\.(md|markdown)$/i, "") : entry.name}</span>
      );

      if (entry.type === "dir") {
        const isOpen = expanded.has(entry.path);
        return [
          <div
            key={entry.path}
            className="tree-row tree-dir"
            style={indent}
            onClick={() => !isRenaming && toggleDir(entry.path)}
            onContextMenu={(e) => openMenu(e, entry)}
          >
            <span className={`tree-chevron${isOpen ? " open" : ""}`}>
              <ChevronRight size={14} />
            </span>
            <span className="tree-icon">{isOpen ? <FolderOpenIcon size={15} /> : <FolderIcon size={15} />}</span>
            {nameEl}
          </div>,
          ...(isOpen ? renderRows(entry.path, level + 1) : []),
        ];
      }
      return [
        <div
          key={entry.path}
          className={`tree-row tree-file${entry.path === activePath ? " tree-active" : ""}`}
          style={indent}
          onClick={(e) => {
            if (isRenaming) return;
            if (e.detail === 1) onFileClick(entry.path);
          }}
          onDoubleClick={() => !isRenaming && onFileDoubleClick(entry.path)}
          onContextMenu={(e) => openMenu(e, entry)}
        >
          <span className="tree-icon">
            <FileIcon size={15} />
          </span>
          {nameEl}
        </div>,
      ];
    });
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <ProjectSwitcher
          root={root}
          projects={projects}
          onSwitch={onSwitchProject}
          onAddFolder={onChangeFolder}
          onRemove={onRemoveProject}
        />
        <span className="sidebar-actions">
          <button className="icon-btn" title="Quick open (⌘P)" onClick={onOpenSwitcher}>
            <SearchIcon size={15} />
          </button>
          <button className="icon-btn" title="New note" onClick={() => void createEntry(root, "file")}>
            <PlusIcon size={15} />
          </button>
          <button className="icon-btn" title="New folder" onClick={() => void createEntry(root, "folder")}>
            <FolderPlusIcon size={15} />
          </button>
          <button className="icon-btn" title="Refresh" onClick={refresh}>
            <RefreshIcon size={15} />
          </button>
          <button className="icon-btn" title="Collapse sidebar (⌘\)" onClick={onCollapse}>
            <PanelLeftIcon size={15} />
          </button>
        </span>
      </div>
      <div className="tree" onContextMenu={(e) => openMenu(e, { name: basename(root), path: root, type: "dir" })}>
        {renderRows(root, 0)}
        {dirs.get(root)?.length === 0 && (
          <div className="tree-empty">
            No markdown files here yet.
            <button className="link-btn" onClick={() => void createEntry(root, "file")}>
              Create your first note
            </button>
          </div>
        )}
      </div>
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.entry.type === "dir" && (
            <>
              <button
                onClick={() => {
                  setMenu(null);
                  void createEntry(menu.entry.path, "file");
                }}
              >
                New note
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  void createEntry(menu.entry.path, "folder");
                }}
              >
                New folder
              </button>
            </>
          )}
          {menu.entry.path !== root && (
            <>
              <button
                onClick={() => {
                  setMenu(null);
                  setRenaming(menu.entry.path);
                }}
              >
                Rename
              </button>
              <button
                className="menu-danger"
                onClick={() => {
                  if (confirmingDelete) void deleteEntry(menu.entry);
                  else setConfirmingDelete(true);
                }}
              >
                {confirmingDelete ? "Click again to confirm" : "Delete"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function alertBanner(message: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
