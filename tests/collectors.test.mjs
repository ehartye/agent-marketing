import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSource, monitor } from "../src/collectors.mjs";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ledger } from "./fixtures.mjs";
const source = {
  id: "hn",
  projectId: "game",
  initiativeId: "video",
  name: "Launch thread",
  adapter: "hn",
  channel: "hacker-news",
  target: "42",
};
const time = "2026-10-08T12:00:00Z";
const fetchFixture = async (url) =>
  new Response(
    JSON.stringify(
      url.includes("/42.json")
        ? { id: 42, score: 5, descendants: 1, kids: [43] }
        : { id: 43, text: "Love &amp; enjoy <i>this</i>", kids: [] },
    ),
    { status: 200 },
  );
test("HN snapshots and reactions have stable IDs and plain text", async () => {
  const a = await collectSource(source, { fetchImpl: fetchFixture, now: time });
  const b = await collectSource(source, { fetchImpl: fetchFixture, now: time });
  assert.equal(a.observations[0].value, 5);
  assert.equal(a.reactions[0].text, "Love & enjoy this");
  assert.deepEqual(
    a.observations.map((x) => x.id),
    b.observations.map((x) => x.id),
  );
  assert.equal(a.reactions[0].reviewed, false);
});
test("partial GitHub traffic permission failure retains public stars and exposes no response secrets", async () => {
  const s = {
    ...source,
    id: "gh",
    adapter: "github",
    channel: "github",
    target: "owner/repo",
    traffic: true,
  };
  const result = await collectSource(s, {
    now: time,
    fetchImpl: async (url) =>
      url.includes("/traffic/")
        ? new Response("secret-token", { status: 403 })
        : new Response(JSON.stringify({ stargazers_count: 12 }), {
            status: 200,
          }),
  });
  assert.equal(result.observations[0].value, 12);
  assert.ok(result.errors.some((x) => x.includes("403")));
  assert.ok(!JSON.stringify(result).includes("secret-token"));
});
test("repeated monitor upserts without erasing reviewed sentiment or old results on outage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-monitor-")),
    file = join(dir, "w.json");
  try {
    const w = ledger();
    w.sources = [source];
    createWorkspace(file, w);
    await monitor(file, { fetchImpl: fetchFixture, now: time });
    const { mutateWorkspace } = await import("../src/store.mjs");
    mutateWorkspace(file, (w) => {
      w.reactions[0].sentiment = "positive";
      w.reactions[0].reviewed = true;
    });
    await monitor(file, { fetchImpl: fetchFixture, now: time });
    assert.equal(readWorkspace(file).reactions.length, 1);
    assert.equal(readWorkspace(file).reactions[0].reviewed, true);
    await monitor(file, {
      fetchImpl: async () => {
        throw Error("offline");
      },
      now: time,
    });
    assert.equal(readWorkspace(file).observations.length, 2);
    assert.match(readWorkspace(file).sources[0].lastError, /offline/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("edited comment invalidates prior human review", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-edited-")),
    file = join(dir, "w.json");
  try {
    const w = ledger();
    w.sources = [source];
    createWorkspace(file, w);
    await monitor(file, { fetchImpl: fetchFixture, now: time });
    const { mutateWorkspace } = await import("../src/store.mjs");
    mutateWorkspace(file, (w) => {
      w.reactions[0].reviewed = true;
      w.reactions[0].sentiment = "positive";
    });
    await monitor(file, {
      now: time,
      fetchImpl: async (url) =>
        url.includes("/42.json")
          ? fetchFixture(url)
          : new Response(
              JSON.stringify({ id: 43, text: "Terrible and broken", kids: [] }),
            ),
    });
    assert.equal(readWorkspace(file).reactions[0].reviewed, false);
    assert.equal(readWorkspace(file).reactions[0].sentiment, "negative");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("source attribution changes during collection reject stale results", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-race-")),
    file = join(dir, "w.json");
  try {
    const w = ledger();
    w.sources = [source];
    createWorkspace(file, w);
    const { mutateWorkspace } = await import("../src/store.mjs");
    let changed = false;
    await assert.rejects(
      () =>
        monitor(file, {
          now: time,
          fetchImpl: async (url) => {
            if (!changed) {
              changed = true;
              mutateWorkspace(file, (w) => {
                w.sources[0].initiativeId = undefined;
              });
            }
            return fetchFixture(url);
          },
        }),
      /changed/i,
    );
    assert.equal(readWorkspace(file).observations.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("maximum source IDs produce valid stable collected record IDs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-longid-")),
    file = join(dir, "w.json");
  try {
    const w = ledger();
    w.sources = [{ ...source, id: "a".repeat(160) }];
    createWorkspace(file, w);
    await monitor(file, { now: time, fetchImpl: fetchFixture });
    assert.equal(readWorkspace(file).observations.length, 2);
    assert.equal(readWorkspace(file).reactions.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
