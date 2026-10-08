import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { ledger } from "./fixtures.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = async (url) => {
  try {
    return (await fetch(url + "/api/ping")).status === 200;
  } catch {
    return false;
  }
};
const within = (promise, ms) =>
  Promise.race([promise.then(() => true), sleep(ms).then(() => false)]);
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "marketing-idle-")), file = join(dir, "w.json");
  createWorkspace(file, ledger());
  return { dir, file };
}

test("the desk closes itself after the idle period with no requests", async () => {
  const { dir, file } = workspace();
  const running = await startServer(file, { port: 0, idleMs: 250 });
  try {
    assert.equal(await alive(running.url), true);
    assert.equal(await within(running.closed, 3000), true, "server should close when idle");
    assert.equal(await alive(running.url), false);
  } finally {
    running.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("any request, including the page heartbeat, restarts the idle clock", async () => {
  const { dir, file } = workspace();
  const running = await startServer(file, { port: 0, idleMs: 400 });
  try {
    for (let i = 0; i < 6; i++) {
      await sleep(150);
      assert.equal(await alive(running.url), true, `still serving after ping ${i}`);
    }
    assert.equal(await within(running.closed, 3000), true, "closes once the pings stop");
  } finally {
    running.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an idle period of zero keeps the desk running", async () => {
  const { dir, file } = workspace();
  const running = await startServer(file, { port: 0, idleMs: 0 });
  try {
    await sleep(500);
    assert.equal(await alive(running.url), true);
  } finally {
    await new Promise((r) => running.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the heartbeat endpoint reveals nothing and still enforces the local-only rule", async () => {
  const { dir, file } = workspace();
  const running = await startServer(file, { port: 0, idleMs: 0 });
  try {
    const response = await fetch(running.url + "/api/ping");
    assert.deepEqual(await response.json(), { ok: true });
    const foreign = await fetch(running.url + "/api/ping", { headers: { "Sec-Fetch-Site": "cross-site" } });
    assert.equal(foreign.status, 403);
  } finally {
    await new Promise((r) => running.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serve --idle-minutes exits cleanly and says why", async () => {
  const { dir, file } = workspace();
  try {
    const child = spawn(process.execPath, [resolve("scripts/marketing.mjs"), "serve", "--workspace", file, "--port", "0", "--idle-minutes", "0.01"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const code = await new Promise((r) => {
      const timer = setTimeout(() => { child.kill(); r("timeout"); }, 10000);
      child.on("exit", (c) => { clearTimeout(timer); r(c); });
    });
    assert.equal(code, 0, err);
    assert.match(JSON.parse(out).url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(err, /idle/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the desk page pings while visible and tells the owner if the desk has stopped", () => {
  const app = readFileSync("ui/app.js", "utf8");
  assert.match(app, /\/api\/ping/);
  assert.match(app, /visibilityState/);
  assert.match(app, /stopped/i);
});
