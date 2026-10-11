import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collections, emptyWorkspace, validateWorkspace, workspaceWarnings, patchWarnings } from "../src/schema.mjs";
import { createWorkspace, readWorkspace, importRecords } from "../src/store.mjs";
import { parseImport } from "../src/import.mjs";
import { ledger as fixture, initiative as baseInitiative } from "./fixtures.mjs";

const ledger = () => structuredClone(fixture());
const gate = (over = {}) => ({
  id: "playtest",
  projectId: "game",
  name: "Outside playtest",
  criteria: "At least 5 of 8 outside players finish chapter one in one session",
  status: "open",
  ...over,
});
const evidence = (over = {}) => ({
  id: "e1",
  projectId: "game",
  claim: "Five of eight players finished",
  dimension: "activation",
  result: "supports",
  strength: "primary",
  url: "https://example.com/playtest",
  checkedAt: "2026-10-11",
  ...over,
});
const initiative = (id, over = {}) => ({ ...baseInitiative, id, name: id, ...over });
const withGates = (gates, initiatives = [], extra = {}) => {
  const w = ledger();
  w.gates = gates;
  w.initiatives = [...w.initiatives, ...initiatives];
  return Object.assign(w, extra);
};
const second = {
  id: "other",
  name: "Other",
  audience: ["x"],
  category: "tool",
  problem: "p",
  promise: "q",
  stage: "idea",
  objective: "o",
  weeklyHours: 1,
  budget: 0,
  currency: "USD",
};

test("workspaces saved before gates existed stay valid and gain an empty collection", () => {
  assert.ok(collections.includes("gates"));
  assert.deepEqual(emptyWorkspace().gates, []);
  const old = ledger();
  delete old.gates;
  delete old.reports;
  assert.deepEqual(validateWorkspace(old).gates, []);
});

test("an older full-ledger backup without gates still imports and a new one round-trips them", () => {
  const old = ledger();
  delete old.gates;
  const patch = parseImport(JSON.stringify(old));
  assert.deepEqual(patch.gates, []);
  const w = withGates([gate({ evidenceIds: ["e1"] })], [], { evidence: [evidence()] });
  assert.deepEqual(parseImport(JSON.stringify(w)).gates, w.gates);
});

test("a valid gate has required text, a status and optional check date, evidence and notes", () => {
  validateWorkspace(withGates([gate()]));
  validateWorkspace(
    withGates([gate({ status: "passed", checkedAt: "2026-10-11", evidenceIds: ["e1"], notes: "Ran at the library" })], [], {
      evidence: [evidence()],
    }),
  );
  for (const status of ["open", "passed", "failed", "waived"]) validateWorkspace(withGates([gate({ status })]));
});

test("invalid gates are rejected with the gate named", () => {
  const bad = [
    { name: " " },
    { name: undefined },
    { criteria: " " },
    { criteria: undefined },
    { status: "done" },
    { status: undefined },
    { checkedAt: "yesterday" },
    { checkedAt: "2026-02-31" },
    { notes: " " },
    { projectId: "absent" },
    { projectId: undefined },
    { evidenceIds: "e1" },
    { evidenceIds: [1] },
    { evidenceIds: ["e1", "e1"] },
    { evidenceIds: ["missing"] },
  ];
  for (const edit of bad) {
    const w = withGates([gate(edit)], [], { evidence: [evidence()] });
    assert.throws(() => validateWorkspace(w), /gates/, JSON.stringify(edit));
  }
  const dup = withGates([gate(), gate()]);
  assert.throws(() => validateWorkspace(dup), /duplicate ID playtest/);
});

test("gate evidence must belong to the gate's own project", () => {
  const w = withGates([gate({ evidenceIds: ["theirs"] })], [], {
    projects: [...ledger().projects, second],
    evidence: [evidence({ id: "theirs", projectId: "other" })],
  });
  assert.throws(() => validateWorkspace(w), /gates\.playtest\.evidenceIds.*theirs/);
});

test("initiative hours are an optional nonnegative number", () => {
  for (const hours of [0, 1, 2.5, 40]) validateWorkspace(withGates([], [initiative("a", { hours })]));
  validateWorkspace(withGates([], [initiative("a")]));
  for (const hours of [-1, "6", null, NaN, Infinity]) {
    const w = withGates([], [initiative("a", { hours })]);
    assert.throws(() => validateWorkspace(w), /initiatives\.a\.hours.*nonnegative number/, String(hours));
  }
});

test("dependsOn accepts gates and initiatives of the same project, including a diamond", () => {
  validateWorkspace(withGates([gate()], [initiative("a", { dependsOn: [] })]));
  validateWorkspace(
    withGates(
      [gate(), gate({ id: "assets", name: "Store assets" })],
      [
        initiative("a", { dependsOn: ["playtest"] }),
        initiative("b", { dependsOn: ["a", "assets"] }),
        initiative("c", { dependsOn: ["a"] }),
        initiative("d", { dependsOn: ["b", "c", "playtest"] }),
      ],
    ),
  );
});

test("dependsOn must name something that exists in the same project", () => {
  const cases = [
    ["not a list", { dependsOn: "playtest" }, /expected an array/],
    ["not text", { dependsOn: [3] }, /dependsOn/],
    ["unknown ID", { dependsOn: ["nope"] }, /"nope" is not a gate or initiative in this project/],
    ["itself", { dependsOn: ["a"] }, /cannot depend on itself/],
    ["repeated", { dependsOn: ["playtest", "playtest"] }, /duplicate dependency "playtest"/],
  ];
  for (const [label, edit, pattern] of cases) {
    const w = withGates([gate()], [initiative("a", edit)]);
    assert.throws(() => validateWorkspace(w), pattern, label);
  }
});

test("a dependency in another project is refused, for gates and for initiatives", () => {
  const projects = [...ledger().projects, second];
  const theirGate = withGates([gate({ id: "theirs-gate", projectId: "other" })], [initiative("a", { dependsOn: ["theirs-gate"] })], { projects });
  assert.throws(() => validateWorkspace(theirGate), /initiatives\.a\.dependsOn.*"theirs-gate"/);
  const theirWork = withGates([], [initiative("a", { dependsOn: ["theirs"] }), initiative("theirs", { projectId: "other" })], { projects });
  assert.throws(() => validateWorkspace(theirWork), /initiatives\.a\.dependsOn.*"theirs"/);
});

test("dependency cycles are rejected and named", () => {
  const two = withGates([], [initiative("a", { dependsOn: ["b"] }), initiative("b", { dependsOn: ["a"] })]);
  assert.throws(() => validateWorkspace(two), /initiatives\.a\.dependsOn: dependency cycle a -> b -> a/);
  const three = withGates(
    [gate()],
    [
      initiative("a", { dependsOn: ["playtest", "b"] }),
      initiative("b", { dependsOn: ["c"] }),
      initiative("c", { dependsOn: ["a"] }),
    ],
  );
  assert.throws(() => validateWorkspace(three), /dependency cycle a -> b -> c -> a/);
  const tail = withGates(
    [],
    [initiative("x", { dependsOn: ["b"] }), initiative("b", { dependsOn: ["c"] }), initiative("c", { dependsOn: ["b"] })],
  );
  assert.throws(() => validateWorkspace(tail), /dependency cycle b -> c -> b/);
});

test("a long dependency chain validates without exhausting the stack", () => {
  const chain = Array.from({ length: 5000 }, (_, i) => initiative(`n${i}`, i ? { dependsOn: [`n${i - 1}`] } : {}));
  validateWorkspace(withGates([], chain));
  chain[0].dependsOn = ["n4999"];
  assert.throws(() => validateWorkspace(withGates([], chain)), /dependency cycle n0 -> n4999/);
});

test("a gate and an initiative in one project cannot share an ID, so a dependency is never ambiguous", () => {
  const clash = withGates([gate({ id: "video" })]);
  assert.throws(() => validateWorkspace(clash), /gates\.video.*initiative/);
  const apart = withGates([gate({ id: "video", projectId: "other" })], [], { projects: [...ledger().projects, second] });
  validateWorkspace(apart);
});

test("a rejected dependency or cycle refuses the whole import and leaves the file untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-gates-")), file = join(dir, "w.json");
  try {
    createWorkspace(file, ledger());
    importRecords(file, { gates: [gate()] }, 0);
    const before = readFileSync(file, "utf8");
    assert.throws(
      () => importRecords(file, { initiatives: [initiative("ok", { dependsOn: ["playtest"] }), initiative("bad", { dependsOn: ["nope"] })] }, 1),
      /initiatives\.bad\.dependsOn/,
    );
    assert.throws(
      () => importRecords(file, { initiatives: [initiative("a", { dependsOn: ["b"] }), initiative("b", { dependsOn: ["a"] })] }, 1),
      /dependency cycle/,
    );
    assert.throws(() => importRecords(file, { gates: [gate({ id: "g2", evidenceIds: ["missing"] })] }, 1), /evidenceIds/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(readWorkspace(file).revision, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gates follow the ledger's revision, upsert and merge rules, and survive a backup restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-gates-")), file = join(dir, "w.json");
  try {
    createWorkspace(file, ledger());
    const first = importRecords(file, { gates: [gate()] }, 0);
    assert.equal(first.revision, 1);
    assert.equal(first.gates.length, 1);
    assert.throws(() => importRecords(file, { gates: [gate({ status: "passed" })] }, 0), /Revision conflict/);
    assert.equal(readWorkspace(file).gates[0].status, "open");
    // A full-record upsert: the reimported gate replaces the saved one, including dropped optional fields.
    importRecords(file, { evidence: [evidence()] }, 1);
    importRecords(file, { gates: [gate({ status: "passed", checkedAt: "2026-10-11", evidenceIds: ["e1"] })] }, 2);
    importRecords(file, { gates: [gate({ status: "failed" })] }, 3);
    const after = readWorkspace(file);
    assert.equal(after.gates.length, 1);
    assert.equal(after.gates[0].status, "failed");
    assert.equal(after.gates[0].evidenceIds, undefined);
    // Importing initiatives alone merges and may depend on gates already saved.
    importRecords(file, { initiatives: [initiative("launch", { dependsOn: ["playtest"], hours: 4 })] }, 4);
    assert.deepEqual(readWorkspace(file).initiatives.find((i) => i.id === "launch").dependsOn, ["playtest"]);
    const backup = JSON.parse(readFileSync(file, "utf8"));
    const restored = join(dir, "restored.json");
    createWorkspace(restored, backup);
    assert.deepEqual(readWorkspace(restored).gates, after.gates);
    const merged = join(dir, "merged.json");
    createWorkspace(merged, ledger());
    importRecords(merged, parseImport(JSON.stringify(backup)));
    assert.equal(readWorkspace(merged).initiatives.find((i) => i.id === "launch").hours, 4);
    assert.equal(readWorkspace(merged).gates.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gate, hours and dependsOn are known fields, and typos of them are caught", () => {
  const w = withGates([gate({ status: "passed", checkedAt: "2026-10-11", evidenceIds: ["e1"], notes: "n" })], [
    initiative("a", { hours: 3, dependsOn: ["playtest"] }),
  ], { evidence: [evidence()] });
  assert.deepEqual(workspaceWarnings(w), []);
  const cases = [
    ["gates", "criterea", "criteria"],
    ["gates", "evidenceId", "evidenceIds"],
    ["gates", "note", "notes"],
    ["initiatives", "dependOn", "dependsOn"],
    ["initiatives", "hour", "hours"],
  ];
  for (const [collection, field, expected] of cases)
    assert.deepEqual(patchWarnings({ [collection]: [{ id: "r1", [field]: 1 }] }), [
      `${collection}.r1: unknown field "${field}"; did you mean "${expected}"?`,
    ]);
});
