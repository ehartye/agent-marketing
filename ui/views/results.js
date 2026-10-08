import { $, esc, num, empty, link, projectLabel } from "../shared.js";

export function renderResults({ workspace, data, selection }) {
  $("readings").innerHTML = data.totals.length
    ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Collected readings"><table><thead><tr><th>Project / channel</th><th>Definition</th><th>Total / latest snapshot</th><th>Source records</th></tr></thead><tbody>${data.totals
        .map(
          (t) =>
            `<tr><td>${projectLabel(t.projectId, workspace)}${esc(t.channel)}</td><td>${esc(t.definition)}</td><td>${t.ambiguous ? "Needs reconciliation" : num(t.value)} ${esc(t.currency || "")}</td><td>${t.evidence
              .map((id) => {
                const o = workspace.observations.find((x) => x.id === id);
                return o ? link(o.url, id) : esc(id);
              })
              .join(", ")}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : empty(
        "No readings in this selection. Import normalized JSON/CSV results or register a monitoring source.",
      );
  $("sources").innerHTML = data.sources.length
    ? data.sources
        .map(
          (s) =>
            `<article class="source">${!selection.projectId ? projectLabel(s.projectId, workspace) : ""}<div class="row"><h3>${esc(s.name)}</h3><span class="pill">${esc(s.adapter)}</span></div><p>${esc(s.target)} · ${s.lastCheckedAt ? "Checked " + esc(s.lastCheckedAt) : "Not collected yet"}</p><p class="${s.lastError ? "error" : "muted"}">${esc(s.lastError || "Ready for collection")}</p></article>`,
        )
        .join("")
    : empty(
        "Register your own repository or HN thread with the market-monitor skill. Analytics from other channels can be imported.",
      );
}
