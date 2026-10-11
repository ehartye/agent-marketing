import { test } from "node:test";
import assert from "node:assert/strict";
import { attention, advise } from "../src/analysis.mjs";
import { validateWorkspace } from "../src/schema.mjs";
import { ledger, project as baseProject, initiative as baseInitiative } from "./fixtures.mjs";

const TODAY = "2026-10-11";
const D = (id, over = {}) => ({
  id,
  projectId: "game",
  title: `Decide ${id}`,
  question: `What about ${id}?`,
  status: "open",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  ...over,
});
const A = (id, over = {}) => ({ id, projectId: "game", title: `Do ${id}`, owner: "owner", status: "todo", ...over });
const G = (id, over = {}) => ({ id, projectId: "game", name: `Gate ${id}`, criteria: `pass ${id}`, status: "open", ...over });
const I = (id, over = {}) => ({ ...baseInitiative, id, name: `Init ${id}`, budget: 0, status: "planned", start: "2026-12-01", end: "2026-12-10", ...over });
const U = (n, over = {}) => ({
  id: `u-${n}`,
  projectId: "game",
  at: `2026-10-${String(n).padStart(2, "0")}T09:00:00.000Z`,
  kind: "note",
  text: `Update ${n}`,
  ...over,
});
const W = (extra = {}) => validateWorkspace({ ...ledger(), projects: [{ ...baseProject, weeklyHours: 40 }], initiatives: [], ...extra });

test("an empty ledger needs nothing from the owner", () => {
  const a = attention(W(), "game", TODAY);
  assert.deepEqual(a, {
    projectId: "game",
    today: TODAY,
    decisions: [],
    actions: [],
    gates: [],
    blockedInitiatives: [],
    picks: [],
    waiting: [],
    stale: [],
    recent: [],
    summary: { decisions: 0, overdueDecisions: 0, actions: 0, overdueActions: 0, gates: 0, overdueGates: 0, blockedInitiatives: 0, picks: 0, stale: 0, total: 0 },
  });
});

const SL = (id, over = {}) => ({ id, projectId: "game", name: `Slot ${id}`, kind: "image", status: "open", ...over });
const AS = (id, slotId, over = {}) => ({
  id,
  projectId: "game",
  slotId,
  label: `Asset ${id}`,
  kind: "link",
  url: `https://example.com/${id}`,
  status: "candidate",
  createdAt: "2026-10-10T09:00:00.000Z",
  ...over,
});

test("an open slot with two or more candidates and no pick is something to pick", () => {
  const w = W({
    initiatives: [I("launch")],
    assetSlots: [
      SL("capsule", { name: "Steam main capsule", initiativeId: "launch" }),
      SL("banner", { name: "Banner" }),
      SL("lonely", { name: "One candidate only" }),
      SL("empty", { name: "No candidates" }),
      SL("done", { name: "Already picked", status: "picked", selectedAssetId: "d1" }),
      SL("rejected", { name: "Only rejected candidates" }),
    ],
    assets: [
      AS("c1", "capsule"),
      AS("c2", "capsule"),
      AS("c3", "capsule", { status: "rejected", rationale: "no" }),
      AS("c4", "capsule", { status: "retired" }),
      AS("b1", "banner"),
      AS("b2", "banner"),
      AS("b3", "banner"),
      AS("l1", "lonely"),
      AS("d1", "done", { status: "selected" }),
      AS("d2", "done"),
      AS("d3", "done"),
      AS("r1", "rejected", { status: "rejected", rationale: "no" }),
      AS("r2", "rejected", { status: "rejected", rationale: "no" }),
    ],
  });
  const a = attention(w, "game", TODAY);
  assert.deepEqual(a.picks, [
    { slotId: "banner", name: "Banner", candidates: 3, candidateIds: ["b1", "b2", "b3"], initiativeId: null },
    { slotId: "capsule", name: "Steam main capsule", candidates: 2, candidateIds: ["c1", "c2"], initiativeId: "launch" },
  ]);
  assert.equal(a.summary.picks, 2);
  assert.equal(a.summary.total, 2, "a pick is something the owner has to do");
});

test("picks count toward the total beside decisions, and belong to their own project", () => {
  const w = W({
    decisions: [D("one")],
    assetSlots: [SL("capsule"), SL("theirs", { projectId: "other" })],
    assets: [AS("c1", "capsule"), AS("c2", "capsule"), AS("t1", "theirs", { projectId: "other" }), AS("t2", "theirs", { projectId: "other" })],
    projects: [{ ...baseProject, weeklyHours: 40 }, { ...baseProject, id: "other", weeklyHours: 40 }],
  });
  const a = attention(w, "game", TODAY);
  assert.equal(a.picks.length, 1);
  assert.equal(a.summary.total, 2);
  assert.equal(attention(w, "other", TODAY).picks[0].slotId, "theirs");
});

test("a ledger from before collateral has no picks", () => {
  const w = W();
  delete w.assetSlots;
  delete w.assets;
  assert.deepEqual(attention(w, "game", TODAY).picks, []);
});

test("open decisions come by need-by date, soonest first, undated last, with the days left", () => {
  const w = W({
    decisions: [
      D("undated"),
      D("later", { needBy: "2026-10-20", recommendation: "Take A", defaultIfSilent: "A ships", initiativeId: undefined }),
      D("overdue", { needBy: "2026-10-09" }),
      D("today", { needBy: TODAY }),
      D("settled", { status: "decided", chosen: "a", decidedAt: "2026-10-01T00:00:00.000Z", needBy: "2026-10-01" }),
      D("parked", { status: "deferred", needBy: "2026-11-30" }),
    ],
  });
  const { decisions, summary } = attention(w, "game", TODAY);
  assert.deepEqual(decisions.map((d) => [d.id, d.daysLeft]), [["overdue", -2], ["today", 0], ["later", 9], ["undated", null]]);
  const later = decisions[2];
  assert.equal(later.recommendation, "Take A");
  assert.equal(later.defaultIfSilent, "A ships");
  assert.equal(later.optionCount, 2);
  assert.equal(later.needBy, "2026-10-20");
  assert.equal(later.title, "Decide later");
  assert.equal(later.question, "What about later?");
  assert.equal(decisions[0].overdue, true);
  assert.equal(decisions[1].overdue, false);
  assert.equal(decisions[3].recommendation, null);
  assert.equal(decisions[3].overdue, false);
  assert.equal(summary.decisions, 4);
  assert.equal(summary.overdueDecisions, 1);
});

test("a deferred decision comes back when its new date arrives", () => {
  const w = W({ decisions: [D("parked", { status: "deferred", needBy: "2026-10-11" }), D("later", { status: "deferred", needBy: "2026-10-12" })] });
  const { decisions } = attention(w, "game", TODAY);
  assert.deepEqual(decisions.map((d) => [d.id, d.status]), [["parked", "deferred"]]);
});

test("a decision that is a week and a day past its date is also stale", () => {
  const w = W({ decisions: [D("a", { needBy: "2026-10-04" }), D("b", { needBy: "2026-10-03" }), D("c", { needBy: "2026-09-01" }), D("d")] });
  const { stale, summary } = attention(w, "game", TODAY);
  assert.deepEqual(stale.map((d) => [d.id, d.daysOverdue]), [["c", 40], ["b", 8]]);
  assert.equal(summary.stale, 2);
});

test("owner actions appear when overdue, due within 14 days or blocked; agent and finished ones never", () => {
  const w = W({
    actions: [
      A("far", { due: "2026-10-26" }),
      A("edge", { due: "2026-10-25" }),
      A("overdue", { due: "2026-10-08" }),
      A("undated"),
      A("stuck", { status: "blocked", blockedBy: "waiting on Steam" }),
      A("stuck-dated", { status: "blocked", due: "2026-10-12" }),
      A("agent", { owner: "agent", due: "2026-10-12" }),
      A("done", { status: "done", due: "2026-10-12" }),
      A("dropped", { status: "dropped", due: "2026-10-12" }),
      A("doing", { status: "doing", due: "2026-10-13", hours: 2, initiativeId: undefined }),
    ],
  });
  const { actions, summary } = attention(w, "game", TODAY);
  assert.deepEqual(actions.map((a) => [a.id, a.daysLeft, a.reason]), [
    ["overdue", -3, "overdue"],
    ["stuck-dated", 1, "blocked"],
    ["doing", 2, "due-soon"],
    ["edge", 14, "due-soon"],
    ["stuck", null, "blocked"],
  ]);
  assert.equal(actions[4].blockedBy, "waiting on Steam");
  assert.equal(actions[2].hours, 2);
  assert.equal(summary.actions, 5);
  assert.equal(summary.overdueActions, 1);
});

test("open or failed gates due within 14 days or overdue come with what they block", () => {
  const w = W({
    initiatives: [I("launch", { dependsOn: ["g1"] }), I("page", { dependsOn: ["g1", "g2"] }), I("old", { dependsOn: ["g1"], status: "complete" })],
    gates: [
      G("g1", { due: "2026-10-14", hours: 3 }),
      G("g2", { due: "2026-10-01", status: "failed" }),
      G("g3", { due: "2026-10-30" }),
      G("g4"),
      G("g5", { due: "2026-10-12", status: "passed", evidenceIds: [] }),
      G("g6", { due: "2026-10-12", status: "waived", notes: "n" }),
    ],
  });
  const { gates, summary } = attention(w, "game", TODAY);
  assert.deepEqual(gates.map((g) => [g.id, g.daysLeft, g.status]), [["g2", -10, "failed"], ["g1", 3, "open"]]);
  assert.deepEqual(gates[1].blocks.map((b) => b.id), ["launch", "page"]);
  assert.deepEqual(gates[0].blocks.map((b) => b.id), ["page"]);
  assert.equal(gates[1].hours, 3);
  assert.equal(gates[1].criteria, "pass g1");
  assert.equal(summary.gates, 2);
  assert.equal(summary.overdueGates, 1);
});

test("blocked initiatives are those running now or about to start, with their first blocker", () => {
  const w = W({
    gates: [G("g1"), G("g2")],
    initiatives: [
      I("running", { status: "running", dependsOn: ["g2", "g1"], start: "2026-10-01" }),
      I("soon", { dependsOn: ["g1"], start: "2026-10-25" }),
      I("far", { dependsOn: ["g1"], start: "2026-10-26" }),
      I("free", { start: "2026-10-12" }),
      I("paused", { status: "paused", dependsOn: ["g1"], start: "2026-10-01" }),
    ],
  });
  const { blockedInitiatives, summary } = attention(w, "game", TODAY);
  assert.deepEqual(blockedInitiatives.map((i) => i.id), ["running", "soon"]);
  assert.deepEqual(blockedInitiatives[0].blocker, { id: "g2", kind: "gate", name: "Gate g2", status: "open" });
  assert.equal(blockedInitiatives[0].daysToStart, -10);
  assert.equal(blockedInitiatives[1].daysToStart, 14);
  assert.equal(summary.blockedInitiatives, 2);
});

test("the ten most recent updates come newest first", () => {
  const updates = Array.from({ length: 12 }, (_, n) => U(n + 1));
  const w = W({ updates });
  const { recent } = attention(w, "game", TODAY);
  assert.deepEqual(recent.map((u) => u.id), ["u-12", "u-11", "u-10", "u-9", "u-8", "u-7", "u-6", "u-5", "u-4", "u-3"]);
});

test("updates in the same instant keep the later one first", () => {
  const w = W({ updates: [U(5, { id: "u-first" }), U(5, { id: "u-second" })] });
  assert.deepEqual(attention(w, "game", TODAY).recent.map((u) => u.id), ["u-second", "u-first"]);
});

test("another project's records are not in this project's attention", () => {
  const other = { ...baseProject, id: "other" };
  const w = W({
    projects: [{ ...baseProject, weeklyHours: 40 }, other],
    decisions: [D("mine"), D("theirs", { projectId: "other" })],
    actions: [A("theirs", { projectId: "other", due: TODAY })],
    gates: [G("theirs", { projectId: "other", due: TODAY })],
    updates: [U(1, { projectId: "other" })],
  });
  const a = attention(w, "game", TODAY);
  assert.deepEqual(a.decisions.map((d) => d.id), ["mine"]);
  assert.deepEqual([a.actions, a.gates, a.recent], [[], [], []]);
});

test("the total counts what needs the owner now", () => {
  const w = W({ decisions: [D("a"), D("b")], actions: [A("x", { due: TODAY })], gates: [G("g", { due: TODAY })] });
  assert.equal(attention(w, "game", TODAY).summary.total, 4);
});

test("attention is a pure function of the ledger and the date it is given", () => {
  const w = W({ decisions: [D("a", { needBy: "2026-10-12" })] });
  const before = JSON.stringify(w);
  const one = attention(w, "game", TODAY);
  assert.deepEqual(attention(w, "game", TODAY), one);
  assert.equal(JSON.stringify(w), before);
  assert.equal(attention(w, "game", "2026-10-13").decisions[0].daysLeft, -1);
  assert.equal(attention(w, "game", "2026-02-28").decisions[0].daysLeft, 226);
});

test("attention needs a real project and a real date", () => {
  assert.throws(() => attention(W(), "nope", TODAY), /Project does not exist/);
  for (const bad of [undefined, "", "2026-13-01", "10/11/2026", "2026-10-11T00:00:00Z"])
    assert.throws(() => attention(W(), "game", bad), /today/);
});

test("a workspace saved before these collections existed has an empty attention", () => {
  const old = ledger();
  assert.equal(attention(old, "game", TODAY).summary.total, 0);
});

test("advise puts the owner's open decisions, actions and gates first", () => {
  const w = W({
    decisions: [D("banner", { needBy: "2026-10-15" }), D("capsule")],
    actions: [A("trailer", { due: "2026-10-09" })],
    gates: [G("playtest", { due: "2026-10-12" })],
  });
  const [first, ...rest] = advise(w, "game", {}, TODAY);
  assert.equal(first.kind, "attention");
  assert.equal(first.priority, 0);
  assert.deepEqual(first.ruleIds, []);
  assert.match(first.title, /owner/i);
  assert.match(first.reason, /2 open decisions/);
  assert.match(first.reason, /Decide banner/);
  assert.match(first.reason, /needed by 2026-10-15/);
  assert.match(first.reason, /1 owner action/);
  assert.match(first.reason, /overdue/);
  assert.match(first.reason, /1 gate/);
  assert.match(first.next, /marketing next game/);
  assert.ok(rest.every((a) => a.kind !== "attention"));
  assert.ok(rest.every((a) => a.priority >= 0));
});

test("advise adds no attention action when nothing waits on the owner", () => {
  assert.equal(advise(W(), "game", {}, TODAY).some((a) => a.kind === "attention"), false);
  const decided = W({ decisions: [D("a", { status: "decided", chosen: "a", decidedAt: "2026-10-01T00:00:00.000Z" })], gates: [G("far", { due: "2026-12-01" })] });
  assert.equal(advise(decided, "game", {}, TODAY).some((a) => a.kind === "attention"), false);
});

test("a blocked running initiative is advised as readiness, not repeated as attention", () => {
  const w = W({ gates: [G("g")], initiatives: [I("run", { status: "running", dependsOn: ["g"], start: "2026-10-01" })] });
  const kinds = advise(w, "game", {}, TODAY).map((a) => a.kind);
  assert.ok(kinds.includes("readiness"));
  assert.ok(!kinds.includes("attention"));
});
