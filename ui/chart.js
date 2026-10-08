import { chartKey, chartLabel } from "/analysis.js";
import { $, esc, num, empty, link } from "./shared.js";
export function renderActivity(workspace, data, metricKey) {
  const projectNames = new Map(workspace.projects.map((p) => [p.id, p.name]));
  const initiativeNames = new Map(
    workspace.initiatives.map((i) => [i.id, i.name]),
  );
  const grouped = new Map();
  for (const o of data.observations) {
    const key = chartKey(o);
    if (!grouped.has(key)) {
      const context = [
        projectNames.get(o.projectId) || o.projectId,
        initiativeNames.get(o.initiativeId),
      ]
        .filter(Boolean)
        .join(" · ");
      grouped.set(key, {
        key,
        name: context + " · " + chartLabel(o),
        count: 0,
      });
    }
    grouped.get(key).count++;
  }
  const groups = [...grouped.values()];
  if (!grouped.has(metricKey))
    metricKey =
      groups.reduce(
        (best, group) => (!best || group.count > best.count ? group : best),
        null,
      )?.key || "";
  $("metric").innerHTML = groups
    .map((g) => `<option value="${esc(g.key)}">${esc(g.name)}</option>`)
    .join("");
  $("metric").value = metricKey;
  drawChart(data, metricKey);
  return metricKey;
}
export function drawChart(data, metricKey) {
  const all = data.observations
    .filter((o) => chartKey(o) === metricKey)
    .toSorted((a, b) => a.end.localeCompare(b.end));
  if (!all.length) {
    $("chart").innerHTML = empty("Choose a metric after collecting readings.");
    return;
  }
  const max = Math.max(1, ...all.map((o) => o.value)),
    x = (i) => 45 + (i * 650) / Math.max(1, all.length - 1),
    y = (v) => 160 - (v / max) * 125;
  $("chart").innerHTML =
    `<svg class="plot" viewBox="0 0 740 195" role="img" aria-label="${esc(all[0].definition)} over reported dates; exact values in the table below"><line x1="45" y1="160" x2="700" y2="160"/><line x1="45" y1="35" x2="700" y2="35"/><text x="5" y="39">${num(max)}</text><text x="5" y="164">0</text>${all.length > 1 ? `<polyline points="${all.map((o, i) => `${x(i)},${y(o.value)}`).join(" ")}"/>` : ""}${all.map((o, i) => `<circle cx="${x(i)}" cy="${y(o.value)}" r="4"><title>${esc(o.end)}: ${num(o.value)}</title></circle>`).join("")}<text x="45" y="184">${esc(all[0].end)}</text><text x="625" y="184">${esc(all.at(-1).end)}</text></svg><details><summary class="caption">Read chart values &amp; sources</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Chart values"><table><thead><tr><th>Reported period</th><th>Value</th><th>Source</th></tr></thead><tbody>${all.map((o) => `<tr><td>${esc(o.start)} → ${esc(o.end)}</td><td>${num(o.value)}</td><td>${link(o.url, o.id)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
