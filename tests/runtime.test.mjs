import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
