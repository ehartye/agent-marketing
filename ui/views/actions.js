import { $, esc, empty } from "../shared.js";
import { openAttr, draftAttr, draftValue, plural, daysFrom, dueBadge, statusChip, gotoButton, selectedIf, hoursText } from "../hub-shared.js";

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

export function actionRow(a, { workspace, today, showProject }) {
  const links = [
    a.gateId && gotoButton("gate", a.gateId, "Gate: " + (workspace.gates.find((g) => g.id === a.gateId)?.name ?? a.gateId)),
    a.decisionId && gotoButton("decision", a.decisionId, "Decision: " + (workspace.decisions.find((d) => d.id === a.decisionId)?.title ?? a.decisionId)),
  ].filter(Boolean);
  const due = a.due && OPEN.includes(a.status) ? dueBadge(daysFrom(today, a.due), a.due) : a.due ? `<span class="meta">due ${esc(a.due)}</span>` : "";
  const facts = [
    a.hours !== undefined && hoursText(a.hours),
    a.status === "done" && a.doneAt && "done " + new Date(a.doneAt).toLocaleDateString(),
  ].filter(Boolean);
  return `<li class="action-row ${esc(a.status)}" data-action="${esc(a.id)}">
    <div class="action-main">
      <div class="action-title"><strong>${esc(a.title)}</strong></div>
      <div class="chips">${statusChip(a.status)}<span class="pill owner-${esc(a.owner)}">${esc(a.owner)}</span>${due}${showProject ? `<span class="meta">${esc(workspace.projects.find((p) => p.id === a.projectId)?.name ?? a.projectId)}</span>` : ""}</div>
      ${a.status === "blocked" && a.blockedBy ? `<p class="caption waiting"><strong>Blocked by</strong> ${esc(a.blockedBy)}</p>` : ""}
      ${a.notes ? `<p class="caption">${esc(a.notes)}</p>` : ""}
      ${facts.length || links.length ? `<p class="caption">${facts.map(esc).join(" · ")}${facts.length && links.length ? " · " : ""}${links.join(" ")}</p>` : ""}
    </div>
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
    closed = mine.filter((a) => !isOpenAction(a)),
    ctx = { workspace, today, showProject: !selection.projectId },
    done = mine.filter((a) => a.status === "done").length;
  $("actions-summary").textContent = mine.length ? `${plural(open.length, "open action")} · ${done} done` : "";
  const groups = groupActions(open, orderedInitiatives);
  const list = open.length
    ? groups.map((g) => `<section class="action-group"><h3>${g.id ? gotoButton("initiative", g.id, g.label, "heading-link") : esc(g.label)}</h3><ul class="action-list">${g.items.map((a) => actionRow(a, ctx)).join("")}</ul></section>`).join("")
    : empty(mine.length ? "No open actions. Everything recorded is done or dropped." : "No actions yet. Add the next concrete step, or ask the agent to record the steps of a plan.");
  const history = closed.length
    ? `<details class="closed-actions" ${openAttr("actions-closed")}><summary>Done and dropped (${closed.length})</summary><ul class="action-list">${closed.toSorted((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).map((a) => actionRow(a, ctx)).join("")}</ul></details>`
    : "";
  $("actions-list").innerHTML = list + history + addForm({ workspace, selection });
}
