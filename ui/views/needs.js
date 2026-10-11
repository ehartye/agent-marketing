import { $, esc } from "../shared.js";
import { plural, daysFrom, dueBadge, gotoButton, initiativeName } from "../hub-shared.js";
import { actionControls } from "./actions.js";

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

const group = (title, items) => items.length ? `<section class="need-group"><h3>${esc(title)} <span class="count">${items.length}</span></h3><ul class="need-list">${items.join("")}</ul></section>` : "";
const row = (key, main, controls) => `<li class="need" data-need="${esc(key)}"><div class="need-main">${main}</div><div class="need-controls">${controls}</div></li>`;

export function needsBody(a, { workspace, plan }) {
  const staleIds = new Set(a.stale.map((s) => s.id)),
    decisions = a.decisions.map((d) =>
      row(
        "decision:" + d.id,
        `<div class="chips">${dueBadge(d.daysLeft, d.needBy)}${staleIds.has(d.id) ? `<span class="pill due overdue">Stale: ${plural(a.stale.find((s) => s.id === d.id).daysOverdue, "day")} unanswered</span>` : ""}${d.status === "deferred" ? '<span class="pill">deferred, back again</span>' : ""}</div>
         <strong>${esc(d.title)}</strong>
         <p class="caption">${esc(d.question)}</p>
         ${d.recommendation ? `<p class="caption"><span class="label">Recommended</span>${esc(d.recommendation)}</p>` : ""}
         ${d.defaultIfSilent ? `<p class="caption"><span class="label">If you stay silent</span>${esc(d.defaultIfSilent)}</p>` : ""}`,
        `<button type="button" class="primary" data-goto="decision:${esc(d.id)}" aria-label="Compare the ${d.optionCount} options and decide: ${esc(d.title)}">${d.optionCount ? `Compare ${plural(d.optionCount, "option")} and decide` : "Open the question"}</button>`,
      )),
    actions = a.actions.map((x) => {
      const full = workspace.actions.find((w) => w.id === x.id);
      return row(
        "action:" + x.id,
        `<div class="chips">${x.reason === "blocked" ? '<span class="pill due overdue">Blocked</span>' : dueBadge(x.daysLeft, x.due)}${x.hours !== null ? `<span class="meta">${x.hours} h</span>` : ""}</div>
         <strong>${esc(x.title)}</strong>
         ${x.blockedBy ? `<p class="caption waiting"><strong>Blocked by</strong> ${esc(x.blockedBy)}</p>` : ""}
         ${x.initiativeId ? `<p class="caption">For ${gotoButton("initiative", x.initiativeId, initiativeName(workspace, x.initiativeId))}</p>` : ""}`,
        full ? actionControls(full) : "",
      );
    }),
    gates = a.gates.map((g) =>
      row(
        "gate:" + g.id,
        `<div class="chips">${dueBadge(g.daysLeft, g.due)}<span class="pill gate-chip ${esc(g.status)}">${esc(g.status)}</span>${g.hours !== null ? `<span class="meta">${g.hours} h</span>` : ""}</div>
         <strong>${esc(g.name)}</strong>
         <p class="caption"><span class="label">Pass when</span>${esc(g.criteria)}</p>
         ${g.blocks.length ? `<p class="caption waiting"><strong>Holding up</strong> ${g.blocks.map((b) => esc(b.name)).join(", ")}</p>` : ""}`,
        gotoButton("gate", g.id, "Open the gate", "primary-link"),
      )),
    blocked = a.blockedInitiatives.map((i) =>
      row(
        "initiative:" + i.id,
        `<div class="chips"><span class="pill due overdue">Blocked</span><span class="meta">${i.status === "running" ? "running" : `starts ${esc(i.start)}`}</span></div>
         <strong>${esc(i.name)}</strong>
         <p class="caption waiting"><strong>Waits on</strong> ${esc(i.blocker.name)} (${esc(i.blocker.kind)}, ${esc(i.blocker.status)})</p>`,
        i.blocker.kind === "gate" ? gotoButton("gate", i.blocker.id, "Open the gate", "primary-link") : gotoButton("initiative", i.id, "Open the initiative", "primary-link"),
      ));
    // An open slot with two or more candidates is a choice only the owner can make.
  const picks = (a.picks ?? []).map((p) =>
      row(
        "pick:" + p.slotId,
        `<div class="chips"><span class="pill kind asset"><span aria-hidden="true">▤</span> Collateral</span></div>
         <strong>Pick the ${esc(p.name)}</strong>
         <p class="caption">${plural(p.candidates, "candidate")} waiting${p.initiativeId ? ` · for ${gotoButton("initiative", p.initiativeId, initiativeName(workspace, p.initiativeId))}` : ""}</p>`,
        `<button type="button" class="primary" data-collateral-pick="${esc(p.slotId)}" aria-label="Compare ${p.candidates} candidates and pick: ${esc(p.name)}">Compare and pick</button>`,
      ));
  return group("Decisions to make", decisions) + group("Collateral to pick", picks) + group("Your actions", actions) + group("Gates due", gates) + group("Blocked work", blocked);
}

export function renderNeeds({ workspace, selection, attention, plan }) {
  const body = $("needs-body"), head = $("needs-summary");
  if (!selection.projectId) {
    head.textContent = "";
    body.innerHTML = '<div class="empty"><p>Choose a project above to see what needs you now.</p></div>';
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
    const next = nextDated(workspace, plan, selection.projectId, attention.today);
    body.innerHTML = `<div class="needs-clear"><p class="headline"><span aria-hidden="true">✓</span> ${esc(headline)}</p>
      <p class="caption">${next ? `Next: ${esc(next.text)} on ${esc(next.date)}, in ${plural(daysFrom(attention.today, next.date), "day")}. ${gotoButton(next.kind, next.id, "Open it")}` : "Nothing is dated ahead either."}</p></div>`;
    return;
  }
  body.innerHTML = `<p class="headline">${esc(headline)}</p>${needsBody(attention, { workspace, plan })}`;
}
