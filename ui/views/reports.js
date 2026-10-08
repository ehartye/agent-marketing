import { $, esc, empty, projectLabel } from "../shared.js";
import { renderMarkdown } from "../markdown.js";

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

export function renderReports({ workspace, selection }) {
  const reports = visibleReports(workspace, selection);
  $("reports").innerHTML = reports.length
    ? reports
        .map((r) => {
          const download = "/api/document?" + new URLSearchParams({ kind: "report", id: r.id });
          return `<article class="report" data-report="${esc(r.id)}">
            <h3>${esc(r.title)}</h3>
            <p class="meta"><span class="pill">${esc(KINDS[r.kind] || KINDS.other)}</span> Saved ${esc(new Date(r.updatedAt).toLocaleDateString())} · ${r.projectId ? projectLabel(r.projectId, workspace) : "Workspace-wide"} · Included in workspace backup</p>
            <details class="saved-document report-reader"${reports.length === 1 ? " open" : ""}>
              <summary>Read report</summary>
              <div class="document-actions"><span class="caption">${esc(r.markdown.length.toLocaleString())} characters</span>
                <span class="report-links"><a class="button" href="${esc(download)}" download>Download (.md)</a>${r.vaultUrl ? ` <a class="button" href="${esc(r.vaultUrl)}" rel="noopener noreferrer">Open in vault</a>` : ""}</span></div>
              <div class="report-body" tabindex="0" aria-label="Report: ${esc(r.title)}">${renderMarkdown(r.markdown)}</div>
            </details>
          </article>`;
        })
        .join("")
    : empty(
        "No research reports saved yet. Run market-research, then save its report here with the document command so you can read it in the desk.",
      );
}
