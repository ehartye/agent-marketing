import { $, esc } from "../shared.js";
import { plural, daysFrom, dueBadge, gotoButton, initiativeName, hoursText, foldMain, fullTitle } from "../hub-shared.js";
import { recommendedLabel } from "./decisions.js";
import { actionControls } from "./actions.js";
import { kindBadge } from "./timeline.js";

// "Needs you now": the first thing on the Decide & plan page. Everything here comes from
// attention(), so the desk and `marketing next` always agree on what is waiting for the owner.
export function needsHeadline(a) {
  const s = a.summary;
  if (!s.total) return "Nothing needs you right now";
  const part = (n, one, many, notes = []) => n && `${plural(n, one, many)}${notes.filter(Boolean).length ? ` (${notes.filter(Boolean).join(", ")})` : ""}`;
  const parts = [
    part(s.decisions, "decision", "decisions", [s.overdueDecisions && `${s.overdueDecisions} overdue`, s.stale && `${s.stale} stale`]),
    part(s.actions, "action", "actions", [s.overdueActions && `${s.overdueActions} overdue`]),
    part(s.gates, "gate due", "gates due", [s.overdueGates && `${s.overdueGates} overdue`]),
    part(s.blockedInitiatives, "blocked initiative", "blocked initiatives"),
    part(s.picks, "collateral pick", "collateral picks"),
  ].filter(Boolean);
  return `${s.total} ${s.total === 1 ? "thing needs" : "things need"} you: ${parts.join(" · ")}`;
}

// The nearest dated thing that is not yet asking for attention, so an empty panel still says
// when it will next ask.
export function nextDated(workspace, plan, projectId, today) {
  const mine = (rows) => (rows ?? []).filter((r) => r.projectId === projectId),
    found = [
      ...mine(workspace.decisions).filter((d) => d.status === "deferred" && d.needBy).map((d) => ({ date: d.needBy, text: `The deferred decision "${d.title}" comes back`, kind: "decision", id: d.id })),
      ...mine(workspace.actions).filter((a) => a.owner === "owner" && ["todo", "doing"].includes(a.status) && a.due).map((a) => ({ date: a.due, text: `Your action "${a.title}" is due`, kind: "action", id: a.id })),
      ...mine(workspace.gates).filter((g) => ["open", "failed"].includes(g.status) && g.due).map((g) => ({ date: g.due, text: `The gate "${g.name}" is due`, kind: "gate", id: g.id })),
      ...(plan?.initiatives ?? []).filter((i) => i.status === "planned" && !i.children.length).map((i) => ({ date: i.start, text: `"${i.name}" is due to start`, kind: "initiative", id: i.id })),
    ].filter((x) => daysFrom(today, x.date) > 0);
  return found.toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;
}

// A long list buries the urgent things, so each group shows a few rows and a button for the rest, and
// whatever is overdue, from any group, leads in a short group of its own.
const CAP = 5;
const expanded = new Set();
export const toggleNeedGroup = (key) => { if (!expanded.delete(key)) expanded.add(key); };
export const resetNeeds = () => { expanded.clear(); };

const isOverdue = (x) => x.overdue ?? (x.daysLeft !== null && x.daysLeft !== undefined && x.daysLeft < 0);

function group(key, title, items, { quiet = false, note = "" } = {}) {
  if (!items.length) return "";
  const open = expanded.has(key),
    shown = open ? items : items.slice(0, CAP),
    more = items.length > CAP
      ? `<button type="button" class="link-button need-more" data-need-more="${key}" aria-expanded="${open}">${open ? "Show fewer" : `Show all ${items.length}`}</button>`
      : "";
  return `<section class="need-group${quiet ? " quiet" : ""}" data-need-group="${key}"><h3>${esc(title)} <span class="count">${items.length}</span></h3>${note}<ul class="need-list">${shown.join("")}</ul>${more}</section>`;
}
// One scannable line per item: what kind it is, when it is due, what it is and, beside it, the control.
// Whatever else the item says (the question, the recommendation, what happens if the owner stays silent,
// the initiative it is for) waits behind the row's Details toggle. The controls sit outside the toggle.
const row = (key, { head, detail = "", controls = "" }) =>
  `<li class="need" data-need="${esc(key)}">${foldMain({ key: "need:" + key, head, detail })}<div class="need-controls">${controls}</div></li>`;
// Collateral is what the owner calls an asset in the desk.
const collateralBadge = '<span class="pill kind asset"><span aria-hidden="true">▤</span> Collateral</span>';
const title = (text) => `<strong class="row-title">${esc(text)}</strong>`;
const chips = (...parts) => `<span class="row-chips">${parts.filter(Boolean).join("")}</span>`;
const forInitiative = (workspace, id) => (id ? `<p class="caption">For ${gotoButton("initiative", id, initiativeName(workspace, id))}</p>` : "");

// Every item of the list as { kind, overdue, daysLeft, build() }. Each row carries its own kind badge, so
// it still says what it is when it is shown under Overdue, away from the heading that would name it.
function needItems(a, { workspace }) {
  const staleIds = new Set(a.stale.map((s) => s.id)),
    hours = (h) => (h !== null && h !== undefined ? `<span class="meta">${hoursText(h)}</span>` : "");
  const decisions = a.decisions.map((d) => ({ kind: "decision", overdue: isOverdue(d), daysLeft: d.daysLeft, build: () => {
    const rec = recommendedLabel(workspace.decisions?.find((w) => w.id === d.id));
    return row("decision:" + d.id, {
      head: `${chips(kindBadge("decision"), dueBadge(d.daysLeft, d.needBy), staleIds.has(d.id) && `<span class="pill due overdue">Stale: ${plural(a.stale.find((s) => s.id === d.id).daysOverdue, "day")} unanswered</span>`, d.status === "deferred" && '<span class="pill">deferred, back again</span>')}${title(d.title)}${rec ? `<span class="row-sub rec-line">${esc(rec)}</span>` : ""}`,
      detail: `${fullTitle(d.title)}<p class="caption">${esc(d.question)}</p>
       ${d.recommendation ? `<p class="caption"><span class="label">Recommended</span>${esc(d.recommendation)}</p>` : ""}
       ${d.defaultIfSilent ? `<p class="caption"><span class="label">If you stay silent</span>${esc(d.defaultIfSilent)}</p>` : ""}
       ${forInitiative(workspace, d.initiativeId)}`,
      controls: `<button type="button" class="primary" data-goto="decision:${esc(d.id)}" aria-label="Compare the ${d.optionCount} options and decide: ${esc(d.title)}">${d.optionCount ? `Compare ${plural(d.optionCount, "option")} and decide` : "Open the question"}</button>`,
    });
  } }));
  const actions = a.actions.map((x) => ({ kind: "action", overdue: isOverdue(x), daysLeft: x.daysLeft, build: () => {
    const full = workspace.actions.find((w) => w.id === x.id);
    return row("action:" + x.id, {
      head: `${chips(kindBadge("action"), x.reason === "blocked" ? '<span class="pill due overdue">Blocked</span>' : dueBadge(x.daysLeft, x.due), hours(x.hours))}${title(x.title)}`,
      detail: `${fullTitle(x.title)}${x.blockedBy ? `<p class="caption waiting"><strong>Blocked by</strong> ${esc(x.blockedBy)}</p>` : ""}${forInitiative(workspace, x.initiativeId)}`,
      controls: full ? actionControls(full) : "",
    });
  } }));
  const gates = a.gates.map((g) => ({ kind: "gate", overdue: isOverdue(g), daysLeft: g.daysLeft, build: () => row("gate:" + g.id, {
    head: `${chips(kindBadge("gate"), dueBadge(g.daysLeft, g.due), `<span class="pill gate-chip ${esc(g.status)}">${esc(g.status)}</span>`, hours(g.hours))}${title(g.name)}`,
    detail: `${fullTitle(g.name)}<p class="caption"><span class="label">Pass when</span>${esc(g.criteria)}</p>
     ${g.blocks.length ? `<p class="caption waiting"><strong>Holding up</strong> ${g.blocks.map((b) => esc(b.name)).join(", ")}</p>` : ""}`,
    controls: gotoButton("gate", g.id, "Open the gate", "primary-link"),
  }) }));
  const blocked = a.blockedInitiatives.map((i) => ({ kind: "initiative", overdue: false, daysLeft: null, build: () => row("initiative:" + i.id, {
    head: `${chips(kindBadge("initiative"), '<span class="pill due overdue">Blocked</span>', `<span class="meta">${i.status === "running" ? "running" : `starts ${esc(i.start)}`}</span>`)}${title(i.name)}`,
    detail: `${fullTitle(i.name)}<p class="caption waiting"><strong>Waits on</strong> ${esc(i.blocker.name)} (${esc(i.blocker.kind)}, ${esc(i.blocker.status)})</p>`,
    controls: i.blocker.kind === "gate" ? gotoButton("gate", i.blocker.id, "Open the gate", "primary-link") : gotoButton("initiative", i.id, "Open the initiative", "primary-link"),
  }) }));
  // An open slot with two or more candidates is a choice only the owner can make.
  const picks = (a.picks ?? []).map((p) => ({ kind: "asset", overdue: false, daysLeft: null, build: () => row("pick:" + p.slotId, {
    head: `${chips(collateralBadge, `<span class="meta">${plural(p.candidates, "candidate")} waiting</span>`)}${title("Pick the " + p.name)}`,
    detail: fullTitle("Pick the " + p.name) + forInitiative(workspace, p.initiativeId),
    controls: `<button type="button" class="primary" data-collateral-pick="${esc(p.slotId)}" aria-label="Compare ${p.candidates} candidates and pick: ${esc(p.name)}">Compare and pick</button>`,
  }) }));
  return { decisions, actions, gates, blocked, picks };
}

// Slots that wait on someone else (the artist, a render) are not the owner's to act on: they are listed
// quietly and are not in the count.
function waitingRows(a, { workspace }) {
  const waiting = a.waiting ?? (workspace.assetSlots ?? [])
    .filter((s) => s.projectId === a.projectId && s.status === "open" && s.waitingOn)
    .map((s) => ({ slotId: s.id, name: s.name, waitingOn: s.waitingOn, candidates: (workspace.assets ?? []).filter((x) => x.slotId === s.id && x.status === "candidate").length, initiativeId: s.initiativeId ?? null }));
  return waiting.map((w) => row("waiting:" + w.slotId, {
    head: `${chips(collateralBadge)}${title(w.name)}<span class="row-sub waiting"><strong>Waiting on</strong> ${esc(w.waitingOn)}</span>`,
    detail: fullTitle(w.name) + (w.candidates || w.initiativeId ? `<p class="caption waiting">${w.candidates ? plural(w.candidates, "candidate") + " so far" : ""}${w.candidates && w.initiativeId ? " · " : ""}${w.initiativeId ? `for ${gotoButton("initiative", w.initiativeId, initiativeName(workspace, w.initiativeId))}` : ""}</p>` : ""),
    controls: `<button type="button" data-collateral-pick="${esc(w.slotId)}" aria-label="Open the slot: ${esc(w.name)}">Open the slot</button>`,
  }));
}

// Groups in the order the owner should meet them: what is late, then decisions, actions, gates, blocked
// work and, below those, collateral picks (there can be hundreds); what waits on others comes last.
export function needsBody(a, ctx) {
  const items = needItems(a, ctx),
    late = Object.values(items).flat().filter((i) => i.overdue).toSorted((x, y) => x.daysLeft - y.daysLeft),
    moved = (list) => {
      const n = list.filter((i) => i.overdue).length;
      return n ? `<p class="caption">${plural(n, "other item is", "other items are")} overdue, shown above under Overdue.</p>` : "";
    },
    section = (key, title, list) => group(key, title, list.filter((i) => !i.overdue).map((i) => i.build()), { note: moved(list) });
  return group("overdue", "Overdue", late.map((i) => i.build()))
    + section("decisions", "Decisions to make", items.decisions)
    + section("actions", "Your actions", items.actions)
    + section("gates", "Gates due", items.gates)
    + section("blocked", "Blocked work", items.blocked)
    + section("picks", "Collateral to pick", items.picks)
    + group("waiting", "Waiting on someone else", waitingRows(a, ctx), { quiet: true });
}

// The few items that say why a project is on the list: overdue first, then decisions, actions, gates,
// blocked work and picks.
export function topNeeds(a, n = 3) {
  const all = [
    ...a.decisions.map((d) => ({ kind: "decision", id: d.id, title: d.title, daysLeft: d.daysLeft, due: d.needBy, overdue: isOverdue(d) })),
    ...a.actions.map((x) => ({ kind: "action", id: x.id, title: x.title, daysLeft: x.daysLeft, due: x.due, overdue: isOverdue(x) })),
    ...a.gates.map((g) => ({ kind: "gate", id: g.id, title: g.name, daysLeft: g.daysLeft, due: g.due, overdue: isOverdue(g) })),
    ...a.blockedInitiatives.map((i) => ({ kind: "initiative", id: i.id, title: i.name + " (blocked)", daysLeft: null, due: null, overdue: false })),
    ...(a.picks ?? []).map((p) => ({ kind: "asset", id: p.slotId, title: "Pick the " + p.name, daysLeft: null, due: null, overdue: false })),
  ];
  return [...all.filter((x) => x.overdue).toSorted((x, y) => x.daysLeft - y.daysLeft), ...all.filter((x) => !x.overdue)].slice(0, n);
}

// With every project in view there is no one list to act on, so each project gets a short block: how much
// waits there, the top of it, and a button that opens that project.
export function needsOverview(attentions, workspace) {
  const projects = workspace.projects.filter((p) => attentions?.[p.id]);
  if (!projects.length) return '<div class="empty"><p>This workspace has nothing to report yet.</p></div>';
  const total = projects.reduce((n, p) => n + attentions[p.id].summary.total, 0),
    headline = total ? `${total} ${total === 1 ? "thing needs" : "things need"} you across ${plural(projects.length, "project")}` : "Nothing needs you right now in any project";
  const block = (p) => {
    const a = attentions[p.id], top = topNeeds(a, 3), rest = a.summary.total - top.length,
      item = (t) => `<li class="need-top-item">${kindBadge(t.kind)} <strong>${esc(t.title)}</strong> ${t.due || (t.daysLeft !== null && t.daysLeft !== undefined) ? dueBadge(t.daysLeft, t.due) : ""}</li>`;
    return `<article class="need-project" data-need-project="${esc(p.id)}">
      <div class="need-project-head"><h3>${esc(p.name)} <span class="count">${a.summary.total}</span></h3>
        <button type="button" data-select-project="${esc(p.id)}" aria-label="Open ${esc(p.name)} to see everything that needs you there">Open ${esc(p.name)}</button></div>
      <p class="caption">${esc(needsHeadline(a))}${a.waiting?.length ? " · " + a.waiting.length + " waiting on someone else" : ""}</p>
      ${top.length ? `<ul class="need-top">${top.map(item).join("")}</ul>${rest > 0 ? `<p class="caption">and ${rest} more</p>` : ""}` : ""}
    </article>`;
  };
  return `<p class="headline">${esc(headline)}</p><div class="need-projects">${projects.map(block).join("")}</div>`;
}

export function renderNeeds({ workspace, selection, attention, attentions, plan }) {
  const body = $("needs-body"), head = $("needs-summary");
  if (!selection.projectId) {
    head.textContent = attentions ? "as of " + (Object.values(attentions)[0]?.today ?? "today") : "";
    body.innerHTML = attentions ? needsOverview(attentions, workspace) : '<div class="empty"><p>Choose a project above to see what needs you now.</p></div>';
    return;
  }
  if (!attention) {
    head.textContent = "";
    body.innerHTML = '<div class="empty"><p>This project has nothing to report yet.</p></div>';
    return;
  }
  head.textContent = `as of ${attention.today}`;
  const headline = needsHeadline(attention);
  if (!attention.summary.total) {
    const next = nextDated(workspace, plan, selection.projectId, attention.today),
      waiting = group("waiting", "Waiting on someone else", waitingRows(attention, { workspace }), { quiet: true });
    body.innerHTML = `<div class="needs-clear"><p class="headline"><span aria-hidden="true">✓</span> ${esc(headline)}</p>
      <p class="caption">${next ? `Next: ${esc(next.text)} on ${esc(next.date)}, in ${plural(daysFrom(attention.today, next.date), "day")}. ${gotoButton(next.kind, next.id, "Open it")}` : "Nothing is dated ahead either."}</p></div>${waiting}`;
    return;
  }
  body.innerHTML = `<p class="headline">${esc(headline)}</p>${needsBody(attention, { workspace, plan })}`;
}
