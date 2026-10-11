import { $, esc, empty, projectLabel } from "../shared.js";
import { renderMarkdown } from "../markdown.js";
import { gotoButton } from "../hub-shared.js";
import { treeOrder } from "./hierarchy.js";

const KINDS = {
  "market-landscape": "Market landscape",
  demand: "Demand",
  competition: "Competition",
  positioning: "Positioning",
  other: "Report",
};

// Reports are workspace-level: unscoped ones always show; project-scoped ones
// show for their project, or for every project when none is selected.
export function visibleReports(workspace, selection) {
  return [...workspace.reports]
    .filter((r) => !r.projectId || !selection.projectId || r.projectId === selection.projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// The record a report hangs from: its initiative, or the initiative of its gate or decision. A
// report with none of them is unassigned. `via` is the gate or decision it names, if any.
export function reportParent(r, workspace) {
  const gate = r.gateId && workspace.gates?.find((g) => g.id === r.gateId),
    decision = r.decisionId && workspace.decisions?.find((d) => d.id === r.decisionId),
    initiativeId = r.initiativeId ?? gate?.initiativeId ?? decision?.initiativeId ?? null;
  return { initiativeId, gate: gate || null, decision: decision || null };
}

// Reports grouped under their initiative, in the order initiatives are shown, then the unassigned.
export function groupReports(reports, workspace) {
  const order = treeOrder(workspace.initiatives),
    parents = new Map(reports.map((r) => [r.id, reportParent(r, workspace)])),
    groups = [];
  for (const i of order) {
    const items = reports.filter((r) => parents.get(r.id).initiativeId === i.id);
    if (items.length) groups.push({ id: i.id, label: i.name, items });
  }
  const placed = new Set(groups.flatMap((g) => g.items.map((r) => r.id))),
    loose = reports.filter((r) => !placed.has(r.id));
  if (loose.length) groups.push({ id: null, label: "Unassigned", items: loose });
  return groups;
}

function reportCard(r, workspace, open, tag = "h3") {
  const download = "/api/document?" + new URLSearchParams({ kind: "report", id: r.id }),
    { gate, decision } = reportParent(r, workspace),
    under = [
      r.initiativeId && "Initiative: " + gotoButton("initiative", r.initiativeId, workspace.initiatives.find((i) => i.id === r.initiativeId)?.name ?? r.initiativeId),
      decision && "Decision: " + gotoButton("decision", decision.id, decision.title),
      gate && "Gate: " + gotoButton("gate", gate.id, gate.name),
    ].filter(Boolean);
  return `<article class="report" data-report="${esc(r.id)}">
            <${tag}>${esc(r.title)}</${tag}>
            <p class="meta"><span class="pill">${esc(KINDS[r.kind] || KINDS.other)}</span> Saved ${esc(new Date(r.updatedAt).toLocaleDateString())} · ${r.projectId ? projectLabel(r.projectId, workspace) : "Workspace-wide"} · Included in workspace backup</p>
            ${under.length ? `<p class="caption">${under.join(" · ")}</p>` : ""}
            <details class="saved-document report-reader"${open ? " open" : ""}>
              <summary>Read report</summary>
              <div class="document-actions"><span class="caption">${esc(r.markdown.length.toLocaleString())} characters</span>
                <span class="report-links"><a class="button" href="${esc(download)}" download>Download (.md)</a>${r.vaultUrl ? ` <a class="button" href="${esc(r.vaultUrl)}" rel="noopener noreferrer">Open in vault</a>` : ""}</span></div>
              <div class="report-body" tabindex="0" aria-label="Report: ${esc(r.title)}">${renderMarkdown(r.markdown)}</div>
            </details>
          </article>`;
}

export function renderReports({ workspace, selection }) {
  const reports = visibleReports(workspace, selection),
    open = reports.length === 1,
    groups = groupReports(reports, workspace),
    // Headings appear once any report belongs to an initiative; a workspace that links none keeps its plain list.
    grouped = groups.some((g) => g.id);
  $("reports").innerHTML = !reports.length
    ? empty("No research reports saved yet. Run market-research, then save its report here with the document command so you can read it in the desk.")
    : grouped
      ? groups.map((g) => `<section class="report-group"><h3 class="group-head">${g.id ? esc(g.label) : "Unassigned"} <span class="count">${g.items.length}</span></h3>${g.id ? "" : '<p class="caption">No initiative, gate or decision names these yet. Set initiativeId, gateId or decisionId on a report to file it under its parent.</p>'}${g.items.map((r) => reportCard(r, workspace, open, "h4")).join("")}</section>`).join("")
      : reports.map((r) => reportCard(r, workspace, open)).join("");
}
