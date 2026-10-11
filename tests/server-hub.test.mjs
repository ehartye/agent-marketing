import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { ledger } from "./fixtures.mjs";

const option = (id, over = {}) => ({ id, label: `Option ${id}`, ...over });
const seeded = () => ({
  ...structuredClone(ledger()),
  initiatives: [
    ...ledger().initiatives,
    { ...ledger().initiatives[0], id: "blog", name: "Launch post", channel: "search", status: "planned", start: "2026-11-01", end: "2026-11-07", parentId: "video" },
  ],
  decisions: [
    {
      id: "banner",
      projectId: "game",
      initiativeId: "video",
      title: "Pick the store banner",
      question: "Which banner goes on the store page?",
      status: "open",
      needBy: "2026-10-15",
      options: [option("a"), option("b")],
    },
  ],
  actions: [{ id: "trailer", projectId: "game", title: "Record the trailer", owner: "owner", status: "todo", due: "2026-10-20" }],
  gates: [{ id: "playtest", projectId: "game", name: "Playtest", criteria: "5 of 8 finish", status: "open" }],
  updates: [],
});

// Runs a body against a desk serving a fresh seeded workspace; `post` sends JSON and returns
// { status, body }. Unless a test says otherwise the body carries the current revision.
async function desk(body, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-hub-")),
    file = join(dir, "w.json");
  createWorkspace(file, { ...seeded(), ...extra });
  let running;
  try {
    running = await startServer(file, { port: 0 });
    const base = running.url;
    const post = async (path, data, { revision = readWorkspace(file).revision, workspaceId } = {}) => {
      const payload = { ...data };
      if (revision !== null) payload.revision = revision;
      if (workspaceId !== undefined) payload.workspaceId = workspaceId;
      const r = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: r.status, body: await r.json() };
    };
    const get = async (path) => {
      const r = await fetch(base + path);
      return { status: r.status, body: await r.json() };
    };
    return await body({ file, base, post, get, read: () => readWorkspace(file) });
  } finally {
    if (running) await new Promise((resolve) => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("POST /api/decide records the choice, the rationale and an update, and returns them", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/decide", { decisionId: "banner", chosen: "b", rationale: "Reads best small" });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);
    assert.equal(r.body.record.status, "decided");
    assert.equal(r.body.record.chosen, "b");
    assert.equal(r.body.record.rationale, "Reads best small");
    assert.equal(r.body.update.kind, "decision");
    assert.equal(r.body.revision, 1);
    const w = read();
    assert.equal(w.decisions[0].chosen, "b");
    assert.equal(w.updates.length, 1);
  }));

test("deciding again needs change:true, which keeps the old choice in history", () =>
  desk(async ({ post, read }) => {
    await post("/api/decide", { decisionId: "banner", chosen: "a", rationale: "first" });
    const refused = await post("/api/decide", { decisionId: "banner", chosen: "b" });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /already decided/);
    const changed = await post("/api/decide", { decisionId: "banner", chosen: "b", rationale: "second", change: true });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.record.chosen, "b");
    assert.equal(read().decisions[0].history[0].chosen, "a");
  }));

test("POST /api/decide refuses bad input with the module's message and writes nothing", () =>
  desk(async ({ post, read }) => {
    const before = read().revision;
    for (const [data, pattern] of [
      [{ chosen: "a" }, /decisionId/],
      [{ decisionId: 7, chosen: "a" }, /decisionId must be text/],
      [{ decisionId: "banner" }, /Required: option/],
      [{ decisionId: "banner", chosen: "zzz" }, /not an option/],
      [{ decisionId: "banner", chosen: "a", rationale: 5 }, /rationale must be text/],
      [{ decisionId: "banner", chosen: "a", change: "yes" }, /change must be true or false/],
    ]) {
      const r = await post("/api/decide", data);
      assert.equal(r.status, 400, JSON.stringify(data));
      assert.match(r.body.error, pattern);
    }
    const unknown = await post("/api/decide", { decisionId: "nope", chosen: "a" });
    assert.equal(unknown.status, 404);
    assert.equal(read().revision, before);
  }));

test("POST /api/decide is refused for a stale revision, a missing revision and another workspace (all conflicts)", () =>
  desk(async ({ post, read }) => {
    const stale = await post("/api/decide", { decisionId: "banner", chosen: "a" }, { revision: 99 });
    assert.equal(stale.status, 409);
    const none = await post("/api/decide", { decisionId: "banner", chosen: "a" }, { revision: null });
    assert.equal(none.status, 409, "a write without a revision is told to reload, as /api/record is");
    assert.match(none.body.error, /revision/i);
    const other = await post("/api/decide", { decisionId: "banner", chosen: "a" }, { workspaceId: "not-this-one" });
    assert.equal(other.status, 409);
    assert.equal(read().decisions[0].status, "open");
  }));

test("POST /api/defer moves the date, logs it, and does nothing when already so", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/defer", { decisionId: "banner", until: "2026-10-30", reason: "waiting on the artist" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.status, "deferred");
    assert.equal(r.body.record.needBy, "2026-10-30");
    assert.match(r.body.update.text, /waiting on the artist/);
    const again = await post("/api/defer", { decisionId: "banner", until: "2026-10-30" });
    assert.equal(again.status, 200);
    assert.equal(again.body.changed, false);
    assert.equal(again.body.update, null);
    assert.equal(read().revision, 1);
    const bad = await post("/api/defer", { decisionId: "banner", until: "tomorrow" });
    assert.equal(bad.status, 400);
    const noId = await post("/api/defer", {});
    assert.equal(noId.status, 400);
    const badReason = await post("/api/defer", { decisionId: "banner", reason: ["x"] });
    assert.equal(badReason.status, 400);
  }));

test("POST /api/action changes an action's status; a repeat is a no-op; blocked keeps the reason", () =>
  desk(async ({ post, read }) => {
    const done = await post("/api/action", { id: "trailer", status: "done" });
    assert.equal(done.status, 200);
    assert.equal(done.body.record.status, "done");
    assert.ok(done.body.record.doneAt);
    assert.equal(done.body.update.kind, "action");
    const again = await post("/api/action", { id: "trailer", status: "done" });
    assert.equal(again.body.changed, false);
    const blocked = await post("/api/action", { id: "trailer", status: "blocked", notes: "needs the final build" });
    assert.equal(blocked.body.record.blockedBy, "needs the final build");
    assert.equal(read().actions[0].doneAt, undefined);
    for (const [data, code, pattern] of [
      [{ status: "done" }, 400, /id/],
      [{ id: "trailer", status: "finished" }, 400, /Action status must be one of/],
      [{ id: "trailer" }, 400, /status/],
      [{ id: "trailer", status: "done", notes: 3 }, 400, /notes must be text/],
      [{ id: "ghost", status: "done" }, 404, /does not exist/],
    ]) {
      const r = await post("/api/action", data);
      assert.equal(r.status, code, JSON.stringify(data));
      assert.match(r.body.error, pattern);
    }
    const stale = await post("/api/action", { id: "trailer", status: "doing" }, { revision: 0 });
    assert.equal(stale.status, 409);
  }));

test("POST /api/action/add creates an action under an initiative and refuses a taken id", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/action/add", { id: "write-post", title: "Write the post", initiativeId: "blog", due: "2026-10-25", hours: 2, owner: "owner", notes: "short" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.projectId, "game");
    assert.equal(r.body.record.status, "todo");
    assert.equal(r.body.record.hours, 2);
    assert.equal(r.body.record.initiativeId, "blog");
    assert.equal(read().actions.length, 2);
    const taken = await post("/api/action/add", { id: "write-post", title: "Again" });
    assert.equal(taken.status, 400);
    assert.match(taken.body.error, /already exists/);
    for (const data of [{ title: "No id" }, { id: "x" }, { id: "x", title: "T", hours: "two" }, { id: "x", title: "T", owner: 4 }, { id: "x", title: "T", due: "soon" }]) {
      const bad = await post("/api/action/add", data);
      assert.equal(bad.status, 400, JSON.stringify(data));
    }
    const ghost = await post("/api/action/add", { id: "y", title: "T", initiativeId: "ghost" });
    assert.equal(ghost.status, 404);
    assert.equal((await post("/api/action/add", { id: "z", title: "T" }, { revision: 0 })).status, 409);
    assert.equal(read().actions.length, 2);
  }));

test("POST /api/gate records a check with note and evidence, and can set the due date and hours", () =>
  desk(
    async ({ post, read }) => {
      const r = await post("/api/gate", { id: "playtest", status: "passed", notes: "6 of 8 finished", evidenceIds: ["e1"], due: "2026-10-18", hours: 3 });
      assert.equal(r.status, 200);
      assert.equal(r.body.record.status, "passed");
      assert.equal(r.body.record.notes, "6 of 8 finished");
      assert.deepEqual(r.body.record.evidenceIds, ["e1"]);
      assert.equal(r.body.record.due, "2026-10-18");
      assert.equal(r.body.record.hours, 3);
      assert.equal(r.body.update.kind, "gate");
      assert.deepEqual(r.body.warnings, []);
      const same = await post("/api/gate", { id: "playtest", status: "passed", due: "2026-10-18", hours: 3 });
      assert.equal(same.body.changed, false);
      const moved = await post("/api/gate", { id: "playtest", status: "passed", due: null, hours: null });
      assert.equal(moved.body.changed, true);
      assert.equal(read().gates[0].due, undefined);
      assert.equal(read().gates[0].hours, undefined);
    },
    { evidence: [{ id: "e1", projectId: "game", claim: "Six finished", dimension: "activation", result: "supports", strength: "primary", url: "https://example.com/x", checkedAt: "2026-10-11" }] },
  ));

test("POST /api/gate warns when a passed gate cites no evidence, and refuses bad input", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/gate", { id: "playtest", status: "passed" });
    assert.equal(r.status, 200);
    assert.match(r.body.warnings[0], /cites no evidence/);
    for (const [data, code, pattern] of [
      [{ status: "passed" }, 400, /id/],
      [{ id: "playtest", status: "maybe" }, 400, /Gate status must be one of/],
      [{ id: "playtest", status: "open", evidenceIds: "e1" }, 400, /evidenceIds must be a list/],
      [{ id: "playtest", status: "open", evidenceIds: [1] }, 400, /evidenceIds must be a list of text/],
      [{ id: "playtest", status: "open", hours: -1 }, 400, /hours/],
      [{ id: "playtest", status: "open", hours: "3" }, 400, /hours must be a number/],
      [{ id: "playtest", status: "open", due: "next week" }, 400, /due/],
      [{ id: "playtest", status: "open", evidenceIds: ["ghost"] }, 400, /ghost/],
      [{ id: "ghost", status: "open" }, 404, /does not exist/],
    ]) {
      const bad = await post("/api/gate", data);
      assert.equal(bad.status, code, JSON.stringify(data));
      assert.match(bad.body.error, pattern);
    }
    assert.equal(read().gates[0].status, "passed");
    assert.equal((await post("/api/gate", { id: "playtest", status: "open" }, { revision: 0 })).status, 409);
  }));

test("POST /api/update logs a note, naming the initiative, and refuses empty or mistyped input", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/update", { text: "Cut the first teaser", initiativeId: "video", kind: "note", refId: "trailer" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.text, "Cut the first teaser");
    assert.equal(r.body.record.initiativeId, "video");
    assert.equal(r.body.record.refId, "trailer");
    const bare = await post("/api/update", { text: "Just a note" });
    assert.equal(bare.status, 200);
    assert.equal(bare.body.record.projectId, "game");
    assert.equal(read().updates.length, 2);
    for (const [data, code, pattern] of [
      [{}, 400, /text/],
      [{ text: "" }, 400, /text/],
      [{ text: "x", kind: "gossip" }, 400, /Update kind must be one of/],
      [{ text: "x", initiativeId: 3 }, 400, /initiativeId must be text/],
      [{ text: "x", refId: {} }, 400, /refId must be text/],
      [{ text: "x", initiativeId: "ghost" }, 404, /does not exist/],
    ]) {
      const bad = await post("/api/update", data);
      assert.equal(bad.status, code, JSON.stringify(data));
      assert.match(bad.body.error, pattern);
    }
    assert.equal((await post("/api/update", { text: "x" }, { revision: 0 })).status, 409);
  }));

test("POST /api/update takes a project for a workspace with several", () =>
  desk(
    async ({ post }) => {
      const ambiguous = await post("/api/update", { text: "x" });
      assert.equal(ambiguous.status, 400);
      assert.match(ambiguous.body.error, /several projects/);
      const named = await post("/api/update", { text: "x", projectId: "other" });
      assert.equal(named.status, 200);
      assert.equal(named.body.record.projectId, "other");
    },
    { projects: [ledger().projects[0], { ...ledger().projects[0], id: "other", name: "Other" }] },
  ));

test("POST /api/initiative/note sets and clears the status line; a repeat is a no-op", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/initiative/note", { id: "video", note: "Teaser cut, waiting on captions" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.note, "Teaser cut, waiting on captions");
    assert.equal(r.body.update.kind, "initiative");
    assert.equal((await post("/api/initiative/note", { id: "video", note: "Teaser cut, waiting on captions" })).body.changed, false);
    const cleared = await post("/api/initiative/note", { id: "video", note: "" });
    assert.equal(cleared.body.changed, true);
    assert.equal(read().initiatives[0].note, undefined);
    for (const [data, code, pattern] of [
      [{ note: "x" }, 400, /id/],
      [{ id: "video" }, 400, /note/],
      [{ id: "video", note: 4 }, 400, /note must be text/],
      [{ id: "ghost", note: "x" }, 404, /does not exist/],
    ]) {
      const bad = await post("/api/initiative/note", data);
      assert.equal(bad.status, code, JSON.stringify(data));
      assert.match(bad.body.error, pattern);
    }
    assert.equal((await post("/api/initiative/note", { id: "video", note: "x" }, { revision: 0 })).status, 409);
  }));

test("the new routes need JSON and refuse foreign origins like the others", () =>
  desk(async ({ base, read }) => {
    const plain = await fetch(base + "/api/decide", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(plain.status, 415);
    const foreign = await fetch(base + "/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ decisionId: "banner", chosen: "a", revision: 0 }),
    });
    assert.equal(foreign.status, 403);
    const get = await fetch(base + "/api/decide");
    assert.equal(get.status, 404);
    assert.equal(read().decisions[0].status, "open");
  }));

test("GET /api/attention returns what needs the owner for a project and date", () =>
  desk(async ({ get }) => {
    const r = await get("/api/attention?projectId=game&today=2026-10-11");
    assert.equal(r.status, 200);
    assert.equal(r.body.projectId, "game");
    assert.equal(r.body.today, "2026-10-11");
    assert.equal(r.body.decisions[0].id, "banner");
    assert.equal(r.body.decisions[0].daysLeft, 4);
    assert.equal(r.body.actions[0].id, "trailer", "due in nine days is inside the 14-day window");
    assert.equal(r.body.actions[0].daysLeft, 9);
    assert.equal(r.body.summary.decisions, 1);
    const defaulted = await get("/api/attention?projectId=game");
    assert.equal(defaulted.status, 200);
    assert.match(defaulted.body.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await get("/api/attention")).body, null, "no project, nothing to say");
    const badDate = await get("/api/attention?projectId=game&today=yesterday");
    assert.equal(badDate.status, 400);
    assert.match(badDate.body.error, /today must be a real/);
    assert.equal((await get("/api/attention?projectId=ghost")).status, 400);
  }));

test("GET /api/plan carries parents, rollups, progress and the gate hours in their weeks", () =>
  desk(async ({ get, post }) => {
    await post("/api/gate", { id: "playtest", status: "open", due: "2026-10-13", hours: 2 });
    await post("/api/action", { id: "trailer", status: "done" });
    const r = await get("/api/plan?projectId=game");
    assert.equal(r.status, 200);
    const parent = r.body.initiatives.find((i) => i.id === "video");
    assert.deepEqual(parent.children, ["blog"]);
    assert.ok(parent.rollup);
    assert.equal(parent.rollup.start, "2026-11-01");
    assert.ok(parent.progress);
    assert.equal(r.body.initiatives.find((i) => i.id === "blog").parentId, "video");
    assert.equal(r.body.load.gateHours, 2);
    assert.ok(r.body.load.weeks.some((w) => w.gates.some((g) => g.id === "playtest" && g.hours === 2)));
    assert.equal(r.body.gates[0].hours, 2);
    assert.equal(r.body.gates[0].due, "2026-10-13");
  }));

test("the generic record route still works beside the new ones", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/record", { collection: "actions", record: { id: "other", projectId: "game", title: "Other", owner: "agent", status: "todo" } });
    assert.equal(r.status, 200);
    assert.equal(read().actions.length, 2);
  }));
