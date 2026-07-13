import { Fragment, useRef } from "react";
import PaneView from "./PaneView";
import type { LayoutNode, Side, SplitNode } from "../layout";

export interface DragInfo {
  paneId: string;
  tabId: string;
}

/** Everything a pane / split needs from the app, threaded down the tree. */
export interface LayoutCtx {
  activePaneId: string;
  drag: DragInfo | null;
  readingTabs: Set<string>;
  dirtyPaths: Set<string>;
  onActivatePane: (paneId: string) => void;
  onActivateTab: (paneId: string, tabId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onOpenFile: (path: string, newTab: boolean) => void;
  onToggleReadingTab: (tabId: string) => void;
  onDragStart: (paneId: string, tabId: string) => void;
  onDragEnd: () => void;
  onDropTab: (targetPaneId: string, index: number) => void;
  onDropZone: (targetPaneId: string, zone: Side | "center") => void;
  onResizeSplit: (splitId: string, sizes: number[]) => void;
}

export function LayoutView({ node, ctx }: { node: LayoutNode; ctx: LayoutCtx }) {
  if (node.type === "pane") return <PaneView pane={node} ctx={ctx} />;
  return <SplitView node={node} ctx={ctx} />;
}

function SplitView({ node, ctx }: { node: SplitNode; ctx: LayoutCtx }) {
  const ref = useRef<HTMLDivElement>(null);
  const row = node.dir === "row";

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const total = row ? rect.width : rect.height;
    const startPos = row ? e.clientX : e.clientY;
    const s0 = node.sizes[index] ?? 1 / node.children.length;
    const s1 = node.sizes[index + 1] ?? 1 / node.children.length;
    document.body.classList.add("resizing");
    document.body.style.cursor = row ? "col-resize" : "row-resize";
    const onMove = (ev: MouseEvent) => {
      const delta = ((row ? ev.clientX : ev.clientY) - startPos) / total;
      const min = 0.12;
      let a = s0 + delta;
      let b = s1 - delta;
      if (a < min) {
        b -= min - a;
        a = min;
      }
      if (b < min) {
        a -= min - b;
        b = min;
      }
      const sizes = [...node.sizes];
      sizes[index] = a;
      sizes[index + 1] = b;
      ctx.onResizeSplit(node.id, sizes);
    };
    const onUp = () => {
      document.body.classList.remove("resizing");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={ref} className={`split split-${node.dir}`}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <div className="split-cell" style={{ flexGrow: node.sizes[i] ?? 1, flexBasis: 0, flexShrink: 1 }}>
            <LayoutView node={child} ctx={ctx} />
          </div>
          {i < node.children.length - 1 && (
            <div className={`gutter gutter-${node.dir}`} onMouseDown={(e) => startResize(i, e)} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
