# Markdown Reader

A local-first markdown **reader & editor** that runs as a web app. Point it at any folder on your machine and read, browse, and edit your notes with an Obsidian-style **live preview**: the line your cursor is on shows raw markdown, everything else renders in place.

## Features

- **Live preview editing** (CodeMirror 6) — formatting marks melt away when your cursor leaves the line: headings, bold/italic/strikethrough, inline code, links, blockquotes, lists, horizontal rules
- **Interactive widgets in the editor** — clickable task checkboxes, inline images (local & remote), fenced code blocks with real syntax highlighting (140+ languages) and a language chip
- **Reading view** (`⌘E`) — fully rendered markdown via markdown-it (GFM tables, task lists, typographer, highlight.js)
- **Any folder** — an in-app folder picker with recent folders; the folder tree lives in the sidebar
- **Tabs** — single-click opens a note in the current tab, double-click opens a new tab and jumps to it; middle-click closes; unsaved-dot indicator
- **Quick switcher** (`⌘P`) — fuzzy-jump to any note in the folder
- **File management** — right-click for new note / new folder / rename / delete, inline renaming
- **Auto-save** — debounced writes to disk as you type, plus `⌘S` to force it
- **Resizable, collapsible sidebar**, light & dark themes, word/character count
- **YAML frontmatter** styled as metadata, `⌘B`/`⌘I` formatting shortcuts, `⌘F` search, ⌘+click to follow links (relative `.md` links open in-app)

## Getting started

```bash
npm install
npm run dev        # dev mode: Vite on :5173, API server on :5174
```

or a production build:

```bash
npm run build
npm start          # serves the built app + API on http://localhost:5174
```

Open the app, pick a folder (or hit **Try the sample notes**), and start writing.

## Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| `⌘P` / `⌘K` | Quick open |
| `⌘E` | Toggle reading view |
| `⌘\` | Toggle sidebar |
| `⌘S` | Save now (auto-saves anyway) |
| `⌘B` / `⌘I` | Bold / italic |
| `⌘F` | Find in note |

## How it works

- **Frontend** — React + TypeScript + Vite. The editor is CodeMirror 6 with `@codemirror/lang-markdown` (GFM) and a custom live-preview extension (`src/editor/livePreview.ts`) that walks the Lezer syntax tree over the visible viewport and swaps syntax for decorations/widgets on every line the selection doesn't touch. Editor states are cached per file, so undo history survives tab switches.
- **Reading view** — markdown-it with task lists and highlight.js, sharing the same typography and syntax palette (all theming is CSS variables).
- **Backend** — a small Express server (`server/index.mjs`) that lists directories, reads/writes files, and serves images referenced by notes. Everything stays on your machine.

## Roadmap ideas

- Rendered tables in live preview (currently tables render in reading view and stay as tidy source while editing)
- KaTeX math and Mermaid diagrams
- Wiki-style `[[links]]` and backlinks
- File watching to reflect external changes live
- Drag-and-drop tab reordering and image paste

## License

MIT
