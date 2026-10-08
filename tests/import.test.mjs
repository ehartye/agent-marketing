import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport, taggedUrl } from "../src/import.mjs";
import { ledger } from "./fixtures.mjs";
import { readFileSync } from "node:fs";
import { validateWorkspace } from "../src/schema.mjs";
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
    Object.fromEntries(
      Object.entries(w).filter(([k]) => !["schema", "revision"].includes(k)),
    ),
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
for (const channel of ["tiktok", "facebook"]) {
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
