import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * One highlight style for both themes — every colour is a CSS variable
 * defined in styles/themes.css, so switching theme is just flipping vars.
 */
export const mdHighlightStyle = HighlightStyle.define([
  // ---- markdown structure ----
  { tag: t.heading1, fontSize: "1.75em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading2, fontSize: "1.45em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading3, fontSize: "1.22em", fontWeight: "650", lineHeight: "1.3" },
  { tag: t.heading4, fontSize: "1.08em", fontWeight: "650" },
  { tag: t.heading5, fontSize: "1em", fontWeight: "650" },
  { tag: t.heading6, fontSize: "0.95em", fontWeight: "650", color: "var(--text-muted)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--text-faint)" },
  { tag: t.quote, color: "var(--text-quote)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)" },
  { tag: t.processingInstruction, color: "var(--text-faint)" },
  { tag: t.labelName, color: "var(--syn-comment)", fontFamily: "var(--font-mono)", fontSize: "0.85em" },
  { tag: t.contentSeparator, color: "var(--text-faint)" },
  { tag: t.meta, color: "var(--text-faint)" },

  // ---- code (nested languages in fenced blocks) ----
  { tag: [t.keyword, t.moduleKeyword, t.operatorKeyword], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--syn-string)" },
  { tag: [t.regexp, t.escape], color: "var(--syn-regexp)" },
  { tag: [t.number, t.integer, t.float], color: "var(--syn-number)" },
  { tag: [t.bool, t.atom, t.null, t.constant(t.variableName)], color: "var(--syn-constant)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "var(--syn-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: "var(--syn-property)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--syn-tag)" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "var(--syn-operator)" },
  { tag: t.variableName, color: "var(--syn-variable)" },
  { tag: t.invalid, color: "var(--syn-invalid)" },
]);
