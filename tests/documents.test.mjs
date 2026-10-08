import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, linkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createWorkspace, readWorkspace, importRecords } from "../src/store.mjs";
import { validateWorkspace } from "../src/schema.mjs";
import { parseImport } from "../src/import.mjs";
import { ledger as fixture } from "./fixtures.mjs";

const ledger = () => structuredClone(fixture());

const document = { markdown: "# Strategy\n\n日本語の読者 · evidence → next test\n", updatedAt: "2026-10-08T12:00:00.000Z" };

test("legacy workspaces remain valid while malformed saved documents are rejected", () => {
  assert.equal(validateWorkspace(ledger()).projects[0].strategy, undefined);
  for (const field of ["strategy", "brief"]) {
    for (const invalid of [null, "text", {}, { ...document, markdown: " " }, { ...document, markdown: "x".repeat(100001) }, { ...document, updatedAt: "yesterday" }]) {
      const w = ledger();
      (field === "strategy" ? w.projects[0] : w.initiatives[0])[field] = invalid;
      assert.throws(() => validateWorkspace(w), /strategy|brief/);
    }
  }
});

test("unrelated full-record imports preserve documents and invalid replacements preserve bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-docs-")), file = join(dir, "w.json");
  try {
    const w = ledger();
    w.projects[0].strategy = document;
    w.initiatives[0].brief = document;
    createWorkspace(file, w);
    const older = ledger();
    older.projects[0].name = "Updated project";
    older.initiatives[0].status = "paused";
    importRecords(file, { projects: older.projects, initiatives: older.initiatives }, 0);
    const saved = readWorkspace(file);
    assert.deepEqual(saved.projects[0].strategy, document);
    assert.deepEqual(saved.initiatives[0].brief, document);
    assert.equal(saved.initiatives[0].status, "paused");
    const before = readFileSync(file, "utf8");
    assert.throws(() => importRecords(file, { projects: [{ ...saved.projects[0], strategy: null }] }, 1));
    assert.equal(readFileSync(file, "utf8"), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI saves reopen in a fresh process, reject stale edits, and survive JSON backup restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-doc-cli-")), file = join(dir, "w.json");
  const run = (...args) => spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
  try {
    const w = ledger(), projectId = w.projects[0].id, initiativeId = w.initiatives[0].id;
    createWorkspace(file, w);
    const input = join(dir, "brief.md");
    writeFileSync(input, document.markdown);
    for (const [kind, id, revision] of [["strategy", projectId, "0"], ["campaign", initiativeId, "1"]]) {
      const save = run("document", "save", kind, id, input, "--revision", revision);
      assert.equal(save.status, 0, save.stderr);
      const show = run("document", "show", kind, id);
      assert.equal(show.status, 0, show.stderr);
      assert.equal(JSON.parse(show.stdout).document.markdown, document.markdown);
    }
    const before = readFileSync(file, "utf8");
    for (const args of [
      ["save", "strategy", projectId, input, "--revision", "0"],
      ["save", "strategy", projectId, input],
      ["save", "campaign", "missing", input, "--revision", "2"],
      ["save", "unknown", projectId, input, "--revision", "2"],
    ]) assert.equal(run("document", ...args).status, 2);
    assert.equal(readFileSync(file, "utf8"), before);
    const output = join(dir, "export.md");
    assert.equal(run("document", "export", "strategy", projectId, "--out", output).status, 0);
    assert.equal(readFileSync(output, "utf8"), document.markdown);
    const alias = join(dir, "workspace-alias.json");
    linkSync(file, alias);
    for (const destination of [file, alias]) {
      const rejected = run("document", "export", "strategy", projectId, "--out", destination);
      assert.equal(rejected.status, 2, "Export must not overwrite the workspace or a hard link to it");
      assert.equal(readFileSync(file, "utf8"), before);
    }
    assert.equal(run("export", "--format", "csv", "--out", file).status, 2);
    assert.equal(readFileSync(file, "utf8"), before);
    const backup = run("export");
    assert.equal(backup.status, 0, backup.stderr);
    const restored = join(dir, "restored.json");
    createWorkspace(restored);
    importRecords(restored, parseImport(backup.stdout, "json"), 0);
    assert.equal(readWorkspace(restored).projects[0].strategy.markdown, document.markdown);
    assert.equal(readWorkspace(restored).initiatives[0].brief.markdown, document.markdown);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
