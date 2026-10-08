import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createWorkspace, readWorkspace, importRecords } from "../src/store.mjs";
import { validateWorkspace, emptyWorkspace } from "../src/schema.mjs";
import { readDocument, saveDocument, saveReport } from "../src/documents.mjs";
import { parseImport } from "../src/import.mjs";
import { ledger as fixture } from "./fixtures.mjs";

const ledger = () => structuredClone(fixture());
const report = (over = {}) => ({
  id: "game-market-2026",
  title: "Game market landscape",
  markdown: "# Landscape\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
  updatedAt: "2026-10-08T12:00:00.000Z",
  ...over,
});

test("workspaces saved before reports existed stay valid and gain an empty collection", () => {
  assert.deepEqual(emptyWorkspace().reports, []);
  const old = ledger();
  delete old.reports;
  assert.deepEqual(validateWorkspace(old).reports, []);
});

test("an older full-ledger backup without reports still imports", () => {
  const old = ledger();
  delete old.reports;
  const patch = parseImport(JSON.stringify(old));
  assert.deepEqual(patch.reports, []);
  assert.ok(patch.projects.length > 0);
});

test("reports are workspace-level, project-optional, and validated", () => {
  const w = ledger();
  w.reports = [report(), report({ id: "scoped", projectId: w.projects[0].id, kind: "demand", vaultUrl: "obsidian://open?vault=v&file=a" })];
  validateWorkspace(w);
  for (const bad of [
    { title: " " },
    { markdown: " " },
    { markdown: "x".repeat(100001) },
    { updatedAt: "yesterday" },
    { projectId: "missing" },
    { kind: "novel" },
    { vaultUrl: "javascript:alert(1)" },
    { vaultUrl: "file:///etc/passwd" },
  ]) {
    const x = ledger();
    x.reports = [report(bad)];
    assert.throws(() => validateWorkspace(x), /reports/, JSON.stringify(bad));
  }
});

test("evidence audit fields are optional and validated", () => {
  const base = (w) => ({
    id: "e1", projectId: w.projects[0].id, claim: "A claim", dimension: "channel",
    result: "supports", strength: "secondary", url: "https://example.com/e", checkedAt: "2026-10-08",
  });
  const w = ledger();
  w.evidence = [{
    ...base(w),
    publishedAt: "2026-01-27",
    dataPeriod: "2025 releases",
    denominator: "608 of 20,282 releases",
    credibility: "medium",
    relevance: "high",
    status: "modeled-estimate",
    limit: "genre labels are one author's",
  }];
  validateWorkspace(w);
  for (const bad of [
    { publishedAt: "January" },
    { credibility: "great" },
    { relevance: "very" },
    { status: "sure" },
    { denominator: " " },
  ]) {
    const x = ledger();
    x.evidence = [{ ...base(x), ...bad }];
    assert.throws(() => validateWorkspace(x), /evidence/, JSON.stringify(bad));
  }
});

test("saving a report is revision-checked, replaces by id, and survives backup restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-report-")), file = join(dir, "w.json");
  try {
    createWorkspace(file, ledger());
    let revision = readWorkspace(file).revision;
    const saved = saveReport(file, { id: "r1", title: "First", markdown: "# One\n" }, revision);
    assert.equal(saved.kind, "report");
    assert.equal(saved.document.markdown, "# One\n");
    revision = readWorkspace(file).revision;
    assert.throws(() => saveReport(file, { id: "r1", title: "Stale", markdown: "# Stale\n" }, revision - 1), /Revision conflict/);
    saveReport(file, { id: "r1", title: "Second", markdown: "# Two\n", vaultUrl: "obsidian://open?vault=v&file=f" }, revision);
    const w = readWorkspace(file);
    assert.equal(w.reports.length, 1);
    assert.equal(w.reports[0].title, "Second");
    assert.equal(readDocument(w, "report", "r1").name, "Second");
    assert.throws(() => readDocument(w, "report", "nope"), /does not exist/);
    const backup = JSON.stringify(w);
    const restored = join(dir, "restored.json");
    createWorkspace(restored, JSON.parse(backup));
    assert.equal(readWorkspace(restored).reports[0].markdown, "# Two\n");
    importRecords(file, { projects: ledger().projects }, readWorkspace(file).revision);
    assert.equal(readWorkspace(file).reports.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI saves, shows and exports a report", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-report-cli-")), file = join(dir, "w.json"), md = join(dir, "r.md");
  const run = (...args) => spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
  try {
    createWorkspace(file, ledger());
    writeFileSync(md, "# Hello report\n\nBody\n");
    const revision = readWorkspace(file).revision;
    const save = run("document", "save", "report", "r1", md, "--title", "Hello", "--revision", String(revision));
    assert.equal(save.status, 0, save.stderr);
    assert.equal(JSON.parse(save.stdout).document.markdown, "# Hello report\n\nBody\n");
    const show = run("document", "show", "report", "r1");
    assert.equal(show.status, 0, show.stderr);
    assert.equal(JSON.parse(show.stdout).document.markdown, "# Hello report\n\nBody\n");
    const missingTitle = run("document", "save", "report", "r2", md, "--revision", String(readWorkspace(file).revision));
    assert.notEqual(missingTitle.status, 0);
    const out = join(dir, "out.md");
    const exp = run("document", "export", "report", "r1", "--out", out);
    assert.equal(exp.status, 0, exp.stderr);
    assert.equal(readFileSync(out, "utf8"), "# Hello report\n\nBody\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
