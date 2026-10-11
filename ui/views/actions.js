import { $, esc, empty } from "../shared.js";
import { openAttr, draftAttr, draftValue, plural, daysFrom, dueBadge, statusChip, gotoButton, selectedIf, hoursText, foldMain, fullTitle } from "../hub-shared.js";

// Actions: the concrete next steps, each with a status the owner can move in place.
const OPEN = ["todo", "doing", "blocked"];
export const isOpenAction = (a) => OPEN.includes(a.status);

const button = (a, status, label, cls = "") =>
  `<button type="button"${cls ? ` class="${cls}"` : ""} data-action-status="${status}" data-action-id="${esc(a.id)}" aria-label="${esc(label)}: ${esc(a.title)}">${esc(label)}</button>`;

// The buttons that move an action on. "Blocked" asks what is in the way, because a blocked action
// with no reason cannot be unblocked by anyone else.
export function actionControls(a) {
  const blockForm = `<details class="inline-pop" ${openAttr("block:" + a.id)}><summary>Blocked…</summary><form data-block-form="${esc(a.id)}"><label>What is in the way?<input name="notes" ${draftAttr("block:" + a.id)} value="${esc(draftValue("block:" + a.id))}" maxlength="300" required /></label><button type="submit">Mark blocked</button></form></details>`;
  if (a.status === "todo") return button(a, "doing", "Start") + button(a, "done", "Done", "primary") + blockForm;
  if (a.status === "doing") return button(a, "done", "Done", "primary") + blockForm;
  if (a.status === "blocked") return button(a, "doing", "Unblock") + button(a, "done", "Done", "primary");
  return button(a, "todo", "Reopen");
}

// What to do now: the owner's own steps due within two weeks (or already late) and anything under way or
// stuck, whoever it belongs to. The rest is folded away, each fold saying how many it holds: the owner's
// steps further off or undated, the agent's own steps, and what is done or dropped. Every action lands in
// exactly one of the four, in the order it was given.
export const NOW_DAYS = 14;
export function splitActions(list, today) {
  const out = { now: [], later: [], agent: [], closed: [] };
  for (const a of list) {
    if (!isOpenAction(a)) out.closed.push(a);
    else if (a.status !== "todo") out.now.push(a);
    else if (a.owner !== "owner") out.agent.push(a);
    else if (a.due && daysFrom(today, a.due) <= NOW_DAYS) out.now.push(a);
    else out.later.push(a);
  }
  return out;
}

// One line: status, who, when and what, with the controls beside it. The notes, the reason it is blocked
// and the links to its gate and decision wait behind the row's Details toggle.
export function actionRow(a, { workspace, today, showProject }) {
  const links = [
    a.gateId && gotoButton("gate", a.gateId, "Gate: " + (workspace.gates.find((g) => g.id === a.gateId)?.name ?? a.gateId)),
    a.decisionId && gotoButton("decision", a.decisionId, "Decision: " + (workspace.decisions.find((d) => d.id === a.decisionId)?.title ?? a.decisionId)),
  ].filter(Boolean);
  const due = a.due && OPEN.includes(a.status) ? dueBadge(daysFrom(today, a.due), a.due) : a.due ? `<span class="meta">due ${esc(a.due)}</span>` : "";
  const done = a.status === "done" && a.doneAt ? "done " + new Date(a.doneAt).toLocaleDateString() : "";
  const head = `<span class="row-chips">${statusChip(a.status)}<span class="pill owner-${esc(a.owner)}">${esc(a.owner)}</span>${due}${a.hours !== undefined ? `<span class="meta">${hoursText(a.hours)}</span>` : ""}${showProject ? `<span class="meta">${esc(workspace.projects.find((p) => p.id === a.projectId)?.name ?? a.projectId)}</span>` : ""}</span><strong class="row-title">${esc(a.title)}</strong>`;
  const detail = `${fullTitle(a.title)}${a.status === "blocked" && a.blockedBy ? `<p class="caption waiting"><strong>Blocked by</strong> ${esc(a.blockedBy)}</p>` : ""}${a.notes ? `<p class="caption">${esc(a.notes)}</p>` : ""}${done || links.length ? `<p class="caption">${esc(done)}${done && links.length ? " · " : ""}${links.join(" ")}</p>` : ""}`;
  return `<li class="action-row ${esc(a.status)}" data-action="${esc(a.id)}">
    <div class="action-main">${foldMain({ key: "action:" + a.id, head, detail })}</div>
    <div class="action-controls">${actionControls(a)}</div>
  </li>`;
}

// Open actions grouped by the initiative they serve, in the order initiatives are shown, then
// the actions that serve none.
export function groupActions(list, orderedInitiatives) {
  const groups = [];
  for (const i of orderedInitiatives) {
    const mine = list.filter((a) => a.initiativeId === i.id);
    if (mine.length) groups.push({ id: i.id, label: i.name, items: mine });
  }
  const known = new Set(orderedInitiatives.map((i) => i.id)),
    loose = list.filter((a) => !a.initiativeId || !known.has(a.initiativeId));
  if (loose.length) groups.push({ id: null, label: "No initiative", items: loose });
  return groups;
}

export const slug = (title, taken) => {
  const base = (String(title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "")) || "action";
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
};

// Drafts are keyed by project, so a half-typed action never turns up under another project.
export function addForm({ workspace, selection }) {
  if (!selection.projectId && workspace.projects.length > 1)
    return '<p class="caption">Choose a project above to add an action to it.</p>';
  const project = selection.projectId || workspace.projects[0]?.id;
  if (!project) return "";
  const initiatives = workspace.initiatives.filter((i) => i.projectId === project),
    key = (name) => `add-action:${project}:${name}`,
    owner = draftValue(key("owner")) === "agent" ? "agent" : "owner",
    initiative = initiatives.some((i) => i.id === draftValue(key("initiativeId"))) ? draftValue(key("initiativeId")) : "";
  return `<details class="add-action" ${openAttr("add-action")}><summary>Add an action</summary>
    <form class="stack-form" data-add-action="${esc(project)}">
      <label>What needs doing<input name="title" required maxlength="200" ${draftAttr(key("title"))} value="${esc(draftValue(key("title")))}" /></label>
      <div class="form-row">
        <label>Who<select name="owner" ${draftAttr(key("owner"))}><option value="owner"${selectedIf("owner", owner)}>Me (owner)</option><option value="agent"${selectedIf("agent", owner)}>The agent</option></select></label>
        <label>Due<input name="due" type="date" ${draftAttr(key("due"))} value="${esc(draftValue(key("due")))}" /></label>
        <label>Hours<input name="hours" type="number" min="0" step="0.25" inputmode="decimal" ${draftAttr(key("hours"))} value="${esc(draftValue(key("hours")))}" /></label>
        <label>For initiative<select name="initiativeId" ${draftAttr(key("initiativeId"))}><option value=""${selectedIf("", initiative)}>None</option>${initiatives.map((i) => `<option value="${esc(i.id)}"${selectedIf(i.id, initiative)}>${esc(i.name)}</option>`).join("")}</select></label>
      </div>
      <button type="submit" class="primary">Add action</button>
    </form></details>`;
}

export function renderActions({ workspace, selection, orderedInitiatives, inScope, today }) {
  const mine = workspace.actions.filter(inScope),
    open = mine.filter(isOpenAction),
    { now, later, agent, closed } = splitActions(mine, today),
    ctx = { workspace, today, showProject: !selection.projectId },
    done = mine.filter((a) => a.status === "done").length,
    byDue = (list) => list.toSorted((x, y) => (x.due ?? "9999").localeCompare(y.due ?? "9999")),
    grouped = (list) => groupActions(byDue(list), orderedInitiatives)
      .map((g) => `<section class="action-group"><h3>${g.id ? gotoButton("initiative", g.id, g.label, "heading-link") : esc(g.label)}</h3><ul class="action-list">${g.items.map((a) => actionRow(a, ctx)).join("")}</ul></section>`).join(""),
    fold = (key, label, list, body) => (list.length ? `<details class="closed-actions" ${openAttr(key)}><summary>${label} (${list.length})</summary>${body}</details>` : "");
  $("actions-summary").textContent = mine.length ? `${plural(now.length, "action")} to do now · ${open.length} open · ${done} done` : "";
  const list = now.length
    ? grouped(now)
    : empty(!mine.length
      ? "No actions yet. Add the next concrete step, or ask the agent to record the steps of a plan."
      : open.length ? `Nothing is due in the next ${NOW_DAYS} days and nothing is under way. The rest is below.` : "No open actions. Everything recorded is done or dropped.");
  $("actions-list").innerHTML = list
    + fold("actions-later", "Later", later, grouped(later))
    + fold("actions-agent", "Agent steps", agent, grouped(agent))
    + fold("actions-closed", "Done and dropped", closed, `<ul class="action-list">${closed.toSorted((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).map((a) => actionRow(a, ctx)).join("")}</ul>`)
    + addForm({ workspace, selection });
}
