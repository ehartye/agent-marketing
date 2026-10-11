import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateWorkspace, recordFields } from "../src/schema.mjs";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { saveReport } from "../src/documents.mjs";
import { ledger, initiative } from "./fixtures.mjs";

const gate = (over = {}) => ({ id: "g1", projectId: "game", name: "Playtest", criteria: "five finish", status: "open", ...over });
const decision = (over = {}) => ({
  id: "d1",
  projectId: "game",
  title: "Pick one",
  question: "Which?",
  status: "open",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  ...over,
});
const message = (w) => {
  try {
    validateWorkspace(w);
  } catch (e) {
    return e.message;
  }
  return null;
};
const withRecords = (extra) => ({ ...ledger(), ...extra });

// ---- A free-form field of an older ledger gets an error that says what to do --------------------

test("a gate due that is not a date names the gate, the field, the value and the new type", () => {
  const m = message(withRecords({ gates: [gate({ due: "Friday" })] }));
  assert.match(m, /^gates\.g1\.due: "Friday" is not a YYYY-MM-DD date; due is a typed field since 0\.11 \(if it holds something else, rename that field\)$/);
  assert.match(message(withRecords({ gates: [gate({ due: "2026-13-45" })] })), /^gates\.g1\.due: "2026-13-45" is not a YYYY-MM-DD date; due is a typed field/, "an impossible date is an error, not a RangeError");
  assert.match(message(withRecords({ gates: [gate({ due: 20261014 })] })), /^gates\.g1\.due: 20261014 is not a YYYY-MM-DD date/);
  assert.equal(message(withRecords({ gates: [gate({ due: "2026-10-14" })] })), null);
});

test("gate hours that are not a number name the field and the new type", () => {
  assert.match(
    message(withRecords({ gates: [gate({ hours: "2h" })] })),
    /^gates\.g1\.hours: "2h" is not a nonnegative number of maker-hours; hours is a typed field since 0\.11 \(if it holds something else, rename that field\)$/,
  );
  assert.match(message(withRecords({ gates: [gate({ hours: -1 })] })), /^gates\.g1\.hours: -1 is not a nonnegative number/);
  assert.match(message(withRecords({ gates: [gate({ hours: null })] })), /^gates\.g1\.hours: null is not a nonnegative number/);
  assert.equal(message(withRecords({ gates: [gate({ hours: 2.5 })] })), null);
});

test("an initiative note that is not text names the initiative and the new type", () => {
  for (const [note, shown] of [[3, "3"], ["", '""'], ["   ", '"   "'], [["a"], '["a"]']]) {
    assert.match(
      message(withRecords({ initiatives: [{ ...initiative, note }] })),
      new RegExp(`^initiatives\\.video\\.note: ${shown.replace(/[[\]"]/g, "\\$&")} is not nonempty text \\(at most 20000 characters\\); note is a typed field since 0\\.11 \\(if it holds something else, rename that field\\)$`),
    );
  }
  assert.equal(message(withRecords({ initiatives: [{ ...initiative, note: "Waiting on art" }] })), null);
});

test("an initiative parentId that is not an initiative of the project names the field and the new type", () => {
  assert.match(
    message(withRecords({ initiatives: [{ ...initiative, parentId: "Q4 launch" }] })),
    /^initiatives\.video\.parentId: "Q4 launch" is not an initiative in this project; parentId is a typed field since 0\.11 \(if it holds something else, rename that field\)$/,
  );
  assert.match(message(withRecords({ initiatives: [{ ...initiative, parentId: 4 }] })), /^initiatives\.video\.parentId: 4 is not an initiative in this project; parentId is a typed field/);
  assert.match(message(withRecords({ initiatives: [{ ...initiative, parentId: "video" }] })), /^initiatives\.video\.parentId: an initiative cannot be its own parent/);
});

test("a report gateId or decisionId that names nothing says the field is typed now", () => {
  const report = (over) => ({ id: "r1", projectId: "game", title: "T", markdown: "# T", updatedAt: "2026-10-08T12:00:00.000Z", ...over });
  assert.match(
    message(withRecords({ reports: [report({ gateId: "G-12" })] })),
    /^reports\.r1\.gateId: "G-12" is not a gate in this project; gateId is a typed field since 0\.11 \(if it holds something else, rename that field\)$/,
  );
  assert.match(
    message(withRecords({ reports: [report({ decisionId: 7 })] })),
    /^reports\.r1\.decisionId: 7 is not a decision in this project; decisionId is a typed field since 0\.11/,
  );
  assert.equal(message(withRecords({ gates: [gate()], reports: [report({ gateId: "g1" })] })), null);
});

test("a very long wrong value is cut short in the message", () => {
  const m = message(withRecords({ gates: [gate({ due: "x".repeat(500) })] }));
  assert.ok(m.length < 300, m.length);
  assert.match(m, /…/);
});

// ---- The updates log may be long ---------------------------------------------------------------

test("the progress log holds up to 200000 entries while other collections stop at 50000", () => {
  const update = (n) => ({ id: `u-${n}`, projectId: "game", at: "2026-10-11T10:00:00.000Z", kind: "note", text: "x" });
  const many = (n) => Array.from({ length: n }, (_, i) => update(i));
  assert.equal(message(withRecords({ updates: many(50001) })), null, "more than 50000 updates is fine");
  assert.equal(message(withRecords({ updates: many(200000) })), null);
  assert.match(message(withRecords({ updates: many(200001) })), /^updates: expected array \(max 200000 records\)$/);
  const obs = Array.from({ length: 50001 }, (_, i) => ({ id: `o-${i}` }));
  assert.match(message(withRecords({ evidence: obs })), /^evidence: expected array \(max 50000 records\)$/);
});

// ---- A decision's recommended option ----------------------------------------------------------

test("recommendedOptionId must be one of the decision's options", () => {
  assert.equal(message(withRecords({ decisions: [decision({ recommendedOptionId: "b", recommendation: "B costs less" })] })), null);
  assert.equal(message(withRecords({ decisions: [decision()] })), null, "it is optional");
  assert.match(message(withRecords({ decisions: [decision({ recommendedOptionId: "z" })] })), /^decisions\.d1\.recommendedOptionId: "z" is not one of the options/);
  assert.match(message(withRecords({ decisions: [decision({ recommendedOptionId: 2 })] })), /^decisions\.d1\.recommendedOptionId: /);
  assert.ok(recordFields.decisions.includes("recommendedOptionId"));
});

// ---- A slot that is waiting ------------------------------------------------------------------

test("waitingOn on a slot is nonempty text of at most 200 characters", () => {
  const slot = (over) => ({ id: "capsule", projectId: "game", name: "Capsule", kind: "image", status: "open", ...over });
  assert.equal(message(withRecords({ assetSlots: [slot({ waitingOn: "five-second tests, Nov 23-25" })] })), null);
  assert.equal(message(withRecords({ assetSlots: [slot({ waitingOn: "x".repeat(200) })] })), null);
  assert.match(message(withRecords({ assetSlots: [slot({ waitingOn: "x".repeat(201) })] })), /^assetSlots\.capsule\.waitingOn: expected nonempty text of at most 200 characters$/);
  for (const bad of ["", "  ", 3, null])
    assert.match(message(withRecords({ assetSlots: [slot({ waitingOn: bad })] })), /^assetSlots\.capsule\.waitingOn: /);
  assert.ok(recordFields.assetSlots.includes("waitingOn"));
});

// ---- Saving a report again keeps its project --------------------------------------------------

test("saving a report again without --project keeps the project it already had", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-report-"));
  try {
    const file = join(dir, "w.json");
    const w = ledger();
    w.gates = [gate()];
    createWorkspace(file, w);
    let revision = readWorkspace(file).revision;
    saveReport(file, { id: "memo", title: "Memo", markdown: "# One", projectId: "game", gateId: "g1" }, revision);
    revision = readWorkspace(file).revision;
    const again = saveReport(file, { id: "memo", title: "Memo", markdown: "# Two" }, revision);
    assert.equal(again.projectId, "game");
    const saved = readWorkspace(file).reports[0];
    assert.equal(saved.projectId, "game");
    assert.equal(saved.gateId, "g1");
    assert.equal(saved.markdown, "# Two");
    // A project named again wins; a workspace-level report stays workspace-level.
    saveReport(file, { id: "free", title: "Free", markdown: "# Free" }, readWorkspace(file).revision);
    assert.equal(readWorkspace(file).reports.find((r) => r.id === "free").projectId, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
