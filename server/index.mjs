import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5174;
const app = express();
app.use(express.json({ limit: "64mb" }));

const MD_EXT = /\.(md|markdown|txt)$/i;
const SKIP_DIRS = new Set(["node_modules", "bower_components", "__pycache__"]);

function ok(res, data) {
  res.json(data);
}
function fail(res, status, message) {
  res.status(status).json({ error: message });
}

/** Normalize an incoming path: must be absolute, no null bytes. */
function safePath(p) {
  if (typeof p !== "string" || p.includes("\0")) return null;
  const resolved = path.resolve(p);
  if (!path.isAbsolute(resolved)) return null;
  return resolved;
}

function isVisible(name) {
  return !name.startsWith(".") && !SKIP_DIRS.has(name);
}

// ---- basic info -------------------------------------------------------------

app.get("/api/home", (_req, res) => {
  ok(res, {
    home: os.homedir(),
    sample: path.join(__dirname, "..", "sample"),
    sep: path.sep,
  });
});

// ---- folder picker: list sub-directories of a path --------------------------

app.get("/api/browse", async (req, res) => {
  const p = safePath(req.query.path || os.homedir());
  if (!p) return fail(res, 400, "Invalid path");
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && isVisible(e.name))
      .map((e) => ({ name: e.name, path: path.join(p, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const parent = path.dirname(p);
    ok(res, { path: p, parent: parent === p ? null : parent, dirs });
  } catch (err) {
    fail(res, 404, `Cannot read directory: ${err.message}`);
  }
});

// ---- list one directory (dirs + markdown files) ------------------------------

app.get("/api/list", async (req, res) => {
  const p = safePath(req.query.path);
  if (!p) return fail(res, 400, "Invalid path");
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    const result = [];
    for (const e of entries) {
      if (!isVisible(e.name)) continue;
      const full = path.join(p, e.name);
      if (e.isDirectory()) result.push({ name: e.name, path: full, type: "dir" });
      else if (e.isFile() && MD_EXT.test(e.name)) result.push({ name: e.name, path: full, type: "file" });
    }
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    ok(res, { path: p, entries: result });
  } catch (err) {
    fail(res, 404, `Cannot read directory: ${err.message}`);
  }
});

// ---- recursive markdown file list (for quick switcher) -----------------------

app.get("/api/files", async (req, res) => {
  const root = safePath(req.query.root);
  if (!root) return fail(res, 400, "Invalid root");
  const files = [];
  const LIMIT = 20000;
  async function walk(dir, depth) {
    if (files.length >= LIMIT || depth > 16) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!isVisible(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile() && MD_EXT.test(e.name)) {
        files.push(path.relative(root, full));
        if (files.length >= LIMIT) return;
      }
    }
  }
  await walk(root, 0);
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  ok(res, { root, files });
});

// ---- read / write files ------------------------------------------------------

app.get("/api/file", async (req, res) => {
  const p = safePath(req.query.path);
  if (!p) return fail(res, 400, "Invalid path");
  try {
    const [content, stat] = await Promise.all([fs.readFile(p, "utf8"), fs.stat(p)]);
    ok(res, { path: p, content, mtime: stat.mtimeMs });
  } catch (err) {
    fail(res, 404, `Cannot read file: ${err.message}`);
  }
});

app.put("/api/file", async (req, res) => {
  const p = safePath(req.body?.path);
  const { content } = req.body ?? {};
  if (!p || typeof content !== "string") return fail(res, 400, "Invalid path or content");
  try {
    await fs.writeFile(p, content, "utf8");
    const stat = await fs.stat(p);
    ok(res, { path: p, mtime: stat.mtimeMs });
  } catch (err) {
    fail(res, 500, `Cannot write file: ${err.message}`);
  }
});

// ---- create new note / folder --------------------------------------------------

app.post("/api/new", async (req, res) => {
  const dir = safePath(req.body?.dir);
  const type = req.body?.type === "folder" ? "folder" : "file";
  if (!dir) return fail(res, 400, "Invalid directory");
  try {
    const base = type === "folder" ? "New folder" : "Untitled";
    const ext = type === "folder" ? "" : ".md";
    let name = `${base}${ext}`;
    for (let i = 2; i < 1000; i++) {
      try {
        await fs.access(path.join(dir, name));
        name = `${base} ${i}${ext}`;
      } catch {
        break;
      }
    }
    const full = path.join(dir, name);
    if (type === "folder") await fs.mkdir(full);
    else await fs.writeFile(full, "", { flag: "wx" });
    ok(res, { path: full, name, type });
  } catch (err) {
    fail(res, 500, `Cannot create: ${err.message}`);
  }
});

// ---- rename / delete -----------------------------------------------------------

app.post("/api/rename", async (req, res) => {
  const from = safePath(req.body?.from);
  const newName = req.body?.name;
  if (!from || typeof newName !== "string" || !newName || /[/\\\0]/.test(newName))
    return fail(res, 400, "Invalid rename request");
  const to = path.join(path.dirname(from), newName);
  try {
    try {
      await fs.access(to);
      if (to !== from) return fail(res, 409, "A file with that name already exists");
    } catch {
      /* target free */
    }
    await fs.rename(from, to);
    ok(res, { from, to });
  } catch (err) {
    fail(res, 500, `Cannot rename: ${err.message}`);
  }
});

app.delete("/api/entry", async (req, res) => {
  const p = safePath(req.query.path);
  if (!p) return fail(res, 400, "Invalid path");
  try {
    await fs.rm(p, { recursive: true });
    ok(res, { deleted: p });
  } catch (err) {
    fail(res, 500, `Cannot delete: ${err.message}`);
  }
});

// ---- raw file serving (images referenced from notes) ----------------------------

app.get("/api/raw", (req, res) => {
  const p = safePath(req.query.path);
  if (!p) return fail(res, 400, "Invalid path");
  res.sendFile(p, (err) => {
    if (err && !res.headersSent) fail(res, 404, "Not found");
  });
});

// ---- static frontend (production build) ------------------------------------------

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"), (err) => {
    if (err && !res.headersSent)
      res.status(404).send("Frontend not built. Run `npm run build` first, or use `npm run dev`.");
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`markdown-reader server listening on http://localhost:${PORT}`);
});
