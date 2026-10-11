import { mutateWorkspace } from "./store.mjs";
import { log } from "./progress.mjs";

function target(workspace, kind, id) {
  if (!["strategy", "campaign"].includes(kind))
    throw new Error("Document kind must be strategy or campaign");
  const collection = kind === "strategy" ? "projects" : "initiatives";
  const field = kind === "strategy" ? "strategy" : "brief";
  const record = workspace[collection].find(r => r.id === id);
  if (!record) throw Object.assign(new Error(`${kind === "strategy" ? "Project" : "Initiative"} does not exist`), { status: 404 });
  return { collection, field, record };
}

function reportRecord(workspace, id) {
  const record = (workspace.reports || []).find(r => r.id === id);
  if (!record) throw Object.assign(new Error("Report does not exist"), { status: 404 });
  return record;
}

export function readDocument(workspace, kind, id) {
  if (kind === "report") {
    const record = reportRecord(workspace, id);
    return {
      kind, id, projectId: record.projectId, name: record.title,
      reportKind: record.kind, vaultUrl: record.vaultUrl, revision: workspace.revision,
      location: `reports[id=${id}]`,
      document: { markdown: record.markdown, updatedAt: record.updatedAt },
    };
  }
  const { collection, field, record } = target(workspace, kind, id);
  if (!record[field]) throw Object.assign(new Error(`No ${kind} document saved for ${id}`), { status: 404 });
  return {
    kind, id, projectId: kind === "strategy" ? id : record.projectId,
    name: record.name, revision: workspace.revision,
    location: `${collection}[id=${id}].${field}`,
    document: record[field],
  };
}

// Reports are workspace-level documents: no project is required, and a save replaces by id.
export function saveReport(file, { id, title, markdown, projectId, kind, vaultUrl, initiativeId, gateId, decisionId }, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Current revision required; validate the workspace before saving a report");
  if (typeof title !== "string" || !title.trim()) throw new Error("A report needs a --title");
  const workspace = mutateWorkspace(file, w => {
    const at = new Date().toISOString(), before = (w.reports || []).find(r => r.id === id);
    const record = { id, title, markdown, updatedAt: at };
    // A save replaces the record, so a project the caller does not restate is kept too.
    const project = projectId || before?.projectId;
    if (project) record.projectId = project;
    if (kind) record.kind = kind;
    if (vaultUrl) record.vaultUrl = vaultUrl;
    // A save replaces the record, so a parent the caller does not restate is kept, not dropped.
    for (const [field, value] of Object.entries({ initiativeId, gateId, decisionId })) {
      const kept = value || before?.[field];
      if (kept) record[field] = kept;
    }
    w.reports = [...(w.reports || []).filter(r => r.id !== id), record];
    if (record.projectId) {
      w.updates = w.updates || [];
      log(w, { projectId: record.projectId, initiativeId: record.initiativeId, kind: "document", refId: id, at, text: `${before ? "Updated" : "Saved"} report: ${title}` });
    }
  }, revision);
  return readDocument(workspace, "report", id);
}

export function saveDocument(file, kind, id, markdown, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Current revision required; validate the workspace before saving a document");
  const workspace = mutateWorkspace(file, w => {
    const { field, record } = target(w, kind, id);
    record[field] = { markdown, updatedAt: new Date().toISOString() };
  }, revision);
  return readDocument(workspace, kind, id);
}
