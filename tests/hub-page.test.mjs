import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { ledger } from "./fixtures.mjs";

test("the desk serves every view module, under a policy that forbids inline script, and the page stays free of inline code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-hub-page-")), file = join(dir, "w.json");
  createWorkspace(file, ledger());
  let running;
  try {
    running = await startServer(file, { port: 0 });
    const base = running.url;
    const modules = ["/hub-shared.js", ...readdirSync("ui/views").map((name) => "/views/" + name)];
    for (const asset of modules) {
      const r = await fetch(base + asset);
      assert.equal(r.status, 200, asset);
      assert.match(r.headers.get("content-type"), /javascript/);
      assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
    }
    const html = await (await fetch(base)).text();
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /\sstyle=/i);
    for (const id of ["needs", "decisions", "actions", "timeline", "initiatives", "decision-filters", "decisions-list", "actions-list", "timeline-list", "needs-body"])
      assert.ok(html.includes(`id="${id}"`), id);
  } finally {
    if (running) await new Promise((resolve) => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no view module writes inline styles or inline handlers the policy would block", () => {
  for (const name of readdirSync("ui/views")) {
    const source = readFileSync("ui/views/" + name, "utf8");
    assert.doesNotMatch(source, /\sstyle="/, name);
    assert.doesNotMatch(source, /\son(click|change|submit|input)=/, name);
  }
});
