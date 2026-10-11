import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { ledger } from "./fixtures.mjs";

function withCli(body, prepare) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-cli-review-")),
    file = join(dir, "w.json");
  try {
    const w = structuredClone(ledger());
    prepare?.(w);
    createWorkspace(file, w);
    const run = (...args) => {
      const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
      return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr ? JSON.parse(r.stderr) : null };
    };
    return body(run, file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const withGate = (w) => {
  w.gates = [{ id: "g1", projectId: "game", name: "Playtest", criteria: "five finish", status: "open", due: "2026-10-20", hours: 3 }];
};

test("action add passes --status through and refuses one it does not know", () =>
  withCli((run, file) => {
    const doing = run("action", "add", "--id", "a1", "--title", "Write the post", "--status", "doing");
    assert.equal(doing.status, 0, JSON.stringify(doing.err));
    assert.equal(doing.out.record.status, "doing");
    assert.equal(readWorkspace(file).actions[0].status, "doing");
    const done = run("action", "add", "--id", "a2", "--title", "Already done", "--status", "done");
    assert.equal(done.status, 0, JSON.stringify(done.err));
    assert.equal(done.out.record.status, "done");
    assert.match(done.out.record.doneAt, /^\d{4}-\d{2}-\d{2}T/, "a done action says when");
    const bad = run("action", "add", "--id", "a3", "--title", "Nope", "--status", "bogus");
    assert.equal(bad.status, 2);
    assert.match(bad.err.error.message, /Action status must be one of todo, doing, done, blocked, dropped/);
    assert.equal(readWorkspace(file).actions.length, 2);
  }));

test("a number option that is empty or not a number is refused, not turned into 0", () =>
  withCli((run, file) => {
    for (const bad of ["", " ", "abc", "1h", "NaN", "Infinity"]) {
      const r = run("action", "add", "--id", "a1", "--title", "T", `--hours=${bad}`);
      assert.equal(r.status, 2, JSON.stringify(bad));
      assert.match(r.err.error.message, /^--hours must be a number/, JSON.stringify(bad));
    }
    const negative = run("action", "add", "--id", "a1", "--title", "T", "--hours=-2");
    assert.equal(negative.status, 2);
    assert.equal(readWorkspace(file).actions.length, 0);
    const ok = run("action", "add", "--id", "a1", "--title", "T", "--hours", "1.5");
    assert.equal(ok.out.record.hours, 1.5);
    const zero = run("action", "add", "--id", "a2", "--title", "T", "--hours", "0");
    assert.equal(zero.out.record.hours, 0);
  }));

test("a revision that is not a whole number says so", () =>
  withCli((run) => {
    for (const command of [
      ["decide", "x", "--option", "a"],
      ["action", "add", "--id", "a1", "--title", "T"],
      ["asset", "slot", "add", "--id", "s", "--name", "S", "--kind", "image"],
      ["put", "projects", "nofile.json"],
    ]) {
      for (const bad of ["abc", "", "1.5", "-1"]) {
        const r = run(...command, `--revision=${bad}`);
        assert.equal(r.status, 2, `${command[0]} ${JSON.stringify(bad)}`);
        assert.match(r.err.error.message, /^--revision must be a whole number of 0 or more/, `${command[0]} ${JSON.stringify(bad)}: ${r.err.error.message}`);
      }
    }
    const saved = run("document", "save", "report", "r", "nofile.md", "--title", "T", "--revision=abc");
    assert.match(saved.err.error.message, /^--revision must be a whole number/);
  }));

test("asset list refuses a status it does not know, and filters by a real one", () =>
  withCli((run) => {
    run("asset", "slot", "add", "--id", "capsule", "--name", "Capsule", "--kind", "link");
    run("asset", "add", "--slot", "capsule", "--label", "A", "--url", "https://example.com/a", "--id", "a");
    const bad = run("asset", "list", "--status", "bogus");
    assert.equal(bad.status, 2);
    assert.match(bad.err.error.message, /^--status must be one of candidate, selected, rejected, retired/);
    assert.equal(run("asset", "list", "--status", "candidate").out.assets.length, 1);
    assert.equal(run("asset", "list", "--status", "selected").out.assets.length, 0);
  }));

test("gate set can clear its due date and hours with none, and refuses nonsense", () =>
  withCli((run, file) => {
    const kept = run("gate", "set", "g1", "--status", "open", "--note", "still waiting");
    assert.equal(kept.out.record.due, "2026-10-20");
    assert.equal(kept.out.record.hours, 3);
    const cleared = run("gate", "set", "g1", "--status", "open", "--due", "none", "--hours", "none");
    assert.equal(cleared.status, 0, JSON.stringify(cleared.err));
    assert.equal(cleared.out.record.due, undefined);
    assert.equal(cleared.out.record.hours, undefined);
    assert.equal(readWorkspace(file).gates[0].due, undefined);
    const again = run("gate", "set", "g1", "--status", "open", "--due", "2026-11-01", "--hours", "2");
    assert.equal(again.out.record.due, "2026-11-01");
    assert.equal(again.out.record.hours, 2);
    const bad = run("gate", "set", "g1", "--status", "open", "--hours=");
    assert.equal(bad.status, 2);
    assert.match(bad.err.error.message, /^--hours must be a number/);
    const worse = run("gate", "set", "g1", "--status", "open", "--due", "Friday");
    assert.equal(worse.status, 2);
    assert.match(worse.err.error.message, /gates\.g1\.due: "Friday" is not a YYYY-MM-DD date/);
  }, withGate));

test("asset slot add --waiting-on, and asset slot set to change or clear it", () =>
  withCli((run, file) => {
    const added = run("asset", "slot", "add", "--id", "capsule", "--name", "Steam capsule", "--kind", "image", "--waiting-on", "five-second tests, Nov 23-25");
    assert.equal(added.status, 0, JSON.stringify(added.err));
    assert.equal(added.out.record.waitingOn, "five-second tests, Nov 23-25");
    const changed = run("asset", "slot", "set", "capsule", "--waiting-on", "the artist", "--spec", "1232x706", "--note", "logo clear");
    assert.equal(changed.status, 0, JSON.stringify(changed.err));
    assert.equal(changed.out.record.waitingOn, "the artist");
    assert.equal(changed.out.record.spec, "1232x706");
    assert.equal(changed.out.record.notes, "logo clear");
    assert.equal(changed.out.update.kind, "asset");
    assert.equal(changed.out.update.refId, "capsule");
    assert.equal(changed.out.changed, true);
    const same = run("asset", "slot", "set", "capsule", "--waiting-on", "the artist");
    assert.equal(same.out.changed, false);
    const cleared = run("asset", "slot", "set", "capsule", "--waiting-on", "none");
    assert.equal(cleared.status, 0, JSON.stringify(cleared.err));
    assert.equal(cleared.out.record.waitingOn, undefined);
    assert.equal(readWorkspace(file).assetSlots[0].waitingOn, undefined);
    assert.equal(run("asset", "slot", "set", "capsule").status, 2);
    assert.match(run("asset", "slot", "set", "capsule").err.error.message, /Nothing to change/);
    assert.equal(run("asset", "slot", "set").status, 2);
    assert.match(run("asset", "slot", "set", "ghost", "--spec", "x").err.error.message, /Asset slot "ghost" does not exist/);
  }));

test("help lists the new commands and options", () => {
  const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "help"], { encoding: "utf8" });
  const text = JSON.parse(r.stdout).commands.join("\n");
  assert.match(text, /asset slot set <slot-id>/);
  assert.match(text, /--waiting-on/);
  assert.match(text, /gate set <gate-id>.*--due YYYY-MM-DD\|none.*--hours n\|none/);
  assert.match(text, /action add .*--status todo\|doing\|done\|blocked\|dropped/);
});
