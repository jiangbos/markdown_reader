import { newId } from "./types";

/**
 * The editor area is a tree: split nodes (row = side by side, column =
 * stacked) whose leaves are panes, each with its own tab strip. Dragging a
 * tab onto a pane edge splits that pane; empty panes are pruned away by
 * normalize(), which also flattens nested splits that share a direction.
 */

export interface Tab {
  id: string;
  path: string;
}

export interface PaneNode {
  type: "pane";
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

export interface SplitNode {
  type: "split";
  id: string;
  dir: "row" | "column";
  children: LayoutNode[];
  sizes: number[]; // fractions, kept summing to ~1
}

export type LayoutNode = PaneNode | SplitNode;
export type Side = "left" | "right" | "top" | "bottom";

export function makePane(tabs: Tab[] = [], activeTabId: string | null = null): PaneNode {
  return { type: "pane", id: newId(), tabs, activeTabId: activeTabId ?? tabs[0]?.id ?? null };
}

/** All panes in visual order. */
export function panes(node: LayoutNode): PaneNode[] {
  return node.type === "pane" ? [node] : node.children.flatMap(panes);
}

export function findPane(node: LayoutNode, id: string): PaneNode | null {
  return panes(node).find((p) => p.id === id) ?? null;
}

export function updatePane(node: LayoutNode, id: string, fn: (p: PaneNode) => PaneNode): LayoutNode {
  if (node.type === "pane") return node.id === id ? fn(node) : node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = updatePane(c, id, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

export function mapPanes(node: LayoutNode, fn: (p: PaneNode) => PaneNode): LayoutNode {
  if (node.type === "pane") return fn(node);
  return { ...node, children: node.children.map((c) => mapPanes(c, fn)) };
}

/** Drop empty panes, collapse single-child splits, flatten same-dir nesting. */
export function normalize(root: LayoutNode): LayoutNode {
  return norm(root) ?? makePane();

  function norm(node: LayoutNode): LayoutNode | null {
    if (node.type === "pane") return node.tabs.length > 0 ? node : null;
    const children: LayoutNode[] = [];
    const sizes: number[] = [];
    node.children.forEach((child, i) => {
      const next = norm(child);
      if (!next) return;
      const size = node.sizes[i] ?? 1 / node.children.length;
      if (next.type === "split" && next.dir === node.dir) {
        next.children.forEach((grandchild, j) => {
          children.push(grandchild);
          sizes.push(size * (next.sizes[j] ?? 1 / next.children.length));
        });
      } else {
        children.push(next);
        sizes.push(size);
      }
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...node, children, sizes: sizes.map((s) => s / sum) };
  }
}

/** Remove a tab, fixing the pane's active tab. Does not normalize. */
export function removeTab(root: LayoutNode, paneId: string, tabId: string): { root: LayoutNode; tab: Tab | null } {
  let removed: Tab | null = null;
  const next = updatePane(root, paneId, (p) => {
    const idx = p.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return p;
    removed = p.tabs[idx];
    const tabs = p.tabs.filter((t) => t.id !== tabId);
    const activeTabId = p.activeTabId === tabId ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? null) : p.activeTabId;
    return { ...p, tabs, activeTabId };
  });
  return { root: next, tab: removed };
}

/** Move a tab to a position in a (possibly different) pane. */
export function moveTabTo(
  root: LayoutNode,
  sourcePaneId: string,
  tabId: string,
  targetPaneId: string,
  index: number,
): LayoutNode {
  if (sourcePaneId === targetPaneId) {
    return updatePane(root, sourcePaneId, (p) => {
      const from = p.tabs.findIndex((t) => t.id === tabId);
      if (from === -1) return p;
      const tabs = [...p.tabs];
      const [tab] = tabs.splice(from, 1);
      const to = Math.max(0, Math.min(from < index ? index - 1 : index, tabs.length));
      tabs.splice(to, 0, tab);
      return { ...p, tabs, activeTabId: tabId };
    });
  }
  const { root: without, tab } = removeTab(root, sourcePaneId, tabId);
  if (!tab) return root;
  const inserted = updatePane(without, targetPaneId, (p) => {
    const tabs = [...p.tabs];
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
    return { ...p, tabs, activeTabId: tab.id };
  });
  return normalize(inserted);
}

/** Split `targetPaneId` on `side`, moving the dragged tab into the new pane. */
export function splitWithTab(
  root: LayoutNode,
  sourcePaneId: string,
  tabId: string,
  targetPaneId: string,
  side: Side,
): { root: LayoutNode; newPaneId: string | null } {
  const source = findPane(root, sourcePaneId);
  if (!source) return { root, newPaneId: null };
  // Splitting a pane with its own only tab would just move the pane around.
  if (sourcePaneId === targetPaneId && source.tabs.length === 1) return { root, newPaneId: null };
  const { root: without, tab } = removeTab(root, sourcePaneId, tabId);
  if (!tab) return { root, newPaneId: null };
  const fresh = makePane([tab], tab.id);
  const dir: "row" | "column" = side === "left" || side === "right" ? "row" : "column";
  const before = side === "left" || side === "top";
  const placed = insertBeside(without, targetPaneId, fresh, dir, before);
  return { root: normalize(placed), newPaneId: fresh.id };
}

function insertBeside(
  node: LayoutNode,
  targetId: string,
  pane: PaneNode,
  dir: "row" | "column",
  before: boolean,
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== targetId) return node;
    return {
      type: "split",
      id: newId(),
      dir,
      children: before ? [pane, node] : [node, pane],
      sizes: [0.5, 0.5],
    };
  }
  const idx = node.children.findIndex((c) => c.type === "pane" && c.id === targetId);
  if (idx !== -1 && node.dir === dir) {
    const children = [...node.children];
    const sizes = [...node.sizes];
    const half = (sizes[idx] ?? 1 / children.length) / 2;
    sizes[idx] = half;
    children.splice(before ? idx : idx + 1, 0, pane);
    sizes.splice(before ? idx : idx + 1, 0, half);
    return { ...node, children, sizes };
  }
  return { ...node, children: node.children.map((c) => insertBeside(c, targetId, pane, dir, before)) };
}

export function updateSplitSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map((c) => updateSplitSizes(c, splitId, sizes)) };
}

export function isValidLayout(x: unknown): x is LayoutNode {
  if (!x || typeof x !== "object") return false;
  const n = x as Record<string, unknown>;
  if (n.type === "pane") {
    return (
      typeof n.id === "string" &&
      Array.isArray(n.tabs) &&
      (n.tabs as unknown[]).every(
        (t) =>
          !!t &&
          typeof (t as Tab).id === "string" &&
          typeof (t as Tab).path === "string",
      ) &&
      (n.activeTabId === null || typeof n.activeTabId === "string")
    );
  }
  if (n.type === "split") {
    return (
      typeof n.id === "string" &&
      (n.dir === "row" || n.dir === "column") &&
      Array.isArray(n.children) &&
      (n.children as unknown[]).length > 0 &&
      (n.children as unknown[]).every(isValidLayout) &&
      Array.isArray(n.sizes)
    );
  }
  return false;
}
