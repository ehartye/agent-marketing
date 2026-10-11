import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { attention, advise, plan, localDate } from "../src/analysis.mjs";
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
const G = (id, over = {}) => ({ id, projectId: "game", name: `Gate ${id}`, criteria: `pass ${id}`, status: "open", ...over });
const A = (id, over = {}) => ({ id, projectId: "game", title: `Do ${id}`, owner: "owner", status: "todo", ...over });
const I = (id, over = {}) => ({ ...baseInitiative, id, name: `Init ${id}`, budget: 0, status: "planned", start: "2026-12-01", end: "2026-12-10", ...over });
const W = (extra = {}, over = {}) => validateWorkspace({ ...ledger(), projects: [{ ...baseProject, weeklyHours: 40, ...over }], initiatives: [], ...extra });
const day = (offset) => new Date(Date.UTC(2026, 9, 11 + offset)).toISOString().slice(0, 10);

// ---- Budget counts leaves only, like hours ----------------------------------------------------

test("a parent's own budget is ignored with a warning, and only leaves are summed against the cap", () => {
  const w = W({ initiatives: [I("p", { budget: 500 }), I("c", { parentId: "p", budget: 500 })] }, { budget: 500 });
  const p = plan(w, "game");
  assert.equal(p.budget.planned, 500);
  assert.equal(p.budget.overBudget, false);
  assert.equal(p.budget.overBy, 0);
  assert.equal(p.budget.remaining, 0);
  assert.ok(
    p.warnings.some((x) => /Initiative "p" has children; its own budget of 500 is ignored and its leaf initiatives' budgets are counted instead/.test(x)),
    p.warnings.join("\n"),
  );
  const real = plan(W({ initiatives: [I("p", { budget: 0 }), I("c", { parentId: "p", budget: 400 }), I("d", { parentId: "p", budget: 300 })] }, { budget: 500 }), "game");
  assert.equal(real.budget.planned, 700);
  assert.equal(real.budget.overBy, 200);
  assert.equal(real.warnings.some((x) => /budget/.test(x)), false, "a parent with no budget needs no warning");
});

// ---- A deferred decision with no date is still the owner's ------------------------------------

test("a deferred decision with no needBy stays in attention, marked deferred; a dated one waits for its date", () => {
  const w = W({
    decisions: [
      D("undated", { status: "deferred" }),
      D("later", { status: "deferred", needBy: day(5) }),
      D("due", { status: "deferred", needBy: day(0) }),
      D("past", { status: "deferred", needBy: day(-3) }),
    ],
  });
  const a = attention(w, "game", TODAY);
  assert.deepEqual(a.decisions.map((d) => d.id), ["past", "due", "undated"], "dated first, undated last");
  const undated = a.decisions.find((d) => d.id === "undated");
  assert.equal(undated.status, "deferred");
  assert.equal(undated.daysLeft, null);
  assert.equal(undated.overdue, false);
  assert.equal(a.summary.decisions, 3);
  assert.equal(a.stale.length, 0, "only an open decision goes stale");
});

// ---- recent sorts by instant ------------------------------------------------------------------

test("recent updates are ordered by the instant they name, offsets included", () => {
  const U = (id, at) => ({ id, projectId: "game", at, kind: "note", text: id });
  // 23:00 at UTC-5 on the 10th is 04:00 UTC on the 11th: after 01:00 UTC on the 11th, though it sorts before it as text.
  const w = W({
    updates: [U("u-utc", "2026-10-11T01:00:00.000Z"), U("u-west", "2026-10-10T23:00:00-05:00"), U("u-east", "2026-10-11T09:00:00+10:00")],
  });
  assert.deepEqual(attention(w, "game", TODAY).recent.map((u) => u.id), ["u-west", "u-utc", "u-east"]);
});

// ---- Boundaries of "due soon" -----------------------------------------------------------------

test("a gate is shown from 14 days before its date, not before; an action likewise", () => {
  const w = W({
    gates: [G("g13", { due: day(13) }), G("g14", { due: day(14) }), G("g15", { due: day(15) }), G("g0", { due: day(0) }), G("gm1", { due: day(-1) })],
    actions: [A("a13", { due: day(13) }), A("a14", { due: day(14) }), A("a15", { due: day(15) })],
  });
  const a = attention(w, "game", TODAY);
  assert.deepEqual(a.gates.map((g) => g.id), ["gm1", "g0", "g13", "g14"]);
  assert.deepEqual(a.gates.map((g) => g.overdue), [true, false, false, false]);
  assert.deepEqual(a.actions.map((x) => x.id), ["a13", "a14"]);
});

test("advise does not count a settled gate's hours against the weekly cap, and does count an open one", () => {
  const gate = (status) => G("g1", { status, due: "2026-12-02", hours: 30, ...(status === "waived" ? { notes: "owner accepts the risk" } : {}) });
  const kinds = (status) =>
    advise(W({ gates: [gate(status)], initiatives: [I("x", { start: "2026-12-01", end: "2026-12-02", hours: 1 })] }, { weeklyHours: 10 }), "game", {}, TODAY).map((a) => a.kind);
  assert.equal(kinds("open").includes("capacity"), true);
  assert.equal(kinds("waived").includes("capacity"), false);
});

// ---- localDate is the local day, not the UTC day ---------------------------------------------

function localIn(zone, iso) {
  const code = `import { localDate } from ${JSON.stringify(new URL("../src/analysis.mjs", import.meta.url).href)};console.log(localDate(new Date(${JSON.stringify(iso)})))`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TZ: zone }, encoding: "utf8" }).trim();
}
test("localDate follows the time zone of the process", () => {
  // Fourteen hours ahead of UTC: the day has already turned.
  assert.equal(localIn("Pacific/Kiritimati", "2026-10-11T23:30:00Z"), "2026-10-12");
  // Seven hours behind (daylight time): the day has not turned yet.
  assert.equal(localIn("America/Los_Angeles", "2026-10-12T03:00:00Z"), "2026-10-11");
  assert.equal(localIn("UTC", "2026-10-12T03:00:00Z"), "2026-10-12");
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});

// ---- Long chains of parents -------------------------------------------------------------------

test("a chain of 3000 parent initiatives validates and plans quickly", () => {
  const rows = Array.from({ length: 3000 }, (_, n) => I(`i${n}`, { ...(n ? { parentId: `i${n - 1}` } : {}), status: n % 3 ? "running" : "planned" }));
  let started = performance.now();
  const w = W({ initiatives: rows });
  const validated = performance.now() - started;
  started = performance.now();
  const p = plan(w, "game");
  const planned = performance.now() - started;
  assert.ok(validated < 1000, `validating took ${Math.round(validated)} ms`);
  assert.ok(planned < 3000, `planning took ${Math.round(planned)} ms`);
  assert.equal(p.initiatives[0].rollup.status, "running");
  assert.equal(p.initiatives[0].children.length, 1);
  assert.equal(p.initiatives.at(-1).rollup, null);
});

test("a parent's derived status follows its children, however deep", () => {
  const status = (rows) => plan(W({ initiatives: rows }), "game").initiatives.find((i) => i.id === "p").rollup.status;
  assert.equal(status([I("p"), I("c", { parentId: "p", status: "complete" }), I("d", { parentId: "c", status: "complete" })]), "complete");
  assert.equal(status([I("p"), I("c", { parentId: "p", status: "planned" }), I("g", { parentId: "c", status: "running" }), I("h", { parentId: "p", status: "complete" })]), "running");
  assert.equal(status([I("p"), I("c", { parentId: "p", status: "paused" }), I("g", { parentId: "c", status: "planned" })]), "planned");
  assert.equal(status([I("p"), I("c", { parentId: "p", status: "paused" }), I("h", { parentId: "p", status: "complete" })]), "paused");
});

// ---- Recommended option ----------------------------------------------------------------------

test("attention names the recommended option of a decision, or null", () => {
  const w = W({ decisions: [D("with", { recommendedOptionId: "b", recommendation: "B is cheaper" }), D("without")] });
  const a = attention(w, "game", TODAY);
  assert.equal(a.decisions.find((d) => d.id === "with").recommendedOptionId, "b");
  assert.equal(a.decisions.find((d) => d.id === "with").recommendation, "B is cheaper");
  assert.equal(a.decisions.find((d) => d.id === "without").recommendedOptionId, null);
});

// ---- Slots that wait on something -------------------------------------------------------------

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

test("a slot that is waiting on something is listed as waiting, not as a pick", () => {
  const w = W({
    initiatives: [I("launch")],
    assetSlots: [
      SL("capsule", { name: "Steam main capsule", waitingOn: "five-second tests, Nov 23-25", initiativeId: "launch" }),
      SL("banner", { name: "Banner" }),
      SL("poster", { name: "Poster", waitingOn: "the artist" }),
      SL("done", { name: "Done", status: "picked", selectedAssetId: "d1", waitingOn: "left over" }),
    ],
    assets: [AS("c1", "capsule"), AS("c2", "capsule"), AS("c3", "capsule", { status: "rejected", rationale: "no" }), AS("b1", "banner"), AS("b2", "banner"), AS("d1", "done", { status: "selected" })],
  });
  const a = attention(w, "game", TODAY);
  assert.deepEqual(a.picks.map((p) => p.slotId), ["banner"]);
  assert.equal(a.summary.picks, 1);
  assert.equal(a.summary.total, 1);
  assert.deepEqual(a.waiting, [
    { slotId: "poster", name: "Poster", waitingOn: "the artist", candidates: 0, initiativeId: null },
    { slotId: "capsule", name: "Steam main capsule", waitingOn: "five-second tests, Nov 23-25", candidates: 2, initiativeId: "launch" },
  ].toSorted((x, y) => x.name.localeCompare(y.name) || x.slotId.localeCompare(y.slotId)));
});

test("attention always has a waiting list", () => {
  assert.deepEqual(attention(W(), "game", TODAY).waiting, []);
});
