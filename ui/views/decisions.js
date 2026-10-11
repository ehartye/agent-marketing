import { $, esc, empty } from "../shared.js";
import { openAttr, draftAttr, draftValue, plural, daysFrom, dueBadge, statusChip, gotoButton, initiativeName, clampMore } from "../hub-shared.js";

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
export function setDecisionFilter(value) { filter = value; touched = true; clearActed(); }

// How many open questions the Open view lists as rows before the rest wait behind one button. Whatever
// was just acted on stays listed, and a jump to a hidden one lists them all.
export const OPEN_ROWS = 5;
let listAll = false;
export const showAllOpen = (value = true) => { listAll = value; };
export const decisionRows = (list, all, keep = () => false) => {
  if (all || list.length <= OPEN_ROWS) return { shown: list, hidden: 0 };
  const shown = list.filter((d, n) => n < OPEN_ROWS || keep(d));
  return { shown, hidden: list.length - shown.length };
};

const optionLabel = (d, id) => d.options.find((o) => o.id === id)?.label ?? id;
// The option the agent recommends is the one the decision names by id (`recommendedOptionId`). The
// recommendation is free text and is only ever shown, never read for a guess: "Don't ship now" would
// otherwise mark "Ship now". No named option means no badge and no primary button.
export function recommendedOption(d) {
  return d.options.some((o) => o.id === d.recommendedOptionId) ? d.recommendedOptionId : null;
}

// The line a row carries: "Recommended: <that option's own label>", from the id the decision names and
// never from its prose. Empty when no option is named.
export function recommendedLabel(d) {
  const id = d ? recommendedOption(d) : null;
  return id ? "Recommended: " + optionLabel(d, id) : "";
}

// Changing a decision to the choice it already has would only overwrite its reason in the history.
export function changeRefusal(d, chosen, change) {
  return change && chosen === d.chosen ? "That is already the decision. Choose a different option to change it." : "";
}

// The decision just acted on stays in the Open view with a banner, so the owner sees where it went;
// the next filter change or move to another tab lets it go.
const acted = new Map();
export const markActed = (id, text) => { acted.set(id, text); };
export const clearActed = () => { acted.clear(); };
export const actedText = (id) => acted.get(id);

// What the Open view lists: the open questions and the one just acted on, with every other settled
// question folded below. Any other view lists exactly what its filter names.
export function decisionsView(all, by) {
  if (by !== "open") return { primary: filterDecisions(all, by), folded: [] };
  const live = (d) => d.status === "open" || acted.has(d.id);
  return {
    primary: all.filter(live).toSorted((x, y) => (x.needBy ?? "9999").localeCompare(y.needBy ?? "9999") || x.id.localeCompare(y.id)),
    folded: all.filter((d) => !live(d)),
  };
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
      ${d.options.map((o) => `<button type="submit" name="option" value="${esc(o.id)}"${o.id === rec && !change ? ' class="primary"' : ""}${change && o.id === d.chosen ? " disabled data-keep-disabled" : ""}>${change ? "Change to" : "Decide"}: ${esc(o.label)}</button>`).join("")}
    </div>
  </form>`;
}

function deferForm(d) {
  return `<details class="defer" ${openAttr("defer:" + d.id)}><summary>${d.status === "deferred" ? "Move the date" : "Defer"}…</summary>
    <form class="stack-form" data-defer="${esc(d.id)}">
      <div class="form-row">
        <label>Decide by<input name="until" type="date" value="${esc(draftValue("defer-until:" + d.id) || d.needBy || "")}" ${draftAttr("defer-until:" + d.id)} /></label>
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
  // A long question, recommendation or default is shown in a few lines with a toggle for the rest, so the card
  // reaches its options without a screenful of prose first.
  const clamped = (text, label, lines, at, cls, inner = esc(text)) =>
    `<div class="clamp clamp-${lines} ${cls}">${inner}${clampMore(text, label, { at })}</div>`;
  const recText = `${recommendedOption(d) ? optionLabel(d, d.recommendedOptionId) + (d.recommendation ? " — " : "") : ""}${d.recommendation ?? ""}`;
  const facts = [
    (d.recommendation || recommendedOption(d)) && `<div class="callout"><span class="label">Recommended</span>${clamped(recText, "Read the whole recommendation", 3, 260, "", `<p class="clamp-text">${recommendedOption(d) ? `<strong>${esc(optionLabel(d, d.recommendedOptionId))}</strong>${d.recommendation ? " — " : ""}` : ""}${esc(d.recommendation ?? "")}</p>`)}</div>`,
    d.defaultIfSilent && d.status !== "decided" && `<div class="callout quiet"><span class="label">If you stay silent</span>${clamped(d.defaultIfSilent, "Read the whole default", 2, 170, "", `<p class="clamp-text">${esc(d.defaultIfSilent)}</p>`)}</div>`,
  ].filter(Boolean).join("");
  const linkLabel = [
    d.initiativeId && "initiative",
    memos.length && plural(memos.length, "memo"),
    gates.length && plural(gates.length, "gate"),
    (workspace.assetSlots ?? []).some((s) => s.decisionId === d.id) && "collateral",
  ].filter(Boolean).join(", ");
  const head = `${clamped(d.question, "Read the whole question", 4, 300, "question", `<p class="question clamp-text">${esc(d.question)}</p>`)}${links.length > 2 ? `<details class="linked-records" ${openAttr("links:" + d.id)}><summary>Linked: ${esc(linkLabel)}</summary><p class="caption links">${links.join(" · ")}</p></details>` : links.length ? `<p class="caption links">${links.join(" · ")}</p>` : ""}${facts}`;
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
  const rec = live ? recommendedLabel(d) : "";
  const cue = live ? (d.options.length ? `Compare ${plural(d.options.length, "option")}` : "Open the question") : "Details";
  const meta = [
    live && dueBadge(left, d.needBy),
    stale && `<span class="pill due overdue">Waiting ${plural(-left, "day")} past its date</span>`,
    d.status === "decided" && `<span class="meta">${esc(optionLabel(d, d.chosen))} · ${esc(day(d.decidedAt))}</span>`,
    ctx.showProject && `<span class="meta">${esc(workspace.projects.find((p) => p.id === d.projectId)?.name ?? d.projectId)}</span>`,
  ].filter(Boolean).join("");
  const banner = ctx.banner ? `<p class="acted-banner"><span aria-hidden="true">✓</span> <strong>${esc(ctx.banner)}</strong> <span class="meta">It leaves the Open list when you change the filter or the tab.</span></p>` : "";
  // An open question is a row, not a card: the Open view already says it is open, so the line is the title,
  // when it is needed by, the option the agent recommends and the cue to compare. The card opens inline.
  return `${banner}<details class="dcard ${esc(d.status)}${ctx.banner ? " acted" : ""}" data-decision="${esc(d.id)}" ${openAttr("decision:" + d.id, startOpen)}>
    <summary><span class="dtitle">${d.status === "open" ? "" : statusChip(d.status)}<strong>${esc(d.title)}</strong>${rec ? `<span class="row-sub rec-line">${esc(rec)}</span>` : ""}</span><span class="dmeta">${meta}<span class="row-toggle">${esc(cue)}</span></span></summary>
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
  const { primary, folded } = decisionsView(all, filter),
    // The most urgent open question starts open, so the first thing on the page is the thing to decide.
    first = all.find((d) => d.status === "open")?.id,
    ctx = { workspace, today, showProject: !selection.projectId },
    item = (d) => decisionItem(d, { ...ctx, startOpen: d.id === first, banner: actedText(d.id) });
  const rows = filter === "open" ? decisionRows(primary, listAll, (d) => acted.has(d.id)) : { shown: primary, hidden: 0 },
    more = filter === "open" && primary.length > OPEN_ROWS
      ? `<button type="button" class="link-button need-more" data-decision-more aria-expanded="${listAll}">${listAll ? "Show fewer" : `Show all ${primary.length} open questions`}</button>`
      : "";
  const fold = folded.length
    ? `<details class="fold decided-fold" ${openAttr("section:decided-list")}><summary>Decided, deferred and replaced <span class="count">${folded.length}</span></summary>${folded.map(item).join("")}</details>`
    : "";
  $("decisions-list").innerHTML = primary.length || folded.length
    ? rows.shown.map(item).join("") + more + fold
    : empty(all.length ? `No ${filter} decisions.` : "No decisions recorded yet. When a choice needs the owner, the agent records it with its options and a recommendation, and it appears here.");
}
// A new workspace starts again on its open questions.
export function resetDecisionView() { filter = ""; touched = false; listAll = false; clearActed(); }
