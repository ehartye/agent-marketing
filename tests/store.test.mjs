import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyWorkspace, validateWorkspace } from "../src/schema.mjs";
import {
  createWorkspace,
  readWorkspace,
  importRecords,
  mutateWorkspace,
} from "../src/store.mjs";
import { ledger, observation } from "./fixtures.mjs";

test("new workspace has a portable versioned ledger", () => {
  assert.equal(emptyWorkspace().schema, "marketing/workspace@1");
});
test("validation rejects dangling references, invalid dates, duplicate IDs and negative counts", () => {
  for (const edit of [
    (w) => w.observations.push(observation("x", "views", -1)),
    (w) =>
      w.observations.push(observation("x", "views", 1, { channel: undefined })),
    (w) => (w.initiatives[0].projectId = "absent"),
    (w) => (w.initiatives[0].start = "2026-02-31"),
    (w) => w.projects.push(w.projects[0]),
    (w) => (w.projects[0].weeklyHours = Infinity),
  ]) {
    const w = structuredClone(ledger());
    edit(w);
    assert.throws(() => validateWorkspace(w));
  }
});
test("atomic merge is idempotent, revisions detect conflicts, and invalid import preserves bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-"));
  const file = join(dir, "ledger.json");
  try {
    createWorkspace(file, ledger());
    importRecords(file, {
      observations: [observation("views", "views", 2400)],
    });
    importRecords(file, {
      observations: [observation("views", "views", 2500)],
    });
    assert.equal(readWorkspace(file).observations.length, 1);
    assert.equal(readWorkspace(file).observations[0].value, 2500);
    const before = readFileSync(file, "utf8");
    assert.throws(() =>
      importRecords(file, { observations: [observation("bad", "views", -1)] }),
    );
    assert.equal(readFileSync(file, "utf8"), before);
    assert.throws(
      () =>
        mutateWorkspace(
          file,
          (w) => {
            w.projects[0].name = "lost edit";
          },
          0,
        ),
      /revision/i,
    );
    assert.equal(readFileSync(file, "utf8"), before);
    assert.throws(() => createWorkspace(file, ledger()), /exist/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("a live writer lock cannot be stolen", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-lock-"));
  const file = join(dir, "ledger.json");
  try {
    createWorkspace(file, ledger());
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid }));
    assert.throws(() => importRecords(file, {}), /locked/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
