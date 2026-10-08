import { $, esc, empty, link, projectLabel } from "../shared.js";

export function renderReception({ workspace, data, selection }, drafts) {
  const filter = $("sentiment-filter").value;
  const rows = data.reactions.filter(r => !filter ||
    (filter === "unreviewed" && !r.reviewed) || (r.reviewed && r.sentiment === filter));
  const pending = data.reactions.filter(r => !r.reviewed).length;
  $("review-count").textContent = `${pending} to review · ${data.reactions.length} captured reactions`;
  $("sentiment").innerHTML = '<div class="summary-grid">' + Object.entries(data.sentiment)
    .map(([sentiment, count]) => `<div><strong>${count}</strong>${esc(sentiment)}</div>`).join("") + "</div>";
  $("reactions").innerHTML = rows.length ? rows.map(r => {
    const draft = drafts.get(r), fields = draft || r;
    return `<article class="panel reaction">
      ${!selection.projectId ? projectLabel(r.projectId, workspace) : ""}
      <span class="pill ${r.reviewed ? esc(r.sentiment) : ""}">${r.reviewed ? esc(r.sentiment) : "Needs review"}</span>
      <span class="pill">${esc(r.channel || "direct")}</span>
      <blockquote>${esc(r.text)}</blockquote><p>${link(r.url, "Read source context")}</p>
      ${!r.reviewed ? `<p class="caption">Suggested label: ${esc(r.sentiment)}. Check the context before saving.</p>` : ""}
      <form data-reaction="${esc(r.id)}" aria-label="Review reaction ${esc(r.id)}">
        <label>Sentiment<select name="sentiment">${["positive", "negative", "neutral", "mixed", "unknown"].map(s => `<option ${fields.sentiment === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <label class="theme-field">Theme<input name="theme" value="${esc(fields.theme)}" required maxlength="150"></label>
        <button class="primary" type="submit">Save review</button>
        <span class="draft-note caption">${draft?.sourceChanged ? "Source changed. Check the updated comment before saving your draft." : draft ? "Unsaved changes in this tab" : ""}</span>
      </form></article>`;
  }).join("") : empty(data.reactions.length
    ? filter === "unreviewed" ? "All captured reactions in this selection have been reviewed." : "No reactions match this label."
    : "No reactions in this selection. Import source-linked comments or adjust the project and date filters.",
    data.reactions.length ? '<button type="button" data-show-reactions>Show all reactions</button>' : '<button type="button" data-open-view="results">Go to results &amp; sources</button>');
}
