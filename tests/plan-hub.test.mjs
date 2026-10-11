import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, advise } from "../src/analysis.mjs";
import { validateWorkspace } from "../src/schema.mjs";
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
const A = (id, extra = {}) => ({ id, projectId: "game", title: `Action ${id}`, owner: "owner", status: "todo", ...extra });
const W = (initiatives, gates = [], extra = {}) =>
  validateWorkspace({
    ...ledger(),
    projects: [{ ...baseProject, weeklyHours: 10, budget: 100 }],
    initiatives,
    gates,
    ...extra,
  });
const week = (p, start) => p.load.weeks.find((x) => x.start === start);
const MON = "2026-10-12"; // a Monday
const NEXT = "2026-10-19";

test("a gate with a due date and hours adds its hours to the week it is due", () => {
  const p = plan(W([I("a", MON, "2026-10-18", 7)], [G("g", "open", { due: "2026-10-14", hours: 4 })]), "game");
  assert.equal(week(p, MON).hours, 11);
  assert.equal(week(p, MON).overCap, true);
  assert.equal(week(p, MON).overBy, 1);
  assert.deepEqual(week(p, MON).gates, [{ id: "g", hours: 4 }]);
  assert.deepEqual(week(p, MON).initiatives, [{ id: "a", hours: 7 }]);
  assert.equal(p.load.totalHours, 11);
  assert.equal(p.load.gateHours, 4);
  assert.deepEqual(p.gates[0].overCapWeeks, [MON]);
  assert.deepEqual(p.initiatives[0].overCapWeeks, [MON]);
  assert.equal(p.gates[0].due, "2026-10-14");
  assert.equal(p.gates[0].hours, 4);
});

test("gate hours can open a week no initiative reaches, and a Sunday due date belongs to the week it ends", () => {
  const p = plan(W([I("a", MON, "2026-10-14", 6)], [G("g", "open", { due: "2026-10-25", hours: 3 })]), "game");
  assert.deepEqual(p.load.weeks.map((x) => [x.start, x.hours]), [[MON, 6], [NEXT, 3]]);
});

test("gate hours alone make a plan", () => {
  const p = plan(W([], [G("g", "open", { due: "2026-10-14", hours: 2 })]), "game");
  assert.deepEqual(p.load.weeks.map((x) => [x.start, x.hours]), [[MON, 2]]);
  assert.equal(p.load.capacityHours, 10);
});

test("a gate without a due date or without hours changes nothing; hours without a date are named in a warning", () => {
  const base = plan(W([I("a", MON, "2026-10-18", 7)]), "game");
  const noHours = plan(W([I("a", MON, "2026-10-18", 7)], [G("g", "open", { due: "2026-10-14" })]), "game");
  const noDue = plan(W([I("a", MON, "2026-10-18", 7)], [G("g", "open", { hours: 4 })]), "game");
  assert.deepEqual(noHours.load, base.load);
  assert.deepEqual(noDue.load, base.load);
  assert.deepEqual(noHours.warnings, base.warnings);
  assert.ok(noDue.warnings.some((x) => /Gate "g" has hours but no due date/.test(x)));
});

test("passed gates still count in the plan, like completed work", () => {
  const p = plan(W([], [G("g", "passed", { due: "2026-10-14", hours: 2, evidenceIds: [] })]), "game");
  assert.equal(week(p, MON).hours, 2);
});

test("advise leaves settled gates out of its capacity action, as it does complete work", () => {
  const w = W([I("a", MON, "2026-10-18", 8, { status: "complete" })], [G("g", "passed", { due: "2026-10-14", hours: 4, notes: "n" })]);
  assert.equal(advise(w, "game").some((x) => x.kind === "capacity"), false);
  const open = W([I("a", MON, "2026-10-18", 8, { status: "complete" })], [G("g", "open", { due: "2026-10-14", hours: 12 })]);
  const capacity = advise(open, "game").find((x) => x.kind === "capacity");
  assert.ok(capacity);
  assert.match(capacity.reason, /12 h, 2 over/);
});

test("the load method says gates count and a parent does not", () => {
  const { method } = plan(W([]), "game").load;
  assert.match(method, /gate/);
  assert.match(method, /parent/i);
});

test("the load counts leaf initiatives only; a parent's own hours are ignored with a warning", () => {
  const w = W([
    I("launch", MON, "2026-10-25", 50),
    I("video", MON, "2026-10-18", 7, { parentId: "launch" }),
    I("page", MON, "2026-10-18", 3, { parentId: "launch" }),
  ]);
  const p = plan(w, "game");
  assert.equal(week(p, MON).hours, 10);
  assert.equal(p.load.totalHours, 10);
  assert.deepEqual(week(p, MON).initiatives.map((x) => x.id), ["video", "page"]);
  assert.ok(p.warnings.some((x) => /Initiative "launch" has children; its own 50 hours are ignored/.test(x)));
});

test("a parent without hours is not an initiative with unknown hours", () => {
  const p = plan(W([I("launch", MON, "2026-10-25"), I("video", MON, "2026-10-18", 7, { parentId: "launch" })]), "game");
  assert.deepEqual(p.load.unknownHours, []);
  assert.equal(p.summary.withoutHours, 0);
  assert.equal(p.warnings.some((x) => /no hours/.test(x)), false);
  assert.equal(p.warnings.some((x) => /children/.test(x)), false);
});

test("each initiative lists its parent and children; a parent has a rollup of its leaves", () => {
  const w = W([
    I("launch", "2026-12-01", "2026-12-02", undefined, { status: "paused" }),
    I("video", "2026-10-12", "2026-10-18", 7, { parentId: "launch", status: "running" }),
    I("page", "2026-10-15", "2026-11-01", 3, { parentId: "launch", status: "planned" }),
    I("solo", MON, MON, 1),
  ]);
  const p = plan(w, "game"),
    by = (id) => p.initiatives.find((i) => i.id === id);
  assert.deepEqual(by("launch").children, ["video", "page"]);
  assert.equal(by("launch").parentId, null);
  assert.equal(by("video").parentId, "launch");
  assert.deepEqual(by("video").children, []);
  assert.equal(by("video").rollup, null);
  assert.deepEqual(by("launch").rollup, {
    start: "2026-10-12",
    end: "2026-11-01",
    hours: 10,
    unknownHours: [],
    status: "running",
    progress: { gatesPassed: 0, gatesTotal: 0, actionsDone: 0, actionsTotal: 0 },
  });
  assert.equal(by("launch").hours, 10, "a parent shows the hours its leaves add up to");
  assert.equal(by("solo").rollup, null);
});

test("a parent's derived status follows its children", () => {
  const status = (...states) => {
    const rows = [I("p", MON, MON), ...states.map((s, n) => I(`c${n}`, MON, MON, 1, { parentId: "p", status: s }))];
    return plan(W(rows), "game").initiatives.find((i) => i.id === "p").rollup.status;
  };
  assert.equal(status("complete", "complete"), "complete");
  assert.equal(status("complete", "running"), "running");
  assert.equal(status("paused", "running", "planned"), "running");
  assert.equal(status("planned", "paused"), "planned");
  assert.equal(status("complete", "paused"), "paused");
  assert.equal(status("paused", "paused"), "paused");
  assert.equal(status("planned", "planned"), "planned");
});

test("unknown leaf hours are listed in the parent's rollup and sums skip them", () => {
  const p = plan(W([I("p", MON, MON), I("a", MON, MON, 2, { parentId: "p" }), I("b", MON, MON, undefined, { parentId: "p" })]), "game");
  const roll = p.initiatives.find((i) => i.id === "p").rollup;
  assert.equal(roll.hours, 2);
  assert.deepEqual(roll.unknownHours, ["b"]);
  const none = plan(W([I("p", MON, MON), I("b", MON, MON, undefined, { parentId: "p" })]), "game");
  assert.equal(none.initiatives.find((i) => i.id === "p").rollup.hours, null);
});

test("parents nest: a grandparent rolls up every leaf below it", () => {
  const w = W([
    I("root", MON, MON),
    I("mid", MON, MON, undefined, { parentId: "root" }),
    I("a", "2026-10-12", "2026-10-14", 3, { parentId: "mid", status: "complete" }),
    I("b", "2026-10-20", "2026-10-30", 4, { parentId: "root", status: "running" }),
  ]);
  const p = plan(w, "game"),
    by = (id) => p.initiatives.find((i) => i.id === id);
  assert.deepEqual(by("root").children, ["mid", "b"]);
  assert.equal(by("root").rollup.hours, 7);
  assert.equal(by("root").rollup.start, "2026-10-12");
  assert.equal(by("root").rollup.end, "2026-10-30");
  assert.equal(by("mid").rollup.status, "complete");
  assert.equal(by("root").rollup.status, "running");
  assert.equal(p.load.totalHours, 7);
});

test("a leaf's progress counts its gates and its actions; passed or waived gates count as passed", () => {
  const w = W(
    [I("video", MON, MON, 1, { dependsOn: ["g1", "g2", "g3"] }), I("other", MON, MON, 1)],
    [G("g1", "passed", { evidenceIds: [] }), G("g2", "waived", { notes: "n" }), G("g3", "failed"), G("g4", "open", { initiativeId: "video" }), G("g5", "passed", { initiativeId: "other" })],
    {
      actions: [
        A("a1", { initiativeId: "video", status: "done" }),
        A("a2", { initiativeId: "video", status: "doing" }),
        A("a3", { initiativeId: "video", status: "dropped" }),
        A("a4", { initiativeId: "other", status: "done" }),
        A("a5", { status: "done" }),
      ],
    },
  );
  const p = plan(w, "game"),
    by = (id) => p.initiatives.find((i) => i.id === id);
  assert.deepEqual(by("video").progress, { gatesPassed: 2, gatesTotal: 4, actionsDone: 1, actionsTotal: 2 });
  assert.deepEqual(by("other").progress, { gatesPassed: 1, gatesTotal: 1, actionsDone: 1, actionsTotal: 1 });
});

test("a parent's progress adds its own and its descendants' gates and actions once each", () => {
  const w = W(
    [I("p", MON, MON, undefined, { dependsOn: ["g1"] }), I("a", MON, MON, 1, { parentId: "p", dependsOn: ["g1", "g2"] }), I("b", MON, MON, 1, { parentId: "p" })],
    [G("g1", "passed", { evidenceIds: [] }), G("g2", "open")],
    { actions: [A("x", { initiativeId: "p", status: "done" }), A("y", { initiativeId: "a" }), A("z", { initiativeId: "b", status: "done" })] },
  );
  const p = plan(w, "game"),
    by = (id) => p.initiatives.find((i) => i.id === id);
  assert.deepEqual(by("p").rollup.progress, { gatesPassed: 1, gatesTotal: 2, actionsDone: 2, actionsTotal: 3 });
  assert.deepEqual(by("p").progress, by("p").rollup.progress);
});

test("a parent lists the over-cap weeks of its leaves", () => {
  const w = W([I("p", MON, MON), I("a", MON, "2026-10-18", 14, { parentId: "p" })]);
  const p = plan(w, "game");
  assert.deepEqual(p.initiatives.find((i) => i.id === "p").overCapWeeks, [MON]);
});

test("plan output for a ledger with none of the new records keeps its old values", () => {
  const p = plan(W([I("a", MON, "2026-10-18", 7)], [G("g")]), "game");
  assert.deepEqual(p.initiatives[0].children, []);
  assert.equal(p.initiatives[0].parentId, null);
  assert.equal(p.initiatives[0].note, null);
  assert.equal(p.load.gateHours, 0);
  assert.equal(p.load.totalHours, 7);
  assert.deepEqual(p.initiatives[0].progress, { gatesPassed: 0, gatesTotal: 0, actionsDone: 0, actionsTotal: 0 });
});
