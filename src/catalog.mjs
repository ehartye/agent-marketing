import { readdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readWorkspace } from "./store.mjs";
import { collections } from "./schema.mjs";

// The workspaces the desk can switch between: the studio file, every *.json under the
// workspaces folder, and the file the desk was launched on. Ids are minted here, so the
// desk can only be pointed at a listed file, never at an arbitrary path.
export function workspaceCatalog(launchFile, { studio, folder } = {}) {
  const entries = [];
  const seen = new Set();
  const add = (id, label, file) => {
    const path = resolve(file);
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({ id, label, path });
  };
  if (studio && existsSync(studio)) add("studio", "Studio", studio);
  if (folder && existsSync(folder))
    for (const name of readdirSync(folder).toSorted())
      if (name.endsWith(".json")) add("ws:" + name.slice(0, -5), name.slice(0, -5), join(folder, name));
  add("launch", basename(launchFile).replace(/\.json$/, ""), launchFile);
  return entries;
}

export function describeWorkspaces(entries, currentId) {
  return {
    current: currentId,
    workspaces: entries.map(({ id, label, path }) => {
      try {
        const w = readWorkspace(path);
        return {
          id,
          label,
          current: id === currentId,
          available: true,
          revision: w.revision,
          projects: w.projects.length,
          records: collections.reduce((n, c) => n + (w[c]?.length || 0), 0),
        };
      } catch (error) {
        return { id, label, current: id === currentId, available: false, reason: error.message };
      }
    }),
  };
}
