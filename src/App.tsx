import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Tabs from "./components/Tabs";
import EditorPane from "./components/EditorPane";
import FolderPicker from "./components/FolderPicker";
import QuickSwitcher from "./components/QuickSwitcher";
import { BookIcon, MoonIcon, PanelLeftIcon, PencilIcon, SunIcon } from "./components/Icons";
import { displayName } from "./api";
import { dropCached, flushAll, flushSave, moveCached, onDirtyChange } from "./docStore";
import { newId, type Tab } from "./types";

type Theme = "light" | "dark";

function loadTabs(root: string): { tabs: Tab[]; activeId: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(`mdr.tabs:${root}`) ?? "null") as {
      tabs: Tab[];
      activeId: string | null;
    } | null;
    if (raw?.tabs?.length) return raw;
  } catch {
    /* fresh start */
  }
  return { tabs: [], activeId: null };
}

export default function App() {
  const [root, setRoot] = useState<string | null>(() => localStorage.getItem("mdr.root"));
  const [tabs, setTabs] = useState<Tab[]>(() => (root ? loadTabs(root).tabs : []));
  const [activeId, setActiveId] = useState<string | null>(() => (root ? loadTabs(root).activeId : null));
  const [readingTabs, setReadingTabs] = useState<Set<string>>(new Set());
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(root === null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("mdr.sidebarWidth")) || 280);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mdr.collapsed") === "1");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("mdr.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const previewRef = useRef<{ tabId: string; prevPath: string; newPath: string; at: number } | null>(null);

  // ---- persistence ----
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mdr.theme", theme);
  }, [theme]);
  useEffect(() => {
    if (root) localStorage.setItem("mdr.root", root);
  }, [root]);
  useEffect(() => {
    if (root) localStorage.setItem(`mdr.tabs:${root}`, JSON.stringify({ tabs, activeId }));
  }, [tabs, activeId, root]);
  useEffect(() => {
    localStorage.setItem("mdr.sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem("mdr.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  useEffect(() => {
    document.title = activeTab
      ? `${displayName(activeTab.path)}${dirtyPaths.has(activeTab.path) ? " •" : ""} — Markdown Reader`
      : "Markdown Reader";
  }, [activeTab, dirtyPaths]);

  useEffect(
    () =>
      onDirtyChange((path, dirty) => {
        setDirtyPaths((prev) => {
          const next = new Set(prev);
          if (dirty) next.add(path);
          else next.delete(path);
          return next;
        });
      }),
    [],
  );

  // ---- tab operations ----
  const openFile = useCallback(
    (path: string, newTab: boolean) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.path === path);
        if (existing) {
          setActiveId(existing.id);
          return prev;
        }
        const current = prev.find((t) => t.id === activeId) ?? null;
        if (!newTab && current) {
          previewRef.current = { tabId: current.id, prevPath: current.path, newPath: path, at: Date.now() };
          setActiveId(current.id);
          return prev.map((t) => (t.id === current.id ? { ...t, path } : t));
        }
        const tab: Tab = { id: newId(), path };
        setActiveId(tab.id);
        const idx = current ? prev.indexOf(current) : -1;
        const next = [...prev];
        next.splice(idx === -1 ? prev.length : idx + 1, 0, tab);
        return next;
      });
    },
    [activeId],
  );

  const handleTreeClick = useCallback((path: string) => openFile(path, false), [openFile]);

  const handleTreeDoubleClick = useCallback(
    (path: string) => {
      const preview = previewRef.current;
      if (preview && preview.newPath === path && Date.now() - preview.at < 600 && preview.prevPath !== path) {
        // The single-click just replaced a tab's file; undo that and open a
        // dedicated new tab instead ("double-click = new tab").
        previewRef.current = null;
        setTabs((prev) => {
          const restored = prev.map((t) => (t.id === preview.tabId ? { ...t, path: preview.prevPath } : t));
          const tab: Tab = { id: newId(), path };
          const idx = restored.findIndex((t) => t.id === preview.tabId);
          const next = [...restored];
          next.splice(idx === -1 ? restored.length : idx + 1, 0, tab);
          setActiveId(tab.id);
          return next;
        });
      } else {
        openFile(path, true);
      }
    },
    [openFile],
  );

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const closing = prev[idx];
      const next = prev.filter((t) => t.id !== id);
      // Make sure any pending edits reach disk when the last tab for a file closes.
      if (!next.some((t) => t.path === closing.path)) void flushSave(closing.path);
      setActiveId((current) => {
        if (current !== id) return current;
        const neighbor = next[Math.min(idx, next.length - 1)];
        return neighbor ? neighbor.id : null;
      });
      return next;
    });
    setReadingTabs((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleReading = useCallback(() => {
    if (!activeId) return;
    void flushAll();
    setReadingTabs((prev) => {
      const next = new Set(prev);
      if (next.has(activeId)) next.delete(activeId);
      else next.add(activeId);
      return next;
    });
  }, [activeId]);

  // ---- rename / delete propagation ----
  const handleRenamed = useCallback((from: string, to: string) => {
    const mapPath = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
    moveCached(from, to);
    setTabs((prev) => prev.map((t) => ({ ...t, path: mapPath(t.path) })));
    setDirtyPaths((prev) => new Set([...prev].map(mapPath)));
  }, []);

  const handleDeleted = useCallback((path: string) => {
    setTabs((prev) => {
      const removed = prev.filter((t) => t.path === path || t.path.startsWith(path + "/"));
      for (const t of removed) dropCached(t.path);
      const next = prev.filter((t) => !removed.includes(t));
      setActiveId((current) => {
        if (next.some((t) => t.id === current)) return current;
        return next.length ? next[next.length - 1].id : null;
      });
      return next;
    });
    dropCached(path);
  }, []);

  const pickFolder = useCallback((path: string) => {
    void flushAll();
    setRoot(path);
    const saved = loadTabs(path);
    setTabs(saved.tabs);
    setActiveId(saved.activeId);
    setReadingTabs(new Set());
    setPickerOpen(false);
    try {
      const recents = (JSON.parse(localStorage.getItem("mdr.recents") ?? "[]") as string[]).filter(
        (r) => r !== path,
      );
      recents.unshift(path);
      localStorage.setItem("mdr.recents", JSON.stringify(recents.slice(0, 6)));
    } catch {
      localStorage.setItem("mdr.recents", JSON.stringify([path]));
    }
  }, []);

  // ---- global keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "p" || e.key === "k") {
        e.preventDefault();
        if (root) setSwitcherOpen((v) => !v);
      } else if (e.key === "\\") {
        e.preventDefault();
        setCollapsed((v) => !v);
      } else if (e.key === "e") {
        e.preventDefault();
        toggleReading();
      } else if (e.key === "s") {
        e.preventDefault();
        void flushAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root, toggleReading]);

  // ---- sidebar resize ----
  const dragging = useRef(false);
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add("resizing");
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.min(560, Math.max(160, ev.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.classList.remove("resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const isReading = activeId !== null && readingTabs.has(activeId);

  return (
    <div className="app">
      {root && !collapsed && (
        <>
          <div className="sidebar-wrap" style={{ width: sidebarWidth }}>
            <Sidebar
              root={root}
              activePath={activeTab?.path ?? null}
              onFileClick={handleTreeClick}
              onFileDoubleClick={handleTreeDoubleClick}
              onChangeFolder={() => setPickerOpen(true)}
              onCollapse={() => setCollapsed(true)}
              onOpenSwitcher={() => setSwitcherOpen(true)}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
            />
          </div>
          <div className="resize-handle" onMouseDown={onDragStart} onDoubleClick={() => setSidebarWidth(280)} />
        </>
      )}

      <div className="main">
        <div className="topbar">
          {(collapsed || !root) && (
            <button className="icon-btn" title="Show sidebar (⌘\)" onClick={() => setCollapsed(false)}>
              <PanelLeftIcon size={16} />
            </button>
          )}
          <Tabs tabs={tabs} activeId={activeId} dirtyPaths={dirtyPaths} onActivate={setActiveId} onClose={closeTab} />
          <div className="topbar-actions">
            {activeTab && (
              <button
                className={`icon-btn${isReading ? " icon-btn-active" : ""}`}
                title={isReading ? "Edit (⌘E)" : "Reading view (⌘E)"}
                onClick={toggleReading}
              >
                {isReading ? <PencilIcon size={16} /> : <BookIcon size={16} />}
              </button>
            )}
            <button
              className="icon-btn"
              title={theme === "dark" ? "Light theme" : "Dark theme"}
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
          </div>
        </div>

        <div className="panes">
          {tabs.map((tab) => (
            <EditorPane
              key={tab.id + ":" + tab.path}
              path={tab.path}
              visible={tab.id === activeId}
              reading={readingTabs.has(tab.id)}
              onOpenFile={openFile}
            />
          ))}
          {tabs.length === 0 && (
            <div className="welcome">
              <div className="welcome-card">
                <h1>Markdown Reader</h1>
                <p>A quiet place for your notes.</p>
                <div className="welcome-hints">
                  <div>
                    <kbd>Click</kbd> a note to open it here
                  </div>
                  <div>
                    <kbd>Double-click</kbd> to open it in a new tab
                  </div>
                  <div>
                    <kbd>⌘P</kbd> jump to any note
                  </div>
                  <div>
                    <kbd>⌘E</kbd> toggle reading view
                  </div>
                  <div>
                    <kbd>⌘B</kbd>/<kbd>⌘I</kbd> bold / italic
                  </div>
                  <div>
                    <kbd>⌘\</kbd> hide the sidebar
                  </div>
                </div>
                {!root && (
                  <button className="btn-primary" onClick={() => setPickerOpen(true)}>
                    Open a folder
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && <FolderPicker onPick={pickFolder} onClose={root ? () => setPickerOpen(false) : null} />}
      {switcherOpen && root && (
        <QuickSwitcher root={root} onPick={(p, nt) => openFile(p, nt)} onClose={() => setSwitcherOpen(false)} />
      )}
    </div>
  );
}
