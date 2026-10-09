import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { ledger } from "./fixtures.mjs";
import { saveDocument, saveReport } from "../src/documents.mjs";
test("UI shares ledger, detects stale edits, rejects foreign origins, and exports persisted data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-ui-")),
    file = join(dir, "w.json");
  createWorkspace(file, ledger());
  let running;
  try {
    running = await startServer(file, { port: 0 });
    const base = running.url;
    let r = await fetch(base + "/api/workspace");
    assert.equal(r.status, 200);
    const w = await r.json();
    assert.equal(w.projects[0].name, "Orbit Garden");
    const record = { ...w.initiatives[0], status: "paused" };
    const edit = () =>
      fetch(base + "/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "initiatives",
          record,
          revision: w.revision,
        }),
      });
    assert.equal((await edit()).status, 200);
    assert.equal(readWorkspace(file).initiatives[0].status, "paused");
    assert.equal((await edit()).status, 409);
    assert.equal(
      (
        await fetch(base + "/api/workspace", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = request(
        base + "/api/workspace",
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(foreignHostStatus, 403);
    const exported = await (
      await fetch(base + "/api/export?format=json")
    ).json();
    assert.equal(exported.initiatives[0].status, "paused");
    assert.match(await (await fetch(base)).text(), /Campaign desk/);
    for (const asset of ["/theme.js", "/state.js", "/shared.js", "/chart.js", "/documents.js", "/markdown.js", "/views/reports.js", "/views/campaign.js", "/views/reception.js", "/views/research.js", "/views/experiments.js", "/views/results.js"]) {
      const assetResponse = await fetch(base + asset);
      assert.equal(assetResponse.status, 200, asset);
      assert.match(assetResponse.headers.get("content-type"), /javascript/);
    }
    assert.equal((await fetch(base + "/views/not-an-asset.js")).status, 404);
  } finally {
    if (running) await new Promise((resolve) => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("document downloads return exact inert Markdown and recover after server restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-doc-http-")), file = join(dir, "w.json");
  const markdown = "# 日本語 strategy\n<script>alert('never execute')</script>\n";
  let running;
  try {
    createWorkspace(file, ledger());
    saveDocument(file, "strategy", "game", markdown, 0);
    for (let restart = 0; restart < 2; restart++) {
      running = await startServer(file, { port: 0 });
      const response = await fetch(running.url + "/api/document?kind=strategy&id=game");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^text\/plain/);
      assert.match(response.headers.get("content-disposition"), /attachment;.*strategy-game\.md/);
      assert.equal(await response.text(), markdown);
      assert.equal((await fetch(running.url + "/api/document?kind=campaign&id=video")).status, 404);
      assert.equal((await fetch(running.url + "/api/document?kind=strategy&id=..%2Fsecret")).status, 404);
      assert.equal((await fetch(running.url + "/api/document?kind=arbitrary&id=game")).status, 400);
      await new Promise(resolve => running.server.close(resolve));
      running = undefined;
    }
  } finally {
    if (running) await new Promise(resolve => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});


test("report downloads return exact Markdown, reports reach the workspace API, and bad ids are not found", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-report-http-")), file = join(dir, "w.json");
  const markdown = "# Landscape\n\n| a | b |\n|---|---|\n| <script>x</script> | 2 |\n";
  let running;
  try {
    createWorkspace(file, ledger());
    saveReport(file, { id: "landscape", title: "Landscape", markdown, kind: "market-landscape" }, 0);
    running = await startServer(file, { port: 0 });
    const workspace = await (await fetch(running.url + "/api/workspace")).json();
    assert.equal(workspace.reports[0].title, "Landscape");
    const response = await fetch(running.url + "/api/document?kind=report&id=landscape");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/plain/);
    assert.match(response.headers.get("content-disposition"), /attachment;.*report-landscape\.md/);
    assert.equal(await response.text(), markdown);
    assert.equal((await fetch(running.url + "/api/document?kind=report&id=missing")).status, 404);
    assert.equal((await fetch(running.url + "/api/document?kind=report&id=..%2Fsecret")).status, 404);
  } finally {
    if (running) await new Promise(resolve => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
