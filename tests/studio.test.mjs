import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { studioWorkspace, installRuntime, inspectInstallation } from "../scripts/runtime.mjs";

const cli = (home, ...args) =>
  spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, AGENT_MARKETING_HOME: home },
  });

test("the studio workspace lives under the plugin home, apart from the managed releases", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-studio-"));
  try {
    const previous = process.env.AGENT_MARKETING_HOME;
    process.env.AGENT_MARKETING_HOME = home;
    try {
      assert.equal(studioWorkspace(), join(resolve(home), "studio", "workspace.json"));
    } finally {
      if (previous === undefined) delete process.env.AGENT_MARKETING_HOME;
      else process.env.AGENT_MARKETING_HOME = previous;
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--studio creates the studio once, saves a project-less report, and refuses --workspace", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-studio-")), md = join(home, "r.md");
  try {
    writeFileSync(md, "# A report\n\nBody\n");
    const first = cli(home, "init", "--studio");
    assert.equal(first.status, 0, first.stderr);
    const file = join(resolve(home), "studio", "workspace.json");
    assert.ok(existsSync(file));
    const again = cli(home, "init", "--studio");
    assert.equal(again.status, 0, again.stderr);
    assert.equal(JSON.parse(again.stdout).exists, true);
    const save = cli(home, "document", "save", "report", "r1", md, "--title", "A report", "--studio", "--revision", "0");
    assert.equal(save.status, 0, save.stderr);
    assert.equal(JSON.parse(save.stdout).workspace, file);
    const w = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(w.reports[0].id, "r1");
    assert.equal(w.projects.length, 0);
    const shown = cli(home, "document", "show", "report", "r1", "--studio");
    assert.equal(JSON.parse(shown.stdout).document.markdown, "# A report\n\nBody\n");
    const both = cli(home, "validate", "--studio", "--workspace", "other.json");
    assert.notEqual(both.status, 0);
    assert.match(both.stderr, /--studio/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("installing or updating the runtime never touches the studio workspace", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-studio-"));
  try {
    assert.equal(cli(home, "init", "--studio").status, 0);
    const file = join(resolve(home), "studio", "workspace.json"),
      before = readFileSync(file, "utf8");
    const installed = installRuntime(resolve("."), home);
    assert.equal(installed.ok, true);
    assert.equal(inspectInstallation(resolve("."), home).ok, true);
    assert.equal(readFileSync(file, "utf8"), before);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("help documents the studio flag", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-studio-"));
  try {
    assert.match(cli(home, "help").stdout, /--studio/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
