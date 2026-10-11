import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createWorkspace, readWorkspace } from "../src/store.mjs";
import { startServer } from "../src/server.mjs";
import { receiveUpload } from "../src/asset-http.mjs";
import { Readable } from "node:stream";
import { addSlot, addAsset, assetsDir, maxAssetBytes, resolveAssetFile } from "../src/assets.mjs";
import { ledger } from "./fixtures.mjs";
import { png, pdf } from "./images.mjs";

const NOW = "2026-10-11T10:00:00.000Z";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
// A video-shaped file: the first bytes say mp4, the rest is filler a range request can slice.
const video = () => Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypisom", "latin1"), Buffer.alloc(988, 7)]);
const uploadDirs = () => readdirSync(tmpdir()).filter((n) => n.startsWith("marketing-upload-"));

// A desk on a fresh workspace with one slot ("capsule") holding a PNG, a video, a PDF, a markdown
// file, a link and a text variant. `src` writes a source file; `post` sends JSON with the current
// revision; `get` fetches raw.
async function desk(body, { catalog } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-assets-desk-")),
    file = join(dir, "hull.json"),
    srcDir = join(dir, "src");
  mkdirSync(srcDir);
  const src = (name, buffer) => {
    const path = join(srcDir, name);
    writeFileSync(path, buffer);
    return path;
  };
  createWorkspace(file, structuredClone(ledger()));
  addSlot(file, { id: "capsule", name: "Steam main capsule", kind: "image", spec: "1232x706", initiativeId: "video", now: NOW });
  const image = png(8, 6, 1);
  addAsset(file, { slotId: "capsule", label: "Dusk", from: src("dusk.png", image), id: "dusk", now: NOW });
  addAsset(file, { slotId: "capsule", label: "Trailer cut", from: src("cut.mp4", video()), id: "cut", now: NOW });
  addAsset(file, { slotId: "capsule", label: "One sheet", from: src("sheet.pdf", pdf(1)), id: "sheet", now: NOW });
  addAsset(file, { slotId: "capsule", label: "Blurb", from: src("blurb.md", Buffer.from("# Hello\nA blurb.\n")), id: "blurb", now: NOW });
  addAsset(file, { slotId: "capsule", label: "Page", url: "https://example.com/a", id: "page", now: NOW });
  addAsset(file, { slotId: "capsule", label: "Tagline", text: "Grow a hull.", id: "tagline", now: NOW });
  let running;
  try {
    running = await startServer(file, { port: 0, catalog });
    const base = running.url;
    const rev = () => readWorkspace(file).revision;
    const post = async (path, data, { revision = rev(), workspaceId } = {}) => {
      const payload = { ...data };
      if (revision !== null) payload.revision = revision;
      if (workspaceId !== undefined) payload.workspaceId = workspaceId;
      const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return { status: r.status, body: await r.json() };
    };
    const upload = async (query, bytes, { type = "application/octet-stream", revision = rev() } = {}) => {
      const q = new URLSearchParams({ slotId: "capsule", ...(revision === null ? {} : { revision }), ...query });
      const r = await fetch(`${base}/api/asset/upload?${q}`, { method: "POST", headers: { "Content-Type": type }, body: bytes });
      return { status: r.status, body: await r.json() };
    };
    return await body({ file, base, dir, src, post, upload, image, read: () => readWorkspace(file), get: (path, headers = {}) => fetch(base + path, { headers }) });
  } finally {
    if (running) await new Promise((resolve) => running.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("GET /assets/<id> serves the file's bytes with its stored type, nosniff and a revalidating cache", () =>
  desk(async ({ get, image }) => {
    const r = await get("/assets/dusk");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(r.headers.get("content-disposition"), /^inline/);
    assert.equal(r.headers.get("cache-control"), "private, max-age=0, must-revalidate");
    assert.equal(r.headers.get("etag"), `"${sha(image)}"`);
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), image);
    const pdfResponse = await get("/assets/sheet");
    assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
    assert.match(pdfResponse.headers.get("content-disposition"), /^inline/);
  }));

test("markdown is served as plain text so a browser shows it and never renders it", () =>
  desk(async ({ get }) => {
    const r = await get("/assets/blurb");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await r.text(), "# Hello\nA blurb.\n");
  }));

test("a matching If-None-Match gets 304 with the validators and no body", () =>
  desk(async ({ get, image }) => {
    const tag = `"${sha(image)}"`;
    for (const header of [tag, `"other", ${tag}`, "*"]) {
      const r = await get("/assets/dusk", { "If-None-Match": header });
      assert.equal(r.status, 304, header);
      assert.equal(r.headers.get("etag"), tag);
      assert.equal(r.headers.get("cache-control"), "private, max-age=0, must-revalidate");
      assert.equal((await r.arrayBuffer()).byteLength, 0);
    }
    assert.equal((await get("/assets/dusk", { "If-None-Match": '"stale"' })).status, 200);
  }));

test("range requests give 206 slices for video, and 416 when the range is outside the file", () =>
  desk(async ({ get }) => {
    const whole = Buffer.from(await (await get("/assets/cut")).arrayBuffer());
    assert.equal(whole.length, 1000);
    const slice = async (range) => {
      const r = await get("/assets/cut", { Range: range });
      return { r, bytes: Buffer.from(await r.arrayBuffer()) };
    };
    let { r, bytes } = await slice("bytes=0-99");
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-range"), "bytes 0-99/1000");
    assert.equal(r.headers.get("content-length"), "100");
    assert.equal(r.headers.get("content-type"), "video/mp4");
    assert.deepEqual(bytes, whole.subarray(0, 100));
    ({ r, bytes } = await slice("bytes=900-"));
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-range"), "bytes 900-999/1000");
    assert.deepEqual(bytes, whole.subarray(900));
    ({ r, bytes } = await slice("bytes=-50"));
    assert.equal(r.headers.get("content-range"), "bytes 950-999/1000");
    assert.deepEqual(bytes, whole.subarray(950));
    ({ r, bytes } = await slice("bytes=990-5000"));
    assert.equal(r.headers.get("content-range"), "bytes 990-999/1000", "an end past the file is clamped");
    ({ r } = await slice("bytes=1000-"));
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("content-range"), "bytes */1000");
    ({ r, bytes } = await slice("bytes=5-2"));
    assert.equal(r.status, 200, "a range whose end precedes its start is invalid, and an invalid range is ignored (RFC 9110)");
    assert.equal(bytes.length, 1000);
    ({ r, bytes } = await slice("bytes=0-1,5-9"));
    assert.equal(r.status, 200, "several ranges are not served; the whole file is");
    assert.equal(bytes.length, 1000);
    ({ r } = await slice("items=0-9"));
    assert.equal(r.status, 200, "a unit other than bytes is ignored");
  }));

test("a link, a text variant, an unknown id and a missing file have no file route", () =>
  desk(async ({ get, file, read }) => {
    for (const id of ["page", "tagline", "nope", "", "capsule"]) {
      const r = await get("/assets/" + id);
      assert.equal(r.status, 404, id || "(empty)");
      assert.match(r.headers.get("content-type"), /application\/json/);
    }
    const a = read().assets.find((x) => x.id === "dusk");
    unlinkSync(resolveAssetFile(file, a));
    assert.equal((await get("/assets/dusk")).status, 404);
  }));

test("an id that is a path, an encoded path or a broken escape reaches nothing", () =>
  desk(async ({ get, base }) => {
    const tries = [
      "..%2f..%2fhull.json", "..%2fhull.json", "%2e%2e%2fhull.json", "%2e%2e%5chull.json", "capsule%2fdusk.png", "capsule/dusk.png",
      "dusk.png", "dusk%00", "%E0%A4%A", "dusk/", "dusk%2f..%2fdusk", "C%3a%5cWindows%5cwin.ini", "%2e%2e%2f%2e%2e%2f",
    ];
    for (const t of tries) {
      const r = await get("/assets/" + t);
      assert.equal(r.status, 404, t);
      assert.doesNotMatch(r.headers.get("content-type"), /^image|^video|^application\/pdf/, t);
    }
    // The URL parser itself folds a dot segment, so a raw traversal never reaches the route.
    for (const raw of ["/assets/../hull.json", "/assets/%2e%2e/hull.json", "/assets/./../src/dusk.png"]) {
      const folded = await fetch(base + raw);
      assert.doesNotMatch(folded.headers.get("content-type"), /image|video|pdf/, raw);
    }
  }));

test("an asset of another workspace is not reachable, and the id resolves again only in its own", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-assets-catalog-"));
  try {
    const folder = join(dir, "workspaces");
    mkdirSync(folder);
    const other = join(folder, "other.json"),
      here = join(dir, "here.json");
    createWorkspace(other, structuredClone(ledger()));
    createWorkspace(here, structuredClone(ledger()));
    for (const f of [other, here]) addSlot(f, { id: "capsule", name: "Capsule", kind: "image", now: NOW });
    const mine = png(4, 4, 11),
      theirs = png(4, 4, 22);
    writeFileSync(join(dir, "mine.png"), mine);
    writeFileSync(join(dir, "theirs.png"), theirs);
    addAsset(here, { slotId: "capsule", label: "Mine", from: join(dir, "mine.png"), id: "mine", now: NOW });
    addAsset(other, { slotId: "capsule", label: "Theirs", from: join(dir, "theirs.png"), id: "theirs", now: NOW });
    const running = await startServer(here, { port: 0, catalog: { folder } });
    try {
      assert.equal((await fetch(running.url + "/assets/mine")).status, 200);
      assert.equal((await fetch(running.url + "/assets/theirs")).status, 404, "another workspace's asset is not served");
      const sel = await fetch(running.url + "/api/workspace/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "ws:other" }) });
      assert.equal(sel.status, 200);
      assert.deepEqual(Buffer.from(await (await fetch(running.url + "/assets/theirs")).arrayBuffer()), theirs);
      assert.equal((await fetch(running.url + "/assets/mine")).status, 404, "after switching, the first workspace's asset is gone");
    } finally {
      await new Promise((resolve) => running.server.close(resolve));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the page policy lets the page show its own images and play its own video, and nothing more", () =>
  desk(async ({ get }) => {
    const csp = (await get("/")).headers.get("content-security-policy");
    assert.match(csp, /img-src 'self'/);
    assert.match(csp, /media-src 'self'/);
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /unsafe|data:|blob:|\*/);
    assert.equal((await get("/assets/dusk")).headers.get("content-security-policy"), csp);
  }));

test("asset files are only served to same-origin local requests", () =>
  desk(async ({ base }) => {
    const port = new URL(base).port;
    const status = (headers) => new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/assets/dusk", headers }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject);
      req.end();
    });
    assert.equal(await status({ Host: `127.0.0.1:${port}` }), 200);
    assert.equal(await status({ Host: "evil.example" }), 403);
    assert.equal(await status({ Host: `127.0.0.1:${port}`, "Sec-Fetch-Site": "cross-site" }), 403);
    assert.equal(await status({ Host: `127.0.0.1:${port}`, Origin: "http://evil.example" }), 403);
  }));

test("the limits the form shows come from the module, not a copy", () =>
  desk(async ({ get }) => {
    const r = await get("/api/asset-limits");
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.maxBytes, maxAssetBytes);
    assert.equal(body.extensions[".png"], "image/png");
    assert.ok(!(".svg" in body.extensions) && !(".html" in body.extensions));
    assert.ok(body.maxText > 0);
    assert.deepEqual(body.kinds, ["image", "video", "document", "text", "link"]);
  }));

test("the workspace snapshot already carries slots and assets, so there is no second list route", () =>
  desk(async ({ get }) => {
    const w = await (await get("/api/workspace")).json();
    assert.equal(w.assetSlots.length, 1);
    assert.equal(w.assets.length, 6);
  }));

// ---- Picking, rejecting, restoring, retiring --------------------------------------------------

test("POST /api/asset/pick picks, records the decision and the update, and returns the module's shape", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/asset/pick", { assetId: "dusk", rationale: "Reads at thumbnail size" });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);
    assert.equal(r.body.record.id, "dusk");
    assert.equal(r.body.record.status, "selected");
    assert.equal(r.body.record.rationale, "Reads at thumbnail size");
    assert.equal(r.body.slot.status, "picked");
    assert.equal(r.body.slot.selectedAssetId, "dusk");
    assert.equal(r.body.decision.status, "decided");
    assert.equal(r.body.decision.chosen, "dusk");
    assert.equal(r.body.update.kind, "asset");
    assert.equal(r.body.revision, 8);
    const w = read();
    assert.equal(w.decisions.length, 1);
    assert.equal(w.decisions[0].rationale, "Reads at thumbnail size");
    assert.match(w.updates.at(-1).text, /Picked "Dusk" for "Steam main capsule"/);
    // Picking another keeps the first in the decision's history.
    const again = await post("/api/asset/pick", { assetId: "cut" });
    assert.equal(again.status, 200);
    assert.equal(again.body.decision.history.length, 1);
    assert.equal(again.body.decision.history[0].chosen, "dusk");
    assert.equal(read().assets.find((a) => a.id === "dusk").status, "candidate");
  }));

test("pick, reject, restore and retire answer 404 for an unknown asset and 400 for a value of the wrong type", () =>
  desk(async ({ post }) => {
    for (const path of ["pick", "reject", "restore", "retire"]) {
      const unknown = await post("/api/asset/" + path, { assetId: "nope", rationale: "x" });
      assert.equal(unknown.status, 404, path);
      assert.match(unknown.body.error, /does not exist/);
      assert.equal((await post("/api/asset/" + path, { assetId: 5, rationale: "x" })).status, 400, path);
      assert.equal((await post("/api/asset/" + path, { rationale: "x" })).status, 400, path);
      if (path !== "restore") assert.equal((await post("/api/asset/" + path, { assetId: "dusk", rationale: 5 })).status, 400, path);
    }
    for (const id of ["../x", "..%2fx", "capsule/dusk"]) assert.equal((await post("/api/asset/pick", { assetId: id })).status, 404, id);
  }));

test("POST /api/asset/reject needs a reason, keeps the asset, and opens the slot again when it was the pick", () =>
  desk(async ({ post, read }) => {
    await post("/api/asset/pick", { assetId: "dusk" });
    assert.equal((await post("/api/asset/reject", { assetId: "dusk" })).status, 400);
    assert.equal((await post("/api/asset/reject", { assetId: "dusk", rationale: "   " })).status, 400);
    const r = await post("/api/asset/reject", { assetId: "dusk", rationale: "Too dark at 184px" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.status, "rejected");
    assert.equal(r.body.record.rationale, "Too dark at 184px");
    assert.equal(r.body.slot.status, "open");
    assert.ok(read().assets.some((a) => a.id === "dusk"), "kept, not deleted");
    const again = await post("/api/asset/reject", { assetId: "dusk", rationale: "Too dark at 184px" });
    assert.equal(again.body.changed, false);
  }));

test("POST /api/asset/restore and /api/asset/retire move an asset back and out of the running", () =>
  desk(async ({ post, read }) => {
    await post("/api/asset/reject", { assetId: "cut", rationale: "Too long" });
    const restored = await post("/api/asset/restore", { assetId: "cut" });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.record.status, "candidate");
    assert.equal(restored.body.record.rationale, undefined);
    assert.equal((await post("/api/asset/restore", { assetId: "cut" })).body.changed, false);
    const retired = await post("/api/asset/retire", { assetId: "cut", rationale: "Newer cut exists" });
    assert.equal(retired.status, 200);
    assert.equal(retired.body.record.status, "retired");
    assert.equal(retired.body.record.rationale, "Newer cut exists");
    const bare = await post("/api/asset/retire", { assetId: "dusk" });
    assert.equal(bare.body.record.status, "retired");
    assert.equal(read().assets.find((a) => a.id === "dusk").rationale, undefined);
  }));

test("writes carry the revision and the workspace, and a stale one is a conflict", () =>
  desk(async ({ post, read }) => {
    const seen = read().revision;
    const first = await post("/api/asset/pick", { assetId: "dusk" }, { revision: seen });
    assert.equal(first.status, 200);
    const second = await post("/api/asset/pick", { assetId: "cut" }, { revision: seen });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /revision/i);
    assert.equal((await post("/api/asset/pick", { assetId: "cut" }, { revision: null })).status, 409, "a write without the revision it saw is refused, as every other write is");
    const wrong = await post("/api/asset/pick", { assetId: "cut" }, { workspaceId: "ws:elsewhere" });
    assert.equal(wrong.status, 409);
    assert.equal(read().assets.find((a) => a.id === "cut").status, "candidate");
  }));

// ---- Adding: slot, link, text -----------------------------------------------------------------

test("POST /api/asset/slot adds a slot, and refuses a repeated id or a bad kind", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/asset/slot", { id: "trailer", name: "Launch trailer", kind: "video", spec: "30s mp4", projectId: "game", initiativeId: "video" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.id, "trailer");
    assert.equal(r.body.record.status, "open");
    assert.equal(r.body.record.initiativeId, "video");
    assert.equal(r.body.update.kind, "asset");
    assert.equal(read().assetSlots.length, 2);
    const dup = await post("/api/asset/slot", { id: "trailer", name: "Again", kind: "video", projectId: "game" });
    assert.equal(dup.status, 400);
    assert.match(dup.body.error, /already exists/);
    assert.equal((await post("/api/asset/slot", { id: "x", name: "X", kind: "hologram", projectId: "game" })).status, 400);
    assert.equal((await post("/api/asset/slot", { id: "x", name: 5, kind: "image" })).status, 400);
    assert.equal((await post("/api/asset/slot", { id: "../x", name: "X", kind: "image", projectId: "game" })).status, 400);
    assert.equal((await post("/api/asset/slot", { id: "y", name: "Y", kind: "image", projectId: "game", initiativeId: "nope" })).status, 404);
  }));

test("POST /api/asset/link takes an https link, such as an artifact, and refuses the rest", () =>
  desk(async ({ post, get }) => {
    const r = await post("/api/asset/link", { slotId: "capsule", label: "Mockup artifact", url: "https://claude.ai/artifact/abc", source: "claude artifact" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.kind, "link");
    assert.equal(r.body.record.url, "https://claude.ai/artifact/abc");
    assert.equal(r.body.record.source, "claude artifact");
    assert.equal(r.body.record.status, "candidate");
    assert.equal((await get("/assets/" + r.body.record.id)).status, 404, "a link has no bytes to serve");
    for (const url of ["http://example.com", "javascript:alert(1)", "https://user:pw@example.com/", "not a url"]) {
      const bad = await post("/api/asset/link", { slotId: "capsule", label: "Bad", url });
      assert.equal(bad.status, 400, url);
      assert.match(bad.body.error, /https URL/);
    }
    assert.equal((await post("/api/asset/link", { slotId: "capsule", label: "x", url: 5 })).status, 400);
    assert.equal((await post("/api/asset/link", { slotId: "nope", label: "x", url: "https://example.com/" })).status, 404);
  }));

test("POST /api/asset/text adds a copy variant, and refuses empty or over-long text", () =>
  desk(async ({ post, read }) => {
    const r = await post("/api/asset/text", { slotId: "capsule", label: "Tagline B", text: "Grow something small.", source: "agent" });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.kind, "text");
    assert.equal(r.body.record.text, "Grow something small.");
    assert.equal(read().assets.at(-1).text, "Grow something small.");
    assert.equal((await post("/api/asset/text", { slotId: "capsule", label: "Empty", text: "  " })).status, 400);
    assert.equal((await post("/api/asset/text", { slotId: "capsule", label: "Long", text: "x".repeat(4001) })).status, 400);
    assert.equal((await post("/api/asset/text", { slotId: "capsule", label: "Num", text: 5 })).status, 400);
    assert.equal((await post("/api/asset/text", { slotId: "capsule", label: "", text: "ok" })).status, 400);
  }));

// ---- Upload -----------------------------------------------------------------------------------

test("POST /api/asset/upload takes raw bytes, adds a file candidate, and leaves no temporary file behind", () =>
  desk(async ({ upload, get, read, file }) => {
    const before = uploadDirs();
    const bytes = png(920, 430, 5);
    const r = await upload({ label: "Banner v2", source: "gimp", filename: "banner.png" }, bytes);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.record.label, "Banner v2");
    assert.equal(r.body.record.source, "gimp");
    assert.equal(r.body.record.kind, "image");
    assert.equal(r.body.record.mediaType, "image/png");
    assert.equal(r.body.record.width, 920);
    assert.equal(r.body.record.height, 430);
    assert.equal(r.body.record.bytes, bytes.length);
    assert.equal(r.body.record.sha256, sha(bytes));
    assert.equal(r.body.update.kind, "asset");
    assert.equal(r.body.revision, read().revision);
    const served = await get("/assets/" + r.body.record.id);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes);
    assert.ok(resolveAssetFile(file, r.body.record).startsWith(assetsDir(file)));
    assert.deepEqual(uploadDirs(), before, "the temporary folder is gone");
    // A label left out is the file name without its extension.
    const named = await upload({ filename: "Hero Shot.PNG" }, png(9, 9, 6));
    assert.equal(named.status, 200);
    assert.equal(named.body.record.label, "Hero Shot");
  }));

test("an upload whose content does not match its extension is refused, in the file's own name", () =>
  desk(async ({ upload, read }) => {
    const before = uploadDirs();
    const r = await upload({ filename: "banner.png" }, Buffer.from("this is not a png at all"));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /"banner\.png" says image\/png by its extension, but its content looks like text\/plain/);
    assert.doesNotMatch(r.body.error, /marketing-upload|upload\.png/i, "the temporary path is not shown");
    const exe = await upload({ filename: "setup.exe" }, Buffer.from("MZ\0\0"));
    assert.equal(exe.status, 400);
    assert.match(exe.body.error, /"setup\.exe" has the extension "\.exe"/);
    const svg = await upload({ filename: "logo.svg" }, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    assert.equal(svg.status, 400);
    const noExt = await upload({ filename: "README" }, Buffer.from("hello"));
    assert.equal(noExt.status, 400);
    const empty = await upload({ filename: "empty.png" }, Buffer.alloc(0));
    assert.equal(empty.status, 400);
    assert.equal(read().assets.length, 6);
    assert.deepEqual(uploadDirs(), before);
  }));

test("an upload over the size limit is refused with 413 and is not kept", () =>
  desk(async ({ upload, read, base }) => {
    const before = uploadDirs();
    const big = Buffer.alloc(maxAssetBytes + 1, 1);
    const r = await upload({ filename: "huge.png" }, big);
    assert.equal(r.status, 413);
    assert.match(r.body.error, /limit/);
    assert.equal(read().assets.length, 6);
    assert.deepEqual(uploadDirs(), before);
    // A body that declares far more than the limit is refused before any of it is read.
    const declared = await new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: new URL(base).port, method: "POST", path: `/api/asset/upload?slotId=capsule&filename=a.png&revision=${read().revision}`, headers: { "Content-Type": "application/octet-stream", "Content-Length": String(5 * maxAssetBytes) } },
        (res) => { res.resume(); resolve(res.statusCode); req.destroy(); },
      );
      req.on("error", reject);
      req.flushHeaders();
    });
    assert.equal(declared, 413, "the client is told, not dropped");
    assert.deepEqual(uploadDirs(), before);
  }), );

test("a file already in the slot is refused with the module's own message", () =>
  desk(async ({ upload, read }) => {
    const bytes = png(12, 12, 9);
    assert.equal((await upload({ filename: "a.png", label: "First" }, bytes)).status, 200);
    const again = await upload({ filename: "again.png", label: "Again" }, bytes);
    assert.equal(again.status, 400);
    assert.match(again.body.error, /Slot "capsule" already has this file as asset "capsule-\d+" \("First", candidate\); it was not added again/);
    assert.equal(read().assets.length, 7);
  }));

test("an upload names its slot and the revision it saw, and uses the same conflict rules", () =>
  desk(async ({ upload, read }) => {
    assert.equal((await upload({ filename: "a.png", slotId: "nope" }, png(3, 3, 1))).status, 404);
    assert.equal((await upload({ filename: "a.png", slotId: "" }, png(3, 3, 1))).status, 400);
    assert.equal((await upload({}, png(3, 3, 1))).status, 400, "a file name is required");
    assert.equal((await upload({ filename: "a.png" }, png(3, 3, 1), { revision: null })).status, 409);
    assert.equal((await upload({ filename: "a.png", revision: "abc" }, png(3, 3, 1), { revision: null })).status, 409);
    const seen = read().revision;
    assert.equal((await upload({ filename: "a.png" }, png(3, 3, 1), { revision: seen })).status, 200);
    assert.equal((await upload({ filename: "b.png" }, png(3, 3, 2), { revision: seen })).status, 409);
    assert.equal((await upload({ filename: "c.png", workspaceId: "ws:elsewhere" }, png(3, 3, 3))).status, 409);
    assert.equal((await upload({ filename: "d.png" }, png(3, 3, 4), { type: "application/json" })).status, 415);
    assert.equal(read().assets.length, 7);
  }));

test("an upload picks up nothing from the request but the extension of its file name", () =>
  desk(async ({ upload, read, file }) => {
    const r = await upload({ filename: "..\\..\\evil/../../x.png", label: "Sneaky" }, png(5, 5, 8));
    assert.equal(r.status, 200);
    assert.match(r.body.record.file, /^capsule\/capsule-\d+\.png$/);
    assert.ok(resolveAssetFile(file, r.body.record).startsWith(assetsDir(file)));
    assert.equal(read().assets.at(-1).label, "Sneaky");
  }));

test("an upload that is still arriving when the desk switches workspace is refused and written nowhere", async () => {
  for (const withId of [true, false]) {
    const dir = mkdtempSync(join(tmpdir(), "marketing-assets-switch-"));
    try {
      const folder = join(dir, "workspaces");
      mkdirSync(folder);
      const alpha = join(dir, "alpha.json"),
        beta = join(folder, "beta.json");
      for (const f of [alpha, beta]) {
        createWorkspace(f, structuredClone(ledger()));
        addSlot(f, { id: "capsule", name: "Capsule", kind: "image", now: NOW });
      }
      const running = await startServer(alpha, { port: 0, catalog: { folder } });
      try {
        const bytes = png(40, 40, 3),
          port = new URL(running.url).port;
        const finished = new Promise((resolve, reject) => {
          const req = request(
            {
              host: "127.0.0.1",
              port,
              method: "POST",
              path: `/api/asset/upload?slotId=capsule&filename=a.png&revision=1${withId ? "&workspaceId=launch" : ""}`,
              headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) },
            },
            (res) => {
              const parts = [];
              res.on("data", (c) => parts.push(c));
              res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(parts).toString()) }));
            },
          );
          req.on("error", reject);
          req.write(bytes.subarray(0, 20));
          // The desk has seen the headers and the guard has passed; now the person switches workspace.
          setTimeout(async () => {
            try {
              const sel = await fetch(running.url + "/api/workspace/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "ws:beta" }) });
              assert.equal(sel.status, 200);
              req.end(bytes.subarray(20));
            } catch (e) {
              reject(e);
            }
          }, 200);
        });
        const r = await finished;
        assert.equal(r.status, 409, JSON.stringify(r.body));
        assert.match(r.body.error, /switched workspace/);
        assert.equal(readWorkspace(alpha).assets.length, 0, "not into the workspace the upload was started on");
        assert.equal(readWorkspace(beta).assets.length, 0, "and not into the one the desk switched to");
        assert.equal(readWorkspace(beta).revision, 1);
        assert.equal(readWorkspace(alpha).revision, 1);
      } finally {
        await new Promise((resolve) => running.server.close(resolve));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("a stored file that is empty is served as an empty 200, not left hanging", () =>
  desk(async ({ get, file, read }) => {
    const asset = read().assets.find((a) => a.id === "dusk");
    truncateSync(resolveAssetFile(file, asset), 0);
    const r = await get("/assets/dusk");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-length"), "0");
    assert.equal((await r.arrayBuffer()).byteLength, 0);
    const ranged = await get("/assets/dusk", { Range: "bytes=0-" });
    assert.ok([200, 416].includes(ranged.status));
    await ranged.arrayBuffer();
  }));

test("a record with no sha256 gets a validator made from the file's size and time, never the word undefined", () =>
  desk(async ({ get, file, read }) => {
    const { mutateWorkspace } = await import("../src/store.mjs");
    mutateWorkspace(file, (w) => {
      delete w.assets.find((a) => a.id === "dusk").sha256;
    });
    const stat = statSync(resolveAssetFile(file, read().assets.find((a) => a.id === "dusk")));
    const r = await get("/assets/dusk");
    assert.equal(r.status, 200);
    const tag = r.headers.get("etag");
    assert.doesNotMatch(tag, /undefined/);
    assert.equal(tag, `"${stat.size}-${stat.mtimeMs}"`);
    await r.arrayBuffer();
    const again = await get("/assets/dusk", { "If-None-Match": tag });
    assert.equal(again.status, 304);
    // A file that changes gets a different validator.
    writeFileSync(resolveAssetFile(file, read().assets.find((a) => a.id === "dusk")), png(9, 9, 1));
    const changed = await get("/assets/dusk");
    assert.notEqual(changed.headers.get("etag"), tag);
    await changed.arrayBuffer();
  }));

// A request-like stream of `total` bytes in pieces of `piece`, counting what was pulled from it.
function body(total, piece) {
  const state = { pulled: 0 };
  let sent = 0;
  state.stream = Object.assign(
    new Readable({
      read() {
        if (sent >= total) return this.push(null);
        const n = Math.min(piece, total - sent);
        sent += n;
        state.pulled += n;
        this.push(Buffer.alloc(n, 1));
      },
    }),
    { headers: {} },
  );
  return state;
}
const response = { setHeader() {} };

test("receiveUpload keeps a body up to the limit, drains one over it into a 413, and cuts one off at four times the limit", async () => {
  const limit = 100000;
  const ok = body(limit, 10000);
  const kept = await receiveUpload(ok.stream, response, "a.png", limit);
  assert.equal(statSync(kept.path).size, limit);
  kept.cleanup();
  const over = body(limit + 1, 10000);
  await assert.rejects(receiveUpload(over.stream, response, "a.png", limit), (e) => e.status === 413 && /larger than the 100000 byte limit/.test(e.message));
  assert.equal(over.pulled, limit + 1, "read to its end so the client gets its answer");
  const edge = body(4 * limit, 10000);
  await assert.rejects(receiveUpload(edge.stream, response, "a.png", limit), (e) => e.status === 413);
  assert.equal(edge.pulled, 4 * limit, "exactly four times the limit is still read to its end");
  const runaway = body(40 * limit, 10000);
  await assert.rejects(receiveUpload(runaway.stream, response, "a.png", limit), (e) => e.status === 413);
  assert.ok(runaway.pulled <= 4 * limit + 100000, `a body past four times the limit is cut off (read ${runaway.pulled} of ${40 * limit})`);
  const declared = { stream: Object.assign(new Readable({ read() {} }), { headers: { "content-length": String(4 * limit + 1) } }) };
  let closed;
  await assert.rejects(receiveUpload(declared.stream, { setHeader: (k, v) => (closed = [k, v]) }, "a.png", limit), (e) => e.status === 413);
  assert.deepEqual(closed, ["Connection", "close"], "a declared size past four times the limit is refused unread");
});

test("POST /api/asset/slot/set sets and clears what a slot waits on, and a slot can be added waiting", () =>
  desk(async ({ post, read }) => {
    const added = await post("/api/asset/slot", { id: "trailer", name: "Trailer", kind: "video", projectId: "game", waitingOn: "the voice-over" });
    assert.equal(added.status, 200);
    assert.equal(added.body.record.waitingOn, "the voice-over");
    const set = await post("/api/asset/slot/set", { slotId: "capsule", waitingOn: "five-second tests, Nov 23-25" });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.record.waitingOn, "five-second tests, Nov 23-25");
    assert.equal(read().assetSlots.find((s) => s.id === "capsule").waitingOn, "five-second tests, Nov 23-25");
    const spec = await post("/api/asset/slot/set", { slotId: "capsule", spec: "1920x1080" });
    assert.equal(spec.body.record.waitingOn, "five-second tests, Nov 23-25", "a field left out is kept");
    const cleared = await post("/api/asset/slot/set", { slotId: "capsule", waitingOn: null });
    assert.equal(cleared.status, 200);
    assert.equal(read().assetSlots.find((s) => s.id === "capsule").waitingOn, undefined);
    assert.equal((await post("/api/asset/slot/set", { slotId: "nope", waitingOn: "x" })).status, 404);
    assert.equal((await post("/api/asset/slot/set", { slotId: "capsule" })).status, 400);
    assert.equal((await post("/api/asset/slot/set", { slotId: "capsule", waitingOn: 4 })).status, 400);
    assert.equal((await post("/api/asset/slot/set", { slotId: "capsule", waitingOn: "x" }, { revision: 1 })).status, 409);
  }));
