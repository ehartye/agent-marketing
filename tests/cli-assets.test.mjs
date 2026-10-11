import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { assetsDir } from "../src/assets.mjs";
import { ledger } from "./fixtures.mjs";
import { png, jpeg } from "./images.mjs";

// Runs `body(run, file, src)`; run(...args) spawns the CLI on a temp workspace and parses its output.
function withCli(body) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-cli-assets-")),
    file = join(dir, "hull.json"),
    srcDir = join(dir, "src");
  mkdirSync(srcDir);
  try {
    createWorkspace(file, structuredClone(ledger()));
    const run = (...args) => {
      const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
      return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr ? JSON.parse(r.stderr) : null };
    };
    const src = (name, buffer) => {
      const path = join(srcDir, name);
      writeFileSync(path, buffer);
      return path;
    };
    return body(run, file, src);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("collateral end to end: slot, candidates, a pick, a re-pick, a reject and the list", () =>
  withCli((run, file, src) => {
    const slot = run("asset", "slot", "add", "--id", "capsule", "--name", "Steam main capsule", "--kind", "image", "--spec", "1232x706 PNG", "--initiative", "video");
    assert.equal(slot.status, 0, JSON.stringify(slot.err));
    assert.equal(slot.out.record.status, "open");
    assert.equal(slot.out.record.spec, "1232x706 PNG");
    assert.equal(slot.out.update.kind, "asset");
    assert.equal(slot.out.workspace, file);

    const first = run("asset", "add", "--slot", "capsule", "--label", "Pixel composite v3", "--file", src("v3.png", png(1232, 706, 3)), "--source", "agent pixel composite v3", "--id", "v3");
    assert.equal(first.status, 0, JSON.stringify(first.err));
    assert.equal(first.out.record.file, "capsule/v3.png");
    assert.equal(first.out.record.width, 1232);
    assert.equal(first.out.record.height, 706);
    assert.equal(first.out.record.status, "candidate");
    assert.match(first.out.record.sha256, /^[0-9a-f]{64}$/);
    assert.ok(existsSync(join(assetsDir(file), "capsule", "v3.png")));

    const second = run("asset", "add", "--slot", "capsule", "--label", "Painted v1", "--file", src("v1.jpg", jpeg(100, 50, 1)), "--id", "v1");
    assert.equal(second.status, 0, JSON.stringify(second.err));
    assert.equal(second.out.record.mediaType, "image/jpeg");
    const link = run("asset", "add", "--slot", "capsule", "--label", "Artifact preview", "--url", "https://claude.ai/artifact/abc", "--id", "preview");
    assert.equal(link.out.record.kind, "link");
    const copy = run("asset", "add", "--slot", "capsule", "--label", "Alt text", "--text", "A tiny planet", "--id", "alt");
    assert.equal(copy.out.record.text, "A tiny planet");

    const next = run("next", "game", "--today", "2026-10-11");
    assert.equal(next.out.picks.length, 1);
    assert.equal(next.out.picks[0].slotId, "capsule");
    assert.equal(next.out.picks[0].candidates, 4);
    assert.equal(next.out.summary.picks, 1);

    const pick = run("asset", "pick", "v3", "--rationale", "Reads best at thumbnail size");
    assert.equal(pick.status, 0, JSON.stringify(pick.err));
    assert.equal(pick.out.record.status, "selected");
    assert.equal(pick.out.slot.status, "picked");
    assert.equal(pick.out.decision.chosen, "v3");
    assert.equal(pick.out.decision.options.length, 4);
    assert.equal(pick.out.update.kind, "asset");
    assert.equal(run("next", "game", "--today", "2026-10-11").out.picks.length, 0);

    const again = run("asset", "pick", "v1", "--rationale", "Warmer");
    assert.equal(again.out.decision.history.length, 1);
    assert.equal(again.out.decision.history[0].chosen, "v3");
    assert.equal(run("asset", "pick", "v1", "--rationale", "Warmer").out.changed, false);

    const refused = run("asset", "reject", "v3");
    assert.equal(refused.status, 2);
    assert.match(refused.err.error.message, /Required: --rationale/);
    const rejected = run("asset", "reject", "v3", "--rationale", "Text unreadable at 231px");
    assert.equal(rejected.status, 0, JSON.stringify(rejected.err));
    assert.equal(rejected.out.record.status, "rejected");
    assert.ok(existsSync(join(assetsDir(file), "capsule", "v3.png")), "rejected files are kept");

    assert.equal(run("asset", "retire", "preview", "--rationale", "superseded by v1").out.record.status, "retired");
    assert.equal(run("asset", "restore", "preview").out.record.status, "candidate");
    assert.equal(run("asset", "restore", "preview").out.changed, false);

    const all = run("asset", "list");
    assert.equal(all.status, 0);
    assert.equal(all.out.slots.length, 1);
    assert.deepEqual(all.out.assets.map((a) => a.id), ["v3", "v1", "preview", "alt"]);
    assert.deepEqual(run("asset", "list", "--status", "rejected").out.assets.map((a) => a.id), ["v3"]);
    assert.deepEqual(run("asset", "list", "--slot", "capsule", "--status", "selected").out.assets.map((a) => a.id), ["v1"]);
    assert.deepEqual(run("asset", "list", "--project", "ghost").out.assets, []);

    const w = readWorkspace(file);
    assert.equal(w.assets.length, 4);
    assert.ok(w.updates.every((u) => u.kind === "asset"));
    const validate = run("validate", "--strict");
    assert.equal(validate.status, 0, JSON.stringify(validate.err));
    assert.equal(validate.out.records.assets, 4);
    assert.equal(validate.out.records.assetSlots, 1);
    assert.deepEqual(validate.out.warnings, []);
  }));

test("collateral commands report missing input and refused files as command errors", () =>
  withCli((run, file, src) => {
    assert.equal(run("asset", "slot", "add", "--id", "capsule", "--name", "Capsule", "--kind", "image").status, 0);
    const before = readFileSync(file, "utf8");
    const code = (r) => [r.status, r.err.error.code];
    assert.deepEqual(code(run("asset", "slot", "add", "--name", "x", "--kind", "image")), [2, "E_COMMAND"]);
    assert.match(run("asset", "slot", "add", "--id", "z", "--name", "x", "--kind", "audio").err.error.message, /kind must be one of/);
    assert.match(run("asset", "add", "--label", "x", "--url", "https://example.com/x").err.error.message, /Required: --slot/);
    assert.match(run("asset", "add", "--slot", "capsule", "--url", "https://example.com/x").err.error.message, /Required: --label/);
    assert.match(run("asset", "add", "--slot", "capsule", "--label", "x").err.error.message, /exactly one of a file, a url or text/);
    assert.match(run("asset", "add", "--slot", "capsule", "--label", "x", "--url", "http://example.com").err.error.message, /https/);
    assert.match(run("asset", "add", "--slot", "capsule", "--label", "x", "--file", src("x.svg", Buffer.from("<svg/>"))).err.error.message, /must be one of/);
    assert.match(run("asset", "add", "--slot", "capsule", "--label", "x", "--file", src("x.png", jpeg())).err.error.message, /looks like image\/jpeg/);
    assert.match(run("asset", "add", "--slot", "capsule", "--label", "x", "--file", "no-such-file.png").err.error.message, /does not exist/);
    assert.match(run("asset", "add", "--slot", "ghost", "--label", "x", "--url", "https://example.com/x").err.error.message, /Asset slot "ghost" does not exist/);
    assert.match(run("asset", "pick", "ghost").err.error.message, /Asset "ghost" does not exist/);
    assert.match(run("asset", "pick").err.error.message, /Required: asset ID/);
    assert.match(run("asset", "bogus").err.error.message, /Unknown asset command: bogus/);
    assert.match(run("asset").err.error.message, /Unknown asset command: \(none\)/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(existsSync(assetsDir(file)), false);
  }));

test("a duplicate file and a stale revision are refused through the CLI too", () =>
  withCli((run, file, src) => {
    run("asset", "slot", "add", "--id", "capsule", "--name", "Capsule", "--kind", "image");
    const path = src("a.png", png(4, 4, 1));
    assert.equal(run("asset", "add", "--slot", "capsule", "--label", "A", "--file", path, "--id", "a").status, 0);
    const dup = run("asset", "add", "--slot", "capsule", "--label", "A again", "--file", path);
    assert.equal(dup.status, 2);
    assert.match(dup.err.error.message, /already has this file as asset "a"/);
    const stale = run("asset", "pick", "a", "--revision", "0");
    assert.equal(stale.status, 2);
    assert.match(stale.err.error.message, /Revision conflict/);
    assert.equal(run("asset", "pick", "a", "--revision", "2").out.revision, 3);
  }));

test("help lists the asset commands", () => {
  const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "help"], { encoding: "utf8" });
  const lines = JSON.parse(r.stdout).commands.filter((c) => c.startsWith("asset "));
  assert.deepEqual(lines.map((c) => c.split(" ").slice(0, 2).join(" ")), ["asset slot", "asset add", "asset pick", "asset reject", "asset restore", "asset retire", "asset list"]);
});
