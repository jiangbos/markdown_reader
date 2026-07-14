export interface Entry {
  name: string;
  path: string;
  type: "dir" | "file";
  hidden?: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  home: () => request<{ home: string; sample: string; sep: string }>("/api/home"),

  browse: (path?: string) =>
    request<{ path: string; parent: string | null; dirs: { name: string; path: string }[] }>(
      `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    ),

  list: (path: string) =>
    request<{ path: string; entries: Entry[] }>(`/api/list?path=${encodeURIComponent(path)}`),

  files: (root: string) =>
    request<{ root: string; files: string[] }>(`/api/files?root=${encodeURIComponent(root)}`),

  readFile: (path: string) =>
    request<{ path: string; content: string; mtime: number }>(`/api/file?path=${encodeURIComponent(path)}`),

  writeFile: (path: string, content: string) =>
    request<{ path: string; mtime: number }>("/api/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    }),

  create: (dir: string, type: "file" | "folder") =>
    request<{ path: string; name: string; type: string }>("/api/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir, type }),
    }),

  rename: (from: string, name: string) =>
    request<{ from: string; to: string }>("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, name }),
    }),

  remove: (path: string) =>
    request<{ deleted: string }>(`/api/entry?path=${encodeURIComponent(path)}`, { method: "DELETE" }),

  rawUrl: (path: string) => `/api/raw?path=${encodeURIComponent(path)}`,
};

/** Join a possibly-relative link target onto the directory of the current file. */
export function resolvePath(currentFile: string, target: string): string {
  if (target.startsWith("/")) return target;
  const dir = currentFile.slice(0, currentFile.lastIndexOf("/"));
  const parts = (dir + "/" + target).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" && out.length > 0) continue;
    if (part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/") || "/";
}

export function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

export function displayName(p: string): string {
  return basename(p).replace(/\.(md|markdown)$/i, "");
}
