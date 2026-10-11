import { $, esc, empty } from "../shared.js";
import { draftAttr, draftValue, plural, localDay, gotoButton, selectedIf } from "../hub-shared.js";

// The timeline: every update, newest first, grouped by the day it happened.
// Five entries to start with, so the page stays short; one button shows the rest.
const PAGE = 5;
let shown = PAGE;
export const resetTimeline = () => { shown = PAGE; };
export const showMoreTimeline = () => { shown = Infinity; };

const KINDS = { decision: "Decision", gate: "Gate", initiative: "Initiative", action: "Action", asset: "Asset", document: "Document", note: "Note" };
const KIND_GLYPH = { decision: "◆", gate: "▣", initiative: "◈", action: "✓", asset: "▤", document: "▤", note: "✎" };

export const kindBadge = (kind) =>
  `<span class="pill kind ${esc(kind)}"><span aria-hidden="true">${KIND_GLYPH[kind] ?? "•"}</span> ${esc(KINDS[kind] ?? kind)}</span>`;

// Which record an update's refId names, if one still exists; null otherwise (the log outlives deletions).
export function updateTarget(u, workspace) {
  const by = {
    decision: ["decision", workspace.decisions], action: ["action", workspace.actions], gate: ["gate", workspace.gates],
    initiative: ["initiative", workspace.initiatives], document: ["report", workspace.reports], asset: ["asset", workspace.assets ?? []],
  };
  // An asset update names the asset, or, when a slot was added, the slot.
  const tries = u.kind === "asset" ? [by.asset, ["slot", workspace.assetSlots ?? []]] : u.kind in by ? [by[u.kind]] : [];
  if (u.refId) for (const pair of [...tries, ["decision", workspace.decisions], ["action", workspace.actions], ["gate", workspace.gates], ["initiative", workspace.initiatives], ["report", workspace.reports]])
    if (pair[1].some((r) => r.id === u.refId)) return { kind: pair[0], id: u.refId, record: pair[1].find((r) => r.id === u.refId) };
  return null;
}

export function dayHeading(day, today) {
  const diff = Math.round((Date.parse(today + "T00:00:00") - Date.parse(day + "T00:00:00")) / 86400000);
  const date = new Date(day + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Yesterday · ${date}` : date;
}

export function groupByDay(updates) {
  const sorted = updates.map((u, n) => ({ u, n })).toSorted((a, b) => b.u.at.localeCompare(a.u.at) || b.n - a.n).map(({ u }) => u),
    days = [];
  for (const u of sorted) {
    const day = localDay(u.at);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(u);
  }
  return days;
}

function entry(u, workspace, showProject) {
  const target = updateTarget(u, workspace),
    time = new Date(u.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    initiative = u.initiativeId && workspace.initiatives.find((i) => i.id === u.initiativeId),
    label = target ? (target.record.title ?? target.record.name ?? target.record.label) : null;
  return `<li class="tl-entry" data-update="${esc(u.id)}">
    <div class="tl-head">${kindBadge(u.kind)}<time datetime="${esc(u.at)}" class="meta">${esc(time)}</time>${showProject ? `<span class="meta">${esc(workspace.projects.find((p) => p.id === u.projectId)?.name ?? u.projectId)}</span>` : ""}</div>
    <p>${esc(u.text)}</p>
    ${target || initiative ? `<p class="caption">${target ? gotoButton(target.kind, target.id, "Open " + label) : ""}${target && initiative && target.kind !== "initiative" ? " · " : ""}${initiative && target?.kind !== "initiative" ? gotoButton("initiative", initiative.id, initiative.name) : ""}</p>` : ""}
  </li>`;
}

// Drafts are keyed by project, so a half-typed note never turns up under another project.
export function logForm({ workspace, selection }) {
  if (!selection.projectId && workspace.projects.length > 1) return '<p class="caption">Choose a project above to log a note on it.</p>';
  const project = selection.projectId || workspace.projects[0]?.id;
  if (!project) return "";
  const initiatives = workspace.initiatives.filter((i) => i.projectId === project),
    key = (name) => `log:${project}:${name}`,
    about = initiatives.some((i) => i.id === draftValue(key("initiativeId"))) ? draftValue(key("initiativeId")) : "";
  return `<form class="stack-form log-form" data-log="${esc(project)}">
    <label>Log a note<textarea name="text" rows="2" required maxlength="1000" ${draftAttr(key("text"))} placeholder="What happened, or what was learned">${esc(draftValue(key("text")))}</textarea></label>
    <div class="form-row">
      <label>About<select name="initiativeId" ${draftAttr(key("initiativeId"))}><option value=""${selectedIf("", about)}>The whole project</option>${initiatives.map((i) => `<option value="${esc(i.id)}"${selectedIf(i.id, about)}>${esc(i.name)}</option>`).join("")}</select></label>
      <button type="submit">Log note</button>
    </div>
  </form>`;
}

export function renderTimeline({ workspace, selection, inScope, today }) {
  const mine = workspace.updates.filter(inScope);
  $("timeline-summary").textContent = mine.length ? plural(mine.length, "entry", "entries") : "";
  const days = groupByDay(mine);
  let budget = shown;
  const html = days.map(({ day, items }) => {
    if (budget <= 0) return "";
    const slice = items.slice(0, budget);
    budget -= slice.length;
    return `<section class="tl-day"><h3>${esc(dayHeading(day, today))}</h3><ol class="tl-list">${slice.map((u) => entry(u, workspace, !selection.projectId)).join("")}</ol></section>`;
  }).join("");
  const hidden = mine.length - Math.min(mine.length, shown);
  $("timeline-list").innerHTML = logForm({ workspace, selection })
    + (mine.length ? html + (hidden > 0 ? `<button type="button" data-timeline-more>Show all ${mine.length} entries</button>` : mine.length > PAGE ? `<button type="button" data-timeline-less>Show only the latest ${PAGE}</button>` : "") : empty("Nothing has been logged yet. Decisions, action changes, gate checks and notes appear here as they happen."));
}
