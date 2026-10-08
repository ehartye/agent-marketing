export async function api(path, body) {
  let response;
  try {
    response = await fetch(path, body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the desk. Check that it is running, then try again.");
  }
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(response.status === 409
      ? "The workspace changed. Refresh, review the latest records, then save again."
      : value.error || "The request failed. Try again.");
    error.status = response.status;
    throw error;
  }
  return value;
}

// Publish one complete snapshot; superseded requests never replace current data.
export function createDeskClient(request = api) {
  let generation = 0, snapshot, references;
  return {
    get snapshot() { return snapshot; },
    async load(input, initial = false) {
      const current = ++generation;
      if (input.from && input.to && input.from > input.to)
        throw new Error("Choose an end date on or after the start date.");
      const workspace = await request("/api/workspace");
      if (current !== generation) return null;
      const selection = { ...input };
      if (!workspace.projects.some(p => p.id === selection.projectId))
        selection.projectId = initial ? workspace.projects[0]?.id || "" : "";
      if (!workspace.initiatives.some(i => i.id === selection.initiativeId && (!selection.projectId || i.projectId === selection.projectId)))
        selection.initiativeId = "";
      const query = new URLSearchParams(Object.entries(selection).filter(([,value]) => value)).toString();
      const suffix = query ? "?" + query : "";
      const [data, actions, channels, refs] = await Promise.all([
        request("/api/report" + suffix), request("/api/advise" + suffix),
        request("/api/channels" + suffix), references || request("/api/references"),
      ]);
      if (current !== generation) return null;
      references = refs;
      snapshot = { workspace, selection, data, actions, channels, refs };
      return snapshot;
    },
  };
}

// Drafts live only in this tab. Keep edits visible when a source changes.
export function reviewDrafts() {
  const values = new Map();
  return {
    set(record, fields) { values.set(record.id, { text: record.text, url: record.url, ...fields }); },
    get(record) {
      const draft = values.get(record.id);
      return draft && { ...draft, sourceChanged: draft.text !== record.text || draft.url !== record.url };
    },
    delete(id) { values.delete(id); },
    get size() { return values.size; },
  };
}
