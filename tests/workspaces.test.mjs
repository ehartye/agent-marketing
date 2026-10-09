import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { workspaceCatalog } from "../src/catalog.mjs";
import { ledger } from "./fixtures.mjs";

function setup() {
  const home = mkdtempSync(join(tmpdir(), "marketing-switch-"));
  const studio = join(home, "studio", "workspace.json"), folder = join(home, "workspaces");
  mkdirSync(join(home, "studio"));
  mkdirSync(folder);
  createWorkspace(studio, { ...ledger(), projects: [], initiatives: [], observations: [], reactions: [], competitors: [], experiments: [], evidence: [], sources: [] });
  createWorkspace(join(folder, "alpha.json"), ledger());
  writeFileSync(join(folder, "broken.json"), "{ not json");
  writeFileSync(join(folder, "notes.txt"), "ignored");
  return { home, studio, folder, catalog: { studio, folder } };
}
const get = async (url, path) => (await fetch(url + path)).json();
const post = (url, path, body) =>
  fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("the catalog lists the studio, the folder's json files and the launch file once", () => {
  const { home, studio, folder, catalog } = setup();
  try {
    const entries = workspaceCatalog(join(folder, "alpha.json"), catalog);
    assert.deepEqual(entries.map((e) => e.id), ["studio", "ws:alpha", "ws:broken"]);
    const outside = join(home, "elsewhere.json");
    const withOutside = workspaceCatalog(outside, catalog);
    assert.equal(withOutside.at(-1).id, "launch");
    assert.deepEqual(workspaceCatalog(studio, {}).map((e) => e.id), ["launch"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the desk lists workspaces, shows invalid ones as unavailable, and marks the current one", async () => {
  const { home, folder, catalog } = setup();
  const running = await startServer(join(folder, "alpha.json"), { port: 0, idleMs: 0, catalog });
  try {
    const list = await get(running.url, "/api/workspaces");
    assert.equal(list.current, "ws:alpha");
    const by = Object.fromEntries(list.workspaces.map((w) => [w.id, w]));
    assert.equal(by.studio.available, true);
    assert.equal(by.studio.projects, 0);
    assert.equal(by["ws:alpha"].current, true);
    assert.ok(by["ws:alpha"].projects > 0);
    assert.equal(by["ws:broken"].available, false);
    assert.ok(by["ws:broken"].reason);
  } finally {
    running.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("selecting a listed workspace changes what the desk serves; unknown ids and paths are refused", async () => {
  const { home, studio, folder, catalog } = setup();
  const running = await startServer(join(folder, "alpha.json"), { port: 0, idleMs: 0, catalog });
  try {
    assert.ok((await get(running.url, "/api/workspace")).projects.length > 0);
    const switched = await post(running.url, "/api/workspace/select", { id: "studio" });
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).current, "studio");
    assert.equal((await get(running.url, "/api/workspace")).projects.length, 0);
    for (const id of ["nope", studio, "../studio/workspace.json", undefined]) {
      const refused = await post(running.url, "/api/workspace/select", { id });
      assert.equal(refused.status, 404, String(id));
    }
    const broken = await post(running.url, "/api/workspace/select", { id: "ws:broken" });
    assert.equal(broken.status, 400);
    assert.equal((await get(running.url, "/api/workspaces")).current, "studio");
  } finally {
    running.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("a write that names a stale workspace is rejected and changes nothing", async () => {
  const { home, folder, catalog } = setup();
  const alpha = join(folder, "alpha.json");
  const running = await startServer(alpha, { port: 0, idleMs: 0, catalog });
  try {
    const before = readFileSync(alpha, "utf8");
    const w = await get(running.url, "/api/workspace");
    await post(running.url, "/api/workspace/select", { id: "studio" });
    const record = { ...w.initiatives[0], status: "paused" };
    const stale = await post(running.url, "/api/record", { workspaceId: "ws:alpha", collection: "initiatives", record, revision: w.revision });
    assert.equal(stale.status, 409);
    assert.equal(readFileSync(alpha, "utf8"), before);
    await post(running.url, "/api/workspace/select", { id: "ws:alpha" });
    const fresh = await post(running.url, "/api/record", { workspaceId: "ws:alpha", collection: "initiatives", record, revision: w.revision });
    assert.equal(fresh.status, 200);
    assert.equal(readWorkspace(alpha).initiatives.find((i) => i.id === record.id).status, "paused");
  } finally {
    running.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("without a catalog the desk lists only its launch file and still serves it", async () => {
  const { home, folder } = setup();
  const running = await startServer(join(folder, "alpha.json"), { port: 0, idleMs: 0 });
  try {
    const list = await get(running.url, "/api/workspaces");
    assert.deepEqual(list.workspaces.map((w) => w.id), ["launch"]);
    assert.equal(list.current, "launch");
    assert.ok((await get(running.url, "/api/workspace")).projects.length > 0);
  } finally {
    running.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});
