/**
 * Per-file reading-position memory: the topmost visible source line (0-based)
 * for each file, shared between edit and reading mode and persisted to
 * localStorage so progress survives reloads.
 */

const KEY = "mdr.readpos";
const MAX_ENTRIES = 500;
const PERSIST_DELAY = 300;

const positions = new Map<string, number>();
let persistTimer: number | undefined;

try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    for (const [path, line] of Object.entries(JSON.parse(raw) as Record<string, number>)) {
      if (typeof line === "number") positions.set(path, line);
    }
  }
} catch {
  /* corrupted store: start fresh */
}

function persist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(positions)));
    } catch {
      /* quota / private mode: position memory is best-effort */
    }
  }, PERSIST_DELAY);
}

export function getScrollLine(path: string): number | undefined {
  return positions.get(path);
}

export function setScrollLine(path: string, line: number) {
  if (positions.get(path) === line) return;
  positions.delete(path); // re-insert so the map stays LRU-ordered
  positions.set(path, line);
  if (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value;
    if (oldest !== undefined) positions.delete(oldest);
  }
  persist();
}

export function moveScrollLine(from: string, to: string) {
  const line = positions.get(from);
  if (line !== undefined) {
    positions.delete(from);
    setScrollLine(to, line);
  }
}
