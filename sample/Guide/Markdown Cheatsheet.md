# Markdown Cheatsheet

A quick reference for everything this editor understands.

## Headings

# H1 — the big one
## H2 — section
### H3 — subsection
#### H4
##### H5
###### H6

## Emphasis

*italic*, **bold**, ***bold italic***, ~~strikethrough~~, and `inline code`.

## Lists

1. First
2. Second
3. Third

- Bullets
- More bullets
  - Nested bullets

## Task lists

- [ ] Click a checkbox to toggle it — right in the editor
- [x] Done items get crossed out

## Quotes

> Simplicity is the ultimate sophistication.

## Links & images

[A markdown guide](https://www.markdownguide.org) — hold ⌘ and click.

Relative links to other notes work too: [Shortcuts](Shortcuts.md).

## Code

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
```

## Horizontal rule

---

That line above is a `---` in the source. Put your cursor on it to see.
