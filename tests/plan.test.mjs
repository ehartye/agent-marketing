import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { plan, advise } from "../src/analysis.mjs";
import { validateWorkspace } from "../src/schema.mjs";
import { createWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { ledger, project as baseProject, initiative as baseInitiative } from "./fixtures.mjs";

const I = (id, start, end, hours, extra = {}) => ({
  ...baseInitiative,
  id,
  name: `Init ${id}`,
  start,
  end,
  budget: 0,
  status: "planned",
  ...(hours === undefined ? {} : { hours }),
  ...extra,
});
const G = (id, status = "open", extra = {}) => ({
  id,
  projectId: "game",
  name: `Gate ${id}`,
  criteria: `pass condition of ${id}`,
  status,
  ...extra,
});
// weeklyHours 10 and a 100 USD budget unless a test says otherwise.
const W = (initiatives, gates = [], project = {}) => ({
  ...ledger(),
  projects: [{ ...baseProject, weeklyHours: 10, budget: 100, ...project }],
  initiatives,
  gates,
});
const week = (p, start) => p.load.weeks.find((x) => x.start === start);
const MON = "2026-10-12"; // 2026-10-12 is a Monday

test("plan lists the project's gates with their status, criteria and the work that needs each", () => {
  const w = W(
    [I("a", MON, MON, 1, { dependsOn: ["g1"] }), I("b", MON, MON, 1, { dependsOn: ["g1", "g2"] }), I("c", MON, MON, 1)],
    [G("g1", "open"), G("g2", "passed", { checkedAt: "2026-10-10", evidenceIds: ["e1"], notes: "ran twice" })],
  );
  w.evidence = [{ id: "e1", projectId: "game" }];
  const p = plan(w, "game");
  assert.equal(p.projectId, "game");
  assert.deepEqual(p.gates.map((g) => [g.id, g.status, g.requiredBy]), [
    ["g1", "open", ["a", "b"]],
    ["g2", "passed", ["b"]],
  ]);
  assert.deepEqual(p.gates[0], {
    id: "g1",
    name: "Gate g1",
    criteria: "pass condition of g1",
    status: "open",
    checkedAt: null,
    evidenceIds: [],
    notes: null,
    due: null,
    hours: null,
    initiativeId: null,
    overCapWeeks: [],
    requiredBy: ["a", "b"],
  });
  assert.equal(p.gates[1].checkedAt, "2026-10-10");
  assert.deepEqual(p.gates[1].evidenceIds, ["e1"]);
  assert.equal(p.gates[1].notes, "ran twice");
});

test("an initiative is blocked by a gate that is open or failed, and freed by one passed or waived", () => {
  const cases = [
    ["open", true],
    ["failed", true],
    ["passed", false],
    ["waived", false],
  ];
  for (const [status, blocked] of cases) {
    const p = plan(W([I("a", MON, MON, 1, { dependsOn: ["g"] })], [G("g", status)]), "game");
    const a = p.initiatives[0];
    assert.equal(a.blocked, blocked, status);
    assert.deepEqual(
      a.blockedBy,
      blocked ? [{ id: "g", kind: "gate", name: "Gate g", status }] : [],
      status,
    );
  }
});

test("an initiative is blocked by another that is not complete, whatever else its status", () => {
  for (const status of ["planned", "running", "paused"]) {
    const p = plan(W([I("a", MON, MON, 1, { dependsOn: ["b"] }), I("b", MON, MON, 1, { status })]), "game");
    assert.equal(p.initiatives[0].blocked, true, status);
    assert.deepEqual(p.initiatives[0].blockedBy, [{ id: "b", kind: "initiative", name: "Init b", status }]);
  }
  const done = plan(W([I("a", MON, MON, 1, { dependsOn: ["b"] }), I("b", MON, MON, 1, { status: "complete" })]), "game");
  assert.equal(done.initiatives[0].blocked, false);
});

test("blockedBy lists only the unmet dependencies, in the order they were declared", () => {
  const p = plan(
    W(
      [I("a", MON, MON, 1, { dependsOn: ["g2", "g1", "b", "g3"] }), I("b", MON, MON, 1)],
      [G("g1", "passed"), G("g2", "open"), G("g3", "failed")],
    ),
    "game",
  );
  assert.deepEqual(p.initiatives[0].blockedBy.map((x) => [x.id, x.kind, x.status]), [
    ["g2", "gate", "open"],
    ["b", "initiative", "planned"],
    ["g3", "gate", "failed"],
  ]);
  assert.equal(p.initiatives.find((i) => i.id === "b").blocked, false);
  assert.deepEqual(p.initiatives.find((i) => i.id === "b").blockedBy, []);
});

test("blocking is direct, so a chain shows each link and an initiative with no dependencies is free", () => {
  const p = plan(
    W([I("a", MON, MON, 1, { dependsOn: ["b"] }), I("b", MON, MON, 1, { dependsOn: ["g"] }), I("c", MON, MON, 1)], [G("g")]),
    "game",
  );
  assert.deepEqual(p.initiatives.map((i) => [i.id, i.blocked, i.blockedBy.map((x) => x.id)]), [
    ["a", true, ["b"]],
    ["b", true, ["g"]],
    ["c", false, []],
  ]);
  assert.deepEqual(p.initiatives[2].dependsOn, []);
});

test("a complete initiative is not blocked even if a gate it listed is open, but the plan says so", () => {
  const p = plan(W([I("a", MON, MON, 1, { status: "complete", dependsOn: ["g"] })], [G("g")]), "game");
  assert.equal(p.initiatives[0].blocked, false);
  assert.deepEqual(p.initiatives[0].blockedBy, []);
  assert.ok(p.warnings.includes('Initiative "a" is complete although it waits on gate "g" (open)'));
});

test("a running initiative that waits on an unmet dependency is a warning", () => {
  const p = plan(
    W([I("a", MON, MON, 1, { status: "running", dependsOn: ["g", "b"] }), I("b", MON, MON, 1)], [G("g", "failed")]),
    "game",
  );
  assert.ok(p.warnings.includes('Initiative "a" is running although it waits on gate "g" (failed), initiative "b" (planned)'));
  const planned = plan(W([I("a", MON, MON, 1, { dependsOn: ["g"] })], [G("g")]), "game");
  assert.ok(!planned.warnings.some((x) => /although/.test(x)));
});

test("a dependency that cannot be found counts as unmet instead of being ignored", () => {
  const p = plan(W([I("a", MON, MON, 1, { dependsOn: ["ghost"] })]), "game");
  assert.deepEqual(p.initiatives[0].blockedBy, [{ id: "ghost", kind: "missing", name: "ghost", status: "missing" }]);
  assert.equal(p.initiatives[0].blocked, true);
});

test("plan reads only the chosen project, so another project's gates never free or block its work", () => {
  const other = { ...baseProject, id: "other", weeklyHours: 1, budget: 5 };
  // Initiative "a" waits on "h", which is a passed gate, but of the other project.
  const w = W(
    [
      I("a", MON, MON, 2, { dependsOn: ["h"], budget: 7 }),
      I("theirs", MON, "2026-10-25", 30, { projectId: "other", budget: 99 }),
    ],
    [G("g", "open"), { ...G("h", "passed"), projectId: "other" }],
  );
  w.projects.push(other);
  const mine = plan(w, "game");
  assert.deepEqual(mine.gates.map((g) => g.id), ["g"]);
  assert.deepEqual(mine.initiatives.map((i) => i.id), ["a"]);
  assert.equal(mine.initiatives[0].blockedBy[0].kind, "missing", "a gate in another project does not satisfy a dependency");
  assert.equal(mine.load.totalHours, 2);
  assert.equal(mine.budget.planned, 7);
  const theirs = plan(w, "other");
  assert.deepEqual(theirs.gates.map((g) => g.id), ["h"]);
  assert.deepEqual(theirs.initiatives.map((i) => i.id), ["theirs"]);
  assert.equal(theirs.load.totalHours, 30);
  assert.equal(theirs.budget.planned, 99);
  assert.equal(theirs.budget.cap, 5);
  assert.equal(theirs.weeklyHours, 1);
});

test("plan refuses a project that does not exist", () => {
  assert.throws(() => plan(W([]), "nope"), /Project does not exist/);
});

test("hours are spread evenly over the days of an initiative, by calendar week from Monday", () => {
  // Monday 12 Oct to Sunday 25 Oct: 14 days, two whole weeks.
  const p = plan(W([I("a", MON, "2026-10-25", 14)]), "game");
  assert.deepEqual(p.load.weeks.map((x) => [x.start, x.end, x.hours]), [
    ["2026-10-12", "2026-10-18", 7],
    ["2026-10-19", "2026-10-25", 7],
  ]);
  assert.deepEqual(week(p, MON).initiatives, [{ id: "a", hours: 7 }]);
  assert.equal(p.load.totalHours, 14);
});

test("a Sunday to Monday initiative is split by the days that fall in each week", () => {
  const p = plan(W([I("a", "2026-10-18", "2026-10-19", 4)]), "game");
  assert.deepEqual(p.load.weeks.map((x) => [x.start, x.hours]), [
    ["2026-10-12", 2],
    ["2026-10-19", 2],
  ]);
});

test("an initiative on one day, or on one whole week, lands in exactly one week", () => {
  const day = plan(W([I("a", "2026-10-14", "2026-10-14", 5)]), "game");
  assert.deepEqual(day.load.weeks.map((x) => [x.start, x.hours]), [[MON, 5]]);
  const whole = plan(W([I("a", MON, "2026-10-18", 9)]), "game");
  assert.deepEqual(whole.load.weeks.map((x) => [x.start, x.hours]), [[MON, 9]]);
  const sunday = plan(W([I("a", "2026-10-18", "2026-10-18", 3)]), "game");
  assert.deepEqual(sunday.load.weeks.map((x) => x.start), [MON]);
  const monday = plan(W([I("a", "2026-10-19", "2026-10-19", 3)]), "game");
  assert.deepEqual(monday.load.weeks.map((x) => x.start), ["2026-10-19"]);
});

test("a partial first and last week take their days' share", () => {
  // Wed 14 Oct to Tue 27 Oct: 5 + 7 + 2 days of 14.
  const p = plan(W([I("a", "2026-10-14", "2026-10-27", 14)]), "game");
  assert.deepEqual(p.load.weeks.map((x) => x.hours), [5, 7, 2]);
});

test("weeks follow the calendar over a year end and a leap day", () => {
  const year = plan(W([I("a", "2026-12-28", "2027-01-10", 14)]), "game");
  assert.deepEqual(year.load.weeks.map((x) => [x.start, x.end, x.hours]), [
    ["2026-12-28", "2027-01-03", 7],
    ["2027-01-04", "2027-01-10", 7],
  ]);
  // 2028-02-28 is a Monday; the week holds 29 February.
  const leap = plan(W([I("a", "2028-02-28", "2028-03-05", 7)]), "game");
  assert.deepEqual(leap.load.weeks.map((x) => [x.start, x.end, x.hours]), [["2028-02-28", "2028-03-05", 7]]);
  const across = plan(W([I("a", "2028-02-26", "2028-03-01", 5)]), "game");
  assert.deepEqual(across.load.weeks.map((x) => [x.start, x.hours]), [
    ["2028-02-21", 2],
    ["2028-02-28", 3],
  ]);
});

test("a week sums every initiative in it and is over the cap only above it", () => {
  const at = plan(W([I("a", MON, "2026-10-18", 6), I("b", "2026-10-14", "2026-10-14", 4)]), "game");
  assert.equal(week(at, MON).hours, 10);
  assert.equal(week(at, MON).overCap, false);
  assert.equal(week(at, MON).overBy, 0);
  const over = plan(W([I("a", MON, "2026-10-18", 6), I("b", "2026-10-14", "2026-10-14", 5.5)]), "game");
  assert.equal(week(over, MON).hours, 11.5);
  assert.equal(week(over, MON).overCap, true);
  assert.equal(week(over, MON).overBy, 1.5);
  assert.deepEqual(week(over, MON).initiatives, [{ id: "a", hours: 6 }, { id: "b", hours: 5.5 }]);
  assert.equal(week(over, MON).cap, 10);
});

test("every week states the cap it is compared with, and a zero cap makes any work over", () => {
  const p = plan(W([I("a", MON, MON, 1)], [], { weeklyHours: 0 }), "game");
  assert.equal(p.weeklyHours, 0);
  assert.equal(week(p, MON).overCap, true);
  assert.equal(week(p, MON).overBy, 1);
  const none = plan(W([I("a", MON, MON, 0)], [], { weeklyHours: 0 }), "game");
  assert.equal(week(none, MON).overCap, false);
});

test("float noise does not push a week over its cap", () => {
  const p = plan(
    W([I("a", MON, MON, 0.1), I("b", MON, MON, 0.1), I("c", MON, MON, 0.1)], [], { weeklyHours: 0.3 }),
    "game",
  );
  assert.equal(week(p, MON).hours, 0.3);
  assert.equal(week(p, MON).overCap, false);
  assert.equal(p.load.totalHours, 0.3);
});

test("hours are rounded to two decimals after a week is summed", () => {
  // Fri 16 Oct to Thu 22 Oct: 3 days in the first week and 4 in the second.
  const p = plan(W([I("a", "2026-10-16", "2026-10-22", 1)]), "game");
  assert.deepEqual(p.load.weeks.map((x) => x.hours), [0.43, 0.57]);
});

test("an initiative of zero hours is known, adds nothing and is not listed as unknown", () => {
  const p = plan(W([I("a", MON, "2026-10-25", 0), I("b", MON, MON, 2)]), "game");
  assert.equal(p.initiatives[0].hours, 0);
  assert.deepEqual(p.load.unknownHours, []);
  assert.deepEqual(week(p, MON).initiatives, [{ id: "b", hours: 2 }]);
  assert.deepEqual(week(p, "2026-10-19").initiatives, []);
  assert.deepEqual(week(p, "2026-10-19").unknownHours, []);
  assert.equal(week(p, "2026-10-19").hours, 0);
  assert.ok(!p.warnings.some((x) => /no hours/.test(x)));
});

test("an initiative with no hours is unknown: reported, listed by week, and never counted as zero", () => {
  const p = plan(W([I("a", MON, "2026-10-25"), I("b", MON, MON, 4), I("c", "2026-10-19", "2026-10-19")]), "game");
  assert.equal(p.initiatives[0].hours, null);
  assert.deepEqual(p.load.unknownHours, ["a", "c"]);
  assert.deepEqual(week(p, MON).unknownHours, ["a"]);
  assert.deepEqual(week(p, "2026-10-19").unknownHours, ["a", "c"]);
  assert.equal(week(p, MON).hours, 4);
  assert.equal(p.load.totalHours, 4);
  assert.equal(p.summary.withoutHours, 2);
  assert.ok(p.warnings.includes("2 initiatives have no hours (a, c); the weekly load counts only initiatives with hours."));
  const one = plan(W([I("a", MON, MON)]), "game");
  assert.ok(one.warnings.includes("1 initiative has no hours (a); the weekly load counts only initiatives with hours."));
});

test("weeks run without a gap from the first start to the last end, quiet weeks included", () => {
  const p = plan(W([I("a", MON, MON, 2), I("b", "2026-11-04", "2026-11-04", 3)]), "game");
  assert.deepEqual(p.load.weeks.map((x) => [x.start, x.hours]), [
    ["2026-10-12", 2],
    ["2026-10-19", 0],
    ["2026-10-26", 0],
    ["2026-11-02", 3],
  ]);
  assert.equal(p.load.capacityHours, 40);
  const empty = plan(W([]), "game");
  assert.deepEqual(empty.load.weeks, []);
  assert.equal(empty.load.totalHours, 0);
  assert.equal(empty.load.capacityHours, 0);
});

test("an initiative lists the over-cap weeks it adds hours to", () => {
  const p = plan(
    W([I("a", MON, "2026-10-25", 28), I("b", "2026-10-21", "2026-10-21", 1), I("c", MON, "2026-10-25", 0), I("d", "2026-11-02", "2026-11-02", 1)]),
    "game",
  );
  // Week one holds 14 hours and week two 15: both are over a 10 hour cap.
  assert.deepEqual(p.initiatives.map((i) => [i.id, i.overCapWeeks]), [
    ["a", ["2026-10-12", "2026-10-19"]],
    ["b", ["2026-10-19"]],
    ["c", []],
    ["d", []],
  ]);
  assert.equal(p.summary.overCapWeeks, 2);
  assert.deepEqual(p.summary.peakWeek, { start: "2026-10-19", hours: 15 });
});

test("a plan without hours has no peak week and no over-cap weeks", () => {
  const p = plan(W([I("a", MON, MON)]), "game");
  assert.equal(p.summary.overCapWeeks, 0);
  assert.equal(p.summary.peakWeek, null);
  assert.equal(plan(W([]), "game").summary.peakWeek, null);
});

test("the budget roll-up compares initiative budgets with the project budget", () => {
  const under = plan(W([I("a", MON, MON, 1, { budget: 40 }), I("b", MON, MON, 1, { budget: 35.5 })]), "game");
  assert.deepEqual(under.budget, { currency: "USD", cap: 100, planned: 75.5, remaining: 24.5, overBudget: false, overBy: 0 });
  const exact = plan(W([I("a", MON, MON, 1, { budget: 100 })]), "game");
  assert.equal(exact.budget.overBudget, false);
  assert.equal(exact.budget.remaining, 0);
  const over = plan(W([I("a", MON, MON, 1, { budget: 100 }), I("b", MON, MON, 1, { budget: 0.1 })]), "game");
  assert.deepEqual(over.budget, { currency: "USD", cap: 100, planned: 100.1, remaining: -0.1, overBudget: true, overBy: 0.1 });
  const none = plan(W([], [], { budget: 0 }), "game");
  assert.deepEqual(none.budget, { currency: "USD", cap: 0, planned: 0, remaining: 0, overBudget: false, overBy: 0 });
});

test("the plan states its method, so a reader knows how weekly hours were derived", () => {
  const { method } = plan(W([]), "game").load;
  assert.match(method, /evenly over the days/);
  assert.match(method, /Monday/);
  assert.match(method, /without hours/);
});

test("a gate marked passed without evidence or waived without a note is flagged", () => {
  const p = plan(
    W([], [G("a", "passed"), G("b", "passed", { evidenceIds: ["e1"] }), G("c", "waived"), G("d", "waived", { notes: "owner call" }), G("e", "open")]),
    "game",
  );
  assert.deepEqual(p.warnings, ['Gate "a" is passed but cites no evidence', 'Gate "c" is waived without a note saying why']);
});

test("an initiative that starts before a dependency ends is flagged unless that dependency is complete", () => {
  const dep = (status, aStart) =>
    plan(W([I("a", aStart, "2026-11-30", 1, { dependsOn: ["b"] }), I("b", MON, "2026-10-20", 1, { status })]), "game");
  const early = dep("planned", "2026-10-19");
  assert.ok(early.warnings.includes('Initiative "a" starts 2026-10-19 before its dependency "b" ends 2026-10-20'));
  assert.ok(!dep("planned", "2026-10-20").warnings.some((x) => /starts/.test(x)), "a same-day handoff is allowed");
  assert.ok(!dep("complete", "2026-10-19").warnings.some((x) => /starts/.test(x)), "a finished dependency has no schedule left to break");
  const done = plan(W([I("a", "2026-10-19", "2026-11-30", 1, { status: "complete", dependsOn: ["b"] }), I("b", MON, "2026-10-20", 1)]), "game");
  assert.ok(!done.warnings.some((x) => /starts/.test(x)), "a finished initiative has no start left to move");
});

test("the summary counts gates by status and the work they hold", () => {
  const p = plan(
    W(
      [I("a", MON, MON, 1, { dependsOn: ["g1"] }), I("b", MON, MON, 1, { dependsOn: ["g3"] }), I("c", MON, MON, 1, { dependsOn: ["a"] })],
      [G("g1", "open"), G("g2", "passed"), G("g3", "passed"), G("g4", "failed"), G("g5", "waived")],
    ),
    "game",
  );
  assert.deepEqual(p.summary.gates, { open: 1, passed: 2, failed: 1, waived: 1 });
  assert.equal(p.summary.blocked, 2);
});

test("plan neither changes the ledger nor depends on object identity", () => {
  const w = W([I("a", MON, "2026-10-25", 14, { dependsOn: ["g"] })], [G("g")]);
  validateWorkspace(w);
  const before = structuredClone(w);
  const first = plan(w, "game");
  assert.deepEqual(w, before);
  assert.deepEqual(plan(structuredClone(w), "game"), first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("a ledger saved before gates existed plans without error", () => {
  const w = ledger();
  delete w.gates;
  const p = plan(w, "game");
  assert.deepEqual(p.gates, []);
  assert.equal(p.initiatives[0].blocked, false);
  assert.equal(p.initiatives[0].hours, null);
});

test("advise says nothing about gates or hours when the ledger holds none", () => {
  const kinds = advise(ledger(), "game").map((a) => a.kind);
  assert.ok(!kinds.includes("readiness"));
  assert.ok(!kinds.includes("capacity"));
});

test("advise puts running work that waits on a gate first and names both", () => {
  const w = W([I("itch", MON, "2026-10-25", 4, { status: "running", dependsOn: ["playtest"] })], [G("playtest", "open")]);
  const [first] = advise(w, "game");
  assert.equal(first.kind, "readiness");
  assert.equal(first.priority, 1);
  assert.match(first.reason, /Init itch/);
  assert.match(first.reason, /running/);
  assert.match(first.reason, /Gate playtest/);
  assert.match(first.next, /pass condition of playtest/);
});

test("advise points planned work held by a gate at the gate's pass condition", () => {
  const w = W(
    [
      I("late", "2026-11-09", "2026-11-20", 2, { dependsOn: ["assets"] }),
      I("soon", "2026-10-19", "2026-10-25", 2, { dependsOn: ["playtest"] }),
      I("free", MON, MON, 1),
    ],
    [G("assets", "open"), G("playtest", "failed")],
  );
  const actions = advise(w, "game");
  const action = actions.find((a) => a.kind === "readiness");
  assert.equal(action.priority, 2);
  assert.match(action.title, /gate/i);
  assert.match(action.reason, /Gate playtest \(failed\) holds Init soon/);
  assert.match(action.reason, /Gate assets \(open\) holds Init late/);
  // The gate holding the earliest start comes first, with its condition and its failure.
  assert.match(action.next, /Gate playtest/);
  assert.match(action.next, /pass condition of playtest/);
  assert.match(action.next, /failed/i);
  assert.ok(actions.indexOf(action) < actions.findIndex((a) => a.kind === "viability"));
});

test("advise stays quiet about work that only waits on earlier work or on a settled gate", () => {
  const w = W(
    [I("a", MON, MON, 1, { dependsOn: ["b", "g"] }), I("b", MON, MON, 1)],
    [G("g", "passed", { evidenceIds: [] })],
  );
  assert.ok(!advise(w, "game").some((a) => a.kind === "readiness"));
});

test("advise reports weeks over the cap with the hours over, and says what is not counted", () => {
  const w = W([I("a", MON, "2026-10-25", 28), I("b", MON, MON)]);
  const action = advise(w, "game").find((a) => a.kind === "capacity");
  assert.equal(action.priority, 2);
  assert.match(action.reason, /2 weeks exceed the 10 hour weekly cap/);
  assert.match(action.reason, /2026-10-12 \(14 h, 4 over\)/);
  assert.match(action.reason, /Init b|\(b\)/);
  assert.match(action.next, /marketing plan game/);
  const fine = W([I("a", MON, "2026-10-25", 20)]);
  assert.ok(!advise(fine, "game").some((a) => a.kind === "capacity"));
});

test("advise lists at most three over-cap weeks and counts the rest", () => {
  const w = W([I("a", MON, "2026-12-06", 160)]);
  const action = advise(w, "game").find((a) => a.kind === "capacity");
  assert.match(action.reason, /^8 weeks exceed/);
  assert.match(action.reason, /and 5 more/);
});

test("advise leaves finished work out of the capacity action, and the plan still records it", () => {
  // 30 hours over one finished week, against a 6 hour cap: nothing can be moved out of that week.
  const done = W([I("a", "2025-03-03", "2025-03-09", 30, { status: "complete" })], [], { weeklyHours: 6 });
  const p = plan(done, "game");
  assert.equal(week(p, "2025-03-03").overCap, true);
  assert.equal(week(p, "2025-03-03").hours, 30);
  assert.equal(p.summary.overCapWeeks, 1);
  assert.ok(!advise(done, "game").some((a) => a.kind === "capacity"));
  // Finished work shares a week with planned work that fits once the finished work is set aside.
  const fits = W([I("a", MON, "2026-10-18", 30, { status: "complete" }), I("b", MON, MON, 5)], [], { weeklyHours: 6 });
  assert.equal(week(plan(fits, "game"), MON).overCap, true);
  assert.ok(!advise(fits, "game").some((a) => a.kind === "capacity"));
  // Planned work that is itself over the cap is named with its own hours, and the action says what it left out.
  const over = W([I("a", MON, "2026-10-18", 30, { status: "complete" }), I("b", MON, MON, 8)], [], { weeklyHours: 6 });
  const action = advise(over, "game").find((a) => a.kind === "capacity");
  assert.match(action.reason, /1 week exceeds the 6 hour weekly cap: 2026-10-12 \(8 h, 2 over\)/);
  assert.match(action.reason, /Completed initiatives are not counted/);
  // The same week with the work still open is counted whole, as before.
  const open = W([I("a", MON, "2026-10-18", 30, { status: "running" }), I("b", MON, MON, 8)], [], { weeklyHours: 6 });
  assert.match(advise(open, "game").find((a) => a.kind === "capacity").reason, /\(38 h, 32 over\)/);
  assert.doesNotMatch(advise(open, "game").find((a) => a.kind === "capacity").reason, /Completed initiatives/);
});

test("a plan over centuries draws a bounded number of weeks, says what it left out, and stays small", () => {
  const p = plan(W([I("a", "0001-01-01", "9999-12-31", 100)]), "game");
  assert.equal(p.load.weeks.length, 260);
  assert.ok(p.load.omittedWeeks > 500000, `omittedWeeks ${p.load.omittedWeeks}`);
  assert.equal(p.load.weeks[0].start, "0001-01-01");
  assert.equal(p.load.capacityHours, 260 * p.weeklyHours);
  const note = p.warnings.find((x) => /260 weeks/.test(x));
  assert.ok(note, "a warning says the weeks were limited");
  assert.match(note, /0001-01-01 to 9999-12-31/);
  assert.match(note, /dates/);
  assert.ok(JSON.stringify(p).length < 250000, "the plan stays small");
  // Inside the limit nothing is left out and nothing is said.
  const year = plan(W([I("a", "2026-01-05", "2027-01-03", 52)]), "game");
  assert.equal(year.load.omittedWeeks, 0);
  assert.equal(year.load.weeks.length, 52);
  assert.ok(!year.warnings.some((x) => /weeks/.test(x)));
  // The limit is a number of weeks, so exactly 260 fit and one more does not.
  const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  assert.equal(plan(W([I("a", "2026-01-05", addDays("2026-01-05", 260 * 7 - 1), 5)]), "game").load.omittedWeeks, 0);
  assert.equal(plan(W([I("a", "2026-01-05", addDays("2026-01-05", 260 * 7), 5)]), "game").load.omittedWeeks, 1);
});

test("a later initiative beyond the limit is left out of the weeks but is still listed", () => {
  const p = plan(W([I("a", "2026-01-05", "2026-01-11", 5), I("late", "2046-01-05", "2046-01-11", 5)]), "game");
  assert.equal(p.load.weeks.length, 260);
  assert.ok(p.load.weeks.every((x) => !x.initiatives.some((i) => i.id === "late")));
  assert.deepEqual(p.initiatives.map((i) => i.id), ["a", "late"]);
  assert.ok(p.load.omittedWeeks > 0);
  assert.equal(p.load.totalHours, 10);
});

test("week boundaries at the ends of the calendar are still four-digit dates", () => {
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const late = plan(W([I("a", "9999-12-25", "9999-12-31", 7)]), "game");
  assert.deepEqual(late.load.weeks.map((x) => [x.start, x.end]), [["9999-12-20", "9999-12-26"], ["9999-12-27", "9999-12-31"]]);
  const early = plan(W([I("a", "0000-01-01", "0000-01-05", 5)]), "game");
  assert.deepEqual(early.load.weeks.map((x) => [x.start, x.end]), [["0000-01-01", "0000-01-02"], ["0000-01-03", "0000-01-09"]]);
  for (const p of [late, early]) for (const x of p.load.weeks) assert.ok(isDate(x.start) && isDate(x.end), `${x.start} ${x.end}`);
  assert.deepEqual(early.initiatives[0].overCapWeeks, []);
});

test("plan and advise stay fast for thousands of initiatives that overlap for years", () => {
  // 5000 initiatives each in 156 weeks make 780000 week entries, so a lookup that scans the initiative
  // list for each entry is quadratic: several seconds for each call.
  const many = Array.from({ length: 5000 }, (_, k) => I(`n${k}`, MON, "2029-10-14", 1));
  const w = W(many, [], { weeklyHours: 5 });
  let t = Date.now();
  const p = plan(w, "game");
  const planMs = Date.now() - t;
  t = Date.now();
  const actions = advise(w, "game");
  const adviseMs = Date.now() - t;
  assert.equal(p.load.weeks.length, 157);
  assert.equal(p.initiatives.length, 5000);
  assert.ok(actions.some((a) => a.kind === "capacity"));
  assert.ok(planMs < 2000, `plan took ${planMs} ms`);
  assert.ok(adviseMs < 2000, `advise took ${adviseMs} ms`);
});

const cli = (file, ...args) =>
  spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });

test("the plan command prints the plan as JSON, takes the project as an argument or --project, and rejects bad input", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-plan-")), file = join(dir, "w.json");
  try {
    const w = W([I("a", MON, "2026-10-25", 14, { dependsOn: ["g"] })], [G("g")]);
    createWorkspace(file, w);
    const run = cli(file, "plan", "game");
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.projectId, "game");
    assert.equal(out.initiatives[0].blocked, true);
    assert.equal(out.load.weeks.length, 2);
    assert.deepEqual(JSON.parse(cli(file, "plan", "--project", "game").stdout), out);
    const missing = cli(file, "plan");
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Required: project ID/);
    const unknown = cli(file, "plan", "nope");
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Project does not exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("help lists the plan command", () => {
  const help = JSON.parse(spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "help"], { encoding: "utf8" }).stdout);
  assert.ok(help.commands.includes("plan <project-id>"));
});

test("advise from the command line carries the readiness action", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-plan-")), file = join(dir, "w.json");
  try {
    createWorkspace(file, W([I("a", MON, "2026-10-25", 2, { status: "running", dependsOn: ["g"] })], [G("g")]));
    const out = JSON.parse(cli(file, "advise", "game").stdout);
    assert.equal(out[0].kind, "readiness");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the desk serves the plan for a project and nothing without one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-plan-http-")), file = join(dir, "w.json");
  createWorkspace(file, W([I("a", MON, "2026-10-25", 14, { dependsOn: ["g"] })], [G("g")]));
  const running = await startServer(file, { port: 0 });
  try {
    const response = await fetch(running.url + "/api/plan?projectId=game");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.projectId, "game");
    assert.equal(body.gates[0].id, "g");
    assert.equal(body.initiatives[0].blockedBy[0].id, "g");
    assert.equal(await (await fetch(running.url + "/api/plan")).json(), null);
    assert.equal((await fetch(running.url + "/api/plan?projectId=nope")).status, 400);
  } finally {
    running.server.close();
    running.server.closeAllConnections?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("docs/CLI.md documents the plan command, the gate and initiative fields and how weekly hours are computed", async () => {
  const { readFileSync } = await import("node:fs");
  const doc = readFileSync("docs/CLI.md", "utf8").replace(/\s+/g, " ");
  assert.match(doc, /marketing plan <project-id> --workspace <file>/);
  assert.match(doc, /## Gates, dependencies and weekly hours/);
  assert.match(doc, /\| gates \| projectId, name, criteria[^|]*status \(`open\/passed\/failed\/waived`\)/);
  assert.match(doc, /optional brief document, hours \(nonnegative number/);
  assert.match(doc, /dependsOn \(array of gate or initiative IDs in the same project/);
  assert.match(doc, /spread evenly over the days from its `start` to its `end`, both included/);
  assert.match(doc, /Monday to Sunday/);
  assert.match(doc, /An initiative without `hours` is unknown, not zero/);
  assert.match(doc, /empty `gates` collection the first time the new runtime writes them, whatever the write[^.]*and need no migration/);
  assert.match(doc, /older runtime refuses any ledger that has a `gates` key/);
  assert.doesNotMatch(doc, /such as `dependsOn`, `hours` or `targets`/);
});

test("the discover, strategy and campaign skills and the README tell an agent to record gates, hours and dependencies and run plan", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path) => readFileSync(path, "utf8").replace(/\s+/g, " ");
  assert.match(read("skills/market-discover/SKILL.md"), /name its readiness gates/);
  assert.match(read("skills/market-discover/SKILL.md"), /`gates` record with `marketing put gates <gate.json>`/);
  assert.match(read("skills/market-discover/SKILL.md"), /`criteria` that can be checked with a number/);
  assert.match(read("skills/market-discover/SKILL.md"), /Never record a gate as `passed` without an evidence record/);
  for (const skill of ["market-strategy", "market-campaign"]) {
    const text = read(`skills/${skill}/SKILL.md`);
    assert.match(text, /`hours`/, skill);
    assert.match(text, /`dependsOn`/, skill);
    assert.match(text, /marketing plan <project-id>/, skill);
    assert.match(text, /`weeklyHours`/, skill);
  }
  assert.match(read("skills/market-campaign/SKILL.md"), /If the initiative is blocked, do not start it|if the initiative is blocked, do not start it/i);
  assert.match(read("README.md"), /`plan`/);
  assert.match(read("README.md"), /docs\/CLI\.md#gates-dependencies-and-weekly-hours/);
});
