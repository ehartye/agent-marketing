// How the desk groups observations into one chart line and names it. The browser loads this file
// as /chart-key.js, so it must stay free of imports and of Node APIs; the advice code in
// analysis.mjs imports stages.mjs and is never sent to the page.
export function chartKey(o) {
  return JSON.stringify([
    o.projectId,
    o.initiativeId || "",
    o.channel,
    o.metric,
    o.definition,
    o.kind,
    o.series || "",
    o.currency || "",
    o.cohort || "",
  ]);
}
export function chartLabel(o) {
  return `${o.channel} · ${o.definition} · ${o.kind}${o.currency ? " · " + o.currency : ""}${o.cohort ? " · cohort " + o.cohort : ""}${o.series ? " · " + o.series : ""}`;
}
