import { $, esc, pct, empty, projectLabel } from "../shared.js";

export function renderExperiments({ workspace, data, selection }) {
  $("experiments-list").innerHTML = data.experiments.length
    ? data.experiments
        .map(
          (e) =>
            `<article class="panel experiment">${!selection.projectId ? projectLabel(e.projectId, workspace) : ""}<span class="pill">${esc(e.decision)}</span><h2>${esc(e.name)}</h2>${e.arms.map((a) => `<div class="interval"><div>${esc(a.name)} · ${a.interval ? `${a.interval.successes} / ${a.interval.trials} · ${pct(a.interval.rate)} observed` : "No observations"}</div>${a.interval ? `<div class="track"><svg role="img" aria-label="${esc(a.name)} Wilson interval ${pct(a.interval.low)} to ${pct(a.interval.high)}"><rect class="range" x="${a.interval.low * 100}%" width="${(a.interval.high - a.interval.low) * 100}%" height="24"/><rect class="point" x="${a.interval.rate * 100}%" width="3" height="24"/></svg></div><span class="caption">95% Wilson interval: ${pct(a.interval.low)}–${pct(a.interval.high)}</span>` : ""}</div>`).join("")}<p>Difference B − A: ${e.difference ? `${pct(e.difference.estimate)} · conservative bounds ${pct(e.difference.low)} to ${pct(e.difference.high)}` : "Unknown"}</p><p><strong>Stopping rule:</strong> ${esc(e.stoppingRule)}</p><p class="caption">${esc(e.caveat)}</p></article>`,
        )
        .join("")
    : empty(
        "No experiments recorded. Define two arms, one primary outcome, a sample target and a stopping rule before gathering results.",
      );
}
