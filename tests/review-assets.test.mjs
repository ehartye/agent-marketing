import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, readWorkspace, mutateWorkspace } from "../src/store.mjs";
import { addSlot, addAsset, pickAsset, rejectAsset, retireAsset, assetsDir, sniffMediaType } from "../src/assets.mjs";
import { decide, defer } from "../src/progress.mjs";
import { ledger } from "./fixtures.mjs";
import { png, webm } from "./images.mjs";

const NOW = "2026-10-11T10:00:00.000Z";
const LATER = "2026-10-12T08:30:00.000Z";

function withFile(body) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-review-assets-")),
    file = join(dir, "hull.json"),
    srcDir = join(dir, "src");
  mkdirSync(srcDir);
  const src = (name, buffer) => {
    const path = join(srcDir, name);
    writeFileSync(path, buffer);
    return path;
  };
  try {
    createWorkspace(file, structuredClone(ledger()));
    return body(file, src, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const slot = (file, id = "capsule", over = {}) => addSlot(file, { id, name: `Slot ${id}`, kind: "image", initiativeId: "video", now: NOW, ...over });
const link = (file, slotId, id, n = id) => addAsset(file, { slotId, label: `Link ${n}`, url: `https://example.com/${n}`, id, now: NOW });

// ---- A pick decision is changed by picking --------------------------------------------------

test("decide and defer refuse a decision that records a slot's pick, and say to use asset pick", () =>
  withFile((file) => {
    slot(file);
    link(file, "capsule", "a");
    link(file, "capsule", "b");
    pickAsset(file, "a", { now: NOW });
    const before = readFileSync(file, "utf8");
    assert.throws(() => decide(file, "pick-capsule", { optionId: "b", change: true, now: LATER }), /records the pick for asset slot "capsule".*asset pick/);
    assert.throws(() => decide(file, "pick-capsule", { optionId: "a", now: LATER }), /asset pick/);
    assert.throws(() => defer(file, "pick-capsule", { until: "2026-11-01", now: LATER }), /records the pick for asset slot "capsule".*asset pick/);
    assert.equal(readFileSync(file, "utf8"), before, "nothing was written");
    const w = readWorkspace(file);
    assert.equal(w.decisions[0].chosen, w.assetSlots[0].selectedAssetId);
    // Picking is still the way to change it, and keeps the two in step.
    pickAsset(file, "b", { now: LATER });
    const after = readWorkspace(file);
    assert.equal(after.decisions[0].chosen, "b");
    assert.equal(after.assetSlots[0].selectedAssetId, "b");
  }));

test("a decision no slot references can still be decided and deferred", () =>
  withFile((file) => {
    mutateWorkspace(file, (w) => {
      w.decisions.push({ id: "plain", projectId: "game", title: "Plain", question: "Which?", status: "open", options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] });
    });
    assert.equal(defer(file, "plain", { until: "2026-11-01", now: NOW }).changed, true);
    assert.equal(decide(file, "plain", { optionId: "x", now: LATER }).record.chosen, "x");
  }));

// ---- The slot shorthand only fills an open slot ---------------------------------------------

test("asset pick <slot-id> fills an open slot but never replaces a pick", () =>
  withFile((file) => {
    slot(file);
    link(file, "capsule", "a");
    assert.equal(pickAsset(file, "capsule", { now: NOW }).record.id, "a");
    link(file, "capsule", "b");
    assert.throws(() => pickAsset(file, "capsule", { now: LATER }), /Slot "capsule" already has a pick \("Link a"\); name the asset to change it/);
    assert.equal(readWorkspace(file).assetSlots[0].selectedAssetId, "a");
    // Naming the asset still changes it.
    assert.equal(pickAsset(file, "b", { now: LATER }).record.status, "selected");
    // A slot opened again by a reject takes the shorthand once more.
    rejectAsset(file, "b", { rationale: "no", now: LATER });
    link(file, "capsule", "c");
    rejectAsset(file, "a", { rationale: "no", now: LATER });
    assert.equal(pickAsset(file, "capsule", { now: LATER }).record.id, "c");
  }));

// ---- Slot ids and asset ids share a namespace -----------------------------------------------

test("a slot id that is already an asset id is refused", () =>
  withFile((file) => {
    slot(file, "hero");
    assert.equal(addAsset(file, { slotId: "hero", label: "First", url: "https://example.com/1", now: NOW }).record.id, "hero-1");
    assert.throws(() => slot(file, "hero-1"), /"hero-1" is already the ID of an asset/);
    assert.throws(() => slot(file, "Hero-1"), /already the ID of an asset/, "case does not make a difference");
    assert.equal(readWorkspace(file).assetSlots.length, 1);
  }));

test("generated asset ids skip the id of any slot, in any case", () =>
  withFile((file) => {
    slot(file, "hero");
    slot(file, "hero-1");
    slot(file, "Hero-2");
    const a = addAsset(file, { slotId: "hero", label: "A", url: "https://example.com/a", now: NOW }).record;
    assert.equal(a.id, "hero-3");
    const w = readWorkspace(file);
    const names = [...w.assetSlots.map((s) => s.id), ...w.assets.map((x) => x.id)].map((x) => x.toLowerCase());
    assert.equal(new Set(names).size, names.length);
  }));

test("an explicit asset id that is a slot id, or differs from an asset id only by case, is refused", () =>
  withFile((file) => {
    slot(file, "hero");
    slot(file, "other");
    assert.throws(() => addAsset(file, { slotId: "hero", label: "A", url: "https://example.com/a", id: "other", now: NOW }), /"other" is the ID of an asset slot/);
    assert.throws(() => addAsset(file, { slotId: "hero", label: "A", url: "https://example.com/a", id: "OTHER", now: NOW }), /ID of an asset slot/);
    link(file, "hero", "dusk");
    assert.throws(() => link(file, "hero", "Dusk", "d2"), /Asset "Dusk" .*"dusk"/);
    assert.equal(readWorkspace(file).assets.length, 1);
  }));

test("generated asset ids are compared without regard to case", () =>
  withFile((file) => {
    slot(file, "hero");
    link(file, "hero", "HERO-2");
    const next = addAsset(file, { slotId: "hero", label: "B", url: "https://example.com/b", now: NOW }).record;
    assert.equal(next.id, "hero-3");
  }));

// ---- A file left in the folder does not block adding ----------------------------------------

test("a stray file where the next asset would go is skipped, never overwritten", () =>
  withFile((file, src) => {
    slot(file);
    const folder = join(assetsDir(file), "capsule");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "capsule-1.png"), "orphan one");
    writeFileSync(join(folder, "capsule-2.png"), "orphan two");
    const out = addAsset(file, { slotId: "capsule", label: "Real", from: src("real.png", png(5, 5, 1)), now: NOW });
    assert.equal(out.record.id, "capsule-3");
    assert.equal(out.record.file, "capsule/capsule-3.png");
    assert.equal(readFileSync(join(folder, "capsule-1.png"), "utf8"), "orphan one");
    assert.equal(readFileSync(join(folder, "capsule-2.png"), "utf8"), "orphan two");
    assert.equal(addAsset(file, { slotId: "capsule", label: "Real 2", from: src("real2.png", png(5, 5, 2)), now: NOW }).record.id, "capsule-4");
    assert.deepEqual(readdirSync(folder).sort(), ["capsule-1.png", "capsule-2.png", "capsule-3.png", "capsule-4.png"]);
  }));

test("a stray file that differs only by case does not block adding or get overwritten", () =>
  withFile((file, src) => {
    slot(file);
    const folder = join(assetsDir(file), "capsule");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "Capsule-1.png"), "orphan");
    const out = addAsset(file, { slotId: "capsule", label: "Real", from: src("real.png", png(5, 5, 1)), now: NOW });
    assert.match(out.record.id, /^capsule-\d+$/);
    assert.equal(readFileSync(join(folder, "Capsule-1.png"), "utf8"), "orphan");
  }));

test("a named asset whose file already exists is refused in words, not with an error code", () =>
  withFile((file, src) => {
    slot(file);
    const folder = join(assetsDir(file), "capsule");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "named.png"), "orphan");
    let message;
    try {
      addAsset(file, { slotId: "capsule", label: "Real", from: src("real.png", png(5, 5, 1)), id: "named", now: NOW });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, "it must be refused");
    assert.doesNotMatch(message, /EEXIST|errno|wx/i);
    assert.match(message, /capsule\/named\.png already exists in the assets folder/);
    assert.equal(readFileSync(join(folder, "named.png"), "utf8"), "orphan");
    assert.equal(readWorkspace(file).assets.length, 0);
  }));

// ---- Retire and pick keep the reasons -------------------------------------------------------

test("retiring an asset that is already retired with a new reason updates the reason and logs it", () =>
  withFile((file) => {
    slot(file);
    link(file, "capsule", "a");
    assert.equal(retireAsset(file, "a", { rationale: "old", now: NOW }).changed, true);
    assert.equal(retireAsset(file, "a", { rationale: "old", now: LATER }).changed, false);
    assert.equal(retireAsset(file, "a", { now: LATER }).changed, false, "no new reason, nothing to say");
    const out = retireAsset(file, "a", { rationale: "superseded by the v3 art", now: LATER });
    assert.equal(out.changed, true);
    assert.equal(out.record.rationale, "superseded by the v3 art");
    assert.match(out.update.text, /Updated why "Link a" was retired in "Slot capsule": superseded by the v3 art/);
    assert.equal(readWorkspace(file).assets[0].rationale, "superseded by the v3 art");
  }));

test("picking a rejected asset says why it had been rejected in the update", () =>
  withFile((file) => {
    slot(file);
    link(file, "capsule", "a");
    link(file, "capsule", "b");
    rejectAsset(file, "a", { rationale: "too dark at thumbnail size", now: NOW });
    const out = pickAsset(file, "a", { rationale: "the new grade fixed it", now: LATER });
    assert.match(out.update.text, /the new grade fixed it/);
    assert.match(out.update.text, /"Link a" was rejected: too dark at thumbnail size/);
    assert.equal(out.record.rationale, "the new grade fixed it");
    const bare = pickAsset(file, "b", { now: LATER });
    assert.doesNotMatch(bare.update.text, /was rejected/);
  }));

// ---- Sniffing -------------------------------------------------------------------------------

test("a file that has the webm magic but not the webm doctype is not video/webm", () => {
  assert.equal(sniffMediaType(webm()), "video/webm");
  const matroska = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x88]), Buffer.from("matroska", "latin1"), Buffer.alloc(8)]);
  assert.notEqual(sniffMediaType(matroska), "video/webm");
  assert.notEqual(sniffMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), "video/webm");
});

test("a file named .webm whose content is something else is refused", () =>
  withFile((file, src) => {
    slot(file, "clip", { kind: "video" });
    assert.throws(() => addAsset(file, { slotId: "clip", label: "Fake", from: src("fake.webm", Buffer.from("just some words, not a video\n")), now: NOW }), /says video\/webm by its extension, but its content looks like text\/plain/);
    assert.throws(() => addAsset(file, { slotId: "clip", label: "Fake", from: src("fake2.webm", png(3, 3, 1)), now: NOW }), /content looks like image\/png/);
    const matroska = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x88]), Buffer.from("matroska", "latin1"), Buffer.alloc(8)]);
    assert.throws(() => addAsset(file, { slotId: "clip", label: "Mkv", from: src("mkv.webm", matroska), now: NOW }), /says video\/webm by its extension/);
    assert.equal(readWorkspace(file).assets.length, 0);
  }));
