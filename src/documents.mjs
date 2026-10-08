import { mutateWorkspace } from "./store.mjs";

function target(workspace, kind, id) {
  if (!["strategy", "campaign"].includes(kind))
    throw new Error("Document kind must be strategy or campaign");
  const collection = kind === "strategy" ? "projects" : "initiatives";
  const field = kind === "strategy" ? "strategy" : "brief";
  const record = workspace[collection].find(r => r.id === id);
  if (!record) throw Object.assign(new Error(`${kind === "strategy" ? "Project" : "Initiative"} does not exist`), { status: 404 });
  return { collection, field, record };
}

export function readDocument(workspace, kind, id) {
  const { collection, field, record } = target(workspace, kind, id);
  if (!record[field]) throw Object.assign(new Error(`No ${kind} document saved for ${id}`), { status: 404 });
  return {
    kind, id, projectId: kind === "strategy" ? id : record.projectId,
    name: record.name, revision: workspace.revision,
    location: `${collection}[id=${id}].${field}`,
    document: record[field],
  };
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
