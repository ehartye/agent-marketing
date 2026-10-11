import { $, esc, empty } from "../shared.js";
import { openAttr, draftAttr, draftValue, plural, daysFrom, dueBadge, statusChip, gotoButton, initiativeName } from "../hub-shared.js";

// Decisions: a question, the options laid side by side on the owner's five dimensions, and the
// controls to decide or defer in place. A decided question folds down to the choice and why, with
// the way to change it and the earlier choices kept in view.
export const DIMENSIONS = [
  ["time", "Time"],
  ["risk", "Risk"],
  ["complexity", "Complexity"],
  ["bestPractice", "Best practice"],
  ["maintainability", "Maintainability"],
];
const ORDER = ["open", "deferred", "decided", "superseded"];
export const FILTERS = [["open", "Open"], ["decided", "Decided"], ["deferred", "Deferred"], ["all", "All"]];
let filter = "", touched = false;
export const decisionFilter = () => filter;
export function setDecisionFilter(value) { filter = value; touched = true; }

const optionLabel = (d, id) => d.options.find((o) => o.id === id)?.label ?? id;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The recommendation is free text, so the option it favours is the one it names first, by id as a
// whole word or by label. No match means no mark rather than a wrong one.
export function recommendedOption(d) {
  const text = (d.recommendation ?? "").toLowerCase();
  if (!text) return null;
  let best = null, at = Infinity;
  const word = (needle) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`, "u").exec(text);
  for (const o of d.options) {
    const id = o.id.toLowerCase(),
      // A one or two letter id ("a") is also an ordinary word; trust it only when the text opens with it.
      byId = id.length <= 2 ? new RegExp(`^(option\\s+)?${escapeRegExp(id)}\\s*($|[:,.;)–—-])`, "u").exec(text) : word(id),
      byLabel = o.label.trim() ? word(o.label.toLowerCase()) : null;
    for (const m of [byId, byLabel]) if (m && m.index < at) { best = o.id; at = m.index; }
  }
  return best;
}

export function optionCard(o, { recommended, chosen, bare = false }) {
  const stated = DIMENSIONS.filter(([key]) => o[key]).length;
  return `<section class="opt${recommended ? " recommended" : ""}${chosen ? " chosen" : ""}" aria-label="Option: ${esc(o.label)}">
    <h4>${esc(o.label)}${recommended ? ' <span class="pill rec"><span aria-hidden="true">★</span> Recommended</span>' : ""}${chosen ? ' <span class="pill chose"><span aria-hidden="true">✓</span> Chosen</span>' : ""}</h4>
    <p class="opt-summary">${o.summary ? esc(o.summary) : ""}</p>
    ${bare ? "" : DIMENSIONS.map(([key, name]) => `<dl class="dim"><dt>${name}</dt><dd${o[key] ? "" : ' class="unstated"'}>${o[key] ? esc(o[key]) : "Not stated"}</dd></dl>`).join("")}
    ${!bare && stated && stated < DIMENSIONS.length ? `<p class="caption opt-gap">${DIMENSIONS.length - stated} of 5 dimensions not stated</p>` : ""}
  </section>`;
}

function optionGrid(d, chosenId) {
  if (!d.options.length) return '<p class="caption">No options have been framed for this question yet.</p>';
  const rec = recommendedOption(d),
    // When no option states any of the five dimensions, rows of "Not stated" would only add noise.
    bare = !d.options.some((o) => DIMENSIONS.some(([key]) => o[key]));
  return `<div class="options${bare ? " bare" : ""}">${d.options.map((o) => optionCard(o, { recommended: o.id === rec, chosen: o.id === chosenId, bare })).join("")}</div>${bare ? '<p class="caption">None of the five dimensions (time, risk, complexity, best practice, maintainability) is stated for these options. Ask the agent to add them before deciding.</p>' : ""}`;
}

// The form that decides. The options are buttons so the choice and the reasoning go together.
function decideForm(d, change) {
  const key = `rationale:${d.id}${change ? ":change" : ""}`,
    rec = recommendedOption(d);
  return `<form class="decide-form" data-decide="${esc(d.id)}"${change ? ' data-change="true"' : ""}>
    <label>${change ? "Why change it" : "Why this choice"} <span class="optional">(saved with the decision)</span>
      <textarea name="rationale" rows="2" maxlength="1000" ${draftAttr(key)}>${esc(draftValue(key))}</textarea></label>
    <div class="decide-buttons" role="group" aria-label="${change ? "Change the decision to" : "Decide"}: ${esc(d.title)}">
      ${d.options.map((o) => `<button type="submit" name="option" value="${esc(o.id)}"${o.id === rec && !change ? ' class="primary"' : ""}${change && o.id === d.chosen ? " disabled" : ""}>${change ? "Change to" : "Decide"}: ${esc(o.label)}</button>`).join("")}
    </div>
  </form>`;
}

function deferForm(d) {
  return `<details class="defer" ${openAttr("defer:" + d.id)}><summary>${d.status === "deferred" ? "Move the date" : "Defer"}…</summary>
    <form class="stack-form" data-defer="${esc(d.id)}">
      <div class="form-row">
        <label>Decide by<input name="until" type="date" value="${esc(d.needBy ?? "")}" ${draftAttr("defer-until:" + d.id)} /></label>
        <label>Reason (optional)<input name="reason" maxlength="300" ${draftAttr("defer-reason:" + d.id)} value="${esc(draftValue("defer-reason:" + d.id))}" /></label>
      </div>
      <button type="submit">${d.status === "deferred" ? "Save the new date" : "Defer"}</button>
    </form></details>`;
}

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function decisionBody(d, { workspace, today }) {
  const report = d.reportId && workspace.reports.find((r) => r.id === d.reportId),
    memos = [report, ...workspace.reports.filter((r) => r.decisionId === d.id && r.id !== d.reportId)].filter(Boolean),
    gates = (d.gateIds ?? []).map((id) => workspace.gates.find((g) => g.id === id)).filter(Boolean),
    links = [
      d.initiativeId && "Initiative: " + gotoButton("initiative", d.initiativeId, initiativeName(workspace, d.initiativeId)),
      ...memos.map((r) => "Memo: " + gotoButton("report", r.id, r.title)),
      ...gates.map((g) => "Affects gate: " + gotoButton("gate", g.id, g.name)),
      ...(workspace.assetSlots ?? []).filter((s) => s.decisionId === d.id).map((s) => "Collateral slot: " + gotoButton("slot", s.id, s.name)),
    ].filter(Boolean);
  const facts = [
    d.recommendation && `<p class="callout"><span class="label">Recommended</span>${esc(d.recommendation)}</p>`,
    d.defaultIfSilent && d.status !== "decided" && `<p class="callout quiet"><span class="label">If you stay silent</span>${esc(d.defaultIfSilent)}</p>`,
  ].filter(Boolean).join("");
  const head = `<p class="question">${esc(d.question)}</p>${links.length ? `<p class="caption links">${links.join(" · ")}</p>` : ""}${facts}`;
  if (d.status === "decided") {
    const history = d.history?.length
      ? `<div class="history"><h4>Earlier choices</h4><ol>${d.history.toReversed().map((h) => `<li>${esc(optionLabel(d, h.chosen))} <span class="meta">${esc(day(h.decidedAt))}</span>${h.rationale ? ` — ${esc(h.rationale)}` : ""}</li>`).join("")}</ol></div>`
      : "";
    return `${head}
      <div class="verdict"><p><strong>Decided: ${esc(optionLabel(d, d.chosen))}</strong> <span class="meta">${esc(day(d.decidedAt))}</span></p>${d.rationale ? `<p class="rationale">${esc(d.rationale)}</p>` : '<p class="caption">No reasoning was recorded.</p>'}</div>
      ${history}
      <details class="compare" ${openAttr("compare:" + d.id)}><summary>Compare the options</summary>${optionGrid(d, d.chosen)}</details>
      <details class="change" ${openAttr("change:" + d.id)}><summary>Change decision</summary><p class="caption">The current choice stays in the history above.</p>${decideForm(d, true)}</details>`;
  }
  if (d.status === "superseded")
    return `${head}<p class="caption">Superseded by ${gotoButton("decision", d.supersededBy, workspace.decisions.find((x) => x.id === d.supersededBy)?.title ?? d.supersededBy)}; decide that one instead.</p>${optionGrid(d, d.chosen)}`;
  return `${head}${optionGrid(d)}${d.options.length ? decideForm(d, false) : ""}${deferForm(d)}`;
}

export function decisionItem(d, ctx) {
  const { workspace, today, startOpen } = ctx,
    left = d.needBy ? daysFrom(today, d.needBy) : null,
    live = d.status === "open" || d.status === "deferred",
    stale = d.status === "open" && left !== null && left < -7;
  const meta = [
    live && dueBadge(left, d.needBy),
    stale && `<span class="pill due overdue">Waiting ${plural(-left, "day")} past its date</span>`,
    d.status === "decided" && `<span class="meta">${esc(optionLabel(d, d.chosen))} · ${esc(day(d.decidedAt))}</span>`,
    ctx.showProject && `<span class="meta">${esc(workspace.projects.find((p) => p.id === d.projectId)?.name ?? d.projectId)}</span>`,
  ].filter(Boolean).join("");
  return `<details class="dcard ${esc(d.status)}" data-decision="${esc(d.id)}" ${openAttr("decision:" + d.id, startOpen)}>
    <summary><span class="dtitle">${statusChip(d.status)}<strong>${esc(d.title)}</strong></span><span class="dmeta">${meta}</span></summary>
    <div class="dbody">${decisionBody(d, ctx)}</div>
  </details>`;
}

export function sortDecisions(list) {
  return list.toSorted((a, b) =>
    ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
    || (a.status === "decided" ? (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "") : (a.needBy ?? "9999").localeCompare(b.needBy ?? "9999"))
    || a.id.localeCompare(b.id));
}
export const filterDecisions = (list, by) => (by === "all" ? list : list.filter((d) => d.status === by));

export function renderDecisions({ workspace, selection, inScope, attention, today }) {
  const all = sortDecisions(workspace.decisions.filter(inScope)),
    counts = Object.fromEntries(FILTERS.map(([key]) => [key, filterDecisions(all, key).length]));
  // Start on the open questions when there are any; once the owner picks a view it stays picked.
  if (!touched || !filter) filter = counts.open ? "open" : "all";
  $("decision-filters").innerHTML = FILTERS.map(([key, label]) => `<button type="button" data-decision-filter="${key}" aria-pressed="${key === filter}">${label} <span class="count">${counts[key]}</span></button>`).join("");
  $("decisions-summary").textContent = all.length ? `${plural(counts.open, "open question")} · ${counts.decided} decided` : "";
  const shown = filterDecisions(all, filter),
    // The most urgent open question starts open, so the first thing on the page is the thing to decide.
    first = all.find((d) => d.status === "open")?.id,
    ctx = { workspace, today, showProject: !selection.projectId };
  $("decisions-list").innerHTML = shown.length
    ? shown.map((d) => decisionItem(d, { ...ctx, startOpen: d.id === first })).join("")
    : empty(all.length ? `No ${filter} decisions.` : "No decisions recorded yet. When a choice needs the owner, the agent records it with its options and a recommendation, and it appears here.");
}
