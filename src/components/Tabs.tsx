import { useState } from "react";
import { displayName } from "../api";
import { BookIcon, PencilIcon, XIcon } from "./Icons";
import type { PaneNode } from "../layout";
import type { LayoutCtx } from "./SplitView";

export default function TabBar({ pane, ctx }: { pane: PaneNode; ctx: LayoutCtx }) {
  const [insert, setInsert] = useState<number | null>(null);
  const readingActive = pane.activeTabId !== null && ctx.readingTabs.has(pane.activeTabId);

  const indexFromEvent = (e: React.DragEvent): number => {
    const els = Array.from((e.currentTarget as HTMLElement).querySelectorAll(".tab"));
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) return i;
    }
    return els.length;
  };

  return (
    <div
      className="tabbar"
      role="tablist"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-mdr-tab")) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setInsert(indexFromEvent(e));
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("application/x-mdr-tab")) return;
        e.preventDefault();
        e.stopPropagation();
        setInsert(null);
        ctx.onDropTab(pane.id, indexFromEvent(e));
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setInsert(null);
      }}
    >
      {pane.tabs.map((tab, i) => {
        const isActiveTab = tab.id === pane.activeTabId;
        const isDirty = ctx.dirtyPaths.has(tab.path);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActiveTab}
            className={`tab${isActiveTab ? " tab-active" : ""}${insert === i ? " tab-insert-before" : ""}`}
            title={tab.path}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-mdr-tab", tab.id);
              e.dataTransfer.effectAllowed = "move";
              ctx.onDragStart(pane.id, tab.id);
            }}
            onDragEnd={() => {
              ctx.onDragEnd();
              setInsert(null);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                ctx.onCloseTab(pane.id, tab.id);
              } else if (e.button === 0) {
                ctx.onActivateTab(pane.id, tab.id);
              }
            }}
          >
            <span className="tab-title">{displayName(tab.path)}</span>
            <button
              className={`tab-close${isDirty ? " tab-dirty" : ""}`}
              aria-label={`Close ${displayName(tab.path)}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onCloseTab(pane.id, tab.id);
              }}
            >
              <span className="tab-dot" />
              <XIcon size={13} />
            </button>
          </div>
        );
      })}
      <div className={`tabbar-space${insert === pane.tabs.length ? " tab-insert-end" : ""}`} />
      {pane.activeTabId && (
        <button
          className={`icon-btn tabbar-action${readingActive ? " icon-btn-active" : ""}`}
          title={readingActive ? "Edit (⌘E)" : "Reading view (⌘E)"}
          onClick={() => pane.activeTabId && ctx.onToggleReadingTab(pane.activeTabId)}
        >
          {readingActive ? <PencilIcon size={15} /> : <BookIcon size={15} />}
        </button>
      )}
    </div>
  );
}
