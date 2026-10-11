import { $, esc, empty, link } from "../shared.js";
import { openAttr } from "../hub-shared.js";

// The plan check in the desk: readiness gates, and the maker hours each calendar week against the
// project's weekly cap. Everything here is a pure function of the /api/plan result except
// renderPlan, which writes it into the page.
const GLYPH = { open: "○", passed: "✓", failed: "✕", waived: "↷" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hours = (h) => String(Math.round(h * 100) / 100);
const brief = (h) => String(Math.round(h * 10) / 10);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// The panel shows once a project records a gate, an initiative's hours or a dependency, so a
// ledger that uses none of them keeps its desk exactly as it was.
export const hasPlanData = (plan) =>
  !!plan && Array.isArray(plan.gates) && Array.isArray(plan.initiatives) &&
  (plan.gates.length > 0 || plan.initiatives.some((i) => i.hours !== null || i.dependsOn.length > 0));

// A status is a word and a shape as well as a colour.
export const gateChip = (status) =>
  `<span class="pill gate-chip ${esc(status)}"><span aria-hidden="true">${GLYPH[status] ?? "•"}</span> ${esc(status)}</span>`;

// The form that records a check: the result, a note, the date it is due, the hours it takes and
// the findings that show it. It saves through /api/gate, which also logs the change.
export function gateForm(g, plan, workspace) {
  const own = (workspace.evidence ?? []).filter((e) => e.projectId === plan.projectId),
    cited = new Set(g.evidenceIds);
  return `<details class="gate-edit" ${openAttr("gate:" + g.id)}><summary>Record a check</summary>
    <form class="stack-form" data-gate-form="${esc(g.id)}">
      <div class="form-row">
        <label>Result<select name="status">${["open", "passed", "failed", "waived"].map((s) => `<option${s === g.status ? " selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>Due<input name="due" type="date" value="${esc(g.due ?? "")}" /></label>
        <label>Hours<input name="hours" type="number" min="0" step="0.25" inputmode="decimal" value="${esc(g.hours ?? "")}" /></label>
      </div>
      <label>Note <span class="optional">(say why when waiving)</span><input name="notes" maxlength="300" value="${esc(g.notes ?? "")}" /></label>
      ${own.length ? `<fieldset class="findings"><legend>Findings that show it</legend>${own.map((e) => `<label class="check"><input type="checkbox" name="evidenceIds" value="${esc(e.id)}"${cited.has(e.id) ? " checked" : ""} /><span>${esc(e.claim)}</span></label>`).join("")}</fieldset>` : ""}
      <button type="submit">Save check</button>
    </form></details>`;
}

export function gateCard(g, plan, workspace) {
  const needed = g.requiredBy.map((id) => plan.initiatives.find((i) => i.id === id)?.name ?? id),
    evidence = g.evidenceIds.map((id) => {
      const e = workspace.evidence.find((x) => x.id === id);
      // A repository path is shown as text: it is not an address the desk can open.
      return !e ? esc(id) : /^https?:\/\//i.test(e.url) ? link(e.url, id) : `<span>${esc(id)}: <code>${esc(e.url)}</code></span>`;
    }),
    facts = [
      g.checkedAt && `Checked ${esc(g.checkedAt)}`,
      evidence.length && `Evidence: ${evidence.join(", ")}`,
      needed.length && `Needed by ${needed.map(esc).join(", ")}`,
      g.due && `Due ${esc(g.due)}`,
      g.hours !== null && g.hours !== undefined && `${hours(g.hours)} h of your time`,
    ].filter(Boolean),
    memos = (workspace.reports ?? []).filter((r) => r.gateId === g.id),
    docs = memos.length ? `<p class="caption">Document: ${memos.map((r) => `<button type="button" class="link-button" data-goto="report:${esc(r.id)}">${esc(r.title)}</button>`).join(" ")}</p>` : "";
  return `<article class="gate" data-gate="${esc(g.id)}" tabindex="-1"><div class="row"><h3>${esc(g.name)}</h3>${gateChip(g.status)}</div><p class="criteria"><span class="label">Pass when</span>${esc(g.criteria)}</p>${facts.length ? `<p class="caption">${facts.join(" · ")}</p>` : ""}${g.notes ? `<p class="caption">Note: ${esc(g.notes)}</p>` : ""}${docs}${gateForm(g, plan, workspace)}</article>`;
}

// One column per calendar week, drawn at one SVG unit to the pixel inside a scrolling box, so the
// text keeps its size on a phone and a long plan scrolls instead of shrinking. When the box is
// wider than the plan needs, `available` (its width in pixels) lets the columns widen to fill it.
// Sizes are SVG attributes because the desk's content security policy allows no inline style.
export function loadStrip(plan, available = 0) {
  const { weeks, weeklyHours: cap } = plan.load;
  if (!weeks.length)
    return empty("No initiative dates yet. Give each initiative a start and end, and hours, to see the load per week.");
  const mark = (w) => brief(w.hours) + (w.overCap ? "▲" : ""),
    narrowest = Math.max(30, 6 * Math.max(...weeks.map((w) => mark(w).length)) + 8),
    column = Math.min(64, Math.max(narrowest, Math.floor((available - 16) / weeks.length))),
    pad = 8,
    width = pad * 2 + column * weeks.length,
    top = 40,
    plot = 96,
    base = top + plot,
    height = base + 34,
    scale = plot / Math.max(cap, ...weeks.map((w) => w.hours), 1),
    over = weeks.filter((w) => w.overCap).length;
  const columns = weeks
    .map((w, n) => {
      const x = pad + n * column,
        mid = x + column / 2,
        bar = w.hours * scale,
        y = base - bar,
        unknown = w.unknownHours.length,
        month = Number(w.start.slice(5, 7)) - 1,
        previous = n && Number(weeks[n - 1].start.slice(5, 7)) - 1,
        fromGates = (w.gates ?? []).reduce((n, g) => n + g.hours, 0),
        said = [`${hours(w.hours)} h${fromGates ? ` (${hours(fromGates)} h of it from gates)` : ""}`];
      if (w.overCap) said.push(`${hours(w.overBy)} h over the ${hours(cap)} h cap`);
      if (unknown) said.push(`plus hours not yet set for ${plural(unknown, "initiative")}`);
      return `<g class="week${w.overCap ? " over" : ""}"><title>Week of ${esc(w.start)}: ${said.join(", ")}</title>`
        + (w.hours > 0 ? `<rect class="col" x="${x + 5}" y="${y.toFixed(1)}" width="${column - 10}" height="${bar.toFixed(1)}"/>` : `<rect class="col quiet" x="${x + 5}" y="${base - 2}" width="${column - 10}" height="2"/>`)
        + (unknown ? `<rect class="unknown" x="${x + 5}" y="${(y - 14).toFixed(1)}" width="${column - 10}" height="12" rx="2"/><text class="unknown-mark" x="${mid}" y="${(y - 5).toFixed(1)}" text-anchor="middle">?</text>` : "")
        + (w.hours > 0 ? `<text class="value" x="${mid}" y="${(y - (unknown ? 18 : 4)).toFixed(1)}" text-anchor="middle">${esc(mark(w))}</text>` : "")
        + `<text class="tick" x="${mid}" y="${base + 13}" text-anchor="middle">${Number(w.start.slice(8, 10))}</text>`
        + (n === 0 || month !== previous ? `<text class="month" x="${x + 5}" y="${base + 26}">${MONTHS[month]}${n === 0 || month === 0 ? " " + esc(w.start.slice(0, 4)) : ""}</text>` : "")
        + "</g>";
    })
    .join("");
  const label = `Planned maker hours per week against a ${hours(cap)} hour weekly cap; ${over ? `${over} of ${plural(weeks.length, "week")} ${over === 1 ? "is" : "are"} over it` : "no week is over it"}. Exact values are in the table below.`;
  return `<div class="load-scroll" tabindex="0" role="region" aria-label="Maker hours per week, scrolls sideways"><svg class="load-plot" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}"><line class="base" x1="${pad}" y1="${base}" x2="${width - pad}" y2="${base}"/>${columns}<line class="cap" x1="${pad}" y1="${(base - cap * scale).toFixed(1)}" x2="${width - pad}" y2="${(base - cap * scale).toFixed(1)}"/></svg></div>`;
}

// The strip's numbers as a table, for readers who skip the graphic.
export function weeksTable(plan) {
  const name = (id) => plan.initiatives.find((i) => i.id === id)?.name ?? id,
    gateName = (id) => plan.gates.find((g) => g.id === id)?.name ?? id;
  const rows = plan.load.weeks
    .map((w) => {
      const work = [...w.initiatives.map((x) => `${esc(name(x.id))} ${hours(x.hours)} h`), ...(w.gates ?? []).map((x) => `Gate: ${esc(gateName(x.id))} ${hours(x.hours)} h`), ...w.unknownHours.map((id) => `${esc(name(id))} (hours not set)`)];
      return `<tr><td>${esc(w.start)} → ${esc(w.end)}</td><td>${hours(w.hours)}</td><td>${w.overCap ? hours(w.overBy) : "—"}</td><td>${work.join("; ") || "—"}</td></tr>`;
    })
    .join("");
  return `<details><summary class="caption">Read weekly hours</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Maker hours per week"><table><thead><tr><th>Week</th><th>Hours</th><th>Over cap by</th><th>Work</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

// What shows on an initiative card: chips beside its channel and notes under its text.
export function initiativeFlags(i) {
  const chips = [], notes = [];
  if (i?.blocked) {
    chips.push('<span class="pill flag blocked">Blocked</span>');
    notes.push(`<p class="caption waiting"><strong>Waits on</strong> ${i.blockedBy.map((b) => `${esc(b.name)} (${esc(b.status)})`).join(", ")}</p>`);
  }
  if (i?.overCapWeeks.length) {
    chips.push('<span class="pill flag over">Over cap</span>');
    notes.push(`<p class="caption">Adds hours to a week over the cap: ${i.overCapWeeks.map((w) => "week of " + esc(w)).join(", ")}</p>`);
  }
  return { chips: chips.join(""), notes: notes.join("") };
}

export function planSummary(plan) {
  const { gates, load, summary } = plan,
    unsettled = summary.gates.open + summary.gates.failed;
  return {
    gates: gates.length ? `${plural(gates.length, "gate")} · ${unsettled ? `${unsettled} not passed` : "all passed or waived"}` : "no gates yet",
    load: !summary.peakWeek
      ? "no hours recorded yet"
      : summary.overCapWeeks
        ? `${plural(summary.overCapWeeks, "week")} over the ${hours(load.weeklyHours)} h cap · peak ${hours(summary.peakWeek.hours)} h`
        : `within the ${hours(load.weeklyHours)} h cap`,
  };
}

export function renderPlan({ workspace, plan }) {
  const show = hasPlanData(plan);
  $("plan-view").hidden = !show;
  if (!show) {
    // Nothing to show: leave nothing behind either, or the last project's cards stay in the hidden view and a
    // jump to one of them would land on something nobody can see.
    for (const id of ["gates", "load"]) $(id).innerHTML = "";
    for (const id of ["gate-summary", "load-summary"]) $(id).textContent = "";
    return;
  }
  const summary = planSummary(plan),
    { load, budget } = plan;
  $("gate-summary").textContent = summary.gates;
  $("load-summary").textContent = summary.load;
  $("gates").innerHTML = plan.gates.length
    ? plan.gates.map((g) => gateCard(g, plan, workspace)).join("")
    : empty("No readiness gates for this project. A gate names what must be true before work starts, with a pass condition that has a number; use market-discover to add them.");
  const totals = `${hours(load.totalHours)} h planned across ${plural(load.weeks.length, "week")} (${hours(load.capacityHours)} h at ${hours(load.weeklyHours)} h a week). Initiative budgets add up to ${hours(budget.planned)} of ${hours(budget.cap)} ${esc(budget.currency)}${budget.overBudget ? ` <strong class="error">(over by ${hours(budget.overBy)})</strong>` : ""}.`;
  $("load").innerHTML = loadStrip(plan, $("load").clientWidth)
    + (load.weeks.length ? `<p class="caption legend">Dashed line: the weekly cap. Columns marked ▲ are over it. A dashed block marks an initiative active that week with no hours set, so that column is a minimum.</p>` : "")
    + `<p class="caption">${totals}</p>`
    + (load.weeks.length ? weeksTable(plan) : "")
    + (plan.warnings.length ? `<ul class="plan-notes caption">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "");
}
