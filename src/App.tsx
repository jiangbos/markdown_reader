import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import FolderPicker from "./components/FolderPicker";
import QuickSwitcher from "./components/QuickSwitcher";
import SettingsModal from "./components/SettingsModal";
import { LayoutView, type DragInfo, type LayoutCtx } from "./components/SplitView";
import { GearIcon, MoonIcon, PanelLeftIcon, SunIcon } from "./components/Icons";
import { displayName } from "./api";
import { fileKind } from "./fileTypes";
import { dropCached, flushAll, flushSave, moveCached, onDirtyChange } from "./docStore";
import { moveScrollLine } from "./scrollStore";
import { matchEvent } from "./keys";
import { newId } from "./types";
import {
  findPane,
  isValidLayout,
  makePane,
  mapPanes,
  moveTabTo,
  normalize,
  panes,
  removeTab,
  splitWithTab,
  updatePane,
  updateSplitSizes,
  type LayoutNode,
  type Side,
  type Tab,
} from "./layout";

type Theme = "light" | "dark";

/** Each browser tab carries its project in the URL hash (#/path/to/folder). */
function rootFromHash(): string | null {
  try {
    const h = decodeURI(window.location.hash.slice(1));
    return h.startsWith("/") ? h : null;
  } catch {
    return null;
  }
}

function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem("mdr.recents") ?? "[]") as string[];
  } catch {
    return [];
  }
}

function loadLayout(root: string | null): { layout: LayoutNode; activePaneId: string } {
  if (root) {
    try {
      const raw = JSON.parse(localStorage.getItem(`mdr.layout:${root}`) ?? "null") as {
        layout?: unknown;
        activePaneId?: string;
      } | null;
      if (raw && isValidLayout(raw.layout)) {
        const layout = normalize(raw.layout);
        const all = panes(layout);
        const active = all.find((p) => p.id === raw.activePaneId) ?? all[0];
        return { layout, activePaneId: active.id };
      }
      // migrate the pre-split single-tab-list format
      const old = JSON.parse(localStorage.getItem(`mdr.tabs:${root}`) ?? "null") as {
        tabs?: Tab[];
        activeId?: string | null;
      } | null;
      if (old?.tabs?.length) {
        const pane = makePane(old.tabs, old.activeId ?? null);
        return { layout: pane, activePaneId: pane.id };
      }
    } catch {
      /* fall through to fresh pane */
    }
  }
  const pane = makePane();
  return { layout: pane, activePaneId: pane.id };
}

export default function App() {
  const [root, setRoot] = useState<string | null>(() => rootFromHash() ?? localStorage.getItem("mdr.root"));
  const [projects, setProjects] = useState<string[]>(loadProjects);
  const [initial] = useState(() => loadLayout(root));
  const [layout, setLayout] = useState<LayoutNode>(initial.layout);
  const [activePaneId, setActivePaneId] = useState<string>(initial.activePaneId);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  // Drop handlers read this ref: state updates can lag behind the native
  // dragstart → drop sequence, but the ref is set synchronously.
  const dragRef = useRef<DragInfo | null>(null);
  const [readingTabs, setReadingTabs] = useState<Set<string>>(new Set());
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(root === null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("mdr.sidebarWidth")) || 280);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mdr.collapsed") === "1");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("mdr.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const activePane = findPane(layout, activePaneId) ?? panes(layout)[0];
  const activeTab = activePane.tabs.find((t) => t.id === activePane.activeTabId) ?? null;
  const previewRef = useRef<{ paneId: string; tabId: string; prevPath: string; newPath: string; at: number } | null>(
    null,
  );
  const activePaneIdRef = useRef(activePaneId);
  useEffect(() => {
    activePaneIdRef.current = activePaneId;
  }, [activePaneId]);

  // If the active pane vanished (last tab closed, merged away), pick a real one.
  useEffect(() => {
    if (!findPane(layout, activePaneId)) setActivePaneId(panes(layout)[0].id);
  }, [layout, activePaneId]);

  // ---- persistence ----
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mdr.theme", theme);
  }, [theme]);
  const rootRef = useRef(root);
  useEffect(() => {
    rootRef.current = root;
    if (root) {
      localStorage.setItem("mdr.root", root);
      history.replaceState(null, "", "#" + encodeURI(root));
    }
  }, [root]);
  useEffect(() => {
    if (root) localStorage.setItem(`mdr.layout:${root}`, JSON.stringify({ layout, activePaneId }));
  }, [layout, activePaneId, root]);
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

  // ---- opening files (into the active pane) ----
  const openFile = useCallback((path: string, newTab: boolean) => {
    setLayout((prev) => {
      for (const p of panes(prev)) {
        const existing = p.tabs.find((t) => t.path === path);
        if (existing) {
          setActivePaneId(p.id);
          return p.activeTabId === existing.id
            ? prev
            : updatePane(prev, p.id, (pp) => ({ ...pp, activeTabId: existing.id }));
        }
      }
      const pane = findPane(prev, activePaneIdRef.current) ?? panes(prev)[0];
      setActivePaneId(pane.id);
      const activeIdx = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
      if (!newTab && activeIdx !== -1) {
        const current = pane.tabs[activeIdx];
        previewRef.current = { paneId: pane.id, tabId: current.id, prevPath: current.path, newPath: path, at: Date.now() };
        return updatePane(prev, pane.id, (pp) => ({
          ...pp,
          tabs: pp.tabs.map((t) => (t.id === current.id ? { ...t, path } : t)),
        }));
      }
      const tab: Tab = { id: newId(), path };
      return updatePane(prev, pane.id, (pp) => {
        const tabs = [...pp.tabs];
        tabs.splice(activeIdx === -1 ? tabs.length : activeIdx + 1, 0, tab);
        return { ...pp, tabs, activeTabId: tab.id };
      });
    });
  }, []);

  const handleTreeClick = useCallback((path: string) => openFile(path, false), [openFile]);

  const handleTreeDoubleClick = useCallback(
    (path: string) => {
      const preview = previewRef.current;
      if (preview && preview.newPath === path && Date.now() - preview.at < 600 && preview.prevPath !== path) {
        // The single-click just replaced a tab's file; undo that and open a
        // dedicated new tab instead ("double-click = new tab").
        previewRef.current = null;
        const tab: Tab = { id: newId(), path };
        setLayout((prev) =>
          updatePane(prev, preview.paneId, (pp) => {
            const idx = pp.tabs.findIndex((t) => t.id === preview.tabId);
            if (idx === -1) return pp;
            const tabs = pp.tabs.map((t) => (t.id === preview.tabId ? { ...t, path: preview.prevPath } : t));
            tabs.splice(idx + 1, 0, tab);
            return { ...pp, tabs, activeTabId: tab.id };
          }),
        );
        setActivePaneId(preview.paneId);
      } else {
        openFile(path, true);
      }
    },
    [openFile],
  );

  const closeTab = useCallback((paneId: string, tabId: string) => {
    setLayout((prev) => {
      const pane = findPane(prev, paneId);
      const closing = pane?.tabs.find((t) => t.id === tabId) ?? null;
      const next = normalize(removeTab(prev, paneId, tabId).root);
      // Make sure pending edits reach disk when a file's last tab closes.
      if (closing && !panes(next).some((p) => p.tabs.some((t) => t.path === closing.path)))
        void flushSave(closing.path);
      return next;
    });
    setReadingTabs((prev) => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
  }, []);

  const toggleReadingTab = useCallback((tabId: string) => {
    void flushAll();
    setReadingTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  }, []);

  // ---- keyboard tab operations (within the active pane) ----
  const cycleTab = useCallback((dir: 1 | -1) => {
    setLayout((prev) => {
      const pane = findPane(prev, activePaneIdRef.current) ?? panes(prev)[0];
      if (!pane || pane.tabs.length < 2 || !pane.activeTabId) return prev;
      const idx = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
      const next = pane.tabs[(idx + dir + pane.tabs.length) % pane.tabs.length];
      return updatePane(prev, pane.id, (pp) => ({ ...pp, activeTabId: next.id }));
    });
  }, []);

  const moveTabBy = useCallback((dir: 1 | -1) => {
    setLayout((prev) => {
      const pane = findPane(prev, activePaneIdRef.current) ?? panes(prev)[0];
      if (!pane || !pane.activeTabId) return prev;
      const idx = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= pane.tabs.length) return prev;
      return updatePane(prev, pane.id, (pp) => {
        const tabs = [...pp.tabs];
        [tabs[idx], tabs[target]] = [tabs[target], tabs[idx]];
        return { ...pp, tabs };
      });
    });
  }, []);

  // ---- rename / delete propagation ----
  const handleRenamed = useCallback((from: string, to: string) => {
    const mapPath = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
    moveCached(from, to);
    moveScrollLine(from, to);
    setLayout((prev) => mapPanes(prev, (p) => ({ ...p, tabs: p.tabs.map((t) => ({ ...t, path: mapPath(t.path) })) })));
    setDirtyPaths((prev) => new Set([...prev].map(mapPath)));
  }, []);

  const handleDeleted = useCallback((path: string) => {
    const isGone = (p: string) => p === path || p.startsWith(path + "/");
    setLayout((prev) => {
      for (const pane of panes(prev))
        for (const t of pane.tabs) if (isGone(t.path)) dropCached(t.path);
      const stripped = mapPanes(prev, (pane) => {
        const tabs = pane.tabs.filter((t) => !isGone(t.path));
        if (tabs.length === pane.tabs.length) return pane;
        const activeTabId = tabs.some((t) => t.id === pane.activeTabId)
          ? pane.activeTabId
          : (tabs[tabs.length - 1]?.id ?? null);
        return { ...pane, tabs, activeTabId };
      });
      return normalize(stripped);
    });
    dropCached(path);
  }, []);

  // ---- projects ----
  const pickFolder = useCallback((path: string) => {
    void flushAll();
    setRoot(path);
    const saved = loadLayout(path);
    setLayout(saved.layout);
    setActivePaneId(saved.activePaneId);
    setReadingTabs(new Set());
    setPickerOpen(false);
    setProjects((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 12);
      localStorage.setItem("mdr.recents", JSON.stringify(next));
      return next;
    });
  }, []);

  const removeProject = useCallback((path: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p !== path);
      localStorage.setItem("mdr.recents", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const r = rootFromHash();
      if (r && r !== rootRef.current) pickFolder(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [pickFolder]);

  // ---- global keyboard shortcuts (configurable in Settings) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const action = matchEvent(e);
      if (!action) return;
      switch (action) {
        case "quickOpen":
          e.preventDefault();
          if (root) setSwitcherOpen((v) => !v);
          break;
        case "toggleSidebar":
          e.preventDefault();
          setCollapsed((v) => !v);
          break;
        case "toggleReading":
          e.preventDefault();
          if (activeTab && fileKind(activeTab.path) === "markdown") toggleReadingTab(activeTab.id);
          break;
        case "save":
          e.preventDefault();
          void flushAll();
          break;
        case "settings":
          e.preventDefault();
          setSettingsOpen((v) => !v);
          break;
        case "nextTab":
          e.preventDefault();
          cycleTab(1);
          break;
        case "prevTab":
          e.preventDefault();
          cycleTab(-1);
          break;
        case "moveTabRight":
          e.preventDefault();
          moveTabBy(1);
          break;
        case "moveTabLeft":
          e.preventDefault();
          moveTabBy(-1);
          break;
        case "closeTab":
          e.preventDefault();
          if (activeTab) closeTab(activePane.id, activeTab.id);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root, activeTab, activePane.id, toggleReadingTab, cycleTab, moveTabBy, closeTab]);

  // ---- sidebar resize ----
  const dragging = useRef(false);
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add("resizing");
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setSidebarWidth(Math.min(560, Math.max(160, ev.clientX)));
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

  // ---- layout context for panes/splits ----
  const ctx: LayoutCtx = {
    activePaneId: activePane.id,
    drag,
    readingTabs,
    dirtyPaths,
    onActivatePane: setActivePaneId,
    onActivateTab: (paneId, tabId) => {
      setActivePaneId(paneId);
      setLayout((prev) =>
        updatePane(prev, paneId, (p) => (p.activeTabId === tabId ? p : { ...p, activeTabId: tabId })),
      );
    },
    onCloseTab: closeTab,
    onOpenFile: openFile,
    onToggleReadingTab: toggleReadingTab,
    onDragStart: (paneId, tabId) => {
      dragRef.current = { paneId, tabId };
      setDrag({ paneId, tabId });
    },
    onDragEnd: () => {
      dragRef.current = null;
      setDrag(null);
    },
    onDropTab: (targetPaneId, index) => {
      const d = dragRef.current;
      if (!d) return;
      setLayout((prev) => moveTabTo(prev, d.paneId, d.tabId, targetPaneId, index));
      setActivePaneId(targetPaneId);
      dragRef.current = null;
      setDrag(null);
    },
    onDropZone: (targetPaneId, zone) => {
      const d = dragRef.current;
      if (!d) return;
      if (zone === "center") {
        if (d.paneId === targetPaneId) {
          setLayout((prev) => updatePane(prev, targetPaneId, (p) => ({ ...p, activeTabId: d.tabId })));
        } else {
          setLayout((prev) => moveTabTo(prev, d.paneId, d.tabId, targetPaneId, Number.MAX_SAFE_INTEGER));
        }
        setActivePaneId(targetPaneId);
      } else {
        setLayout((prev) => {
          const res = splitWithTab(prev, d.paneId, d.tabId, targetPaneId, zone as Side);
          if (res.newPaneId) {
            setActivePaneId(res.newPaneId);
            return res.root;
          }
          return prev;
        });
      }
      dragRef.current = null;
      setDrag(null);
    },
    onResizeSplit: (splitId, sizes) => setLayout((prev) => updateSplitSizes(prev, splitId, sizes)),
  };

  return (
    <div className="app">
      {root && !collapsed && (
        <>
          <div className="sidebar-wrap" style={{ width: sidebarWidth }}>
            <Sidebar
              root={root}
              projects={projects}
              activePath={activeTab?.path ?? null}
              onFileClick={handleTreeClick}
              onFileDoubleClick={handleTreeDoubleClick}
              onChangeFolder={() => setPickerOpen(true)}
              onSwitchProject={pickFolder}
              onRemoveProject={removeProject}
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
          <button className="icon-btn" title="Toggle sidebar (⌘\)" onClick={() => setCollapsed((v) => !v)}>
            <PanelLeftIcon size={16} />
          </button>
          <span className="topbar-spacer" />
          <button
            className="icon-btn"
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon size={16} />
          </button>
        </div>

        <div className="panes">
          <LayoutView node={layout} ctx={ctx} />
        </div>
      </div>

      {pickerOpen && <FolderPicker onPick={pickFolder} onClose={root ? () => setPickerOpen(false) : null} />}
      {switcherOpen && root && (
        <QuickSwitcher root={root} onPick={(p, nt) => openFile(p, nt)} onClose={() => setSwitcherOpen(false)} />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
