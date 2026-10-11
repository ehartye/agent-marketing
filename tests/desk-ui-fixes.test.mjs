import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeskClient } from "../ui/state.js";
import { keepsDisabled } from "../ui/shared.js";
import { setDraft, draftValue, setOpen, isOpen, resetHubState, isShown, hoursText } from "../ui/hub-shared.js";
import { needsBody, needsHeadline, needsOverview, topNeeds, toggleNeedGroup, resetNeeds } from "../ui/views/needs.js";
import { recommendedOption, optionCard, decisionBody, decisionItem, changeRefusal, markActed, clearActed, decisionsView, sortDecisions } from "../ui/views/decisions.js";
import { addForm } from "../ui/views/actions.js";
import { logForm, renderTimeline, resetTimeline } from "../ui/views/timeline.js";
import { renderPlan } from "../ui/views/plan.js";
import { slotCard, slotState, collateralSummary, collateralCounts, uploadRow, newSlotForm, setLimits } from "../ui/views/collateral.js";

// A page with no browser: every element a view writes to is a plain object.
const els = new Map();
globalThis.document = { getElementById: (id) => { if (!els.has(id)) els.set(id, { id, hidden: false, innerHTML: "", textContent: "", clientWidth: 800 }); return els.get(id); } };
const el = (id) => document.getElementById(id);

const option = (id, over = {}) => ({ id, label: `Option ${id}`, ...over });
const full = { time: "t", risk: "r", complexity: "c", bestPractice: "b", maintainability: "m" };
const decision = (over = {}) => ({ id: "d", projectId: "p", title: "Pick one", question: "Which?", status: "open", options: [option("ship", { ...full, label: "Ship now" }), option("wait", { ...full, label: "Wait a week" })], ...over });
const ws = (over = {}) => ({ projects: [{ id: "p", name: "P" }, { id: "q", name: "Q" }], initiatives: [{ id: "i1", projectId: "p", name: "One" }, { id: "i2", projectId: "q", name: "Two" }], decisions: [], actions: [], gates: [], reports: [], updates: [], evidence: [], assetSlots: [], assets: [], ...over });
const summary = (over = {}) => ({ decisions: 0, overdueDecisions: 0, actions: 0, overdueActions: 0, gates: 0, overdueGates: 0, blockedInitiatives: 0, picks: 0, stale: 0, total: 0, ...over });
const att = (over = {}) => ({ today: "2026-10-11", decisions: [], actions: [], gates: [], blockedInitiatives: [], picks: [], stale: [], recent: [], waiting: [], summary: summary(), ...over });
const dec = (id, over = {}) => ({ id, title: "Decision " + id, question: "?", status: "open", needBy: null, daysLeft: null, overdue: false, recommendation: null, defaultIfSilent: null, optionCount: 2, ...over });
const act = (id, over = {}) => ({ id, title: "Action " + id, status: "todo", due: null, daysLeft: null, overdue: false, reason: "due-soon", blockedBy: null, hours: null, initiativeId: null, ...over });
const gate = (id, over = {}) => ({ id, name: "Gate " + id, criteria: "c", status: "open", due: "2026-10-10", daysLeft: -1, overdue: true, hours: null, blocks: [], ...over });
const pick = (n, over = {}) => ({ slotId: "s" + n, name: "Slot " + n, candidates: 2, candidateIds: [], initiativeId: null, ...over });
const wsFor = (a) => ws({ actions: a.actions.map((x) => ({ id: x.id, projectId: "p", title: x.title, owner: "owner", status: x.status })) });

// ---- 1. the recommended option is the one the record names, never a guess from prose ----------------

test("an option is Recommended only when the decision names it by id; prose is never read for a guess", () => {
  const prose = decision({ recommendation: "Don't ship now. Wait a week." });
  assert.equal(recommendedOption(prose), null, "a negation in the text must not mark Ship now");
  const html = decisionBody(prose, { workspace: ws({ decisions: [prose] }), today: "2026-10-11" });
  assert.doesNotMatch(html, /pill rec/);
  assert.doesNotMatch(html, /class="primary"/, "no option is the primary button without a named recommendation");
  assert.match(html, /Don&#39;t ship now\. Wait a week\./, "the recommendation text is always shown");
  const named = decision({ recommendation: "Don't ship now. Wait a week.", recommendedOptionId: "wait" });
  assert.equal(recommendedOption(named), "wait");
  const marked = decisionBody(named, { workspace: ws({ decisions: [named] }), today: "2026-10-11" });
  assert.equal((marked.match(/pill rec/g) || []).length, 1);
  assert.match(marked, /value="wait" class="primary"/);
  assert.doesNotMatch(marked, /value="ship" class="primary"/);
  assert.equal(recommendedOption(decision({ recommendedOptionId: "gone" })), null, "an id that names no option marks nothing");
  assert.doesNotMatch(optionCard(option("a"), { recommended: false }), /Recommended/);
  assert.match(optionCard(option("a"), { recommended: true }), /Recommended/);
});

// ---- 2. a disabled "Change to: <current>" stays disabled ----------------------------------------------

test("the change form's standing choice is marked to stay disabled, and a change to it is refused", () => {
  const d = decision({ status: "decided", chosen: "ship", decidedAt: "2026-10-11T08:00:00.000Z" });
  const html = decisionBody(d, { workspace: ws({ decisions: [d] }), today: "2026-10-11" });
  assert.match(html, /value="ship" disabled data-keep-disabled>Change to: Ship now/);
  assert.doesNotMatch(html, /value="wait"[^>]*disabled/);
  assert.equal(keepsDisabled({ hasAttribute: (n) => n === "data-keep-disabled" }), true);
  assert.equal(keepsDisabled({ hasAttribute: () => false, getAttribute: (n) => (n === "aria-disabled" ? "true" : null) }), true);
  assert.equal(keepsDisabled({ hasAttribute: () => false, getAttribute: () => null }), false);
  assert.match(changeRefusal(d, "ship", true), /already the decision/);
  assert.equal(changeRefusal(d, "wait", true), "");
  assert.equal(changeRefusal(d, "ship", false), "", "deciding an open question is not a change");
});

// ---- 3. drafts belong to a project and go when the workspace does -------------------------------------

test("a half-typed note or action stays with its project, and a workspace switch clears every draft and opened state", () => {
  resetHubState();
  setDraft("log:p:text", "typed in P");
  setDraft("add-action:p:title", "Do P thing");
  const w = ws();
  assert.match(logForm({ workspace: w, selection: { projectId: "p" } }), /typed in P/);
  assert.doesNotMatch(logForm({ workspace: w, selection: { projectId: "q" } }), /typed in P/);
  assert.match(addForm({ workspace: w, selection: { projectId: "p" } }), /Do P thing/);
  assert.doesNotMatch(addForm({ workspace: w, selection: { projectId: "q" } }), /Do P thing/);
  setOpen("add-action", true);
  resetHubState();
  assert.equal(draftValue("log:p:text"), "");
  assert.equal(isOpen("add-action"), false);
});

// ---- 4. a hidden plan view leaves nothing behind, and a hidden record is "not shown" ----------------

test("with nothing to show the plan view clears its cards, and an element that is not visible counts as not shown", () => {
  el("plan-view").hidden = false;
  el("gates").innerHTML = "<article data-gate='x'></article>";
  el("load").innerHTML = "<svg></svg>";
  el("gate-summary").textContent = "1 gate";
  renderPlan({ workspace: ws(), plan: null });
  assert.equal(el("plan-view").hidden, true);
  assert.equal(el("gates").innerHTML, "");
  assert.equal(el("load").innerHTML, "");
  assert.equal(el("gate-summary").textContent, "");
  assert.equal(isShown({ checkVisibility: () => false }), false);
  assert.equal(isShown({ checkVisibility: () => true }), true);
  assert.equal(isShown({}), true, "an old browser without checkVisibility is trusted");
  assert.equal(isShown(null), false);
});

// ---- 6. the needs list is bounded and urgent things come first ------------------------------------------

test("overdue items from every group lead, each group shows five rows with a way to see all, and collateral picks sit below actions and gates", () => {
  resetNeeds();
  const a = att({
    decisions: [dec("d1"), dec("d2", { overdue: true, daysLeft: -3, needBy: "2026-10-08" })],
    actions: [act("a1", { overdue: true, daysLeft: -5, due: "2026-10-06", reason: "overdue" }), ...Array.from({ length: 7 }, (_, n) => act("b" + n, { daysLeft: 1, due: "2026-10-12" }))],
    gates: [gate("g1"), gate("g2", { overdue: false, daysLeft: 2, due: "2026-10-13" })],
    picks: Array.from({ length: 200 }, (_, n) => pick(n)),
    summary: summary({ decisions: 2, overdueDecisions: 1, actions: 8, overdueActions: 1, gates: 2, overdueGates: 1, picks: 200, total: 212 }),
  });
  const html = needsBody(a, { workspace: wsFor(a), plan: null });
  const at = (s) => html.indexOf(s);
  assert.ok(at('data-need-group="overdue"') >= 0 && at('data-need-group="overdue"') < at('data-need-group="decisions"'));
  assert.ok(at('data-need-group="decisions"') < at('data-need-group="actions"') && at('data-need-group="actions"') < at('data-need-group="gates"') && at('data-need-group="gates"') < at('data-need-group="picks"'));
  const overdue = html.slice(at('data-need-group="overdue"'), at('data-need-group="decisions"'));
  for (const id of ["decision:d2", "action:a1", "gate:g1"]) assert.ok(overdue.includes(`data-need="${id}"`), id);
  assert.equal((html.match(/data-need="pick:/g) || []).length, 5, "200 picks show five");
  assert.equal((html.match(/data-need="action:b/g) || []).length, 5, "seven due-soon actions show five");
  assert.match(html, /data-need-more="picks"[^>]*>Show all 200</);
  assert.match(html, /data-need-more="actions"[^>]*>Show all 7</);
  assert.equal((html.match(/data-need="/g) || []).length, 3 + 1 + 5 + 1 + 5, "no row appears twice");
  assert.doesNotMatch(html, /data-need-more="decisions"/, "a short group has no control");
  toggleNeedGroup("picks");
  const open = needsBody(a, { workspace: wsFor(a), plan: null });
  assert.equal((open.match(/data-need="pick:/g) || []).length, 200);
  assert.match(open, /data-need-more="picks"[^>]*aria-expanded="true"[^>]*>Show fewer</);
  resetNeeds();
});

test("what is shown adds up to the headline: every counted item appears once, in the overdue group or its own", () => {
  resetNeeds();
  const a = att({
    decisions: [dec("d1", { overdue: true, daysLeft: -1 })],
    actions: [act("a1"), act("a2", { overdue: true, daysLeft: -2 })],
    gates: [gate("g1")],
    summary: summary({ decisions: 1, overdueDecisions: 1, actions: 2, overdueActions: 1, gates: 1, overdueGates: 1, total: 4 }),
  });
  const html = needsBody(a, { workspace: wsFor(a), plan: null });
  assert.equal((html.match(/data-need="/g) || []).length, a.summary.total);
  assert.match(needsHeadline(a), /^4 things need you: 1 decision \(1 overdue\) · 2 actions \(1 overdue\) · 1 gate due \(1 overdue\)$/);
});

// ---- 13. hours are rounded -----------------------------------------------------------------------------

test("hours in the needs list are rounded to two decimals", () => {
  assert.equal(hoursText(0.3333333), "0.33 h");
  assert.equal(hoursText(2), "2 h");
  const a = att({ actions: [act("a1", { hours: 0.3333333 })], gates: [gate("g1", { hours: 1.6666666 })], summary: summary({ actions: 1, gates: 1, overdueGates: 1, total: 2 }) });
  const html = needsBody(a, { workspace: wsFor(a), plan: null });
  assert.match(html, /0\.33 h/);
  assert.match(html, /1\.67 h/);
  assert.doesNotMatch(html, /0\.333|1\.666/);
});

// ---- 7. all projects: a block per project -------------------------------------------------------------

test("with All projects the needs panel gives each project a block: counts, the top three items and a link that selects it", () => {
  resetNeeds();
  const harbor = att({
    decisions: [dec("d1", { overdue: true, daysLeft: -4 }), dec("d2"), dec("d3")],
    actions: [act("a1", { daysLeft: 2 }), act("a2", { daysLeft: 3 })],
    summary: summary({ decisions: 3, overdueDecisions: 1, actions: 2, total: 5 }),
  });
  const orbit = att({ summary: summary() });
  const w = ws();
  const top = topNeeds(harbor, 3);
  assert.deepEqual(top.map((t) => t.id), ["d1", "d2", "d3"], "overdue first, then decisions");
  const html = needsOverview({ p: harbor, q: orbit }, w);
  assert.match(html, /5 things need you across 2 projects/);
  assert.match(html, /data-need-project="p"[\s\S]*P[\s\S]*3 decisions \(1 overdue\)/);
  assert.match(html, /data-select-project="p"[^>]*>Open P</);
  assert.match(html, /data-select-project="q"[^>]*>Open Q</);
  assert.match(html, /Nothing needs you/);
  assert.equal((html.match(/class="need-top-item"/g) || []).length, 3, "three items, not five");
  assert.match(html, /2 more/);
});

test("the desk client loads attention for each project when none is chosen", async () => {
  const urls = [], workspace = { revision: 1, projects: [{ id: "a" }, { id: "b" }], initiatives: [] };
  const client = createDeskClient(async (url) => {
    urls.push(url);
    return url === "/api/workspace" ? workspace : url.startsWith("/api/attention") ? { projectId: url.split("=")[1], summary: { total: 0 } } : url.startsWith("/api/plan") ? { projectId: url.split("=")[1] } : [];
  });
  const all = await client.load({ projectId: "", initiativeId: "" });
  assert.deepEqual(Object.keys(all.attentions), ["a", "b"]);
  assert.equal(all.attention, null, "no single project is in view");
  assert.ok(urls.includes("/api/attention?projectId=a") && urls.includes("/api/attention?projectId=b"));
  const one = await client.load({ projectId: "a", initiativeId: "" });
  assert.deepEqual(Object.keys(one.attentions), ["a"]);
  assert.equal(one.attention, one.attentions.a);
});

// ---- 8. the card just acted on stays, with a banner -------------------------------------------------

test("in the Open view a decision just decided stays, with its banner, until the filter changes; the rest fold below", () => {
  clearActed();
  const a = decision({ id: "a" }), b = decision({ id: "b", status: "decided", chosen: "ship", decidedAt: "2026-10-01T00:00:00Z" }), c = decision({ id: "c", status: "decided", chosen: "wait", decidedAt: "2026-10-02T00:00:00Z" });
  let view = decisionsView(sortDecisions([a, b, c]), "open");
  assert.deepEqual(view.primary.map((d) => d.id), ["a"]);
  assert.deepEqual(view.folded.map((d) => d.id), ["c", "b"], "decided, newest first");
  markActed("c", "Decided: Wait a week");
  view = decisionsView(sortDecisions([a, b, c]), "open");
  assert.deepEqual(view.primary.map((d) => d.id).toSorted(), ["a", "c"]);
  assert.deepEqual(view.folded.map((d) => d.id), ["b"]);
  const html = decisionItem(c, { workspace: ws({ decisions: [c] }), today: "2026-10-11", banner: "Decided: Wait a week" });
  assert.match(html, /class="acted-banner">[\s\S]*?<strong>Decided: Wait a week<\/strong>/);
  assert.deepEqual(decisionsView(sortDecisions([a, b, c]), "decided").primary.map((d) => d.id), ["c", "b"]);
  assert.equal(decisionsView(sortDecisions([a, b, c]), "decided").folded.length, 0);
  clearActed();
  assert.deepEqual(decisionsView(sortDecisions([a, b, c]), "open").primary.map((d) => d.id), ["a"]);
});

// ---- 9. the collateral summary says what it counts ---------------------------------------------------

test("the collateral summary counts assets as assets, so six candidates are not claimed when there are twelve assets", () => {
  const text = collateralSummary({ slots: 7, toPick: 2, picked: 2, assets: 12 });
  assert.equal(text, "7 slots · 2 to pick · 2 picked · 12 assets in all");
  assert.doesNotMatch(text, /candidate/);
  assert.match(collateralSummary({ slots: 1, toPick: 0, picked: 0, assets: 1 }), /1 slot · .*1 asset in all/);
});

// ---- 10. a defer date and the selects survive a redraw ----------------------------------------------

test("the defer date and the add and log selects are restored from what was chosen", () => {
  resetHubState();
  const d = decision({ needBy: "2026-10-20" });
  const body = (x) => decisionBody(x, { workspace: ws({ decisions: [x] }), today: "2026-10-11" });
  assert.match(body(d), /name="until" type="date" value="2026-10-20"/);
  setDraft("defer-until:d", "2026-12-01");
  assert.match(body(d), /name="until" type="date" value="2026-12-01"/);
  setDraft("add-action:p:owner", "agent");
  setDraft("add-action:p:initiativeId", "i1");
  setDraft("log:p:initiativeId", "i1");
  const w = ws();
  const add = addForm({ workspace: w, selection: { projectId: "p" } });
  assert.match(add, /<option value="agent" selected>/);
  assert.match(add, /<option value="i1" selected>/);
  assert.match(logForm({ workspace: w, selection: { projectId: "p" } }), /<option value="i1" selected>/);
  setDraft("add-action:p:initiativeId", "gone");
  assert.doesNotMatch(addForm({ workspace: w, selection: { projectId: "p" } }), /selected>One/, "a value that is no longer an option falls back to the default");
  setDraft("new-slot:all:kind", "video");
  setDraft("new-slot:all:projectId", "q");
  const slot = newSlotForm({ workspace: w, selection: { projectId: "" } });
  assert.match(slot, /<option value="video" selected>/);
  assert.match(slot, /<option value="q" selected>/);
  resetHubState();
});

// ---- 12. uploads announce once, in a region of their own ---------------------------------------------

test("the upload list is not a live region, a progress tick changes nothing but the bar, and the page has one separate polite region", () => {
  const source = readFileSync("ui/views/collateral.js", "utf8");
  const card = slotCard({ id: "s", projectId: "p", name: "S", kind: "image", status: "open" }, { workspace: ws(), showProject: false });
  assert.match(card, /data-upload-list="s"/);
  assert.doesNotMatch(card, /aria-live|role="status"/);
  assert.match(readFileSync("ui/index.html", "utf8"), /id="upload-live"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="upload-live"/);
  assert.match(source, /export function patchUploadRow/);
  assert.match(uploadRow("s", { name: "a.png", size: 1, state: "sending", fraction: 0.25 }, 0), /<progress max="1" value="0.25"/);
});

// ---- 14. nothing typed into a class or attribute is trusted ------------------------------------------

test("a slot's status and the text limit cannot break out of their attributes", () => {
  const evil = { id: "s", projectId: "p", name: "S", kind: "image", status: 'open"><img src=x onerror=1>' };
  assert.doesNotMatch(slotCard(evil, { workspace: ws(), showProject: false }), /<img src=x/);
  setLimits({ maxText: '4000"><img src=y>' });
  assert.doesNotMatch(slotCard({ ...evil, status: "open" }, { workspace: ws(), showProject: false }), /<img src=y/);
  setLimits({ maxText: 4000 });
});

// ---- 16. a status chip's glyph is a fixed box so a fallback font cannot swell the chip ----------------

test("the status chip's glyph is boxed, and the picked and open chips are styled like the rest", () => {
  const css = readFileSync("ui/style.css", "utf8");
  assert.match(css, /\.pill > \[aria-hidden="true"\]\s*\{[^}]*line-height:\s*1/);
  assert.match(css, /\.status-chip\.picked/);
  assert.match(css, /\.status-chip\.open/);
});

// ---- 17. a slot that waits on someone is not asking for a pick ---------------------------------------

test("a slot waiting on someone says so instead of 'Pick one', still lets the owner compare, and is not counted as a pick", () => {
  const slot = { id: "s", projectId: "p", name: "Logo", kind: "image", status: "open", waitingOn: "the artist's second pass" };
  const asset = (id) => ({ id, projectId: "p", slotId: "s", label: id, kind: "image", status: "candidate", width: 10, height: 10, bytes: 1, mediaType: "image/png", createdAt: "2026-10-11T10:00:00.000Z" });
  const w = ws({ assetSlots: [slot], assets: [asset("a"), asset("b")] });
  const html = slotCard(slot, { workspace: w, showProject: false });
  assert.match(html, /Waiting on:<\/strong> the artist(&#39;|')s second pass/);
  assert.doesNotMatch(html, /Pick one\./);
  assert.match(html, /data-view-slot="s" data-view-mode="compare"/);
  assert.equal(slotState(slot, w.assets).toPick, false);
  assert.equal(collateralCounts(w).toPick, 0);
  const a = att({ waiting: [{ slotId: "s", name: "Logo", waitingOn: "the artist's second pass", candidates: 2, initiativeId: null }] });
  resetNeeds();
  const needs = needsBody(a, { workspace: w, plan: null });
  assert.match(needs, /data-need-group="waiting"/);
  assert.match(needs, /Waiting on[^<]*<\/strong>[^<]*the artist/);
  assert.equal(needsHeadline(a), "Nothing needs you right now");
  assert.doesNotMatch(needs, /Pick the Logo/);
});

// ---- the layout: a jump bar, folds, and a timeline of five ------------------------------------------------

test("the Decide and plan tab has a jump bar to six sections, and the sections fold with the right defaults", () => {
  const html = readFileSync("ui/index.html", "utf8");
  const bar = html.match(/<nav[^>]*id="jumpbar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.match(bar, /aria-label=/);
  for (const id of ["needs", "decisions", "actions", "timeline", "initiatives", "plan-details"]) {
    assert.ok(bar.includes(`href="#${id}"`), "jump to " + id);
    assert.ok(html.includes(`id="${id}"`), "section " + id);
  }
  const fold = (key) => html.match(new RegExp(`<details[^>]*data-key="section:${key}"[^>]*>`))?.[0];
  for (const key of ["needs", "decisions", "actions", "timeline", "initiatives"]) assert.match(fold(key) ?? "", /\sopen[\s>]/, key + " starts open");
  assert.doesNotMatch(fold("plan-details") ?? "x open", /\sopen[\s>]/, "plan details start closed");
  assert.ok(fold("plan-details"), "plan details is a fold");
  for (const id of ["gates", "load", "strategy", "channels", "funnels", "chart", "decision"]) {
    const from = html.indexOf('data-key="section:plan-details"');
    assert.ok(html.indexOf(`id="${id}"`) > from, `${id} sits inside Plan details`);
  }
});

test("a section's open state is remembered in localStorage, and a browser that blocks storage still works", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  resetHubState();
  setOpen("section:plan-details", true);
  assert.equal(store.get("desk.section.plan-details"), "1");
  resetHubState();
  assert.equal(isOpen("section:plan-details", false), true, "read back after the in-memory copy is gone");
  setOpen("section:timeline", false);
  resetHubState();
  assert.equal(isOpen("section:timeline", true), false);
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  resetHubState();
  assert.doesNotThrow(() => setOpen("section:needs", false));
  assert.equal(isOpen("section:needs", true), false, "kept in memory when storage is blocked");
  assert.equal(isOpen("section:actions", true), true);
  delete globalThis.localStorage;
  resetHubState();
});

test("the timeline shows five entries and a button for all of them", () => {
  resetTimeline();
  const updates = Array.from({ length: 12 }, (_, n) => ({ id: "u" + n, projectId: "p", at: `2026-10-${String(10 - (n % 9)).padStart(2, "0")}T12:${String(n).padStart(2, "0")}:00`, kind: "note", text: "note " + n }));
  const w = ws({ updates });
  const inScope = () => true;
  renderTimeline({ workspace: w, selection: { projectId: "p" }, inScope, today: "2026-10-11" });
  const html = el("timeline-list").innerHTML;
  assert.equal((html.match(/class="tl-entry"/g) || []).length, 5);
  assert.match(html, /data-timeline-more[^>]*>Show all 12 entries</);
  assert.equal(el("timeline-summary").textContent, "12 entries");
  resetTimeline();
});
