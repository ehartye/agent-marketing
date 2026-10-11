import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport, taggedUrl } from "../src/import.mjs";
import { ledger } from "./fixtures.mjs";
import { readFileSync } from "node:fs";
import { validateWorkspace } from "../src/schema.mjs";
import { report } from "../src/analysis.mjs";
test("quoted CSV handles multiline definitions and converts numeric values", () => {
  const x = parseImport(
    'id,value,definition\r\na,12,"views, public\nplay starts"\r\n',
    "csv",
  );
  assert.equal(x.observations[0].value, 12);
  assert.equal(x.observations[0].definition, "views, public\nplay starts");
  assert.throws(() => parseImport("id,id\na,b", "csv"), /duplicate/i);
  assert.throws(() => parseImport('id,definition\na,"open', "csv"), /quote/i);
});
test("a complete exported ledger imports as validated collection arrays", () => {
  const w = ledger();
  assert.deepEqual(
    parseImport(JSON.stringify(w)),
    {
      ...Object.fromEntries(
        Object.entries(w).filter(([k]) => !["schema", "revision"].includes(k)),
      ),
      reports: [], // ledgers saved before reports existed gain an empty collection
      gates: [], // and so do ledgers saved before gates existed
    },
  );
});
test("campaign tagging preserves existing query/fragment and canonicalizes labels", () => {
  const u = new URL(
    taggedUrl("https://example.com/play?mode=easy#start", {
      source: "YouTube",
      medium: "Organic Video",
      campaign: "Orbit Launch",
      content: "Clip A",
    }),
  );
  assert.equal(u.searchParams.get("mode"), "easy");
  assert.equal(u.hash, "#start");
  assert.equal(u.searchParams.get("utm_source"), "youtube");
  assert.equal(u.searchParams.get("utm_content"), "clip-a");
  assert.throws(() => taggedUrl("https://example.com", { source: "x" }));
});
for (const channel of ["tiktok", "facebook", "x", "linkedin", "steam", "itch", "discord", "email", "github", "hacker-news", "product-hunt", "youtube", "reddit", "search", "instagram", "twitch", "bluesky", "apple-app-store", "google-play", "poki", "crazygames", "newgrounds", "gamejolt", "press", "mastodon"]) {
  test(`${channel} example import validates and keeps definitions distinct`, () => {
    const base = JSON.parse(readFileSync("examples/studio.json", "utf8")),
      patch = parseImport(
        readFileSync(`examples/observations-${channel}.csv`, "utf8"),
        "csv",
      );
    validateWorkspace({
      ...base,
      observations: [...base.observations, ...patch.observations],
    });
    assert.ok(patch.observations.every((o) => o.channel === channel));
    const defs = patch.observations.map((o) => o.definition);
    assert.equal(new Set(defs).size, defs.length);
  });
}
test("installs, unsubscribes and follows are ledger metrics used by the store, email and Twitch examples", () => {
  const used = (channel) =>
    new Set(
      parseImport(
        readFileSync(`examples/observations-${channel}.csv`, "utf8"),
        "csv",
      ).observations.map((o) => o.metric),
    );
  assert.ok(used("apple-app-store").has("installs"));
  assert.ok(used("google-play").has("installs"));
  assert.ok(used("email").has("unsubscribes"));
  assert.ok(used("twitch").has("follows"));
  for (const channel of ["apple-app-store", "google-play", "email", "twitch"]) {
    const base = JSON.parse(readFileSync("examples/studio.json", "utf8")),
      patch = parseImport(
        readFileSync(`examples/observations-${channel}.csv`, "utf8"),
        "csv",
      );
    validateWorkspace({
      ...base,
      observations: [...base.observations, ...patch.observations],
    });
  }
});
test("plays, ratings and playtime hours are used by the portal and rating examples", () => {
  const used = (channel) =>
    parseImport(
      readFileSync(`examples/observations-${channel}.csv`, "utf8"),
      "csv",
    ).observations;
  const metricsOf = (channel) => new Set(used(channel).map((o) => o.metric));
  assert.ok(metricsOf("poki").has("plays"));
  assert.ok(metricsOf("crazygames").has("plays"));
  assert.ok(metricsOf("newgrounds").has("ratings"));
  assert.ok(metricsOf("gamejolt").has("ratings"));
  // Platforms report an average playtime; the example shows the derived total as decimal hours.
  assert.equal(used("poki").find((o) => o.metric === "hours").value, 37.5);
  assert.equal(used("crazygames").find((o) => o.metric === "hours").value, 52);
});
test("the CrazyGames example imports into a ledger whose report shows a 12% day 1 return rate", () => {
  const base = JSON.parse(readFileSync("examples/studio.json", "utf8")),
    patch = parseImport(
      readFileSync("examples/observations-crazygames.csv", "utf8"),
      "csv",
    ),
    w = validateWorkspace({ ...base, observations: patch.observations }),
    [rate] = report(w, { projectId: "orbit" }).returnRates;
  assert.equal(rate.channel, "crazygames");
  assert.equal(rate.starts, 400);
  assert.equal(rate.returns, 48);
  assert.equal(rate.rate, 0.12);
  assert.equal(rate.interpretation, "Cohort return rate");
});
