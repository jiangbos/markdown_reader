import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js/lib/common";

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        /* fall through */
      }
    }
    return "";
  },
}).use(taskLists, { enabled: false, label: true });

// External links open in a new tab; internal links are handled by the app.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Tag block elements with their source line so scroll position can be mapped
// between reading mode and the editor.
md.core.ruler.push("source_line_attrs", (state) => {
  const offset = (state.env as { lineOffset?: number }).lineOffset ?? 0;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1 && token.type !== "inline") {
      token.attrSet("data-line", String(token.map[0] + offset));
    }
  }
});

// Resolve relative image paths through the local file server.
const defaultImage =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx].attrGet("src");
  const resolve = (env as { resolveSrc?: (s: string) => string }).resolveSrc;
  if (src && resolve) tokens[idx].attrSet("src", resolve(src));
  return defaultImage(tokens, idx, options, env, self);
};

function stripFrontmatter(text: string): { body: string; lineOffset: number } {
  if (!text.startsWith("---\n")) return { body: text, lineOffset: 0 };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { body: text, lineOffset: 0 };
  const after = text.indexOf("\n", end + 1);
  if (after === -1) return { body: "", lineOffset: 0 };
  const stripped = text.slice(0, after + 1);
  return { body: text.slice(after + 1), lineOffset: (stripped.match(/\n/g) ?? []).length };
}

export function renderMarkdown(text: string, resolveSrc: (src: string) => string): string {
  const { body, lineOffset } = stripFrontmatter(text);
  return md.render(body, { resolveSrc, lineOffset });
}
