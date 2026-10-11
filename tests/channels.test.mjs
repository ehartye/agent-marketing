import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { channels } from "../src/schema.mjs";
import { channelLibrary } from "../src/channels.mjs";

const gameChannels = ["poki", "crazygames", "newgrounds", "gamejolt", "press", "mastodon"],
  references = JSON.parse(readFileSync("craft/references.json", "utf8")),
  cli = readFileSync("docs/CLI.md", "utf8"),
  guide = readFileSync("craft/channels.md", "utf8"),
  card = (id) => channelLibrary.find((c) => c.id === id),
  listed = (label) =>
    new RegExp(`${label}: \`([^\`]+)\``).exec(cli)?.[1].split(", ");

test("the ledger accepts the game portal, press and Mastodon channels", () => {
  for (const id of gameChannels) assert.ok(channels.includes(id), id);
});

test("every ledger channel except direct has one channel card, and every card is a ledger channel", () => {
  assert.deepEqual(
    channelLibrary.map((c) => c.id).toSorted(),
    channels.filter((c) => c !== "direct").toSorted(),
  );
});

test("each game channel card meets the module standard and resolves its references", () => {
  const known = new Set(references.map((r) => r.id));
  for (const id of gameChannels) {
    const c = card(id);
    assert.ok(c, `missing card ${id}`);
    assert.ok(c.name.length > 2, `${id}.name`);
    for (const key of ["approach", "measure", "risk", "complexity", "maintainability", "cost"])
      assert.ok(typeof c[key] === "string" && c[key].length > 40, `${id}.${key}`);
    for (const key of ["categories", "audiences"])
      assert.ok(Array.isArray(c[key]) && c[key].length, `${id}.${key}`);
    assert.ok(Number.isFinite(c.hours) && c.hours > 0, `${id}.hours`);
    assert.ok(c.referenceIds.length >= 2, `${id} needs a rules source and a metric source`);
    for (const ref of c.referenceIds) assert.ok(known.has(ref), `${id}: unknown reference ${ref}`);
    assert.ok(existsSync(`examples/observations-${id}.csv`), `${id} example import`);
    assert.ok(guide.includes(`](../examples/observations-${id}.csv)`), `${id} section in craft/channels.md`);
  }
});

test("new references are dated and keep the verifier's caveats in their limit", () => {
  const added = references.filter((r) => /^(poki|cg|ng|gj|press|mastodon|steam-(curators|keys|next-fest)|wholesome|comfy|keymailer|lurkit)/.test(r.id));
  assert.ok(added.length >= 20, `expected the game channel references, found ${added.length}`);
  for (const r of added) {
    assert.match(r.checkedAt, /^2026-10-1[01]$/, r.id);
    assert.match(r.url, /^https:\/\//, r.id);
  }
  const poki = references.find((r) => r.id === "poki-revenue-deals");
  assert.match(poki.limit, /indicative/i);
});

test("Poki is described as offering a non-exclusive deal, not as requiring exclusivity", () => {
  const c = card("poki"), text = Object.values(c).flat().join(" ");
  assert.match(text, /non-exclusive/i);
  assert.match(text, /5 years/);
  assert.match(text, /Steam, app stores and consoles/);
  assert.doesNotMatch(text, /requires? (web )?exclusiv/i);
  assert.doesNotMatch(text, /must be exclusive/i);
});

test("CrazyGames needs its SDK above 50 MB in total, and allows 250 MB with the SDK", () => {
  const text = Object.values(card("crazygames")).flat().join(" ");
  assert.match(text, /50 MB/);
  assert.match(text, /250 MB/);
  assert.match(text, /without the SDK/i);
  assert.match(text, /1,500 files/);
});

test("Newgrounds and the press card state the AI and key rules they were verified against", () => {
  assert.match(Object.values(card("newgrounds")).flat().join(" "), /generated via an AI prompt/);
  const press = Object.values(card("press")).flat().join(" ");
  assert.match(press, /100 curators/);
  assert.match(press, /no obligation/i);
});

test("docs/CLI.md lists exactly the channels the ledger accepts", () => {
  assert.deepEqual(listed("Channels")?.toSorted(), channels.toSorted());
});
