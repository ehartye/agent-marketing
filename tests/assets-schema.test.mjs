import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collections,
  emptyWorkspace,
  validateWorkspace,
  recordFields,
  workspaceWarnings,
  patchWarnings,
  assetExtensions,
  assetMediaTypes,
  assetPathProblem,
  maxAssetBytes,
} from "../src/schema.mjs";
import { ledger as fixture, initiative as baseInitiative } from "./fixtures.mjs";

const ledger = () => structuredClone(fixture());
const NOW = "2026-10-11T10:00:00.000Z";
const SHA = "a".repeat(64);
const slot = (over = {}) => ({ id: "capsule", projectId: "game", name: "Steam main capsule", kind: "image", status: "open", ...over });
const asset = (id, over = {}) => ({
  id,
  projectId: "game",
  slotId: "capsule",
  label: `Capsule ${id}`,
  kind: "image",
  file: `capsule/${id}.png`,
  mediaType: "image/png",
  bytes: 1200,
  sha256: SHA,
  width: 1232,
  height: 706,
  status: "candidate",
  createdAt: NOW,
  ...over,
});
// An asset with no file: a link or a piece of copy.
const bare = (id, over = {}) => {
  const { file, mediaType, bytes, sha256, width, height, ...rest } = asset(id);
  return { ...rest, ...over };
};
const decision = (over = {}) => ({
  id: "pick-capsule",
  projectId: "game",
  title: "Pick Steam main capsule",
  question: "Which?",
  status: "decided",
  options: [{ id: "a1", label: "A" }],
  chosen: "a1",
  decidedAt: NOW,
  ...over,
});
const bad = (w, pattern) => assert.throws(() => validateWorkspace(w), pattern);
const withRecords = (extra) => Object.assign(ledger(), extra);

test("assetSlots and assets are collections that older workspaces gain empty", () => {
  for (const k of ["assetSlots", "assets"]) {
    assert.ok(collections.includes(k), k);
    assert.deepEqual(emptyWorkspace()[k], []);
    assert.ok(recordFields[k].includes("projectId"), k);
  }
  const old = ledger();
  for (const k of ["reports", "gates", "decisions", "actions", "updates", "assetSlots", "assets"]) delete old[k];
  const w = validateWorkspace(old);
  assert.deepEqual(w.assetSlots, []);
  assert.deepEqual(w.assets, []);
  assert.deepEqual(workspaceWarnings(w), []);
});

test("an open slot with candidates and a picked slot with its decision validate", () => {
  assert.ok(
    validateWorkspace(
      withRecords({
        initiatives: [baseInitiative],
        assetSlots: [slot({ spec: "1232x706 PNG", notes: "n", initiativeId: "video" })],
        assets: [asset("a1"), asset("a2", { sha256: "b".repeat(64) })],
      }),
    ),
  );
  const picked = withRecords({
    decisions: [decision()],
    assetSlots: [slot({ status: "picked", selectedAssetId: "a1", decisionId: "pick-capsule" })],
    assets: [
      asset("a1", { status: "selected", rationale: "reads small", decidedAt: NOW, source: "agent v3" }),
      asset("a2", { status: "rejected", rationale: "too busy", supersedes: "a1" }),
    ],
  });
  assert.ok(validateWorkspace(picked));
  assert.deepEqual(workspaceWarnings(picked), []);
});

test("a slot needs a project, a name and a known kind and status", () => {
  bad(withRecords({ assetSlots: [slot({ projectId: "nope" })] }), /projectId/);
  bad(withRecords({ assetSlots: [slot({ name: "" })] }), /name/);
  bad(withRecords({ assetSlots: [slot({ kind: "audio" })] }), /kind/);
  bad(withRecords({ assetSlots: [slot({ status: "closed" })] }), /status/);
  bad(withRecords({ assetSlots: [slot({ spec: "" })] }), /spec/);
  bad(withRecords({ assetSlots: [slot({ initiativeId: "ghost" })] }), /initiativeId/);
  bad(withRecords({ assetSlots: [slot({ decisionId: "ghost" })] }), /decisionId/);
});

test("a picked slot names a selected asset of its own, and an open slot names none", () => {
  const picked = (over, assets) => withRecords({ assetSlots: [slot({ status: "picked", ...over })], assets });
  bad(picked({}, [asset("a1")]), /selectedAssetId/);
  bad(picked({ selectedAssetId: "ghost" }, [asset("a1")]), /not an asset in this slot/);
  bad(picked({ selectedAssetId: "a1" }, [asset("a1")]), /not selected/);
  bad(
    withRecords({
      assetSlots: [slot(), slot({ id: "other", status: "picked", selectedAssetId: "a1" })],
      assets: [asset("a1", { status: "selected" })],
    }),
    /not an asset in this slot|open slot has a selected/,
  );
  bad(withRecords({ assetSlots: [slot({ selectedAssetId: "a1" })], assets: [asset("a1", { status: "selected" })] }), /open slot has no selected/);
  bad(withRecords({ assetSlots: [slot()], assets: [asset("a1", { status: "selected" })] }), /open slot has a selected/);
});

test("a selected asset must be the one its slot names", () => {
  bad(
    withRecords({
      assetSlots: [slot({ status: "picked", selectedAssetId: "a1" })],
      assets: [asset("a1", { status: "selected" }), asset("a2", { status: "selected" })],
    }),
    /more than one selected/,
  );
});

test("an asset belongs to a slot of its own project", () => {
  bad(withRecords({ assetSlots: [slot()], assets: [asset("a1", { slotId: "ghost" })] }), /slotId/);
  bad(withRecords({ assetSlots: [slot()], assets: [asset("a1", { projectId: "nope" })] }), /projectId/);
  const other = withRecords({
    projects: [fixture().projects[0], { ...fixture().projects[0], id: "other" }],
    assetSlots: [slot()],
    assets: [asset("a1", { projectId: "other" })],
  });
  bad(other, /not an asset slot in this project/);
});

test("exactly one of file, url or text is required", () => {
  const w = (a) => withRecords({ assetSlots: [slot()], assets: [a] });
  bad(w(bare("a1")), /exactly one of file, url or text/);
  bad(w({ ...asset("a1"), url: "https://example.com/x" }), /exactly one/);
  bad(w(bare("a1", { kind: "text", text: "Hi", url: "https://example.com/x" })), /exactly one/);
  assert.ok(validateWorkspace(w(bare("a1", { kind: "link", url: "https://claude.ai/artifact/abc" }))));
  assert.ok(validateWorkspace(w(bare("a1", { kind: "text", text: "Wishlist the calm planet game" }))));
  bad(w(bare("a1", { kind: "image", url: "https://example.com/x" })), /is a link/);
  bad(w(bare("a1", { kind: "image", text: "Hi" })), /is text/);
});

test("a file path is relative, forward-slashed and has no parent segment", () => {
  const w = (file) => withRecords({ assetSlots: [slot()], assets: [asset("a1", { file })] });
  for (const file of [
    "../escape.png",
    "capsule/../../x.png",
    "/etc/passwd.png",
    "C:/x.png",
    "c:x.png",
    "capsule\\a1.png",
    "\\\\server\\share\\a.png",
    "capsule//a1.png",
    "./a1.png",
    "capsule/a:1.png",
    "capsule/a1.png ",
    "capsule/..",
  ])
    bad(w(file), /file|\.\.|absolute|backslash|segment|portable/i);
  bad(w(""), /file/);
  assert.ok(validateWorkspace(w("capsule/a1.png")));
  assert.ok(validateWorkspace(w("deep/er/a1.png")));
  assert.match(assetPathProblem("../x"), /\.\./);
  assert.match(assetPathProblem("/x"), /absolute/);
  assert.match(assetPathProblem("a\\b"), /backslash/);
  assert.equal(assetPathProblem("ok/a.png"), undefined);
});

test("a link must be an https URL, and text is limited to 4000 characters", () => {
  const link = (url) => withRecords({ assetSlots: [slot()], assets: [bare("a1", { kind: "link", url })] });
  bad(link("http://example.com/x"), /https/);
  bad(link("javascript:alert(1)"), /https/);
  bad(link("file:///c:/x"), /https/);
  bad(link("https://user:pw@example.com/x"), /https/);
  bad(link("not a url"), /https/);
  assert.ok(validateWorkspace(link("https://example.com/x")));
  const copy = (text) => withRecords({ assetSlots: [slot({ kind: "text" })], assets: [bare("a1", { kind: "text", text })] });
  assert.ok(validateWorkspace(copy("x".repeat(4000))));
  bad(copy("x".repeat(4001)), /4000/);
  bad(copy("  "), /nonempty/);
});

test("media types are a whitelist: no svg, html, script or executable", () => {
  assert.deepEqual(
    [...assetMediaTypes].sort(),
    ["application/pdf", "image/gif", "image/jpeg", "image/png", "image/webp", "text/markdown", "text/plain", "video/mp4", "video/webm"],
  );
  const w = (over) => withRecords({ assetSlots: [slot()], assets: [asset("a1", over)] });
  for (const [file, mediaType] of [
    ["capsule/a1.svg", "image/svg+xml"],
    ["capsule/a1.html", "text/html"],
    ["capsule/a1.js", "text/javascript"],
    ["capsule/a1.exe", "application/x-msdownload"],
    ["capsule/a1.png", "image/svg+xml"],
    ["capsule/a1.png", "text/html"],
  ])
    bad(w({ file, mediaType }), /extension|media type|one of/i);
  for (const ext of Object.keys(assetExtensions)) assert.ok(!/svg|html|js|exe|bat/.test(ext), ext);
  bad(w({ mediaType: undefined }), /media type/);
  bad(w({ mediaType: "image/jpeg" }), /does not match the file extension/);
  bad(w({ kind: "video" }), /does not fit kind/);
  bad(w({ kind: "link" }), /not a link/);
  assert.ok(validateWorkspace(w({ file: "capsule/a1.jpg", mediaType: "image/jpeg" })));
  assert.ok(validateWorkspace(w({ kind: "video", file: "capsule/a1.mp4", mediaType: "video/mp4" })));
  assert.ok(validateWorkspace(w({ kind: "document", file: "capsule/a1.pdf", mediaType: "application/pdf" })));
  assert.ok(validateWorkspace(w({ kind: "document", file: "capsule/a1.md", mediaType: "text/markdown" })));
});

test("size, hash, dimensions, status and timestamps are checked", () => {
  const w = (over) => withRecords({ assetSlots: [slot()], assets: [asset("a1", over)] });
  assert.equal(maxAssetBytes, 50 * 1024 * 1024);
  assert.ok(validateWorkspace(w({ bytes: maxAssetBytes })));
  bad(w({ bytes: maxAssetBytes + 1 }), /byte limit/);
  bad(w({ bytes: -1 }), /bytes/);
  bad(w({ bytes: 1.5 }), /bytes/);
  bad(w({ sha256: "xyz" }), /sha256/);
  bad(w({ sha256: "A".repeat(64) }), /sha256/);
  bad(w({ width: 0 }), /width/);
  bad(w({ height: 2.5 }), /height/);
  bad(w({ status: "approved" }), /status/);
  bad(w({ label: "" }), /label/);
  bad(w({ createdAt: undefined }), /createdAt/);
  bad(w({ decidedAt: "2026-10-11" }), /decidedAt/);
  bad(w({ rationale: "" }), /rationale/);
  bad(w({ source: "" }), /source/);
});

test("supersedes names another asset of the same slot", () => {
  const w = (over) =>
    withRecords({
      assetSlots: [slot(), slot({ id: "banner" })],
      assets: [asset("a1"), asset("a2", over), asset("b1", { slotId: "banner", file: "banner/b1.png" })],
    });
  assert.ok(validateWorkspace(w({ supersedes: "a1" })));
  bad(w({ supersedes: "b1" }), /same slot/);
  bad(w({ supersedes: "ghost" }), /same slot/);
  bad(w({ supersedes: "a2" }), /itself/);
});

test("a slot's decision must be a decision of the project", () => {
  bad(withRecords({ decisions: [decision()], assetSlots: [slot({ decisionId: "nope" })] }), /decisionId/);
  assert.ok(
    validateWorkspace(
      withRecords({
        decisions: [decision({ status: "open", chosen: undefined, decidedAt: undefined })],
        assetSlots: [slot({ decisionId: "pick-capsule" })],
      }),
    ),
  );
});

test("asset fields are known to the unknown-field warning", () => {
  assert.deepEqual(patchWarnings({ assetSlots: [slot()], assets: [asset("a1")] }), []);
  const { sha256, ...without } = asset("a1");
  assert.match(patchWarnings({ assets: [{ ...without, sha265: SHA }] })[0], /unknown field "sha265".*sha256/);
});
