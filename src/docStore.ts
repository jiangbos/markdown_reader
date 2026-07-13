import { EditorState } from "@codemirror/state";
import { api } from "./api";

/**
 * Shared per-file document store: caches CodeMirror EditorStates (so undo
 * history, cursor and content survive tab switches / reopen) and handles
 * debounced auto-saving with dirty tracking.
 */

const states = new Map<string, EditorState>();
const dirty = new Map<string, string>(); // path -> latest unsaved content
const timers = new Map<string, number>();
const listeners = new Set<(path: string, isDirty: boolean) => void>();

const SAVE_DELAY = 600;

export function getCachedState(path: string): EditorState | undefined {
  return states.get(path);
}

export function setCachedState(path: string, state: EditorState) {
  states.set(path, state);
}

export function dropCached(path: string) {
  states.delete(path);
  dirty.delete(path);
  const t = timers.get(path);
  if (t) window.clearTimeout(t);
  timers.delete(path);
}

export function moveCached(from: string, to: string) {
  const s = states.get(from);
  if (s) {
    states.set(to, s);
    states.delete(from);
  }
  const d = dirty.get(from);
  if (d !== undefined) {
    dirty.set(to, d);
    dirty.delete(from);
  }
  const t = timers.get(from);
  if (t) {
    window.clearTimeout(t);
    timers.delete(from);
    scheduleSave(to, dirty.get(to) ?? "");
  }
}

export function isDirty(path: string): boolean {
  return dirty.has(path);
}

export function onDirtyChange(fn: (path: string, isDirty: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(path: string, d: boolean) {
  for (const fn of listeners) fn(path, d);
}

export function scheduleSave(path: string, content: string) {
  if (!dirty.has(path)) emit(path, true);
  dirty.set(path, content);
  const prev = timers.get(path);
  if (prev) window.clearTimeout(prev);
  timers.set(
    path,
    window.setTimeout(() => void flushSave(path), SAVE_DELAY),
  );
}

export async function flushSave(path: string): Promise<void> {
  const t = timers.get(path);
  if (t) {
    window.clearTimeout(t);
    timers.delete(path);
  }
  const content = dirty.get(path);
  if (content === undefined) return;
  try {
    await api.writeFile(path, content);
    // Only clear if no newer edit arrived while saving.
    if (dirty.get(path) === content) {
      dirty.delete(path);
      emit(path, false);
    }
  } catch (err) {
    console.error("Save failed:", err);
  }
}

export async function flushAll(): Promise<void> {
  await Promise.all([...dirty.keys()].map((p) => flushSave(p)));
}

// Best-effort flush when the page is being closed.
window.addEventListener("beforeunload", () => {
  for (const [path, content] of dirty) {
    try {
      fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
        keepalive: true,
      });
    } catch {
      /* best effort */
    }
  }
});

/** Current text of a file: unsaved buffer > cached editor state > disk. */
export async function currentText(path: string): Promise<string> {
  const d = dirty.get(path);
  if (d !== undefined) return d;
  const s = states.get(path);
  if (s) return s.doc.toString();
  const { content } = await api.readFile(path);
  return content;
}
