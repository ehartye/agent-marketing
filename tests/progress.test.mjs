import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, readWorkspace, mutateWorkspace, unchanged } from "../src/store.mjs";
import { decide, defer, setActionStatus, setGate, addUpdate, setInitiativeNote } from "../src/progress.mjs";
import { ledger, project, initiative } from "./fixtures.mjs";

const NOW = "2026-10-11T10:00:00.000Z";
const LATER = "2026-10-12T08:30:00.000Z";
const option = (id, over = {}) => ({ id, label: `Option ${id}`, ...over });
const decision = (over = {}) => ({
  id: "banner",
  projectId: "game",
  initiativeId: "video",
  title: "Pick the store banner",
  question: "Which banner goes on the store page?",
  status: "open",
  needBy: "2026-10-15",
  options: [option("a"), option("b")],
  ...over,
});
const action = (over = {}) => ({ id: "trailer", projectId: "game", title: "Record the trailer", owner: "owner", status: "todo", ...over });
const gate = (over = {}) => ({ id: "playtest", projectId: "game", name: "Playtest", criteria: "5 of 8 finish", status: "open", ...over });
const evidence = { id: "e1", projectId: "game", claim: "Five finished", dimension: "activation", result: "supports", strength: "primary", url: "https://example.com/x", checkedAt: "2026-10-11" };

// Runs a test body against a fresh workspace file seeded with one of each record.
function withFile(body, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-progress-")),
    file = join(dir, "w.json");
  try {
    createWorkspace(file, {
      ...structuredClone(ledger()),
      decisions: [decision()],
      actions: [action()],
      gates: [gate()],
      evidence: [evidence],
      ...extra,
    });
    return body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const bytes = (file) => readFileSync(file, "utf8");

test("decide marks the decision decided, stamps it and logs one update in the same write", () =>
  withFile((file) => {
    const out = decide(file, "banner", { optionId: "b", rationale: "Reads best at thumbnail size", now: NOW });
    assert.equal(out.changed, true);
    assert.equal(out.record.status, "decided");
    assert.equal(out.record.chosen, "b");
    assert.equal(out.record.rationale, "Reads best at thumbnail size");
    assert.equal(out.record.decidedAt, NOW);
    assert.equal(out.revision, 1);
    assert.deepEqual(out.warnings, []);
    const w = readWorkspace(file);
    assert.equal(w.revision, 1);
    assert.deepEqual(w.decisions[0], out.record);
    assert.equal(w.updates.length, 1);
    assert.deepEqual(w.updates[0], out.update);
    assert.equal(out.update.id, `u-${Date.parse(NOW).toString(36)}-1`);
    assert.equal(out.update.kind, "decision");
    assert.equal(out.update.refId, "banner");
    assert.equal(out.update.initiativeId, "video");
    assert.equal(out.update.projectId, "game");
    assert.equal(out.update.at, NOW);
    assert.match(out.update.text, /Pick the store banner/);
    assert.match(out.update.text, /Option b/);
    assert.match(out.update.text, /Reads best/);
  }));

test("decide works without a rationale and from a deferred decision", () =>
  withFile(
    (file) => {
      const out = decide(file, "banner", { optionId: "a", now: NOW });
      assert.equal(out.record.rationale, undefined);
      assert.equal(out.record.status, "decided");
    },
    { decisions: [decision({ status: "deferred" })] },
  ));

test("decide refuses a second decision unless told to change it, and leaves the file untouched", () =>
  withFile((file) => {
    decide(file, "banner", { optionId: "a", now: NOW });
    const before = bytes(file);
    assert.throws(() => decide(file, "banner", { optionId: "b", now: LATER }), /already decided.*change/i);
    assert.equal(bytes(file), before);
  }));

test("changing a decision keeps the old choice in history and says changed in the log", () =>
  withFile((file) => {
    decide(file, "banner", { optionId: "a", rationale: "first thought", now: NOW });
    const out = decide(file, "banner", { optionId: "b", rationale: "the playtest disagreed", change: true, now: LATER });
    assert.equal(out.record.chosen, "b");
    assert.equal(out.record.decidedAt, LATER);
    assert.equal(out.record.rationale, "the playtest disagreed");
    assert.deepEqual(out.record.history, [{ chosen: "a", rationale: "first thought", decidedAt: NOW }]);
    assert.match(out.update.text, /^Changed/);
    assert.match(out.update.text, /Option a/);
    assert.match(out.update.text, /Option b/);
    const again = decide(file, "banner", { optionId: "a", change: true, now: "2026-10-13T00:00:00.000Z" });
    assert.equal(again.record.history.length, 2);
    assert.deepEqual(again.record.history[1], { chosen: "b", rationale: "the playtest disagreed", decidedAt: LATER });
    assert.equal(again.record.rationale, undefined, "a new choice does not inherit the old reasons");
    assert.equal(readWorkspace(file).updates.length, 3);
  }));

test("a first decision with the change flag is just a decision", () =>
  withFile((file) => {
    const out = decide(file, "banner", { optionId: "a", change: true, now: NOW });
    assert.equal(out.record.history, undefined);
    assert.match(out.update.text, /^Decided/);
  }));

test("decide needs a known decision and one of its options", () =>
  withFile((file) => {
    const before = bytes(file);
    assert.throws(() => decide(file, "ghost", { optionId: "a" }), /Decision "ghost" does not exist/);
    assert.throws(() => decide(file, "banner", {}), /option/i);
    assert.throws(() => decide(file, "banner", { optionId: "zzz" }), /not an option.*a, b/i);
    assert.equal(bytes(file), before);
  }));

test("decide refuses a superseded decision and points at its replacement", () =>
  withFile(
    (file) => {
      assert.throws(() => decide(file, "banner", { optionId: "a" }), /superseded by banner-2/);
    },
    { decisions: [decision({ status: "superseded", supersededBy: "banner-2" }), decision({ id: "banner-2" })] },
  ));

test("decide honours the expected revision: a stale writer fails and changes nothing", () =>
  withFile((file) => {
    const stale = readWorkspace(file).revision;
    addUpdate(file, { text: "someone else wrote", now: NOW });
    const before = bytes(file);
    assert.throws(() => decide(file, "banner", { optionId: "a", revision: stale, now: NOW }), /Revision conflict/);
    assert.equal(bytes(file), before);
    const out = decide(file, "banner", { optionId: "a", revision: stale + 1, now: NOW });
    assert.equal(out.revision, stale + 2);
  }));

test("the default time is the real clock", () =>
  withFile((file) => {
    const t0 = Date.now();
    const out = decide(file, "banner", { optionId: "a" });
    const stamped = Date.parse(out.record.decidedAt);
    assert.ok(stamped >= t0 - 1000 && stamped <= Date.now() + 1000);
  }));

test("defer parks a decision, optionally moves its date, and logs the note", () =>
  withFile((file) => {
    const out = defer(file, "banner", { until: "2026-11-01", note: "waiting on the playtest", now: NOW });
    assert.equal(out.record.status, "deferred");
    assert.equal(out.record.needBy, "2026-11-01");
    assert.equal(out.update.kind, "decision");
    assert.equal(out.update.refId, "banner");
    assert.match(out.update.text, /Deferred.*until 2026-11-01.*waiting on the playtest/);
    const keep = defer(file, "banner", { note: "still waiting", now: LATER });
    assert.equal(keep.record.needBy, "2026-11-01", "no until keeps the date");
    assert.equal(keep.changed, true);
  }));

test("defer without a date keeps the old need-by date", () =>
  withFile((file) => {
    const out = defer(file, "banner", { now: NOW });
    assert.equal(out.record.status, "deferred");
    assert.equal(out.record.needBy, "2026-10-15");
  }));

test("deferring a deferred decision to the same date again is a no-op", () =>
  withFile((file) => {
    defer(file, "banner", { until: "2026-11-01", now: NOW });
    const before = bytes(file);
    const again = defer(file, "banner", { until: "2026-11-01", now: LATER });
    assert.equal(again.changed, false);
    assert.equal(again.update, null);
    assert.equal(bytes(file), before);
  }));

test("defer refuses a decided or superseded decision, a bad date and a missing decision", () =>
  withFile((file) => {
    assert.throws(() => defer(file, "ghost", {}), /does not exist/);
    assert.throws(() => defer(file, "banner", { until: "2026-02-30" }), /needBy/);
    decide(file, "banner", { optionId: "a", now: NOW });
    const before = bytes(file);
    assert.throws(() => defer(file, "banner", { until: "2026-11-01" }), /already decided/);
    assert.equal(bytes(file), before);
  }));

test("an action moves through its statuses; done stamps doneAt and reopening clears it", () =>
  withFile((file) => {
    const doing = setActionStatus(file, "trailer", "doing", { now: NOW });
    assert.equal(doing.record.status, "doing");
    assert.equal(doing.record.doneAt, undefined);
    const done = setActionStatus(file, "trailer", "done", { now: LATER });
    assert.equal(done.record.doneAt, LATER);
    assert.equal(done.update.kind, "action");
    assert.equal(done.update.refId, "trailer");
    assert.match(done.update.text, /Record the trailer.*done/);
    const reopened = setActionStatus(file, "trailer", "todo", { now: LATER });
    assert.equal(reopened.record.doneAt, undefined);
    assert.equal(readWorkspace(file).updates.length, 3);
  }));

test("marking an action done twice does not move doneAt, bump the revision or repeat the log", () =>
  withFile((file) => {
    setActionStatus(file, "trailer", "done", { now: NOW });
    const before = bytes(file);
    const again = setActionStatus(file, "trailer", "done", { now: LATER });
    assert.equal(again.changed, false);
    assert.equal(again.record.doneAt, NOW);
    assert.equal(again.update, null);
    assert.equal(again.revision, 1);
    assert.equal(bytes(file), before);
  }));

test("a note on a blocked action says what it waits on; any other status keeps it as notes", () =>
  withFile((file) => {
    const blocked = setActionStatus(file, "trailer", "blocked", { notes: "needs the final build", now: NOW });
    assert.equal(blocked.record.blockedBy, "needs the final build");
    assert.equal(blocked.record.notes, undefined);
    assert.match(blocked.update.text, /needs the final build/);
    const doing = setActionStatus(file, "trailer", "doing", { notes: "build arrived", now: LATER });
    assert.equal(doing.record.blockedBy, undefined, "leaving blocked clears what it waited on");
    assert.equal(doing.record.notes, "build arrived");
  }));

test("an action status must be a known one on a known action", () =>
  withFile((file) => {
    assert.throws(() => setActionStatus(file, "trailer", "finished"), /status.*todo, doing, done, blocked, dropped/);
    assert.throws(() => setActionStatus(file, "ghost", "done"), /Action "ghost" does not exist/);
  }));

test("an action's log entry carries its initiative", () =>
  withFile(
    (file) => {
      assert.equal(setActionStatus(file, "trailer", "done", { now: NOW }).update.initiativeId, "video");
    },
    { actions: [action({ initiativeId: "video" })] },
  ));

test("setGate records the status, the check date and a log entry", () =>
  withFile((file) => {
    const out = setGate(file, "playtest", { status: "passed", note: "6 of 8 finished", evidenceIds: ["e1"], today: "2026-10-11", now: NOW });
    assert.equal(out.record.status, "passed");
    assert.equal(out.record.checkedAt, "2026-10-11");
    assert.equal(out.record.notes, "6 of 8 finished");
    assert.deepEqual(out.record.evidenceIds, ["e1"]);
    assert.deepEqual(out.warnings, []);
    assert.equal(out.update.kind, "gate");
    assert.equal(out.update.refId, "playtest");
    assert.match(out.update.text, /Playtest.*passed/);
  }));

test("a gate takes its check date from the injected now when today is not given", () =>
  withFile((file) => {
    assert.equal(setGate(file, "playtest", { status: "failed", now: LATER }).record.checkedAt, "2026-10-12");
  }));

test("a passed gate without evidence is saved with a warning, as plan warns", () =>
  withFile((file) => {
    const out = setGate(file, "playtest", { status: "passed", now: NOW });
    assert.equal(out.record.status, "passed");
    assert.deepEqual(out.warnings, ['Gate "playtest" is passed but cites no evidence']);
    const waived = setGate(file, "playtest", { status: "waived", now: LATER });
    assert.deepEqual(waived.warnings, ['Gate "playtest" is waived without a note saying why']);
  }));

test("setGate keeps the evidence and note it is not given", () =>
  withFile(
    (file) => {
      const out = setGate(file, "playtest", { status: "passed", now: NOW });
      assert.deepEqual(out.record.evidenceIds, ["e1"]);
      assert.equal(out.record.notes, "earlier note");
      assert.deepEqual(out.warnings, []);
    },
    { gates: [gate({ evidenceIds: ["e1"], notes: "earlier note" })] },
  ));

test("setGate refuses unknown evidence, a bad status and an unknown gate, writing nothing", () =>
  withFile((file) => {
    const before = bytes(file);
    assert.throws(() => setGate(file, "playtest", { status: "passed", evidenceIds: ["ghost"] }), /evidence/);
    assert.throws(() => setGate(file, "playtest", { status: "great" }), /status.*open, passed, failed, waived/);
    assert.throws(() => setGate(file, "playtest", {}), /status/);
    assert.throws(() => setGate(file, "ghost", { status: "open" }), /Gate "ghost" does not exist/);
    assert.equal(bytes(file), before);
  }));

test("setting a gate to what it already is, the same day, changes nothing", () =>
  withFile((file) => {
    setGate(file, "playtest", { status: "failed", note: "3 of 8", today: "2026-10-11", now: NOW });
    const before = bytes(file);
    const again = setGate(file, "playtest", { status: "failed", note: "3 of 8", today: "2026-10-11", now: LATER });
    assert.equal(again.changed, false);
    assert.equal(bytes(file), before);
    const nextDay = setGate(file, "playtest", { status: "failed", note: "3 of 8", today: "2026-10-12", now: LATER });
    assert.equal(nextDay.changed, true, "a new check date is a new check");
  }));

test("a gate's log entry carries the initiative it belongs to", () =>
  withFile(
    (file) => {
      assert.equal(setGate(file, "playtest", { status: "failed", now: NOW }).update.initiativeId, "video");
    },
    { gates: [gate({ initiativeId: "video" })] },
  ));

test("addUpdate appends a note under the initiative's project with a unique id", () =>
  withFile((file) => {
    const one = addUpdate(file, { text: "Cut the first teaser", initiativeId: "video", now: NOW });
    assert.equal(one.record.kind, "note");
    assert.equal(one.record.projectId, "game");
    assert.equal(one.record.initiativeId, "video");
    assert.equal(one.record.id, `u-${Date.parse(NOW).toString(36)}-1`);
    const two = addUpdate(file, { text: "Second note, same instant", kind: "document", refId: "memo", now: NOW });
    assert.equal(two.record.id, `u-${Date.parse(NOW).toString(36)}-2`);
    assert.equal(two.record.kind, "document");
    assert.equal(two.record.refId, "memo");
    assert.equal(readWorkspace(file).updates.length, 2);
    assert.deepEqual(two.update, two.record);
  }));

test("addUpdate refuses an empty text, an unknown kind or initiative", () =>
  withFile((file) => {
    assert.throws(() => addUpdate(file, { text: "" }), /text/);
    assert.throws(() => addUpdate(file, { text: "x", kind: "rumor" }), /kind/);
    assert.throws(() => addUpdate(file, { text: "x", initiativeId: "ghost" }), /Initiative "ghost" does not exist/);
    assert.throws(() => addUpdate(file, { text: "x", projectId: "ghost" }), /projectId/);
    assert.equal(readWorkspace(file).updates.length, 0);
  }));

test("addUpdate needs a project when the workspace has several", () =>
  withFile(
    (file) => {
      assert.throws(() => addUpdate(file, { text: "x", now: NOW }), /several projects/i);
      assert.equal(addUpdate(file, { text: "x", projectId: "other", now: NOW }).record.projectId, "other");
      assert.equal(addUpdate(file, { text: "x", initiativeId: "video", now: NOW }).record.projectId, "game");
    },
    { projects: [project, { ...project, id: "other" }] },
  ));

test("setInitiativeNote sets the one-line status, logs it and clears it with an empty note", () =>
  withFile((file) => {
    const out = setInitiativeNote(file, "video", "Editing the second cut", { now: NOW });
    assert.equal(out.record.note, "Editing the second cut");
    assert.equal(out.update.kind, "initiative");
    assert.equal(out.update.refId, "video");
    assert.equal(out.update.initiativeId, "video");
    assert.match(out.update.text, /Playable clip.*Editing the second cut/);
    const same = setInitiativeNote(file, "video", "Editing the second cut", { now: LATER });
    assert.equal(same.changed, false);
    assert.equal(readWorkspace(file).updates.length, 1);
    const cleared = setInitiativeNote(file, "video", "", { now: LATER });
    assert.equal(cleared.record.note, undefined);
    assert.equal(readWorkspace(file).initiatives[0].note, undefined);
    assert.equal(cleared.changed, true);
    assert.throws(() => setInitiativeNote(file, "ghost", "x"), /Initiative "ghost" does not exist/);
  }));

test("a function that errors leaves the workspace and its lock as they were", () =>
  withFile((file) => {
    const before = bytes(file);
    assert.throws(() => decide(file, "banner", { optionId: "zzz" }));
    assert.equal(bytes(file), before);
    // The lock is released, so the next write succeeds.
    assert.equal(decide(file, "banner", { optionId: "a", now: NOW }).changed, true);
  }));

test("mutateWorkspace skips the write and the revision bump when the edit returns unchanged", () =>
  withFile((file) => {
    const before = bytes(file);
    const w = mutateWorkspace(file, () => unchanged);
    assert.equal(w.revision, 0);
    assert.equal(bytes(file), before);
  }));
