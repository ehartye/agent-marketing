import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { installRuntime, inspectInstallation } from "../scripts/runtime.mjs";
test("managed install is content verified, idempotent, launches and detects tampering", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-runtime-")),
    source = resolve(".");
  try {
    assert.equal(inspectInstallation(source, home).ok, false);
    const a = installRuntime(source, home);
    assert.equal(a.ok, true);
    const b = installRuntime(source, home);
    assert.equal(a.runtimeRoot, b.runtimeRoot);
    const r = spawnSync(
      process.execPath,
      [resolve("scripts/run-managed.mjs"), "channels"],
      { encoding: "utf8", env: { ...process.env, AGENT_MARKETING_HOME: home } },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.ok(JSON.parse(r.stdout).some((c) => c.id === "youtube"));
    const file = join(a.runtimeRoot, "src/analysis.mjs");
    writeFileSync(file, readFileSync(file, "utf8") + "\n// tampered\n");
    assert.equal(inspectInstallation(source, home).ok, false);
    const rejected = spawnSync(
      process.execPath,
      [resolve("scripts/run-managed.mjs"), "help"],
      { encoding: "utf8", env: { ...process.env, AGENT_MARKETING_HOME: home } },
    );
    assert.notEqual(rejected.status, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
import {
  cpSync,
  mkdirSync,
  readdirSync,
  existsSync,
  utimesSync,
} from "node:fs";
import {
  isInstalledPlugin,
  healRuntime,
  runtimeFiles,
} from "../scripts/runtime.mjs";
const repo = resolve(".");
function pluginCopy(root, version = "0.0.1") {
  const dir = join(root, "plugins", "cache", "h", "agent-marketing", version);
  for (const file of runtimeFiles(repo)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    cpSync(join(repo, file), join(dir, file));
  }
  return dir;
}
const run = (source, home, args = ["channels"]) =>
  spawnSync(process.execPath, [join(source, "scripts/run-managed.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, AGENT_MARKETING_HOME: home },
  });
const releases = (home) =>
  existsSync(join(home, "releases"))
    ? readdirSync(join(home, "releases")).filter((n) => !n.startsWith("."))
    : [];
test("only an installed plugin copy may heal, never a checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "marketing-heal-"));
  try {
    assert.equal(isInstalledPlugin(repo), false);
    const copy = pluginCopy(root);
    assert.equal(isInstalledPlugin(copy), true);
    mkdirSync(join(copy, ".git"));
    assert.equal(isInstalledPlugin(copy), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("an installed plugin heals a missing or stale runtime on first use", () => {
  const root = mkdtempSync(join(tmpdir(), "marketing-heal-")),
    home = join(root, "home");
  try {
    const copy = pluginCopy(root);
    const first = run(copy, home);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(JSON.parse(first.stdout).some((c) => c.id === "youtube"));
    assert.match(first.stderr, /Updating managed runtime/);
    assert.equal(releases(home).length, 1);
    const again = run(copy, home);
    assert.equal(again.status, 0);
    assert.equal(again.stderr, "");
    const file = join(copy, "craft/channels.md");
    writeFileSync(file, readFileSync(file, "utf8") + "\nupdate\n");
    const updated = run(copy, home);
    assert.equal(updated.status, 0, updated.stderr);
    assert.equal(releases(home).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("a modified installed release is reported, not overwritten", () => {
  const root = mkdtempSync(join(tmpdir(), "marketing-heal-")),
    home = join(root, "home");
  try {
    const copy = pluginCopy(root);
    assert.equal(run(copy, home).status, 0);
    const [release] = releases(home);
    const file = join(home, "releases", release, "src/analysis.mjs");
    writeFileSync(file, readFileSync(file, "utf8") + "\n// tampered\n");
    const r = run(copy, home);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /modified/i);
    assert.equal(releases(home).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("a source checkout never heals", () => {
  const home = mkdtempSync(join(tmpdir(), "marketing-heal-"));
  try {
    const r = run(repo, home);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /E_RUNTIME/);
    assert.equal(releases(home).length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
test("two launchers started together install once and both succeed", async () => {
  const root = mkdtempSync(join(tmpdir(), "marketing-heal-")),
    home = join(root, "home");
  try {
    const copy = pluginCopy(root);
    const start = () =>
      new Promise((done) => {
        const child = spawn(
          process.execPath,
          [join(copy, "scripts/run-managed.mjs"), "channels"],
          { env: { ...process.env, AGENT_MARKETING_HOME: home } },
        );
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.on("exit", (code) => done({ code, out }));
      });
    const [a, b] = await Promise.all([start(), start()]);
    assert.equal(a.code, 0);
    assert.equal(b.code, 0);
    assert.equal(releases(home).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("a lock from a dead process is cleared and a live one is waited on then reported", async () => {
  const root = mkdtempSync(join(tmpdir(), "marketing-heal-")),
    home = join(root, "home");
  try {
    const copy = pluginCopy(root);
    mkdirSync(home, { recursive: true });
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    writeFileSync(join(home, "setup.lock"), JSON.stringify({ pid: dead }));
    const healed = await healRuntime(copy, home, { timeoutMs: 2000 });
    assert.equal(healed.ok, true);
    assert.equal(existsSync(join(home, "setup.lock")), false);
    rmSync(join(home, "receipt.json"));
    writeFileSync(join(home, "setup.lock"), JSON.stringify({ pid: process.pid }));
    const blocked = await healRuntime(copy, home, { timeoutMs: 400 });
    assert.equal(blocked.ok, false);
    assert.match(blocked.errors.join(" "), /locked/i);
    assert.equal(existsSync(join(home, "setup.lock")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
