import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeskClient } from "../ui/state.js";
import { dueBadge, daysFrom, statusChip, gotoButton } from "../ui/hub-shared.js";
import { needsHeadline, needsBody, nextDated } from "../ui/views/needs.js";
import { recommendedOption, optionCard, decisionBody, decisionItem, filterDecisions, sortDecisions, DIMENSIONS } from "../ui/views/decisions.js";
import { actionControls, actionRow, groupActions, slug } from "../ui/views/actions.js";
import { groupByDay, updateTarget, kindBadge, dayHeading } from "../ui/views/timeline.js";
import { buildTree, flatten, subtreeIds } from "../ui/views/hierarchy.js";
import { groupReports, reportParent } from "../ui/views/reports.js";
import { gateCard, weeksTable, gateForm } from "../ui/views/plan.js";
import { plan as buildPlan, attention } from "../src/analysis.mjs";

const studio = () => JSON.parse(readFileSync("examples/studio.json", "utf8"));
const option = (id, over = {}) => ({ id, label: `Option ${id}`, ...over });
const full = { time: "t", risk: "r", complexity: "c", bestPractice: "b", maintainability: "m" };
const decision = (over = {}) => ({ id: "d", projectId: "p", title: "Pick one", question: "Which?", status: "open", options: [option("alpha", full), option("beta", full)], ...over });
const ws = (over = {}) => ({ projects: [{ id: "p", name: "P" }], initiatives: [], decisions: [], actions: [], gates: [], reports: [], updates: [], evidence: [], ...over });

test("due badges say overdue, today and soon in words, not only colour", () => {
  assert.match(dueBadge(-3, "2026-10-08"), /Overdue 3 days · 2026-10-08/);
  assert.match(dueBadge(-1), /Overdue 1 day</);
  assert.match(dueBadge(0), /Due today/);
  assert.match(dueBadge(2), /class="pill due soon">Due in 2 days/);
  assert.match(dueBadge(9), /class="pill due">Due in 9 days/);
  assert.match(dueBadge(null), /No date/);
  assert.equal(daysFrom("2026-10-11", "2026-10-14"), 3);
  assert.equal(daysFrom("2026-10-11", "2026-10-09"), -2);
  assert.match(statusChip("done"), /✓/);
  assert.doesNotMatch(statusChip('x"><img'), /<img/);
  assert.doesNotMatch(gotoButton("decision", '"><script>', "<b>"), /<script>|<b>/);
});

test("the needs headline counts what is waiting, and says so when nothing is", () => {
  const summary = { decisions: 2, overdueDecisions: 1, actions: 1, overdueActions: 0, gates: 1, overdueGates: 1, blockedInitiatives: 1, stale: 1, total: 5 };
  assert.equal(needsHeadline({ summary }), "5 things need you: 2 decisions (1 overdue, 1 stale) · 1 action · 1 gate due (1 overdue) · 1 blocked initiative");
  assert.equal(needsHeadline({ summary: { decisions: 1, overdueDecisions: 0, actions: 0, overdueActions: 0, gates: 0, overdueGates: 0, blockedInitiatives: 0, stale: 0, total: 1 } }), "1 thing needs you: 1 decision");
  assert.equal(needsHeadline({ summary: { total: 0 } }), "Nothing needs you right now");
});

test("the needs panel gives every item a control: decide, move an action, open the gate", () => {
  const w = studio();
  w.decisions = [{ id: "banner", projectId: "harbor", title: "Banner", question: "Which?", status: "open", needBy: "2026-10-09", recommendation: "alpha", defaultIfSilent: "Ship dusk", options: [option("alpha"), option("beta")] }];
  w.actions = [
    { id: "a1", projectId: "harbor", title: "Cut it", owner: "owner", status: "todo", due: "2026-10-12" },
    { id: "a2", projectId: "harbor", title: "Wait on build", owner: "owner", status: "blocked", blockedBy: "the build" },
  ];
  w.gates.find((g) => g.id === "harbor-gate-playtest").due = "2026-10-14";
  const a = attention(w, "harbor", "2026-10-11"), p = buildPlan(w, "harbor");
  const html = needsBody(a, { workspace: w, plan: p });
  assert.match(html, /data-need="decision:banner"/);
  assert.match(html, /data-goto="decision:banner"/);
  assert.match(html, /Overdue 2 days/);
  assert.match(html, /Ship dusk/);
  assert.match(html, /data-action-status="done" data-action-id="a1"/);
  assert.match(html, /data-action-status="doing" data-action-id="a2"/, "a blocked action can be unblocked");
  assert.match(html, /Blocked by<\/strong> the build/);
  assert.match(html, /data-goto="gate:harbor-gate-playtest"/);
});

test("with nothing owed, the next dated thing is named", () => {
  const w = ws({
    decisions: [decision({ id: "later", status: "deferred", needBy: "2026-11-02", title: "Later" })],
    actions: [
      { id: "a", projectId: "p", title: "Soon", owner: "owner", status: "todo", due: "2026-10-30" },
      { id: "agent", projectId: "p", title: "Agent", owner: "agent", status: "todo", due: "2026-10-20" },
    ],
    gates: [{ id: "g", projectId: "p", name: "Gate", criteria: "x", status: "passed", due: "2026-10-15" }],
  });
  const next = nextDated(w, null, "p", "2026-10-11");
  assert.equal(next.id, "a");
  assert.equal(next.date, "2026-10-30");
  assert.equal(nextDated(ws(), null, "p", "2026-10-11"), null);
});

test("a recommendation marks the option the decision names by id, and nothing otherwise", () => {
  const opts = [option("a", { label: "Dusk" }), option("moon", { label: "Moonlit" })];
  assert.equal(recommendedOption(decision({ options: opts, recommendedOptionId: "moon" })), "moon");
  assert.equal(recommendedOption(decision({ options: opts, recommendation: "Moonlit: best contrast" })), null, "prose is never read for a guess");
  assert.equal(recommendedOption(decision({ options: opts, recommendedOptionId: "gone" })), null);
  assert.equal(recommendedOption(decision()), null);
});

test("an option card lays out all five dimensions, and flags the ones not stated", () => {
  const html = optionCard(option("a", { time: "an hour", risk: "low" }), { recommended: true });
  for (const [, name] of DIMENSIONS) assert.ok(html.includes(`<dt>${name}</dt>`), name);
  assert.match(html, /Recommended/);
  assert.equal((html.match(/Not stated/g) || []).length, 3);
  assert.match(html, /3 of 5 dimensions not stated/);
  assert.doesNotMatch(optionCard(option("b", full), {}), /Not stated/);
});

test("an open decision offers a decide button per option, a rationale box and a defer; text is escaped", () => {
  const d = decision({ title: "<img src=x>", question: "a & b", recommendation: "alpha", defaultIfSilent: "<b>do nothing</b>" }), w = ws({ decisions: [d] });
  const html = decisionBody(d, { workspace: w, today: "2026-10-11" });
  assert.equal((html.match(/name="option"/g) || []).length, 2);
  assert.match(html, /data-decide="d"/);
  assert.match(html, /<textarea name="rationale"/);
  assert.match(html, /data-defer="d"/);
  assert.match(html, /If you stay silent/);
  assert.doesNotMatch(html, /<b>do nothing/);
  assert.doesNotMatch(decisionItem(d, { workspace: w, today: "2026-10-11" }), /<img/);
});

test("options that state none of the five dimensions are not padded with empty rows", () => {
  const d = decision({ options: [option("a"), option("b")] });
  const html = decisionBody(d, { workspace: ws({ decisions: [d] }), today: "2026-10-11" });
  assert.doesNotMatch(html, /Not stated/);
  assert.match(html, /None of the five dimensions/);
});

test("a decided decision shows the choice, why, the history, and a change control", () => {
  const d = decision({ status: "decided", chosen: "beta", decidedAt: "2026-10-11T08:00:00.000Z", rationale: "Cheaper", history: [{ chosen: "alpha", decidedAt: "2026-10-10T08:00:00.000Z", rationale: "First thought" }] });
  const html = decisionBody(d, { workspace: ws({ decisions: [d] }), today: "2026-10-11" });
  assert.match(html, /Decided: Option beta/);
  assert.match(html, /Cheaper/);
  assert.match(html, /Earlier choices/);
  assert.match(html, /Option alpha[^]*First thought/);
  assert.match(html, /Change decision/);
  assert.match(html, /data-change="true"/);
  assert.match(html, /<button type="submit" name="option" value="beta" disabled data-keep-disabled>/, "the standing choice is not offered as a change");
  assert.doesNotMatch(html, /data-defer/);
});

test("decisions filter by status and sort open first, by date, then decided newest first", () => {
  const list = [
    decision({ id: "z", status: "decided", chosen: "alpha", decidedAt: "2026-10-01T00:00:00Z" }),
    decision({ id: "y", status: "decided", chosen: "alpha", decidedAt: "2026-10-05T00:00:00Z" }),
    decision({ id: "b", needBy: "2026-10-20" }),
    decision({ id: "a" }),
    decision({ id: "c", needBy: "2026-10-12" }),
    decision({ id: "d", status: "deferred", needBy: "2026-10-30" }),
  ];
  assert.deepEqual(sortDecisions(list).map((x) => x.id), ["c", "b", "a", "d", "y", "z"]);
  assert.deepEqual(filterDecisions(list, "decided").map((x) => x.id), ["z", "y"]);
  assert.equal(filterDecisions(list, "all").length, 6);
});

test("action controls follow the status, and blocking asks for a reason", () => {
  const a = (status) => ({ id: "x", title: "T", status });
  assert.match(actionControls(a("todo")), /data-action-status="doing"/);
  assert.match(actionControls(a("todo")), /data-block-form="x"/);
  assert.match(actionControls(a("doing")), /data-action-status="done"/);
  assert.doesNotMatch(actionControls(a("doing")), /data-action-status="doing"/);
  assert.match(actionControls(a("blocked")), /Unblock/);
  assert.doesNotMatch(actionControls(a("blocked")), /data-block-form/);
  assert.match(actionControls(a("done")), /data-action-status="todo"[^>]*aria-label="Reopen: T"/);
  assert.match(actionControls(a("todo")), /aria-label="Done: T"/, "each button says which action it acts on");
});

test("actions group under their initiative in display order, with the rest last; ids are unique slugs", () => {
  const order = [{ id: "i1", name: "One" }, { id: "i2", name: "Two" }];
  const list = [{ id: "a", initiativeId: "i2" }, { id: "b" }, { id: "c", initiativeId: "i1" }, { id: "d", initiativeId: "gone" }];
  const groups = groupActions(list, order);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((x) => x.id)]), [["One", ["c"]], ["Two", ["a"]], ["No initiative", ["b", "d"]]]);
  assert.equal(slug("Record the Trailer!", new Set()), "record-the-trailer");
  assert.equal(slug("Record the trailer", new Set(["record-the-trailer"])), "record-the-trailer-2");
  assert.equal(slug("???", new Set()), "action");
  const html = actionRow({ id: "x", projectId: "p", title: "<i>t</i>", owner: "owner", status: "todo", due: "2026-10-10", hours: 1.5, notes: "<b>n</b>" }, { workspace: ws(), today: "2026-10-11" });
  assert.match(html, /Overdue 1 day/);
  assert.match(html, /1\.5 h/);
  assert.doesNotMatch(html, /<i>|<b>/);
});

test("the timeline groups updates by day, newest first, and links to the record they name", () => {
  const u = (id, at, over = {}) => ({ id, projectId: "p", at, kind: "note", text: id, ...over });
  const days = groupByDay([u("old", "2026-10-08T12:00:00"), u("new", "2026-10-11T12:00:00"), u("mid", "2026-10-11T08:00:00")]);
  assert.deepEqual(days.map((d) => d.items.map((x) => x.id)), [["new", "mid"], ["old"]]);
  assert.match(dayHeading("2026-10-11", "2026-10-11"), /^Today/);
  assert.match(dayHeading("2026-10-10", "2026-10-11"), /^Yesterday/);
  const w = ws({ decisions: [decision()], actions: [{ id: "act", projectId: "p", title: "A", owner: "owner", status: "todo" }] });
  const at = "2026-10-11T00:00:00";
  assert.equal(updateTarget(u("x", at, { kind: "decision", refId: "d" }), w).kind, "decision");
  assert.equal(updateTarget(u("x", at, { kind: "action", refId: "act" }), w).kind, "action");
  assert.equal(updateTarget(u("x", at, { kind: "note", refId: "d" }), w).kind, "decision");
  assert.equal(updateTarget(u("x", at, { kind: "decision", refId: "deleted" }), w), null, "the log outlives the record");
  assert.match(kindBadge("gate"), /Gate/);
});

test("initiatives form a tree, parents before children, and a filter takes one subtree", () => {
  const i = (id, parentId) => ({ id, ...(parentId ? { parentId } : {}) });
  const list = [i("root"), i("kid1", "root"), i("other"), i("kid2", "root"), i("grandkid", "kid1"), i("orphan", "missing")];
  const tree = buildTree(list);
  assert.deepEqual(flatten(tree).map((x) => x.id), ["root", "kid1", "grandkid", "kid2", "other", "orphan"]);
  assert.deepEqual(tree[0].children.map((n) => n.depth), [1, 1]);
  assert.deepEqual([...subtreeIds(list, "kid1")], ["kid1", "grandkid"]);
});

test("a report hangs under its initiative, or its gate's or decision's; the rest are unassigned, last", () => {
  const w = ws({
    initiatives: [{ id: "i1", name: "One" }, { id: "i2", name: "Two" }],
    gates: [{ id: "g", initiativeId: "i2" }],
    decisions: [decision({ id: "dec", initiativeId: "i1" })],
  });
  const reports = [{ id: "r1", initiativeId: "i1" }, { id: "r2", gateId: "g" }, { id: "r3", decisionId: "dec" }, { id: "r4" }, { id: "r5", gateId: "ghost" }];
  assert.equal(reportParent(reports[1], w).initiativeId, "i2");
  const groups = groupReports(reports, w);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((r) => r.id)]), [["One", ["r1", "r3"]], ["Two", ["r2"]], ["Unassigned", ["r4", "r5"]]]);
  assert.deepEqual(groupReports([{ id: "x" }], w).map((g) => g.id), [null]);
});

test("gate cards show due date, hours and a form to record a check; weekly hours name the gates", () => {
  const w = studio(), target = w.gates.find((g) => g.id === "harbor-gate-playtest");
  target.due = "2026-10-14";
  target.hours = 3;
  const p = buildPlan(w, "harbor"), g = p.gates.find((x) => x.id === "harbor-gate-playtest");
  const html = gateCard(g, p, w);
  assert.match(html, /Due 2026-10-14/);
  assert.match(html, /3 h of your time/);
  assert.match(html, /data-gate-form="harbor-gate-playtest"/);
  assert.match(html, /name="evidenceIds"/);
  assert.match(gateForm(g, p, w), /<option selected>open<\/option>/);
  assert.match(weeksTable(p, w), /Gate: Outside playtest[^<]* 3 h/);
});
