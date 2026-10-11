import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { assetMedia, assetThumb, assetUrl, collateralCounts, fmtBytes, limitsText, newSlotForm, slotCard, slotMatches, slotOrder, slotState, uploadRow, visibleSlots, newSlotId } from "../ui/views/collateral.js";
import { decisionForm, startingIds } from "../ui/views/collateral-viewer.js";
import { needsBody, needsHeadline } from "../ui/views/needs.js";
import { collateralLine, buildTree } from "../ui/views/hierarchy.js";
import { updateTarget } from "../ui/views/timeline.js";
import { decisionBody } from "../ui/views/decisions.js";
import { attention } from "../src/analysis.mjs";

const slot = (over = {}) => ({ id: "capsule", projectId: "p", name: "Steam main capsule", kind: "image", status: "open", initiativeId: "launch", ...over });
const asset = (id, over = {}) => ({ id, projectId: "p", slotId: "capsule", label: `Asset ${id}`, kind: "image", file: `capsule/${id}.png`, mediaType: "image/png", bytes: 2048, sha256: "a".repeat(64), width: 920, height: 430, status: "candidate", createdAt: "2026-10-11T10:00:00.000Z", ...over });
const ws = (over = {}) => ({
  projects: [{ id: "p", name: "Pixel" }],
  initiatives: [{ id: "launch", projectId: "p", name: "Launch" }, { id: "page", projectId: "p", name: "Page", parentId: "launch" }],
  decisions: [], actions: [], gates: [], reports: [], updates: [], evidence: [],
  assetSlots: [slot()], assets: [asset("a"), asset("b"), asset("c")],
  ...over,
});

test("a slot is waiting for a pick only while it is open with two or more live candidates", () => {
  const w = ws();
  assert.equal(slotState(w.assetSlots[0], w.assets).toPick, true);
  assert.equal(slotState(w.assetSlots[0], w.assets.slice(0, 1)).toPick, false);
  const rejected = w.assets.map((a, n) => (n ? { ...a, status: "rejected" } : a));
  assert.equal(slotState(w.assetSlots[0], rejected).toPick, false, "a rejected candidate is out of the running");
  const picked = [asset("a", { status: "selected" }), asset("b"), asset("r", { status: "rejected" }), asset("t", { status: "retired" })];
  const state = slotState(slot({ status: "picked", selectedAssetId: "a" }), picked);
  assert.deepEqual(state.all.map((a) => a.id), ["a", "b", "r", "t"], "the pick, then candidates, rejects and retired");
  assert.equal(state.toPick, false);
});

test("counts say how many slots, how many are to pick and how many are picked", () => {
  const w = ws({ assetSlots: [slot(), slot({ id: "icon", status: "picked", selectedAssetId: "x", initiativeId: "page" }), slot({ id: "bare", initiativeId: undefined })], assets: [...ws().assets, asset("x", { slotId: "icon", status: "selected" })] });
  assert.deepEqual(collateralCounts(w), { slots: 3, assets: 4, toPick: 1, picked: 1, open: 2 });
  assert.equal(collateralCounts(w, new Set(["page"])).slots, 1);
  assert.equal(collateralCounts(w, new Set(["launch", "page"])).slots, 2);
  assert.equal(collateralCounts({}).slots, 0, "a workspace without the collections counts nothing");
});

test("slots are filtered by project, initiative filter and the initiative a link jumped from, and sorted with the picks first", () => {
  const w = ws({ assetSlots: [slot(), slot({ id: "m", name: "A picked one", status: "picked", initiativeId: "page" }), slot({ id: "o", name: "Open one", initiativeId: undefined, projectId: "q" })] });
  assert.deepEqual(visibleSlots(w, { projectId: "p" }, "").map((s) => s.id), ["capsule", "m"]);
  assert.deepEqual(visibleSlots(w, { projectId: "", initiativeId: "launch" }, "").map((s) => s.id), ["capsule", "m"], "an initiative includes its parts");
  assert.deepEqual(visibleSlots(w, { projectId: "" }, "page").map((s) => s.id), ["m"]);
  assert.deepEqual(slotOrder(w.assetSlots, w.assets).map((s) => s.id), ["capsule", "o", "m"], "picks first, then other open slots by name, then picked");
  assert.equal(slotMatches(w.assetSlots[0], w.assets, "pick"), true);
  assert.equal(slotMatches(w.assetSlots[0], w.assets, "open"), false);
  assert.equal(slotMatches(w.assetSlots[1], w.assets, "picked"), true);
});

test("an unpicked slot with candidates asks for a pick and lists each candidate with its status", () => {
  const w = ws();
  const html = slotCard(w.assetSlots[0], { workspace: w, showProject: false });
  assert.match(html, /Pick one\./);
  assert.match(html, /3 candidates waiting/);
  assert.match(html, /data-view-slot="capsule" data-view-mode="compare"/);
  assert.match(html, /Compare 3 and pick/);
  assert.equal(html.match(/data-asset-card=/g).length, 3);
  assert.match(html, /for <button[^>]*data-goto="initiative:launch"/);
  assert.match(html, /920×430 · 2\.0 KB/);
  assert.match(html, /loading="lazy"/);
});

test("a picked slot shows the pick large with its date and reason, and keeps rejects and the replaced pick in view", () => {
  const picked = asset("a", { status: "selected", rationale: "Reads at 184px", decidedAt: "2026-10-12T09:00:00.000Z" }),
    w = ws({
      assetSlots: [slot({ status: "picked", selectedAssetId: "a", decisionId: "pick-capsule" })],
      assets: [picked, asset("b", { status: "candidate", rationale: 'Replaced by "Asset a"' }), asset("r", { status: "rejected", rationale: "Title unreadable" }), asset("t", { status: "retired" })],
      decisions: [{ id: "pick-capsule", projectId: "p", title: "Pick", question: "?", status: "decided", chosen: "a", options: [{ id: "a", label: "Asset a" }, { id: "z", label: "Old pick" }], history: [{ chosen: "z", rationale: "first thought", decidedAt: "2026-10-11T09:00:00.000Z" }] }],
    });
  const html = slotCard(w.assetSlots[0], { workspace: w, showProject: false });
  assert.match(html, /class="pick-block"/);
  assert.match(html, /Picked [^<]* — Reads at 184px/);
  assert.match(html, /data-goto="decision:pick-capsule"[^>]*>Decision history/);
  assert.match(html, /Earlier picks \(1\)[\s\S]*Old pick[\s\S]*first thought/);
  assert.match(html, /class="alt rejected"[\s\S]*Title unreadable/);
  assert.match(html, /class="alt retired"[\s\S]*No reason was recorded/);
  assert.match(html, /Replaced by &quot;Asset a&quot;/, "the replaced pick is a candidate again, with its history");
  assert.match(html, /data-asset-restore="r"/);
  assert.match(html, /data-asset-restore="t"/);
  assert.doesNotMatch(html, /data-asset-restore="b"/);
  assert.doesNotMatch(html, /Pick one\./);
  assert.match(html, /Compare or change the pick/);
});

test("every kind of candidate is shown the way it can be opened, and what is typed is escaped", () => {
  const img = assetMedia(asset("a", { label: 'x" onerror="bad' }), { crisp: true });
  assert.match(img, /<img class="asset-img fit crisp" src="\/assets\/a"/);
  assert.match(img, /alt="x&quot; onerror=&quot;bad, 920 by 430 pixels"/, "a quote in a label cannot end the attribute");
  assert.match(assetMedia(asset("a"), { zoom: 2 }), /width="1840" height="860"/);
  assert.equal(assetUrl("a/b c"), "/assets/a%2Fb%20c");
  assert.match(assetMedia(asset("v", { kind: "video", mediaType: "video/mp4" })), /<video class="asset-video" controls preload="metadata"[^>]*src="\/assets\/v"/);
  assert.doesNotMatch(assetMedia(asset("v", { kind: "video", mediaType: "video/mp4" })), /poster/);
  const pdf = assetMedia(asset("d", { kind: "document", mediaType: "application/pdf" }));
  assert.match(pdf, /href="\/assets\/d" target="_blank" rel="noopener noreferrer"/);
  assert.match(pdf, /Open the PDF/);
  const text = assetMedia(asset("t", { kind: "text", text: "<b>hi</b>", file: undefined }));
  assert.match(text, /<pre class="copy-text"[^>]*>&lt;b&gt;hi&lt;\/b&gt;<\/pre>/);
  assert.match(text, /data-copy-asset="t"/);
  const link = assetMedia(asset("l", { kind: "link", url: "https://claude.ai/artifact/x" }));
  assert.match(link, /href="https:\/\/claude\.ai\/artifact\/x" target="_blank" rel="noopener noreferrer"/);
  const bad = assetMedia(asset("l", { kind: "link", url: "javascript:alert(1)" }));
  assert.doesNotMatch(bad, /href=/, "only an https address becomes a link");
  assert.match(assetThumb(asset("p", { width: 64, height: 64 })), /thumb-img crisp/, "small images keep their pixels square");
  assert.doesNotMatch(assetThumb(asset("p")), /crisp/);
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(5 * 1024 * 1024), "5.0 MB");
});

test("the add forms name what a file may be, carry drafts, and a refused upload shows its reason", () => {
  const html = slotCard(ws().assetSlots[0], { workspace: ws(), showProject: false });
  for (const name of ["data-dropzone", "data-file-input", "data-add-link", "data-add-text"]) assert.ok(html.includes(name), name);
  assert.match(html, /<input type="file" multiple/);
  assert.match(html, /accept="\.png,\.jpg/);
  assert.match(limitsText(), /up to 50 MB each\. SVG and HTML are not accepted/);
  assert.match(html, /rel|type="url"/);
  assert.match(uploadRow("capsule", { name: "a.png", size: 2048, state: "refused", message: "Already in the slot" }, 0), /Refused[\s\S]*Already in the slot[\s\S]*data-upload-dismiss="capsule:0"/);
  assert.match(uploadRow("capsule", { name: "<i>.png", size: 1, state: "sending", fraction: 0.4 }, 1), /<progress max="1" value="0.4"[\s\S]*Sending 40%/);
  assert.doesNotMatch(uploadRow("capsule", { name: "<i>.png", size: 1, state: "waiting" }, 1), /<i>/);
});

test("the new slot form takes a name, kind and spec, and asks for a project only when there is a choice", () => {
  const one = newSlotForm({ workspace: ws(), selection: { projectId: "" } });
  assert.match(one, /name="name"/);
  assert.match(one, /<option value="video">video<\/option>/);
  assert.doesNotMatch(one, /name="projectId"/);
  const many = newSlotForm({ workspace: ws({ projects: [{ id: "p", name: "P" }, { id: "q", name: "Q" }] }), selection: { projectId: "" } });
  assert.match(many, /name="projectId" required/);
  assert.equal(newSlotId("Steam main capsule", ws()), "steam-main-capsule");
  assert.equal(newSlotId("Capsule", ws({ assetSlots: [slot({ id: "capsule" })] })), "capsule-2");
});

test("the viewer starts on the candidates worth comparing, and its decision form fits the status", () => {
  const w = ws({ assets: [asset("a", { status: "selected" }), asset("b"), asset("c")], assetSlots: [slot({ status: "picked", selectedAssetId: "a" })] });
  const state = slotState(w.assetSlots[0], w.assets);
  assert.deepEqual(startingIds(state, undefined, "compare"), ["a", "b"]);
  assert.deepEqual(startingIds(state, "c", "compare"), ["c", "a"]);
  assert.deepEqual(startingIds(state, "c", "single"), ["c"]);
  const open = slotState(slot(), ws().assets);
  assert.deepEqual(startingIds(open, undefined, "compare"), ["a", "b"]);
  const candidate = decisionForm(asset("b"));
  assert.match(candidate, /Pick this one/);
  assert.match(candidate, /value="reject"/);
  assert.match(candidate, /value="retire"/);
  assert.match(candidate, /<textarea name="rationale"/);
  assert.match(decisionForm(asset("a", { status: "selected", rationale: "kept" })), />kept<\/textarea>[\s\S]*Save the reason/);
  const rejected = decisionForm(asset("r", { status: "rejected", rationale: "ugly" }));
  assert.match(rejected, /data-asset-restore="r"/);
  assert.doesNotMatch(rejected, /Pick this one|<textarea/);
});

test("the needs panel lists a collateral pick with a button that jumps to its slot, and the headline counts it", () => {
  const w = ws({ initiatives: [{ id: "launch", projectId: "p", name: "Launch", channel: "search", status: "running", start: "2026-10-01", end: "2026-10-30", owner: "owner", hypothesis: "h", cta: "c" }] });
  w.projects[0] = { ...w.projects[0], weeklyHours: 5, budget: 0, currency: "USD", promise: "x", objective: "y", audience: "z" };
  const a = { today: "2026-10-11", decisions: [], actions: [], gates: [], blockedInitiatives: [], stale: [], recent: [], picks: [{ slotId: "capsule", name: "Steam main capsule", candidates: 3, candidateIds: ["a", "b", "c"], initiativeId: "launch" }], summary: { decisions: 0, actions: 0, gates: 0, blockedInitiatives: 0, picks: 1, stale: 0, total: 1, overdueDecisions: 0, overdueActions: 0, overdueGates: 0 } };
  const html = needsBody(a, { workspace: w, plan: null });
  assert.match(html, /Pick the Steam main capsule/);
  assert.match(html, /3 candidates waiting/);
  assert.match(html, /data-collateral-pick="capsule"/);
  assert.equal(needsHeadline(a), "1 thing needs you: 1 collateral pick");
  const real = attention({ ...w, observations: [], reactions: [], competitors: [], experiments: [], sources: [], schema: "marketing/workspace@1", revision: 0, assetSlots: w.assetSlots, assets: w.assets }, "p", "2026-10-11");
  assert.equal(real.picks[0].slotId, "capsule", "the panel reads the same list next does");
});

test("an initiative row says how much collateral it holds, counting its parts, and links to the tab", () => {
  const w = ws({ assetSlots: [slot(), slot({ id: "icon", initiativeId: "page", status: "picked", selectedAssetId: "x" })] });
  const tree = buildTree(w.initiatives);
  const html = collateralLine(tree[0], w);
  assert.match(html, /data-collateral-for="launch"/);
  assert.match(html, /2 slots · 3 assets · 1 to pick · 1 picked/);
  assert.equal(collateralLine(tree[0].children[0], w).match(/1 slot/)?.[0], "1 slot");
  assert.equal(collateralLine(buildTree([{ id: "x", projectId: "p", name: "X" }])[0], w), "");
});

test("the timeline opens the asset or slot an update names, and a pick decision links back to its slot", () => {
  const w = ws({ decisions: [{ id: "pick-capsule", projectId: "p", title: "Pick Steam main capsule", question: "?", status: "decided", chosen: "a", decidedAt: "2026-10-11T10:00:00.000Z", options: [{ id: "a", label: "A" }] }] });
  w.assetSlots[0].decisionId = "pick-capsule";
  const u = (kind, refId) => ({ id: "u", projectId: "p", at: "2026-10-11T10:00:00.000Z", kind, refId, text: "t" });
  assert.deepEqual([updateTarget(u("asset", "a"), w).kind, updateTarget(u("asset", "a"), w).record.label], ["asset", "Asset a"]);
  assert.equal(updateTarget(u("asset", "capsule"), w).kind, "slot");
  assert.equal(updateTarget(u("asset", "gone"), w), null);
  const html = decisionBody(w.decisions[0], { workspace: w, today: "2026-10-11" });
  assert.match(html, /Collateral slot: <button[^>]*data-goto="slot:capsule"/);
});

test("the Collateral view is on the page, served, and written without inline styles or handlers", () => {
  const html = readFileSync("ui/index.html", "utf8");
  for (const id of ["tab-collateral", "collateral", "collateral-heading", "collateral-summary", "collateral-filters", "collateral-focus", "collateral-new", "collateral-body", "lightbox", "lightbox-inner"])
    assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /<dialog id="lightbox"/);
  assert.match(html, /data-tab="collateral"/);
  for (const name of ["collateral.js", "collateral-viewer.js"]) {
    assert.ok(readdirSync("ui/views").includes(name));
    const source = readFileSync("ui/views/" + name, "utf8");
    assert.doesNotMatch(source, /\sstyle=|setAttribute\(["']style/, name);
    assert.doesNotMatch(source, /\son(click|change|submit|input|drop|dragover)=/, name);
    assert.doesNotMatch(source, /innerHTML\s*=\s*[^;`]*\b(text|label|rationale)\b[^;`]*;/, name);
  }
  assert.match(readFileSync("ui/style.css", "utf8"), /image-rendering: pixelated/);
});
