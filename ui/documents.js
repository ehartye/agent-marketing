import { esc } from "./shared.js";

export function documentCard(record, kind) {
  const saved = kind === "strategy" ? record.strategy : record.brief;
  const label = kind === "strategy" ? "strategy" : "campaign brief";
  const skill = kind === "strategy" ? "market-strategy" : "market-campaign";
  if (!saved) return `<p class="caption">No ${label} saved yet. Use ${skill} to create and save one for this ${kind === "strategy" ? "project" : "initiative"}.</p>`;
  const download = "/api/document?" + new URLSearchParams({ kind, id: record.id });
  return `<details class="saved-document"><summary>Read saved ${label}</summary>
    <div class="document-actions"><span class="caption">Saved ${esc(new Date(saved.updatedAt).toLocaleString())} · Included in workspace backup</span>
    <a class="button" href="${esc(download)}" download>Download ${label} (.md)</a></div>
    <pre class="document-body" tabindex="0" aria-label="Saved ${label} for ${esc(record.name)}">${esc(saved.markdown)}</pre>
    <p class="caption">To revise this document, use ${skill} or save an edited Markdown copy with the document command.</p>
    </details>`;
}
