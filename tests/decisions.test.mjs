import { test } from "node:test";
import assert from "node:assert/strict";
import { collections, emptyWorkspace, validateWorkspace, recordFields, workspaceWarnings, patchWarnings } from "../src/schema.mjs";
import { parseImport } from "../src/import.mjs";
import { ledger as fixture, initiative as baseInitiative } from "./fixtures.mjs";

const ledger = () => structuredClone(fixture());
const option = (id, over = {}) => ({ id, label: `Option ${id}`, ...over });
const decision = (over = {}) => ({
  id: "banner",
  projectId: "game",
  title: "Pick the store banner",
  question: "Which banner goes on the store page?",
  status: "open",
  options: [option("a"), option("b")],
  ...over,
});
const action = (over = {}) => ({
  id: "ship-it",
  projectId: "game",
  title: "Record the trailer",
  owner: "owner",
  status: "todo",
  ...over,
});
const update = (over = {}) => ({
  id: "u-1-1",
  projectId: "game",
  at: "2026-10-11T09:00:00.000Z",
  kind: "note",
  text: "Started the trailer",
  ...over,
});
const gate = (over = {}) => ({ id: "playtest", projectId: "game", name: "Playtest", criteria: "5 of 8 finish", status: "open", ...over });
const report = (over = {}) => ({ id: "memo", projectId: "game", title: "Memo", markdown: "# Memo", updatedAt: "2026-10-11T09:00:00.000Z", ...over });
const initiative = (id, over = {}) => ({ ...baseInitiative, id, name: id, ...over });
const bad = (w, pattern) => assert.throws(() => validateWorkspace(w), pattern);
const withRecords = (extra) => Object.assign(ledger(), extra);

test("decisions, actions and updates are collections that older workspaces gain empty", () => {
  for (const k of ["decisions", "actions", "updates"]) {
    assert.ok(collections.includes(k), k);
    assert.deepEqual(emptyWorkspace()[k], []);
    assert.ok(recordFields[k].includes("projectId"), k);
  }
  const old = ledger();
  for (const k of ["reports", "gates", "decisions", "actions", "updates"]) delete old[k];
  const w = validateWorkspace(old);
  for (const k of ["decisions", "actions", "updates"]) assert.deepEqual(w[k], []);
  assert.deepEqual(workspaceWarnings(w), []);
});

test("a full-ledger backup without the new collections imports with them empty", () => {
  const patch = parseImport(JSON.stringify(ledger()));
  for (const k of ["decisions", "actions", "updates"]) assert.deepEqual(patch[k], []);
});

test("an open decision with options and every optional field validates", () => {
  const w = withRecords({
    reports: [report()],
    gates: [gate()],
    initiatives: [initiative("video")],
    decisions: [
      decision({
        initiativeId: "video",
        needBy: "2026-10-20",
        defaultIfSilent: "Use option a",
        recommendation: "Option a",
        reportId: "memo",
        gateIds: ["playtest"],
        options: [option("a", { summary: "s", time: "1h", risk: "low", complexity: "low", bestPractice: "ok", maintainability: "easy" }), option("b")],
      }),
    ],
  });
  assert.equal(validateWorkspace(w).decisions.length, 1);
  assert.deepEqual(workspaceWarnings(w), []);
});

test("a decision needs a question, a status and well-formed options", () => {
  for (const key of ["title", "question"]) bad(withRecords({ decisions: [decision({ [key]: "" })] }), new RegExp(key));
  bad(withRecords({ decisions: [decision({ status: "maybe" })] }), /status/);
  bad(withRecords({ decisions: [decision({ options: undefined })] }), /options/);
  bad(withRecords({ decisions: [decision({ options: "a" })] }), /options/);
  bad(withRecords({ decisions: [decision({ options: [option("a"), option("a")] })] }), /duplicate option/);
  bad(withRecords({ decisions: [decision({ options: [option("a", { label: " " })] })] }), /label/);
  bad(withRecords({ decisions: [decision({ options: [{ label: "x" }] })] }), /option/);
  bad(withRecords({ decisions: [decision({ options: [option("a", { time: "" })] })] }), /time/);
  bad(withRecords({ decisions: [decision({ options: [option("a", { risk: 3 })] })] }), /risk/);
  bad(withRecords({ decisions: [decision({ options: [option("bad id")] })] }), /option/);
  bad(withRecords({ decisions: [decision({ needBy: "2026-02-30" })] }), /needBy/);
  bad(withRecords({ decisions: [decision({ recommendation: "" })] }), /recommendation/);
  bad(withRecords({ decisions: [decision({ defaultIfSilent: 5 })] }), /defaultIfSilent/);
  bad(withRecords({ decisions: [decision({ projectId: "nope" })] }), /projectId/);
  bad(withRecords({ decisions: [decision({ initiativeId: "ghost" })] }), /initiativeId/);
});

test("an open decision may have no options yet; a decided one needs a real choice and its date", () => {
  assert.ok(validateWorkspace(withRecords({ decisions: [decision({ options: [] })] })));
  const decided = { status: "decided", chosen: "a", decidedAt: "2026-10-11T10:00:00.000Z", rationale: "Reads best small" };
  assert.ok(validateWorkspace(withRecords({ decisions: [decision(decided)] })));
  bad(withRecords({ decisions: [decision({ ...decided, chosen: undefined })] }), /chosen/);
  bad(withRecords({ decisions: [decision({ ...decided, chosen: "zzz" })] }), /chosen/);
  bad(withRecords({ decisions: [decision({ ...decided, decidedAt: undefined })] }), /decidedAt/);
  bad(withRecords({ decisions: [decision({ ...decided, decidedAt: "yesterday" })] }), /decidedAt/);
  bad(withRecords({ decisions: [decision({ chosen: "zzz" })] }), /chosen/);
  bad(withRecords({ decisions: [decision({ ...decided, rationale: "" })] }), /rationale/);
});

test("a decision keeps its earlier choices in history", () => {
  const decided = { status: "decided", chosen: "b", decidedAt: "2026-10-12T10:00:00.000Z" };
  const history = [{ chosen: "a", rationale: "first thought", decidedAt: "2026-10-11T10:00:00.000Z" }];
  assert.ok(validateWorkspace(withRecords({ decisions: [decision({ ...decided, history })] })));
  bad(withRecords({ decisions: [decision({ ...decided, history: "a" })] }), /history/);
  bad(withRecords({ decisions: [decision({ ...decided, history: [{ chosen: "a" }] })] }), /history/);
  bad(withRecords({ decisions: [decision({ ...decided, history: [{ chosen: "a", decidedAt: "soon" }] })] }), /history/);
  assert.deepEqual(patchWarnings({ decisions: [decision({ ...decided, history })] }), []);
});

test("a decision's report, gates and replacement must exist in the project", () => {
  const other = { ...fixture().projects[0], id: "other" };
  bad(withRecords({ decisions: [decision({ reportId: "ghost" })] }), /reportId/);
  bad(withRecords({ reports: [report({ projectId: "other" })], projects: [fixture().projects[0], other], decisions: [decision({ reportId: "memo" })] }), /reportId/);
  assert.ok(validateWorkspace(withRecords({ reports: [report({ projectId: undefined })], decisions: [decision({ reportId: "memo" })] })), "a workspace-level report may hold the memo");
  bad(withRecords({ decisions: [decision({ gateIds: ["ghost"] })] }), /gateIds/);
  bad(withRecords({ gates: [gate()], decisions: [decision({ gateIds: ["playtest", "playtest"] })] }), /duplicate/);
  bad(withRecords({ gates: [gate()], decisions: [decision({ gateIds: "playtest" })] }), /gateIds/);
  bad(withRecords({ gates: [gate({ projectId: "other" })], projects: [fixture().projects[0], other], decisions: [decision({ gateIds: ["playtest"] })] }), /gateIds/);
});

test("a superseded decision names the decision that replaced it", () => {
  const replacement = decision({ id: "banner-2" });
  const old = decision({ status: "superseded", supersededBy: "banner-2" });
  assert.ok(validateWorkspace(withRecords({ decisions: [old, replacement] })));
  bad(withRecords({ decisions: [decision({ status: "superseded" })] }), /supersededBy/);
  bad(withRecords({ decisions: [decision({ status: "superseded", supersededBy: "ghost" })] }), /supersededBy/);
  bad(withRecords({ decisions: [decision({ status: "superseded", supersededBy: "banner" })] }), /supersededBy/);
});

test("an action has an owner, a status and checked references", () => {
  const w = withRecords({
    initiatives: [initiative("video")],
    gates: [gate()],
    decisions: [decision()],
    actions: [action({ initiativeId: "video", gateId: "playtest", decisionId: "banner", due: "2026-10-15", hours: 1.5, notes: "n", doneAt: "2026-10-11T10:00:00.000Z", blockedBy: "waiting" })],
  });
  assert.ok(validateWorkspace(w));
  assert.deepEqual(workspaceWarnings(w), []);
  bad(withRecords({ actions: [action({ title: "" })] }), /title/);
  bad(withRecords({ actions: [action({ owner: "intern" })] }), /owner/);
  bad(withRecords({ actions: [action({ status: "later" })] }), /status/);
  bad(withRecords({ actions: [action({ due: "next week" })] }), /due/);
  bad(withRecords({ actions: [action({ hours: -1 })] }), /hours/);
  bad(withRecords({ actions: [action({ hours: "2" })] }), /hours/);
  bad(withRecords({ actions: [action({ notes: "" })] }), /notes/);
  bad(withRecords({ actions: [action({ doneAt: "2026-10-11" })] }), /doneAt/);
  bad(withRecords({ actions: [action({ blockedBy: "" })] }), /blockedBy/);
  bad(withRecords({ actions: [action({ gateId: "ghost" })] }), /gateId/);
  bad(withRecords({ actions: [action({ decisionId: "ghost" })] }), /decisionId/);
  bad(withRecords({ actions: [action({ initiativeId: "ghost" })] }), /initiativeId/);
  bad(withRecords({ actions: [action({ projectId: "nope" })] }), /projectId/);
});

test("an action cannot name a gate or decision of another project", () => {
  const other = { ...fixture().projects[0], id: "other" };
  const two = { projects: [fixture().projects[0], other] };
  bad(withRecords({ ...two, gates: [gate({ projectId: "other" })], actions: [action({ gateId: "playtest" })] }), /gateId/);
  bad(withRecords({ ...two, decisions: [decision({ projectId: "other" })], actions: [action({ decisionId: "banner" })] }), /decisionId/);
});

test("an update is a timestamped note of a known kind", () => {
  assert.ok(validateWorkspace(withRecords({ initiatives: [initiative("video")], updates: [update({ initiativeId: "video", refId: "anything", kind: "decision" })] })));
  for (const kind of ["decision", "gate", "initiative", "action", "asset", "document", "note"])
    assert.ok(validateWorkspace(withRecords({ updates: [update({ kind })] })), kind);
  bad(withRecords({ updates: [update({ kind: "rumor" })] }), /kind/);
  bad(withRecords({ updates: [update({ text: "" })] }), /text/);
  bad(withRecords({ updates: [update({ at: "2026-10-11" })] }), /at/);
  bad(withRecords({ updates: [update({ at: undefined })] }), /at/);
  bad(withRecords({ updates: [update({ refId: "" })] }), /refId/);
  bad(withRecords({ updates: [update({ initiativeId: "ghost" })] }), /initiativeId/);
  bad(withRecords({ updates: [update({ projectId: "nope" })] }), /projectId/);
});

test("an update outlives the record it names, so the log never blocks a write", () => {
  assert.ok(validateWorkspace(withRecords({ updates: [update({ refId: "removed-by-hand" })] })));
});

test("an initiative may have a parent in its project, never itself and never a cycle", () => {
  const w = withRecords({ initiatives: [initiative("launch"), initiative("video", { parentId: "launch", note: "Editing the cut" })] });
  assert.ok(validateWorkspace(w));
  assert.deepEqual(workspaceWarnings(w), []);
  bad(withRecords({ initiatives: [initiative("video", { parentId: "video" })] }), /own parent/);
  bad(withRecords({ initiatives: [initiative("video", { parentId: "ghost" })] }), /parentId/);
  bad(withRecords({ initiatives: [initiative("a", { parentId: "b" }), initiative("b", { parentId: "a" })] }), /cycle/);
  bad(withRecords({ initiatives: [initiative("a", { parentId: "b" }), initiative("b", { parentId: "c" }), initiative("c", { parentId: "a" })] }), /cycle/);
  bad(withRecords({ initiatives: [initiative("launch"), initiative("video", { parentId: "" })] }), /parentId/);
  bad(withRecords({ initiatives: [initiative("video", { note: "" })] }), /note/);
  bad(withRecords({ initiatives: [initiative("video", { note: 4 })] }), /note/);
  const other = { ...fixture().projects[0], id: "other" };
  bad(withRecords({ projects: [fixture().projects[0], other], initiatives: [initiative("launch", { projectId: "other" }), initiative("video", { parentId: "launch" })] }), /parentId/);
});

test("a parent may be several levels up; each initiative has one parent", () => {
  const w = withRecords({ initiatives: [initiative("root"), initiative("mid", { parentId: "root" }), initiative("leaf", { parentId: "mid" })] });
  assert.ok(validateWorkspace(w));
});

test("a report names the initiative, gate or decision it belongs to", () => {
  const w = withRecords({
    initiatives: [initiative("video")],
    gates: [gate()],
    decisions: [decision()],
    reports: [report({ initiativeId: "video", gateId: "playtest", decisionId: "banner" })],
  });
  assert.ok(validateWorkspace(w));
  assert.deepEqual(workspaceWarnings(w), []);
  bad(withRecords({ reports: [report({ initiativeId: "ghost" })] }), /initiativeId/);
  bad(withRecords({ reports: [report({ gateId: "ghost" })] }), /gateId/);
  bad(withRecords({ reports: [report({ decisionId: "ghost" })] }), /decisionId/);
  bad(withRecords({ initiatives: [initiative("video")], reports: [report({ projectId: undefined, initiativeId: "video" })] }), /initiativeId/);
  bad(withRecords({ gates: [gate()], reports: [report({ projectId: undefined, gateId: "playtest" })] }), /gateId/);
});

test("a gate may have a due date, owner hours and an initiative it belongs to", () => {
  const w = withRecords({ initiatives: [initiative("video")], gates: [gate({ due: "2026-10-20", hours: 2.5, initiativeId: "video" })] });
  assert.ok(validateWorkspace(w));
  assert.deepEqual(workspaceWarnings(w), []);
  bad(withRecords({ gates: [gate({ due: "soon" })] }), /due/);
  bad(withRecords({ gates: [gate({ hours: -1 })] }), /hours/);
  bad(withRecords({ gates: [gate({ hours: "3" })] }), /hours/);
  bad(withRecords({ gates: [gate({ initiativeId: "ghost" })] }), /initiativeId/);
});

test("unknown fields on the new records are still warned about", () => {
  const warnings = patchWarnings({ decisions: [decision({ recomendation: "x" })], actions: [action({ duee: "2026-10-12" })], updates: [update({ kinds: "note" })] });
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /did you mean "recommendation"/);
  assert.match(warnings[1], /did you mean "due"/);
  assert.match(patchWarnings({ decisions: [decision({ options: [option("a", { risks: "x" })] })] })[0], /options.*did you mean "risk"/);
});
