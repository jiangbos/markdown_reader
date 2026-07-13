/**
 * Configurable keyboard shortcuts. Bindings are stored as normalized combo
 * strings ("Mod-Alt-ArrowRight"), persisted in localStorage, and looked up
 * live on every keydown — so changes in Settings apply immediately.
 */

export interface ActionDef {
  id: string;
  label: string;
  def: string; // default combo
}

export const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);

// On macOS, ⌘⌥←/→ switch *browser* tabs and ⌘, opens the browser's settings —
// those keys never reach the page. Default to ⌃⌥ arrows and ⌘; instead.
const tabMod = isMac ? "Ctrl-Alt-" : "Mod-Alt-";

export const ACTIONS: ActionDef[] = [
  { id: "quickOpen", label: "Quick open", def: "Mod-p" },
  { id: "toggleReading", label: "Toggle reading view", def: "Mod-e" },
  { id: "toggleSidebar", label: "Toggle sidebar", def: "Mod-\\" },
  { id: "save", label: "Save now", def: "Mod-s" },
  { id: "bold", label: "Bold", def: "Mod-b" },
  { id: "italic", label: "Italic", def: "Mod-i" },
  { id: "nextTab", label: "Next tab", def: `${tabMod}ArrowRight` },
  { id: "prevTab", label: "Previous tab", def: `${tabMod}ArrowLeft` },
  { id: "moveTabRight", label: "Move tab right", def: `${tabMod}Shift-ArrowRight` },
  { id: "moveTabLeft", label: "Move tab left", def: `${tabMod}Shift-ArrowLeft` },
  { id: "closeTab", label: "Close tab", def: "Mod-Alt-w" },
  { id: "settings", label: "Open settings", def: "Mod-;" },
];

const STORAGE_KEY = "mdr.keys";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

let overrides = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function bindingFor(id: string): string {
  return overrides[id] ?? ACTIONS.find((a) => a.id === id)?.def ?? "";
}

export function isCustom(id: string): boolean {
  return overrides[id] !== undefined && overrides[id] !== ACTIONS.find((a) => a.id === id)?.def;
}

export function setBinding(id: string, combo: string | null) {
  if (combo === null) delete overrides[id];
  else overrides[id] = combo;
  save();
}

export function resetAllBindings() {
  overrides = {};
  save();
}

/** Normalize a KeyboardEvent into a combo string, or null for bare modifiers. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  let key = e.key;
  if (key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") return null;
  // With Alt held, macOS produces special characters — recover the real key.
  if (e.altKey && e.code.startsWith("Key")) key = e.code.slice(3).toLowerCase();
  else if (e.altKey && e.code.startsWith("Digit")) key = e.code.slice(5);
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toLowerCase();
  const parts: string[] = [];
  // "Mod" is the platform's primary modifier (⌘ on Mac, Ctrl elsewhere);
  // "Ctrl" is the secondary one (⌃ on Mac, Win/Meta elsewhere).
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (isMac ? e.ctrlKey : e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("-");
}

/** Which configured action (if any) does this event trigger? */
export function matchEvent(e: KeyboardEvent): string | null {
  const combo = comboFromEvent(e);
  if (!combo) return null;
  for (const a of ACTIONS) if (bindingFor(a.id) === combo) return a.id;
  return null;
}

const KEY_SYMBOLS: Record<string, string> = {
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "⏎",
  Backspace: "⌫",
  Space: "␣",
  Escape: "⎋",
  Tab: "⇥",
};

export function formatCombo(combo: string): string {
  let rest = combo;
  let out = "";
  const mods: [string, string][] = isMac
    ? [
        ["Mod-", "⌘"],
        ["Ctrl-", "⌃"],
        ["Alt-", "⌥"],
        ["Shift-", "⇧"],
      ]
    : [
        ["Mod-", "Ctrl+"],
        ["Ctrl-", "Win+"],
        ["Alt-", "Alt+"],
        ["Shift-", "Shift+"],
      ];
  let changed = true;
  while (changed && rest.length > 1) {
    changed = false;
    for (const [prefix, symbol] of mods) {
      if (rest.startsWith(prefix)) {
        out += symbol;
        rest = rest.slice(prefix.length);
        changed = true;
      }
    }
  }
  return out + (KEY_SYMBOLS[rest] ?? (rest.length === 1 ? rest.toUpperCase() : rest));
}
