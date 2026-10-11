import { $, esc, empty, num } from "../shared.js";
import { documentCard } from "../documents.js";
import { openAttr, draftAttr, draftValue, plural, statusChip, gotoButton } from "../hub-shared.js";
import { initiativeFlags, gateChip } from "./plan.js";

// Initiatives as the hierarchy they are: a parent holds the children below it, with the status,
// dates and hours rolled up from them, how far gates and actions have come, a one-line note the
// owner reads, and the documents, decisions, actions and gates that belong to it.
const STATUSES = ["planned", "running", "paused", "complete"];

// Roots first, children in record order. `within` limits the tree to one initiative and below.
export function buildTree(initiatives, within = "") {
  const ids = new Set(initiatives.map((i) => i.id)),
    kids = new Map();
  for (const i of initiatives) {
    const parent = ids.has(i.parentId) ? i.parentId : "";
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(i);
  }
  const grow = (i, depth, seen) => ({ initiative: i, depth, children: seen.has(i.id) ? [] : (kids.get(i.id) ?? []).map((c) => grow(c, depth + 1, new Set([...seen, i.id]))) });
  const roots = within ? initiatives.filter((i) => i.id === within) : (kids.get("") ?? []);
  return roots.map((r) => grow(r, 0, new Set()));
}
export const flatten = (tree) => tree.flatMap((n) => [n.initiative, ...flatten(n.children)]);
// Initiative IDs in display order, for grouping actions the same way.
export const treeOrder = (initiatives, within = "") => flatten(buildTree(initiatives, within));
export function subtreeIds(initiatives, id) {
  return new Set(flatten(buildTree(initiatives, id)).map((i) => i.id));
}

function meter(label, done, total, none) {
  if (!total) return `<div class="meter none"><span class="caption">${esc(none)}</span></div>`;
  return `<div class="meter"><div class="meter-line"><span>${esc(label)}</span><span class="meter-count">${done} of ${total}</span></div><progress max="${total}" value="${done}" aria-label="${esc(label)}: ${done} of ${total}"></progress></div>`;
}

function noteForm(i) {
  const key = "note:" + i.id,
    text = draftValue(key) || (i.note ?? "");
  return `<form class="note-form" data-note-form="${esc(i.id)}"><label>Status note<input name="note" maxlength="200" value="${esc(text)}" ${draftAttr(key)} placeholder="Where this stands, in a line" /></label><button type="submit">Save note</button></form>`;
}

function linked(i, workspace) {
  const reports = workspace.reports.filter((r) => r.initiativeId === i.id),
    decisions = workspace.decisions.filter((d) => d.initiativeId === i.id),
    actions = workspace.actions.filter((a) => a.initiativeId === i.id),
    gates = workspace.gates.filter((g) => g.initiativeId === i.id || (i.dependsOn ?? []).includes(g.id)),
    docs = reports.length
      ? `<p class="docs"><span class="label">Documents</span>${reports.map((r) => gotoButton("report", r.id, r.title)).join(" ")}</p>`
      : "";
  const counts = [
    decisions.length && plural(decisions.length, "decision"),
    actions.length && plural(actions.length, "action"),
    gates.length && plural(gates.length, "gate"),
  ].filter(Boolean);
  const list = (title, items) => items.length ? `<div class="linked-group"><h4>${title}</h4><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul></div>` : "";
  const detail = counts.length
    ? `<details class="linked" ${openAttr("linked:" + i.id)}><summary>${counts.join(" · ")}</summary>
        ${list("Decisions", decisions.map((d) => `${gotoButton("decision", d.id, d.title)} ${statusChip(d.status)}`))}
        ${list("Actions", actions.map((a) => `${gotoButton("action", a.id, a.title)} ${statusChip(a.status)}`))}
        ${list("Gates", gates.map((g) => `${gotoButton("gate", g.id, g.name)} ${gateChip(g.status)}`))}
      </details>`
    : "";
  return docs + detail;
}

export function initiativeNode(node, ctx) {
  const { initiative: i, children } = node,
    { workspace, planFor } = ctx,
    p = planFor(i.projectId)?.initiatives.find((x) => x.id === i.id),
    flags = initiativeFlags(p),
    parent = children.length > 0,
    progress = p?.progress,
    start = p?.rollup?.start ?? i.start,
    end = p?.rollup?.end ?? i.end,
    hours = p ? p.hours : Number.isFinite(i.hours) ? i.hours : null,
    derived = p?.rollup?.status;
  return `<li class="init-node">
    <article class="initiative${parent ? " parent" : ""}" data-initiative-card="${esc(i.id)}" tabindex="-1">
      <div class="row">
        <div class="init-title"><span class="pill">${esc(i.channel)}</span>${flags.chips}${derived ? `<span class="pill rolled">${esc(derived)} overall</span>` : ""}<h3>${esc(i.name)}</h3></div>
        <label>Status<select data-initiative="${esc(i.id)}">${STATUSES.map((s) => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      </div>
      <p>${esc(i.hypothesis)}</p>
      <p class="caption">${esc(i.cta)} · ${esc(start)} → ${esc(end)}${parent ? " (across its children)" : ""} · ${esc(i.owner)} · ${hours === null ? "hours not set" : `${num(hours)} h${parent ? " in total" : ""}`}</p>
      ${flags.notes}
      ${progress ? `<div class="meters">${meter("Gates passed", progress.gatesPassed, progress.gatesTotal, "No gates")}${meter("Actions done", progress.actionsDone, progress.actionsTotal, "No actions")}</div>` : ""}
      ${noteForm(i)}
      ${linked(i, workspace)}
      ${documentCard(i, "campaign")}
    </article>
    ${children.length ? `<ul class="init-children" aria-label="Parts of ${esc(i.name)}">${children.map((c) => initiativeNode(c, ctx)).join("")}</ul>` : ""}
  </li>`;
}

export function renderHierarchy({ workspace, selection, plans, plan }) {
  const planFor = (id) => plans?.[id] ?? (plan?.projectId === id ? plan : null),
    projects = workspace.projects.filter((p) => !selection.projectId || p.id === selection.projectId),
    ctx = { workspace, planFor };
  const trees = projects.map((project) => ({
    project,
    tree: buildTree(workspace.initiatives.filter((i) => i.projectId === project.id), selection.initiativeId),
  })).filter((x) => x.tree.length);
  $("initiatives").innerHTML = trees.length
    ? trees.map(({ project, tree }) => `${selection.projectId ? "" : `<h3 class="project-head">${esc(project.name)}</h3>`}<ul class="init-tree">${tree.map((n) => initiativeNode(n, ctx)).join("")}</ul>`).join("")
    : empty("No initiatives yet. Import a campaign plan or use the market-campaign skill to create one.");
}
