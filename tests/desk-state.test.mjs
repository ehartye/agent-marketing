import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeskClient, reviewDrafts } from "../ui/state.js";

const workspace = { revision: 3, projects: [{ id: "orbit" }, { id: "sketch" }], initiatives: [{ id: "orbit-video", projectId: "orbit" }] };
const response = (url) => url === "/api/workspace" ? workspace : [];
test("desk commits only a complete current selection and clears a foreign initiative", async () => {
  const urls = [];
  const client = createDeskClient(async (url) => { urls.push(url); return response(url); });
  const result = await client.load({ projectId: "sketch", initiativeId: "orbit-video" });
  assert.equal(result.selection.initiativeId, "");
  assert.ok(urls.some(url => url === "/api/report?projectId=sketch"));
  assert.equal(client.snapshot, result);
});
test("obsolete loads cannot overwrite newer results", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const client = createDeskClient(async url => {
    if (url === "/api/report?projectId=orbit") await waiting;
    return response(url);
  });
  const older = client.load({ projectId: "orbit" });
  await new Promise(resolve => setImmediate(resolve));
  const newer = await client.load({ projectId: "sketch" });
  release();
  assert.equal(await older, null);
  assert.equal(client.snapshot, newer);
});
test("failed or invalid loads do not replace the last complete snapshot", async () => {
  let failing = false;
  const client = createDeskClient(async url => {
    if (failing && url.startsWith("/api/report")) throw new Error("Offline");
    return response(url);
  });
  const before = await client.load({});
  failing = true;
  await assert.rejects(client.load({}), /Offline/);
  assert.equal(client.snapshot, before);
  await assert.rejects(client.load({ from: "2026-10-15", to: "2026-10-01" }), /end date/);
});
test("saving one reaction preserves other drafts and flags changed source text", () => {
  const drafts = reviewDrafts();
  const first = { id: "a", text: "Original", url: "https://example.com/a", theme: "old", sentiment: "unknown" };
  const second = { ...first, id: "b" };
  drafts.set(first, { theme: "first draft", sentiment: "positive" });
  drafts.set(second, { theme: "second draft", sentiment: "mixed" });
  drafts.delete(first.id);
  assert.equal(drafts.get(second).theme, "second draft");
  assert.equal(drafts.get(second).sourceChanged, false);
  const changed = drafts.get({ ...second, text: "Edited source" });
  assert.equal(changed.theme, "second draft");
  assert.equal(changed.sourceChanged, true);
  assert.equal(drafts.size, 1);
});
