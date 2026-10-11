import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { addAction } from "../src/progress.mjs";
import { ledger, project } from "./fixtures.mjs";

const decision = {
  id: "banner",
  projectId: "game",
  title: "Pick the store banner",
  question: "Which banner?",
  status: "open",
  needBy: "2026-10-15",
  recommendation: "Take a",
  options: [
    { id: "a", label: "Bold", time: "1h", risk: "low", complexity: "low", bestPractice: "ok", maintainability: "easy" },
    { id: "b", label: "Quiet" },
  ],
};
const gate = { id: "playtest", projectId: "game", name: "Playtest", criteria: "5 of 8", status: "open", due: "2026-10-12" };
const evidence = { id: "e1", projectId: "game", claim: "c", dimension: "activation", result: "supports", strength: "primary", url: "https://example.com", checkedAt: "2026-10-11" };

// Runs `body(run, file, dir)`; run(...args) spawns the CLI on the workspace and parses its output.
function withCli(body, seed = {}) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-cli-progress-")),
    file = join(dir, "w.json");
  try {
    createWorkspace(file, { ...structuredClone(ledger()), decisions: [decision], gates: [gate], evidence: [evidence], ...seed });
    const run = (...args) => {
      const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
      return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr ? JSON.parse(r.stderr) : null };
    };
    return body(run, file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("decide settles a decision and prints the record and the log entry", () =>
  withCli((run, file) => {
    const r = run("decide", "banner", "--option", "a", "--rationale", "Reads best small");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.equal(r.out.record.status, "decided");
    assert.equal(r.out.record.chosen, "a");
    assert.equal(r.out.record.rationale, "Reads best small");
    assert.ok(r.out.record.decidedAt);
    assert.equal(r.out.update.kind, "decision");
    assert.equal(r.out.changed, true);
    assert.equal(r.out.revision, 1);
    assert.equal(readWorkspace(file).updates.length, 1);
  }));

test("decide refuses a second choice until --change, which keeps the history", () =>
  withCli((run, file) => {
    assert.equal(run("decide", "banner", "--option", "a").status, 0);
    const refused = run("decide", "banner", "--option", "b");
    assert.equal(refused.status, 2);
    assert.match(refused.err.error.message, /already decided/);
    assert.equal(readWorkspace(file).decisions[0].chosen, "a");
    const changed = run("decide", "banner", "--option", "b", "--change");
    assert.equal(changed.status, 0);
    assert.equal(changed.out.record.history.length, 1);
    assert.equal(changed.out.record.history[0].chosen, "a");
  }));

test("decide reports a missing option or decision as a command error", () =>
  withCli((run) => {
    assert.match(run("decide", "banner").err.error.message, /option/);
    assert.match(run("decide", "nope", "--option", "a").err.error.message, /does not exist/);
    assert.match(run("decide").err.error.message, /Required/);
  }));

test("decide honours --revision", () =>
  withCli((run) => {
    const stale = run("decide", "banner", "--option", "a", "--revision", "5");
    assert.equal(stale.status, 2);
    assert.match(stale.err.error.message, /Revision conflict/);
    assert.equal(run("decide", "banner", "--option", "a", "--revision", "0").status, 0);
  }));

test("defer parks a decision with a new date and a note", () =>
  withCli((run) => {
    const r = run("defer", "banner", "--until", "2026-11-01", "--note", "waiting for the playtest");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.equal(r.out.record.status, "deferred");
    assert.equal(r.out.record.needBy, "2026-11-01");
    assert.match(r.out.update.text, /waiting for the playtest/);
    assert.equal(run("defer", "banner", "--until", "2026-13-01").status, 2);
  }));

test("action add creates an action with its references, and refuses an existing id", () =>
  withCli((run, file) => {
    const r = run("action", "add", "--id", "trailer", "--title", "Record the trailer", "--owner", "owner", "--due", "2026-10-14", "--initiative", "video", "--gate", "playtest", "--decision", "banner", "--hours", "1.5");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.deepEqual(r.out.record, {
      id: "trailer",
      projectId: "game",
      initiativeId: "video",
      gateId: "playtest",
      decisionId: "banner",
      title: "Record the trailer",
      owner: "owner",
      status: "todo",
      due: "2026-10-14",
      hours: 1.5,
    });
    assert.equal(readWorkspace(file).actions.length, 1);
    assert.equal(readWorkspace(file).updates[0].kind, "action");
    const again = run("action", "add", "--id", "trailer", "--title", "x");
    assert.equal(again.status, 2);
    assert.match(again.err.error.message, /already exists/);
  }));

test("action add defaults to the owner and the only project, and checks its references", () =>
  withCli((run) => {
    const r = run("action", "add", "--id", "a1", "--title", "Do it");
    assert.equal(r.out.record.owner, "owner");
    assert.equal(r.out.record.projectId, "game");
    assert.equal(run("action", "add", "--id", "a2", "--title", "x", "--owner", "intern").status, 2);
    assert.equal(run("action", "add", "--id", "a3", "--title", "x", "--gate", "ghost").status, 2);
    assert.equal(run("action", "add", "--id", "a4", "--title", "x", "--hours", "lots").status, 2);
    assert.match(run("action", "add", "--title", "x").err.error.message, /Required: --id/);
    assert.match(run("action", "add", "--id", "a5").err.error.message, /Required: --title/);
  }));

test("action status moves an action and stamps doneAt", () =>
  withCli(
    (run) => {
      const done = run("action", "status", "trailer", "done", "--note", "Posted");
      assert.equal(done.status, 0, JSON.stringify(done.err));
      assert.equal(done.out.record.status, "done");
      assert.ok(done.out.record.doneAt);
      assert.equal(done.out.record.notes, "Posted");
      const again = run("action", "status", "trailer", "done");
      assert.equal(again.out.changed, false);
      assert.equal(run("action", "status", "trailer", "finished").status, 2);
      assert.equal(run("action", "status", "ghost", "done").status, 2);
      assert.equal(run("action", "bogus").status, 2);
    },
    { actions: [{ id: "trailer", projectId: "game", title: "Record the trailer", owner: "owner", status: "todo" }] },
  ));

test("gate set records the check and warns when a passed gate has no evidence", () =>
  withCli((run, file) => {
    const bare = run("gate", "set", "playtest", "--status", "passed");
    assert.equal(bare.status, 0, JSON.stringify(bare.err));
    assert.equal(bare.out.record.status, "passed");
    assert.match(bare.out.record.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(bare.out.warnings, ['Gate "playtest" is passed but cites no evidence']);
    const cited = run("gate", "set", "playtest", "--status", "passed", "--note", "6 of 8", "--evidence", "e1");
    assert.deepEqual(cited.out.record.evidenceIds, ["e1"]);
    assert.deepEqual(cited.out.warnings, []);
    assert.equal(readWorkspace(file).updates.length, 2);
    assert.equal(run("gate", "set", "playtest", "--status", "great").status, 2);
    assert.equal(run("gate", "set", "playtest").status, 2);
    assert.equal(run("gate", "set", "playtest", "--status", "passed", "--evidence", "ghost").status, 2);
    assert.equal(run("gate", "get", "playtest").status, 2);
  }));

test("update add logs a note against an initiative or the project", () =>
  withCli((run) => {
    const r = run("update", "add", "--text", "Cut the first teaser", "--initiative", "video");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.equal(r.out.record.kind, "note");
    assert.equal(r.out.record.initiativeId, "video");
    const doc = run("update", "add", "--text", "Saved the memo", "--kind", "document", "--ref", "memo");
    assert.equal(doc.out.record.kind, "document");
    assert.equal(doc.out.record.refId, "memo");
    assert.equal(run("update", "add", "--text", "x", "--kind", "rumor").status, 2);
    assert.match(run("update", "add").err.error.message, /Required: --text/);
    assert.equal(run("update", "list").status, 2);
  }));

test("next prints what needs the owner, with an injected date", () =>
  withCli((run) => {
    const r = run("next", "game", "--today", "2026-10-13");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.equal(r.out.today, "2026-10-13");
    assert.equal(r.out.decisions[0].id, "banner");
    assert.equal(r.out.decisions[0].daysLeft, 2);
    assert.equal(r.out.decisions[0].recommendation, "Take a");
    assert.equal(r.out.gates[0].id, "playtest");
    assert.equal(r.out.gates[0].daysLeft, -1);
    assert.equal(r.out.summary.total, 2);
    const bare = run("next", "--today", "2026-10-13");
    assert.equal(bare.out.projectId, "game", "the only project is used");
    assert.equal(run("next", "--today", "tomorrow").status, 2);
    assert.equal(run("next", "nope", "--today", "2026-10-13").status, 2);
  }));

test("next without a project asks which one when there are several", () =>
  withCli(
    (run) => {
      const r = run("next");
      assert.equal(r.status, 2);
      assert.match(r.err.error.message, /several projects.*game, other/i);
      assert.equal(run("next", "--project", "other", "--today", "2026-10-13").out.projectId, "other");
    },
    { projects: [project, { ...project, id: "other" }] },
  ));

test("next with no projects explains what to do", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-cli-empty-")),
    file = join(dir, "w.json");
  try {
    createWorkspace(file);
    const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "next", "--workspace", file], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stderr).error.message, /no projects/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("put accepts the new collections and the new fields", () =>
  withCli((run, file, dir) => {
    const record = join(dir, "record.json");
    writeFileSync(record, JSON.stringify({ id: "u-1", projectId: "game", at: "2026-10-11T09:00:00.000Z", kind: "note", text: "hi" }));
    const r = run("put", "updates", record, "--strict");
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.deepEqual(r.out.warnings, []);
    assert.equal(r.out.updates.length, 1);
    writeFileSync(record, JSON.stringify({ id: "memo", projectId: "game", title: "Memo", markdown: "# Memo", updatedAt: "2026-10-11T09:00:00.000Z", initiativeId: "video", gateId: "playtest", decisionId: "banner" }));
    assert.equal(run("put", "reports", record, "--strict").status, 0);
    writeFileSync(record, JSON.stringify({ id: "banner", projectId: "game", title: "t", question: "q", status: "open", options: [{ id: "a", label: "A", risks: "x" }] }));
    assert.equal(run("put", "decisions", record, "--strict").status, 2, "a misspelled option field is refused in strict mode");
    assert.equal(run("put", "decisions", record).status, 0);
    assert.equal(run("validate", "--strict").status, 2);
  }));

test("validate counts the new collections and the help lists the new commands", () =>
  withCli((run) => {
    const v = run("validate");
    assert.deepEqual([v.out.records.decisions, v.out.records.actions, v.out.records.updates], [1, 0, 0]);
    const help = run("help").out.commands.join("\n");
    for (const command of ["decide <decision-id>", "defer <decision-id>", "action add", "action status", "gate set", "update add", "next [project-id]"])
      assert.ok(help.includes(command), command);
  }));

test("addAction is a store function too: it logs the new action in the same write", () =>
  withCli((run, file) => {
    const out = addAction(file, { id: "a1", title: "Do it", initiativeId: "video", now: "2026-10-11T10:00:00.000Z" });
    assert.equal(out.record.projectId, "game");
    assert.equal(out.update.refId, "a1");
    assert.equal(out.update.initiativeId, "video");
    assert.throws(() => addAction(file, { id: "a1", title: "again" }), /already exists/);
  }));
