import { useRef, useState } from "react";
import EditorPane from "./EditorPane";
import TabBar from "./Tabs";
import type { PaneNode, Side } from "../layout";
import type { LayoutCtx } from "./SplitView";

type Zone = Side | "center";

export default function PaneView({ pane, ctx }: { pane: PaneNode; ctx: LayoutCtx }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const isActive = ctx.activePaneId === pane.id;

  const computeZone = (e: React.DragEvent): Zone => {
    const r = bodyRef.current?.getBoundingClientRect();
    if (!r) return "center";
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0.22) return "left";
    if (x > 0.78) return "right";
    if (y < 0.25) return "top";
    if (y > 0.75) return "bottom";
    return "center";
  };

  // Guard on the dataTransfer type, not React state — drag state can lag a
  // frame behind the native event sequence.
  const isTabDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("application/x-mdr-tab");

  // Capture-phase so CodeMirror never sees tab drags as text drops.
  const onDragOver = (e: React.DragEvent) => {
    if (!isTabDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setZone(computeZone(e));
  };
  const onDrop = (e: React.DragEvent) => {
    if (!isTabDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setZone(null);
    ctx.onDropZone(pane.id, computeZone(e));
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!bodyRef.current?.contains(e.relatedTarget as Node)) setZone(null);
  };

  return (
    <div className={`pane${isActive ? "" : " pane-inactive"}`} onMouseDownCapture={() => ctx.onActivatePane(pane.id)}>
      <TabBar pane={pane} ctx={ctx} />
      <div
        ref={bodyRef}
        className="pane-body"
        onDragOverCapture={onDragOver}
        onDropCapture={onDrop}
        onDragLeave={onDragLeave}
      >
        {pane.tabs.map((tab) => (
          <EditorPane
            key={tab.id + ":" + tab.path}
            path={tab.path}
            visible={tab.id === pane.activeTabId}
            reading={ctx.readingTabs.has(tab.id)}
            onOpenFile={ctx.onOpenFile}
          />
        ))}
        {pane.tabs.length === 0 && (
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
                  <kbd>Drag</kbd> a tab to an edge to split
                </div>
                <div>
                  <kbd>⌘\</kbd> hide the sidebar
                </div>
              </div>
            </div>
          </div>
        )}
        {ctx.drag && zone && <div className={`drop-overlay drop-${zone}`} />}
      </div>
    </div>
  );
}
