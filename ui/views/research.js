import { $, esc, empty, link, projectLabel } from "../shared.js";

// Optional claim-level audit fields, shown only when the evidence record carries them.
export function auditNote(e) {
  const parts = [
    e.status && `Status: ${e.status}`,
    e.credibility && `Credibility: ${e.credibility}`,
    e.relevance && `Relevance: ${e.relevance}`,
    e.publishedAt && `Published ${e.publishedAt}`,
    e.dataPeriod && `Data: ${e.dataPeriod}`,
    e.denominator && `Denominator: ${e.denominator}`,
    e.limit && `Limit: ${e.limit}`,
  ].filter(Boolean);
  return parts.length ? `<br><span class="meta audit">${parts.map(esc).join(" · ")}</span>` : "";
}
export function renderResearch({ workspace, data, selection }) {
  $("viability").innerHTML = ["problem", "activation", "retention", "payment", "positioning", "channel"]
    .map((d) => {
      const evidence = data.evidence.filter((e) => e.dimension === d);
      return `<article class="evidence"><h3>${d}</h3>${evidence.length ? evidence.map((e) => `<p>${!selection.projectId ? projectLabel(e.projectId, workspace) : ""}<span class="pill">${esc(e.result)} · ${esc(e.strength)}</span>${esc(e.claim)}<br>${link(e.url, "Evidence source")} · <span class="meta">Checked ${esc(e.checkedAt)}</span>${auditNote(e)}</p>`).join("") : '<p class="caption">No evidence recorded. This remains an open question.</p>'}</article>`;
    })
    .join("");
  $("competitors").innerHTML = data.competitors.length
    ? data.competitors
        .map(
          (c) =>
            `<article class="evidence">${!selection.projectId ? projectLabel(c.projectId, workspace) : ""}<span class="pill">${esc(c.kind)}</span><h3>${esc(c.name)}</h3><p>${esc(c.positioning)}</p><p>${link(c.url, "Open alternative")} · <span class="meta">Checked ${esc(c.checkedAt)}</span></p><div class="table-scroll" tabindex="0" role="region" aria-label="Alternative claims"><table><thead><tr><th>Dimension</th><th>Observed claim</th></tr></thead><tbody>${c.claims.map((x) => `<tr><td>${esc(x.dimension)}</td><td>${esc(x.value)} · ${link(x.url, "Source")}</td></tr>`).join("")}</tbody></table></div></article>`,
        )
        .join("")
    : empty(
        "Research direct alternatives, substitutes and doing nothing. Record dated evidence rather than filling a guessed feature matrix.",
      );
}
