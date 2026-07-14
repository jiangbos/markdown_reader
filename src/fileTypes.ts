/** Classify files by extension to pick a viewer. Unknown types attempt a
 * plain-text render; the server rejects binaries so they fall back to the
 * "can't be opened" panel. */

export type FileKind = "markdown" | "image" | "pdf" | "video" | "audio" | "text";

const MARKDOWN = new Set(["md", "markdown", "txt"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const VIDEO = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac"]);

export function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileKind(path: string): FileKind {
  const ext = extOf(path);
  if (MARKDOWN.has(ext)) return "markdown";
  if (IMAGE.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (VIDEO.has(ext)) return "video";
  if (AUDIO.has(ext)) return "audio";
  return "text";
}
