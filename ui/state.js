const unreachable = () => new Error("Cannot reach the desk. Check that it is running, then try again.");
function refusal(status, value) {
  const error = new Error(status === 409
    ? "The workspace changed. Refresh, review the latest records, then save again."
    : value?.error || "The request failed. Try again.");
  error.status = status;
  return error;
}
export async function api(path, body) {
  let response;
  try {
    response = await fetch(path, body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw unreachable();
  }
  const value = await response.json();
  if (!response.ok) throw refusal(response.status, value);
  return value;
}

// Sends one file as the raw body of a request, with everything else in the query, and reports how
// much has gone as a fraction. (fetch cannot report upload progress; XMLHttpRequest can.)
export function uploadFile(query, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/asset/upload?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== "")));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onerror = () => reject(unreachable());
    xhr.onload = () => {
      let value = null;
      try { value = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && value) resolve(value);
      else reject(refusal(xhr.status, value));
    };
    xhr.send(file);
  });
}

// What the desk says after an import: the first warnings about fields no record defines, then a count.
export function importMessage(result) {
  const base = "Results imported. Records with matching IDs were updated.",
    warnings = result?.warnings || [];
  if (!warnings.length) return base;
  const more = warnings.length - 3;
  return `${base} ${warnings.length} warning${warnings.length === 1 ? "" : "s"}: ${warnings.slice(0, 3).join(" | ")}${more > 0 ? `; and ${more} more` : ""}`;
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
      // What needs the owner is read for the project in view, or for every project when none is; the
      // hierarchy needs a plan for every project it shows, so with no project chosen each gets its own.
      const each = (path) => Promise.all(workspace.projects.map(p => request(path + encodeURIComponent(p.id))));
      const [data, actions, channels, refs, plan, attention, plans, attentionList] = await Promise.all([
        request("/api/report" + suffix), request("/api/advise" + suffix),
        request("/api/channels" + suffix), references || request("/api/references"),
        request("/api/plan" + suffix),
        selection.projectId ? request("/api/attention?projectId=" + encodeURIComponent(selection.projectId)) : null,
        selection.projectId ? null : each("/api/plan?projectId="),
        selection.projectId ? null : each("/api/attention?projectId="),
      ]);
      if (current !== generation) return null;
      references = refs;
      const byProject = selection.projectId
        ? { [selection.projectId]: plan }
        : Object.fromEntries(workspace.projects.map((p, n) => [p.id, plans[n]]));
      const attentions = selection.projectId
        ? (attention ? { [selection.projectId]: attention } : {})
        : Object.fromEntries(workspace.projects.map((p, n) => [p.id, attentionList[n]]).filter(([, a]) => a));
      snapshot = { workspace, selection, data, actions, channels, refs, plan, plans: byProject, attention, attentions };
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
    clear() { values.clear(); },
    get size() { return values.size; },
  };
}
