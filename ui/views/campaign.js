import { $, esc, num, pct, empty, link, projectLabel, refLinks as references } from "../shared.js";

export function renderCampaign({ workspace, data, actions, channels, refs, selection }) {
  const p = workspace.projects.find(p => p.id === selection.projectId);
  const refLinks = ids => references(ids, refs);
  const initiatives = () => workspace.initiatives.filter(i => (!selection.projectId || i.projectId === selection.projectId) && (!selection.initiativeId || i.id === selection.initiativeId));
  const a = actions[0];
  $("decision").innerHTML = a
    ? `<div class="decision"><div><span class="label">EVIDENCE</span><h2>${esc(a.title)}</h2><p>${esc(a.reason)}</p>${a.evidence
        .map((id) => {
          const o =
            workspace.observations.find((x) => x.id === id) ||
            workspace.reactions.find((x) => x.id === id) ||
            workspace.evidence.find((x) => x.id === id);
          return o ? link(o.url, id) : esc(id);
        })
        .join(
          " · ",
        )}</div><div><span class="label">NEXT TEST</span><p>${esc(a.next)}</p><p>${refLinks(a.referenceIds)}</p></div><div class="next"><span class="label">STOP &amp; DECIDE</span><p>${esc(a.stop)}</p><strong>Keep the test small enough to learn.</strong></div></div>`
    : empty(
        p
          ? "Record some results or evidence to guide the next decision."
          : "Choose a project to see its next decision.",
      );
  $("initiatives").innerHTML = initiatives().length
    ? initiatives()
        .map(
          (i) =>
            `<article class="initiative">${!selection.projectId ? projectLabel(i.projectId, workspace) : ""}<div class="row"><div><span class="pill">${esc(i.channel)}</span><h3>${esc(i.name)}</h3></div><label>Status<select data-initiative="${esc(i.id)}">${["planned", "running", "paused", "complete"].map((s) => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><p>${esc(i.hypothesis)}</p><p class="caption">${esc(i.cta)} · ${esc(i.start)} → ${esc(i.end)} · ${esc(i.owner)}</p></article>`,
        )
        .join("")
    : empty(
        "No initiatives yet. Import a campaign plan or use the market-campaign skill to create one.",
      );
  $("funnels").innerHTML = data.funnels.length
    ? data.funnels
        .map(
          (f) =>
            `<article class="funnel"><span class="pill">${esc(f.channel)}</span><div class="funnel-step"><span>Visitors</span><strong>${num(f.visitors)}</strong></div><div class="bar"><svg aria-hidden="true"><rect width="100%" height="12"/></svg></div><div class="funnel-step"><span>First use</span><strong>${num(f.starts)}</strong></div><div class="bar"><svg aria-hidden="true"><rect class="starts" width="${f.rate === null ? 0 : Math.max(1, f.rate * 100)}%" height="12"/></svg></div><p><strong>${pct(f.rate)}</strong> <small>${esc(f.interpretation)}</small></p></article>`,
        )
        .join("")
    : empty(
        "Import attributed visitors and starts with matching windows and definitions to see the first-use path.",
      );
  $("channels").innerHTML = channels
    .slice(0, 4)
    .map(
      (c, i) =>
        `<details class="channel"><summary>${esc(c.name)}<span class="meta">${esc(c.hours)} h / test</span></summary><p>${esc(c.approach)}</p><p>${esc((c.rationale || []).join(" · "))}</p><dl><dt>Measure</dt><dd>${esc(c.measure)}</dd><dt>Time &amp; cost</dt><dd>${esc(c.hours)} hours for a test; ${esc(c.cost)}. Launch response may arrive quickly; durable demand takes follow-up.</dd><dt>Risk</dt><dd>${esc(c.risk)}</dd><dt>Complexity</dt><dd>${esc(c.complexity)}</dd><dt>Maintenance</dt><dd>${esc(c.maintainability)}</dd></dl><p>${refLinks(c.referenceIds)}</p></details>`,
    )
    .join("");
}
