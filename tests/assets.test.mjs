import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { createWorkspace, readWorkspace, mutateWorkspace } from "../src/store.mjs";
import {
  assetsDir,
  addSlot,
  addAsset,
  pickAsset,
  rejectAsset,
  restoreAsset,
  retireAsset,
  listAssets,
  listSlots,
  resolveAssetFile,
  sniffMediaType,
  imageSize,
  maxAssetBytes,
} from "../src/assets.mjs";
import { ledger } from "./fixtures.mjs";
import { png, jpeg, gif, webp, pdf, mp4, webm } from "./images.mjs";

const NOW = "2026-10-11T10:00:00.000Z";
const LATER = "2026-10-12T08:30:00.000Z";
const LATEST = "2026-10-13T08:30:00.000Z";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const bytes = (file) => readFileSync(file, "utf8");

// Runs a body against a fresh workspace (project "game", initiative "video") and a folder of source
// files; `src(name, buffer)` writes one and returns its path.
function withFile(body) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-assets-")),
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
const slot = (file, over = {}) =>
  addSlot(file, { id: "capsule", name: "Steam main capsule", kind: "image", spec: "1232x706 PNG", initiativeId: "video", now: NOW, ...over });
const asset = (file, src, id, over = {}) =>
  addAsset(file, { slotId: "capsule", label: `Capsule ${id}`, from: src(`${id}.png`, png(4, 3, id.charCodeAt(0))), id, source: `agent composite ${id}`, now: NOW, ...over });

test("the assets folder is the workspace file name without .json, plus .assets", () => {
  assert.equal(basename(assetsDir("/tmp/hullgrown.json")), "hullgrown.assets");
  assert.equal(basename(assetsDir("/tmp/Studio.JSON")), "Studio.assets");
  assert.equal(basename(assetsDir("/tmp/noext")), "noext.assets");
  assert.equal(assetsDir("/tmp/a/b.json"), assetsDir("/tmp/a/../a/b.json"));
});

test("media types are sniffed from the first bytes", () => {
  assert.equal(sniffMediaType(png()), "image/png");
  assert.equal(sniffMediaType(jpeg()), "image/jpeg");
  assert.equal(sniffMediaType(gif()), "image/gif");
  assert.equal(sniffMediaType(webp()), "image/webp");
  assert.equal(sniffMediaType(mp4()), "video/mp4");
  assert.equal(sniffMediaType(webm()), "video/webm");
  assert.equal(sniffMediaType(pdf()), "application/pdf");
  assert.equal(sniffMediaType(Buffer.from("Just words\n")), "text/plain");
  assert.equal(sniffMediaType(Buffer.from([0x00, 0x01, 0x02, 0x03])), undefined);
  assert.equal(sniffMediaType(Buffer.from([0xc3, 0x28])), undefined, "not valid UTF-8");
});

test("image size is read from the header of a PNG, JPEG, GIF or WebP", () => {
  assert.deepEqual(imageSize(png(1232, 706)), { width: 1232, height: 706 });
  assert.deepEqual(imageSize(jpeg(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(imageSize(gif(33, 17)), { width: 33, height: 17 });
  assert.deepEqual(imageSize(webp(1920, 1080, "VP8X")), { width: 1920, height: 1080 });
  assert.deepEqual(imageSize(webp(300, 200, "VP8L")), { width: 300, height: 200 });
  assert.deepEqual(imageSize(webp(301, 201, "VP8 ")), { width: 301, height: 201 });
  assert.deepEqual(imageSize(pdf()), {}, "unknown types have no size");
  assert.deepEqual(imageSize(png().subarray(0, 20)), {}, "a cut-short header has no size");
  assert.deepEqual(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), {});
  assert.deepEqual(imageSize(Buffer.alloc(0)), {});
});

test("addSlot makes an open slot in the only project and logs one update", () =>
  withFile((file) => {
    const out = slot(file);
    assert.deepEqual(out.record, { id: "capsule", projectId: "game", initiativeId: "video", name: "Steam main capsule", kind: "image", spec: "1232x706 PNG", status: "open" });
    assert.equal(out.changed, true);
    assert.equal(out.revision, 1);
    assert.deepEqual(out.warnings, []);
    assert.equal(out.update.kind, "asset");
    assert.equal(out.update.refId, "capsule");
    assert.equal(out.update.initiativeId, "video");
    assert.equal(out.update.at, NOW);
    assert.match(out.update.text, /Steam main capsule.*image/);
    const w = readWorkspace(file);
    assert.deepEqual(w.assetSlots, [out.record]);
    assert.deepEqual(w.updates, [out.update]);
    assert.deepEqual(w.assets, []);
  }));

test("addSlot refuses a used ID, a bad kind, an ID that cannot be a folder, and an unknown initiative", () =>
  withFile((file) => {
    slot(file);
    const before = bytes(file);
    assert.throws(() => slot(file), /already exists/);
    assert.throws(() => slot(file, { id: "x", kind: "audio" }), /kind must be one of image, video, document, text, link/);
    assert.throws(() => slot(file, { id: "a:b" }), /folder name/);
    assert.throws(() => slot(file, { id: "x", initiativeId: "ghost" }), /Initiative "ghost" does not exist/);
    assert.throws(() => slot(file, { id: "x", projectId: "ghost" }), /projectId/);
    assert.throws(() => slot(file, { id: "", name: "x" }), /Required: id/);
    assert.throws(() => slot(file, { id: "y", name: "" }), /Required: name/);
    assert.equal(bytes(file), before);
  }));

test("addAsset copies the file, names it by slot and asset, and records its hash, size and dimensions", () =>
  withFile((file, src, dir) => {
    slot(file);
    const buffer = png(1232, 706, 7),
      from = src("original.png", buffer),
      out = addAsset(file, { slotId: "capsule", label: "Pixel composite v3", from, id: "v3", source: "agent pixel composite v3", now: NOW });
    assert.equal(out.changed, true);
    assert.deepEqual(out.record, {
      id: "v3",
      projectId: "game",
      slotId: "capsule",
      label: "Pixel composite v3",
      kind: "image",
      file: "capsule/v3.png",
      mediaType: "image/png",
      bytes: buffer.length,
      sha256: sha(buffer),
      width: 1232,
      height: 706,
      status: "candidate",
      source: "agent pixel composite v3",
      createdAt: NOW,
    });
    assert.deepEqual(out.warnings, []);
    assert.equal(out.slot.id, "capsule");
    const copied = join(assetsDir(file), "capsule", "v3.png");
    assert.ok(existsSync(copied));
    assert.ok(readFileSync(copied).equals(buffer));
    assert.ok(readFileSync(from).equals(buffer), "the original is left alone");
    assert.equal(basename(assetsDir(file)), "hull.assets");
    assert.deepEqual(readdirSync(dir).sort(), ["hull.assets", "hull.json", "src"]);
    assert.equal(out.update.kind, "asset");
    assert.equal(out.update.refId, "v3");
    assert.equal(out.update.initiativeId, "video");
    assert.match(out.update.text, /Pixel composite v3.*Steam main capsule/);
    const w = readWorkspace(file);
    assert.deepEqual(w.assets, [out.record]);
    assert.equal(w.updates.length, 2);
    assert.equal(w.revision, 2);
  }));

test("an asset ID is made when none is given, and a .jpeg file is stored as .jpg", () =>
  withFile((file, src) => {
    slot(file);
    const one = addAsset(file, { slotId: "capsule", label: "First", from: src("a.jpeg", jpeg(10, 20, 1)), now: NOW });
    assert.equal(one.record.id, "capsule-1");
    assert.equal(one.record.file, "capsule/capsule-1.jpg");
    assert.equal(one.record.mediaType, "image/jpeg");
    assert.deepEqual([one.record.width, one.record.height], [10, 20]);
    const two = addAsset(file, { slotId: "capsule", label: "Second", from: src("b.gif", gif(3, 4, 2)), now: NOW });
    assert.equal(two.record.id, "capsule-2");
    assert.equal(two.record.file, "capsule/capsule-2.gif");
    assert.equal(addAsset(file, { slotId: "capsule", label: "Third", from: src("c.webp", webp(11, 12, "VP8L", 3)), now: NOW }).record.height, 12);
  }));

test("other allowed files are kept without dimensions: pdf, mp4, webm, text and markdown", () =>
  withFile((file, src) => {
    slot(file, { id: "trailer", name: "Trailer", kind: "video" });
    const cases = [
      ["a.mp4", mp4(), "video/mp4", "video"],
      ["b.webm", webm(), "video/webm", "video"],
      ["c.pdf", pdf(), "application/pdf", "document"],
      ["d.txt", Buffer.from("Wishlist now\n"), "text/plain", "document"],
      ["e.md", Buffer.from("# Blurb\n\nHello\n"), "text/markdown", "document"],
    ];
    for (const [name, buffer, mediaType, kind] of cases) {
      const r = addAsset(file, { slotId: "trailer", label: name, from: src(name, buffer), now: NOW }).record;
      assert.equal(r.mediaType, mediaType);
      assert.equal(r.kind, kind);
      assert.equal(r.width, undefined);
      assert.equal(r.bytes, buffer.length);
      assert.ok(r.file.startsWith("trailer/"));
    }
  }));

test("a link asset keeps an https URL and a text asset keeps its copy; neither has a file", () =>
  withFile((file) => {
    slot(file);
    slot(file, { id: "blurb", name: "Short blurb", kind: "text" });
    const link = addAsset(file, { slotId: "capsule", label: "Artifact preview", url: "https://claude.ai/artifact/abc", now: NOW });
    assert.equal(link.record.kind, "link");
    assert.equal(link.record.url, "https://claude.ai/artifact/abc");
    assert.equal(link.record.file, undefined);
    assert.deepEqual(link.warnings, [], "a link stands in for any kind");
    const copy = addAsset(file, { slotId: "blurb", label: "Calm blurb", text: "Grow a tiny planet in five minutes.", source: "agent draft 2", now: NOW });
    assert.equal(copy.record.kind, "text");
    assert.equal(copy.record.text, "Grow a tiny planet in five minutes.");
    assert.equal(existsSync(assetsDir(file)), false, "no folder is made when nothing is copied");
    assert.equal(readWorkspace(file).assets.length, 2);
  }));

test("addAsset needs exactly one of a file, a url or text, and a valid one", () =>
  withFile((file, src) => {
    slot(file);
    const before = bytes(file),
      add = (over) => addAsset(file, { slotId: "capsule", label: "x", now: NOW, ...over });
    assert.throws(() => add({}), /exactly one of a file, a url or text/);
    assert.throws(() => add({ url: "https://example.com/x", text: "y" }), /exactly one/);
    assert.throws(() => add({ from: src("a.png", png()), url: "https://example.com/x" }), /exactly one/);
    assert.throws(() => add({ url: "http://example.com/x" }), /https/);
    assert.throws(() => add({ url: "javascript:alert(1)" }), /https/);
    assert.throws(() => add({ url: "https://u:p@example.com/" }), /https/);
    assert.throws(() => add({ text: "x".repeat(4001) }), /4000/);
    assert.throws(() => add({ text: "   " }), /nonempty/);
    assert.throws(() => add({ url: "https://example.com/x", label: "" }), /label/);
    assert.throws(() => addAsset(file, { label: "x", url: "https://example.com/x" }), /slot/);
    assert.throws(() => addAsset(file, { slotId: "ghost", label: "x", url: "https://example.com/x" }), /Asset slot "ghost" does not exist/);
    assert.throws(() => add({ url: "https://example.com/x", id: "a:b" }), /file name/);
    assert.throws(() => add({ from: src("missing-dir/none.png", png()) }), /ENOENT/);
    assert.throws(() => add({ from: join(assetsDir(file), "..", "nope.png") }), /does not exist/);
    assert.throws(() => add({ from: join(assetsDir(file), "..", "src") }), /not a file/);
    assert.equal(bytes(file), before);
  }));

test("only whitelisted types are accepted: no svg, html, script or executable, and content must match the extension", () =>
  withFile((file, src) => {
    slot(file);
    const before = bytes(file),
      add = (name, buffer) => addAsset(file, { slotId: "capsule", label: name, from: src(name, buffer), now: NOW });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const name of ["a.svg", "a.html", "a.htm", "a.js", "a.exe", "a.bat", "a.mjs", "a.zip", "noext"])
      assert.throws(() => add(name, svg), /must be one of \.png, \.jpg/, name);
    assert.throws(() => add("a.png", jpeg()), /looks like image\/jpeg/);
    assert.throws(() => add("a.jpg", png()), /looks like image\/png/);
    assert.throws(() => add("a.png", svg), /looks like text\/plain/);
    assert.throws(() => add("a.png", Buffer.from([0, 1, 2, 3, 4])), /unrecognised data/);
    assert.throws(() => add("a.mp4", png()), /image\/png/);
    assert.throws(() => add("a.pdf", Buffer.from("hello")), /text\/plain/);
    assert.throws(() => add("a.txt", svg), /markup/);
    assert.throws(() => add("b.md", Buffer.from("<!DOCTYPE html><html></html>")), /markup/);
    assert.throws(() => add("c.png", Buffer.alloc(0)), /empty/);
    assert.equal(bytes(file), before);
    assert.equal(existsSync(assetsDir(file)), false);
  }));

test("a file over 50 MB is refused before it is read", () =>
  withFile((file, src, dir) => {
    slot(file);
    assert.equal(maxAssetBytes, 50 * 1024 * 1024);
    const big = src("big.png", png());
    truncateSync(big, maxAssetBytes + 1);
    assert.throws(() => addAsset(file, { slotId: "capsule", label: "big", from: big, now: NOW }), /the limit is 52428800 bytes \(50 MB\)/);
    assert.equal(existsSync(assetsDir(file)), false);
    const edge = src("edge.png", png());
    truncateSync(edge, maxAssetBytes);
    assert.equal(addAsset(file, { slotId: "capsule", label: "edge", from: edge, now: NOW }).record.bytes, maxAssetBytes, "exactly 50 MB is within the limit");
  }));

test("the same content twice in a slot is refused, naming the first asset; another slot may hold it", () =>
  withFile((file, src) => {
    slot(file);
    slot(file, { id: "banner", name: "Store banner" });
    const buffer = png(4, 4, 9);
    addAsset(file, { slotId: "capsule", label: "Original", from: src("o.png", buffer), id: "orig", now: NOW });
    const before = bytes(file);
    assert.throws(
      () => addAsset(file, { slotId: "capsule", label: "Copy", from: src("copy.png", buffer), now: NOW }),
      /already has this file as asset "orig" \("Original", candidate\)/,
    );
    assert.equal(bytes(file), before);
    assert.deepEqual(readdirSync(join(assetsDir(file), "capsule")), ["orig.png"]);
    rejectAsset(file, "orig", { rationale: "off palette", now: LATER });
    assert.throws(() => addAsset(file, { slotId: "capsule", label: "Copy", from: src("copy.png", buffer), now: LATER }), /asset "orig".*rejected/, "a rejected asset still counts");
    assert.equal(addAsset(file, { slotId: "banner", label: "Same art", from: src("copy.png", buffer), now: LATER }).changed, true);
  }));

test("a ledger write that fails removes the copied file and the folders it made", () =>
  withFile((file, src, dir) => {
    slot(file);
    const before = bytes(file);
    // A source note over the 20000 characters the ledger allows: the copy is made, then validation refuses.
    assert.throws(() => addAsset(file, { slotId: "capsule", label: "x", from: src("a.png", png()), source: "s".repeat(20001), id: "doomed", now: NOW }), /20000/);
    assert.equal(bytes(file), before);
    assert.equal(existsSync(assetsDir(file)), false, "the folders it created are gone too");
    // A folder that already held assets keeps its other files.
    asset(file, src, "keep");
    assert.throws(() => addAsset(file, { slotId: "capsule", label: "x", from: src("b.png", png(5, 5)), source: "s".repeat(20001), id: "doomed2", now: NOW }), /20000/);
    assert.deepEqual(readdirSync(join(assetsDir(file), "capsule")), ["keep.png"]);
    assert.equal(readWorkspace(file).assets.length, 1);
  }));

test("a stale revision is refused and nothing is copied", () =>
  withFile((file, src) => {
    slot(file);
    assert.throws(() => asset(file, src, "a", { revision: 0 }), /Revision conflict/);
    assert.equal(existsSync(assetsDir(file)), false);
    assert.equal(asset(file, src, "a", { revision: 1 }).revision, 2);
  }));

test("an asset of another kind than its slot is saved with a warning", () =>
  withFile((file, src) => {
    slot(file, { id: "trailer", name: "Trailer", kind: "video" });
    const out = addAsset(file, { slotId: "trailer", label: "Still", from: src("s.png", png()), now: NOW });
    assert.deepEqual(out.warnings, ['Asset "trailer-1" is image but slot "Trailer" expects video']);
  }));

test("supersedes names another asset of the slot", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    const out = asset(file, src, "b", { supersedes: "a" });
    assert.equal(out.record.supersedes, "a");
    assert.throws(() => asset(file, src, "c", { supersedes: "ghost" }), /not an asset in slot "capsule"/);
  }));

test("resolveAssetFile returns the real path of a copied file and nothing else", () =>
  withFile((file, src, dir) => {
    slot(file);
    const a = asset(file, src, "a").record,
      path = resolveAssetFile(file, a);
    assert.ok(path && existsSync(path));
    assert.ok(readFileSync(path).equals(readFileSync(join(assetsDir(file), "capsule", "a.png"))));
    writeFileSync(join(dir, "secret.png"), png());
    for (const file_ of ["../secret.png", "capsule/../../secret.png", "capsule/../../hull.json", "/etc/passwd", "C:/Windows/win.ini", "capsule\\a.png", "..", "", "capsule//a.png", "./capsule/a.png", "capsule/missing.png"])
      assert.equal(resolveAssetFile(file, { ...a, file: file_ }), null, JSON.stringify(file_));
    assert.equal(resolveAssetFile(file, { ...a, file: undefined }), null);
    assert.equal(resolveAssetFile(file, undefined), null);
    assert.equal(resolveAssetFile(file, { id: "l", url: "https://example.com" }), null);
    assert.equal(resolveAssetFile(file, { ...a, file: "capsule" }), null, "a folder is not a file");
    assert.equal(resolveAssetFile(join(dir, "other.json"), a), null, "no assets folder");
  }));

test("a symbolic link that leaves the assets folder is not followed", (t) =>
  withFile((file, src, dir) => {
    slot(file);
    const a = asset(file, src, "a").record,
      secret = join(dir, "secret.png");
    writeFileSync(secret, png(2, 2));
    try {
      symlinkSync(secret, join(assetsDir(file), "capsule", "evil.png"), "file");
    } catch (e) {
      t.skip(`cannot create symbolic links here: ${e.code}`);
      return;
    }
    assert.equal(resolveAssetFile(file, { ...a, id: "evil", file: "capsule/evil.png" }), null);
    // A folder link that points out is refused too, and a link that stays inside is fine.
    // Only a refusal to make the link skips this; a failed assertion must fail the test.
    let junction = true;
    try {
      symlinkSync(dir, join(assetsDir(file), "outside"), "junction");
    } catch (e) {
      if (!["EPERM", "EACCES"].includes(e.code)) throw e;
      junction = false;
    }
    if (junction) assert.equal(resolveAssetFile(file, { ...a, file: "outside/secret.png" }), null);
    symlinkSync(join(assetsDir(file), "capsule", "a.png"), join(assetsDir(file), "capsule", "inside.png"), "file");
    assert.ok(resolveAssetFile(file, { ...a, file: "capsule/inside.png" }));
  }));

// ---- Picking ----------------------------------------------------------------------------------

test("the first pick selects the asset, picks the slot and records a decision, all in one write", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    const before = readWorkspace(file);
    const out = pickAsset(file, "b", { rationale: "Reads best at thumbnail size", now: LATER });
    assert.equal(out.changed, true);
    assert.equal(out.revision, before.revision + 1);
    assert.equal(out.record.status, "selected");
    assert.equal(out.record.rationale, "Reads best at thumbnail size");
    assert.equal(out.record.decidedAt, LATER);
    const w = readWorkspace(file);
    assert.deepEqual(w.assets.find((a) => a.id === "a").status, "candidate");
    const s = w.assetSlots[0];
    assert.equal(s.status, "picked");
    assert.equal(s.selectedAssetId, "b");
    assert.equal(s.decisionId, "pick-capsule");
    assert.equal(w.decisions.length, 1);
    assert.deepEqual(w.decisions[0], {
      id: "pick-capsule",
      projectId: "game",
      initiativeId: "video",
      title: "Pick Steam main capsule",
      question: "Which candidate is the Steam main capsule? Spec: 1232x706 PNG",
      status: "decided",
      options: [
        { id: "a", label: "Capsule a", summary: "agent composite a" },
        { id: "b", label: "Capsule b", summary: "agent composite b" },
      ],
      chosen: "b",
      rationale: "Reads best at thumbnail size",
      decidedAt: LATER,
    });
    assert.deepEqual(out.decision, w.decisions[0]);
    assert.deepEqual(out.slot, s);
    assert.equal(w.updates.length, before.updates.length + 1, "one update for the whole pick");
    assert.deepEqual(w.updates.at(-1), out.update);
    assert.equal(out.update.kind, "asset");
    assert.equal(out.update.refId, "b");
    assert.equal(out.update.initiativeId, "video");
    assert.equal(out.update.at, LATER);
    assert.match(out.update.text, /^Picked "Capsule b" for "Steam main capsule" \(Reads best at thumbnail size\)$/);
    assert.deepEqual(out.warnings, []);
  }));

test("picking another asset changes the same decision and keeps the old choice in its history", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    pickAsset(file, "a", { rationale: "first thought", now: LATER });
    asset(file, src, "c", { now: LATER });
    const out = pickAsset(file, "c", { rationale: "the playtest preferred it", now: LATEST });
    const w = readWorkspace(file);
    assert.equal(w.decisions.length, 1, "the same decision, not a new one");
    const d = w.decisions[0];
    assert.equal(d.chosen, "c");
    assert.equal(d.decidedAt, LATEST);
    assert.equal(d.rationale, "the playtest preferred it");
    assert.deepEqual(d.history, [{ chosen: "a", rationale: "first thought", decidedAt: LATER }]);
    assert.deepEqual(d.options.map((o) => o.id), ["a", "b", "c"], "a candidate added after the first pick joins the options");
    const a = w.assets.find((x) => x.id === "a");
    assert.equal(a.status, "candidate");
    assert.match(a.rationale, /^Replaced by "Capsule c" \(was picked: first thought\)$/);
    assert.equal(a.decidedAt, LATEST);
    assert.equal(w.assets.find((x) => x.id === "c").status, "selected");
    assert.equal(w.assetSlots[0].selectedAssetId, "c");
    assert.match(out.update.text, /^Changed the pick for "Steam main capsule" from "Capsule a" to "Capsule c" \(the playtest preferred it\)$/);
    // And back again: the history grows, the files are all still there.
    pickAsset(file, "a", { now: "2026-10-14T00:00:00.000Z" });
    const back = readWorkspace(file).decisions[0];
    assert.equal(back.history.length, 2);
    assert.deepEqual(back.history[1], { chosen: "c", rationale: "the playtest preferred it", decidedAt: LATEST });
    assert.equal(back.rationale, undefined, "a new choice does not inherit the old reasons");
    assert.deepEqual(readdirSync(join(assetsDir(file), "capsule")).sort(), ["a.png", "b.png", "c.png"]);
  }));

test("picking records the same decision shape that decide --change would", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    pickAsset(file, "a", { rationale: "r1", now: LATER });
    pickAsset(file, "b", { rationale: "r2", now: LATEST });
    const d = readWorkspace(file).decisions[0];
    assert.deepEqual(Object.keys(d.history[0]).sort(), ["chosen", "decidedAt", "rationale"]);
    assert.equal(d.status, "decided");
  }));

test("picking what is already picked writes nothing; a new reason updates it in place", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    pickAsset(file, "a", { rationale: "clear", now: LATER });
    const before = bytes(file);
    const again = pickAsset(file, "a", { now: LATEST });
    assert.equal(again.changed, false);
    assert.equal(again.update, null);
    assert.equal(again.record.status, "selected");
    assert.equal(pickAsset(file, "a", { rationale: "clear", now: LATEST }).changed, false);
    assert.equal(bytes(file), before);
    const reworded = pickAsset(file, "a", { rationale: "clearer still", now: LATEST });
    assert.equal(reworded.changed, true);
    const w = readWorkspace(file);
    assert.equal(w.assets[0].rationale, "clearer still");
    assert.equal(w.decisions[0].rationale, "clearer still");
    assert.equal(w.decisions[0].history, undefined, "no change of choice, no history");
    assert.match(reworded.update.text, /Updated why "Capsule a" is the pick.*clearer still/);
  }));

test("a pick without a rationale is allowed", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    const out = pickAsset(file, "a", { now: LATER });
    assert.equal(out.record.rationale, undefined);
    assert.equal(out.decision.rationale, undefined);
    assert.equal(out.update.text, 'Picked "Capsule a" for "Steam main capsule"');
  }));

test("a slot ID picks its only candidate; with none or several it asks for the asset", () =>
  withFile((file, src) => {
    slot(file);
    assert.throws(() => pickAsset(file, "capsule", {}), /has 0 candidates; name the asset to pick/);
    asset(file, src, "a");
    assert.equal(pickAsset(file, "capsule", { now: LATER }).record.id, "a");
    slot(file, { id: "banner", name: "Banner" });
    addAsset(file, { slotId: "banner", label: "one", url: "https://example.com/1", id: "b1", now: NOW });
    addAsset(file, { slotId: "banner", label: "two", url: "https://example.com/2", id: "b2", now: NOW });
    assert.throws(() => pickAsset(file, "banner", {}), /has 2 candidates \(b1, b2\); name the asset to pick/);
    assert.throws(() => pickAsset(file, "ghost", {}), /Asset "ghost" does not exist/);
  }));

test("a retired asset cannot be picked until restored; a rejected one can", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    retireAsset(file, "a", { now: LATER });
    assert.throws(() => pickAsset(file, "a", {}), /retired; restore it/);
    rejectAsset(file, "b", { rationale: "too dark", now: LATER });
    const out = pickAsset(file, "b", { rationale: "brightened since", now: LATEST });
    assert.equal(out.record.status, "selected");
    assert.equal(out.record.rationale, "brightened since");
  }));

test("link and copy assets can be picked, and the decision lists them with their source", () =>
  withFile((file) => {
    slot(file, { id: "blurb", name: "Short blurb", kind: "text" });
    addAsset(file, { slotId: "blurb", label: "Calm", text: "Grow a tiny planet.", source: "agent draft 1", id: "calm", now: NOW });
    addAsset(file, { slotId: "blurb", label: "Punchy", text: "Plant. Grow. Repeat.", id: "punchy", now: NOW });
    const out = pickAsset(file, "punchy", { rationale: "shorter", now: LATER });
    assert.deepEqual(out.decision.options, [{ id: "calm", label: "Calm", summary: "agent draft 1" }, { id: "punchy", label: "Punchy" }]);
  }));

test("a decision already using the usual ID is left alone and the pick gets the next free one", () =>
  withFile((file) => {
    slot(file);
    mutateWorkspace(file, (w) => {
      w.decisions.push({ id: "pick-capsule", projectId: "game", title: "Unrelated", question: "?", status: "open", options: [] });
    });
    addAsset(file, { slotId: "capsule", label: "A", url: "https://example.com/a", id: "a", now: NOW });
    const out = pickAsset(file, "a", { now: LATER });
    assert.equal(out.decision.id, "pick-capsule-2");
    const w = readWorkspace(file);
    assert.equal(w.assetSlots[0].decisionId, "pick-capsule-2");
    assert.equal(w.decisions.find((d) => d.id === "pick-capsule").status, "open");
  }));

// ---- Reject, restore, retire --------------------------------------------------------------------

test("rejecting needs a reason, keeps the file and says why in the log", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    const before = bytes(file);
    assert.throws(() => rejectAsset(file, "a", {}), /Required: rationale/);
    assert.throws(() => rejectAsset(file, "a", { rationale: "  " }), /Required: rationale/);
    assert.throws(() => rejectAsset(file, "ghost", { rationale: "x" }), /Asset "ghost" does not exist/);
    assert.equal(bytes(file), before);
    const out = rejectAsset(file, "a", { rationale: "text unreadable at 231px", now: LATER });
    assert.equal(out.record.status, "rejected");
    assert.equal(out.record.rationale, "text unreadable at 231px");
    assert.equal(out.record.decidedAt, LATER);
    assert.equal(out.update.kind, "asset");
    assert.equal(out.update.refId, "a");
    assert.match(out.update.text, /Rejected "Capsule a".*text unreadable at 231px/);
    assert.ok(existsSync(join(assetsDir(file), "capsule", "a.png")), "a rejected file is kept");
    assert.ok(resolveAssetFile(file, out.record), "and still reachable");
  }));

test("rejecting the selected asset opens the slot again and keeps its decision as it was", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    pickAsset(file, "a", { rationale: "good", now: LATER });
    const out = rejectAsset(file, "a", { rationale: "the store crops it", now: LATEST });
    const w = readWorkspace(file);
    assert.equal(w.assetSlots[0].status, "open");
    assert.equal(w.assetSlots[0].selectedAssetId, undefined);
    assert.equal(w.assetSlots[0].decisionId, "pick-capsule");
    assert.equal(w.decisions[0].status, "decided");
    assert.equal(w.decisions[0].chosen, "a");
    assert.match(out.update.text, /"Steam main capsule" is open again/);
    assert.equal(out.slot.status, "open");
    // The next pick is a change of that decision, and the history keeps the rejected choice.
    pickAsset(file, "b", { rationale: "safe margins", now: "2026-10-14T00:00:00.000Z" });
    const d = readWorkspace(file).decisions[0];
    assert.equal(d.chosen, "b");
    assert.deepEqual(d.history, [{ chosen: "a", rationale: "good", decidedAt: LATER }]);
  }));

test("rejecting twice with the same reason writes nothing; a new reason is recorded", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    rejectAsset(file, "a", { rationale: "dull", now: LATER });
    const before = bytes(file);
    const again = rejectAsset(file, "a", { rationale: "dull", now: LATEST });
    assert.equal(again.changed, false);
    assert.equal(again.update, null);
    assert.equal(bytes(file), before);
    const reworded = rejectAsset(file, "a", { rationale: "dull and blurry", now: LATEST });
    assert.equal(reworded.changed, true);
    assert.equal(reworded.record.rationale, "dull and blurry");
    assert.match(reworded.update.text, /Updated why "Capsule a" was rejected/);
  }));

test("restoring brings a rejected or retired asset back as a candidate; candidates are left alone", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    rejectAsset(file, "a", { rationale: "dull", now: LATER });
    const out = restoreAsset(file, "a", { now: LATEST });
    assert.equal(out.record.status, "candidate");
    assert.equal(out.record.rationale, undefined);
    assert.equal(out.record.decidedAt, undefined);
    assert.match(out.update.text, /Restored "Capsule a".*was rejected: dull/);
    retireAsset(file, "b", { now: LATER });
    assert.equal(restoreAsset(file, "b", { now: LATEST }).record.status, "candidate");
    const before = bytes(file);
    assert.equal(restoreAsset(file, "a", { now: LATEST }).changed, false);
    pickAsset(file, "a", { now: LATEST });
    const picked = bytes(file);
    assert.equal(restoreAsset(file, "a", { now: LATEST }).changed, false, "the selected asset is already in play");
    assert.equal(bytes(file), picked);
    assert.notEqual(picked, before);
    assert.throws(() => restoreAsset(file, "ghost"), /Asset "ghost" does not exist/);
  }));

test("retiring takes an asset out of the running without a verdict; the selected one reopens its slot", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    asset(file, src, "b");
    const plain = retireAsset(file, "b", { now: LATER });
    assert.equal(plain.record.status, "retired");
    assert.equal(plain.record.rationale, undefined);
    assert.match(plain.update.text, /^Retired "Capsule b" in "Steam main capsule"$/);
    const before = bytes(file);
    assert.equal(retireAsset(file, "b", { now: LATEST }).changed, false);
    assert.equal(bytes(file), before);
    pickAsset(file, "a", { now: LATER });
    const out = retireAsset(file, "a", { rationale: "v2 replaces it", now: LATEST });
    assert.equal(out.record.rationale, "v2 replaces it");
    assert.equal(readWorkspace(file).assetSlots[0].status, "open");
    assert.match(out.update.text, /Retired "Capsule a".*v2 replaces it.*open again/);
    assert.throws(() => rejectAsset(file, "a", { rationale: "x" }), /retired; restore it first/);
    assert.deepEqual(readdirSync(join(assetsDir(file), "capsule")).sort(), ["a.png", "b.png"]);
  }));

test("every command honours the expected revision", () =>
  withFile((file, src) => {
    slot(file);
    asset(file, src, "a");
    const stale = 0,
      before = bytes(file);
    assert.throws(() => pickAsset(file, "a", { revision: stale }), /Revision conflict/);
    assert.throws(() => rejectAsset(file, "a", { rationale: "x", revision: stale }), /Revision conflict/);
    assert.throws(() => retireAsset(file, "a", { revision: stale }), /Revision conflict/);
    assert.throws(() => restoreAsset(file, "a", { revision: stale }), /Revision conflict/);
    assert.throws(() => slot(file, { id: "z", revision: stale }), /Revision conflict/);
    assert.equal(bytes(file), before);
  }));

test("listAssets and listSlots filter by project, slot and status", () =>
  withFile((file, src) => {
    slot(file);
    slot(file, { id: "banner", name: "Banner" });
    asset(file, src, "a");
    asset(file, src, "b");
    addAsset(file, { slotId: "banner", label: "Link", url: "https://example.com/x", id: "l", now: NOW });
    rejectAsset(file, "b", { rationale: "no", now: LATER });
    const w = readWorkspace(file);
    assert.deepEqual(listAssets(w).map((a) => a.id), ["a", "b", "l"]);
    assert.deepEqual(listAssets(w, { slotId: "capsule" }).map((a) => a.id), ["a", "b"]);
    assert.deepEqual(listAssets(w, { status: "rejected" }).map((a) => a.id), ["b"]);
    assert.deepEqual(listAssets(w, { slotId: "capsule", status: "candidate" }).map((a) => a.id), ["a"]);
    assert.deepEqual(listAssets(w, { projectId: "nope" }), []);
    assert.deepEqual(listAssets(w, { projectId: "game" }).length, 3);
    assert.deepEqual(listSlots(w, { slotId: "banner" }).map((s) => s.id), ["banner"]);
    assert.equal(listSlots(w, { projectId: "game" }).length, 2);
    listAssets(w)[0].label = "mutated";
    assert.equal(w.assets[0].label, "Capsule a", "results are copies");
    assert.deepEqual(listAssets({}), []);
  }));

test("a long run of picks, rejections and restores leaves one selected asset and the full history", () =>
  withFile((file, src) => {
    slot(file);
    for (const id of ["a", "b", "c"]) asset(file, src, id);
    pickAsset(file, "a", { now: NOW });
    pickAsset(file, "b", { now: LATER });
    rejectAsset(file, "b", { rationale: "r", now: LATER });
    restoreAsset(file, "b", { now: LATER });
    retireAsset(file, "c", { now: LATER });
    pickAsset(file, "b", { now: LATEST });
    const w = readWorkspace(file);
    assert.equal(w.assets.filter((a) => a.status === "selected").length, 1);
    assert.equal(w.decisions[0].history.length, 2);
  }));
