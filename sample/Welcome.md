---
title: Welcome
tags: [getting-started]
---

# Welcome to Markdown Reader

This is a **live preview** editor, in the spirit of Obsidian: the line your cursor is on shows the raw markdown, and everything else renders in place. Move your cursor onto this line and the `**bold**` markers appear — move away and they melt back into formatting.

Try it. Click anywhere and just start typing. Your changes save automatically.

## The basics

- Click a note in the sidebar to open it in the current tab
- *Double-click* to open it in a new tab
- Press `⌘P` to jump to any note by name
- Press `⌘E` to switch to the fully rendered reading view
- `⌘B` and `⌘I` toggle **bold** and *italic*
- `⌘F` finds text in the current note
- ⌘+click a [link](https://www.markdownguide.org) to open it

## Tasks

- [x] Build a markdown reader
- [x] Make editing feel like writing, not coding
- [ ] Take notes about everything

## A little code

Code blocks get proper syntax highlighting:

```ts
interface Note {
  path: string;
  title: string;
  words: number;
}

const welcome: Note = {
  path: "Welcome.md",
  title: "Welcome",
  words: 260,
};
```

And `inline code` looks like this.

> The palest ink is more reliable than the most powerful memory.
> — Chinese proverb

## Tables

Tables render right here in the editor. **Click a table to edit its source** — click anywhere outside and it turns back into a table:

| Shortcut | Action                |
| -------- | --------------------- |
| ⌘P       | Quick open            |
| ⌘E       | Toggle reading view   |
| ⌃⌥→ / ⌃⌥← | Next / previous tab  |
| ⌘;       | Settings — remap any shortcut |

---

There are more notes in the **Guide** folder. Enjoy!
