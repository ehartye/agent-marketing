import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampMore, foldMain, fullTitle, TITLE_LINE, setOpen, isOpen, resetHubState } from "../ui/hub-shared.js";
import { needsBody, resetNeeds } from "../ui/views/needs.js";
import { recommendedLabel, decisionItem, decisionRows, OPEN_ROWS } from "../ui/views/decisions.js";
import { splitActions, actionRow, NOW_DAYS } from "../ui/views/actions.js";
import { initiativeNode, buildTree } from "../ui/views/hierarchy.js";

// The shapes the views are fed with, kept small.
const option = (id, label, over = {}) => ({ id, label, ...over });
const decision = (over = {}) => ({
  id: "d", projectId: "p", title: "Pick one", question: "Which?", status: "open",
  options: [option("a", "Option A: pay on Fri 10-16"), option("b", "Option B: wait")], ...over,
});
const ws = (over = {}) => ({ projects: [{ id: "p", name: "P" }], initiatives: [{ id: "i1", projectId: "p", name: "Trailer" }], decisions: [], actions: [], gates: [], reports: [], updates: [], evidence: [], assetSlots: [], assets: [], ...over });
const summary = (over = {}) => ({ decisions: 0, overdueDecisions: 0, actions: 0, overdueActions: 0, gates: 0, overdueGates: 0, blockedInitiatives: 0, picks: 0, stale: 0, total: 0, ...over });
const att = (over = {}) => ({ today: "2026-10-11", projectId: "p", decisions: [], actions: [], gates: [], blockedInitiatives: [], picks: [], stale: [], recent: [], waiting: [], summary: summary(), ...over });

// ---- 1. a long objective is clamped, and the whole text is one toggle away ---------------------------

test("a long text gets a Read-the-full expander built from a details element; a short one gets none", () => {
  const long = "Release the game on Steam with one truthful disclosure everywhere and no rejection for a banned claim, and file a verdict on every learning question. ".repeat(3);
  const html = clampMore(long, "Read the full objective");
  assert.match(html, /^<details class="clamp-more">/);
  assert.match(html, /<summary>[^]*Read the full objective[^]*<\/summary>/);
  assert.match(html, /Show less/, "the open state says how to fold it again");
  assert.equal(clampMore("Make a tiny game.", "Read the full objective"), "", "short text is not clamped, so it needs no expander");
  assert.doesNotMatch(clampMore("x".repeat(400), 'Read <img src=x onerror=1>'), /<img/, "the label is escaped");
  assert.equal(clampMore("", "Read it"), "");
  assert.equal(clampMore(undefined, "Read it"), "");
  // A threshold of its own for the longer promise line.
  assert.equal(clampMore("y".repeat(200), "Read more", { at: 240 }), "");
  assert.notEqual(clampMore("y".repeat(260), "Read more", { at: 240 }), "");
});

test("the page head holds the promise and the objective in clamped blocks with a place for the toggle, and the filters fold", () => {
  const html = readFileSync("ui/index.html", "utf8");
  for (const id of ["project-summary", "project-objective"]) {
    assert.match(html, new RegExp(`id="${id}" class="clamp-text"`), id);
    assert.match(html, new RegExp(`id="${id}-more"`), id);
  }
  assert.match(html, /<details class="filters-fold" id="filters-fold" open>\s*<summary>Filters <span id="filters-now"/);
  assert.match(html, /<form class="filters" id="filters">/, "the form is still the form the desk reads");
  const css = readFileSync("ui/style.css", "utf8");
  assert.match(css, /\.clamp-text \{[^}]*-webkit-line-clamp: 3/);
  assert.match(css, /\.clamp:has\(\.clamp-more\[open\]\) \.clamp-text/, "opening the toggle lifts the clamp");
});

test("a title longer than a row shows is given whole under Details, and a short one is not repeated", () => {
  const long = "Get the written agreement from the game team: who runs the work, who approves a patch, and a delivery date for each ask";
  assert.ok(long.length > TITLE_LINE);
  assert.match(fullTitle(long), /Full title[^]*Get the written agreement/);
  assert.equal(fullTitle("Short one"), "");
  assert.doesNotMatch(fullTitle("<img src=x> " + "x".repeat(TITLE_LINE)), /<img/);
  resetNeeds();
  const a = att({ gates: [{ id: "g", name: long, criteria: "c", status: "open", due: "2026-10-12", daysLeft: 1, overdue: false, hours: null, blocks: [] }], summary: summary({ gates: 1, total: 1 }) });
  const html = needsBody(a, { workspace: ws(), plan: null });
  const detail = html.slice(html.indexOf("</summary>"));
  assert.match(detail, /Full title/);
});

// ---- 2. the recommended label comes from the id the record names --------------------------------------

test("the recommended label is the named option's own label, and empty when none is named", () => {
  assert.equal(recommendedLabel(decision({ recommendedOptionId: "a" })), "Recommended: Option A: pay on Fri 10-16");
  assert.equal(recommendedLabel(decision({ recommendedOptionId: "gone" })), "");
  assert.equal(recommendedLabel(decision({ recommendation: "Option A: best" })), "", "prose is never read for a guess");
  assert.equal(recommendedLabel(decision()), "");
  assert.equal(recommendedLabel(undefined), "");
});

// ---- 3. Needs rows are one scannable line with the rest behind Details -------------------------------

test("each needs row says kind, when, what and the control on one line; the rest folds behind Details", () => {
  resetNeeds();
  const d = decision({ id: "dec1", recommendedOptionId: "a", recommendation: "Pay Friday; it clears the queue", defaultIfSilent: "We ship Monday", initiativeId: "i1" });
  const w = ws({
    decisions: [d],
    actions: [{ id: "a1", projectId: "p", title: "Cut the trailer", owner: "owner", status: "todo", due: "2026-10-12", initiativeId: "i1" }],
  });
  const a = att({
    decisions: [{ id: "dec1", title: d.title, question: d.question, status: "open", needBy: "2026-10-14", daysLeft: 3, overdue: false, recommendation: d.recommendation, recommendedOptionId: "a", defaultIfSilent: d.defaultIfSilent, optionCount: 2, initiativeId: "i1" }],
    actions: [{ id: "a1", title: "Cut the trailer", status: "todo", due: "2026-10-12", daysLeft: 1, overdue: false, reason: "due-soon", blockedBy: null, hours: 2, initiativeId: "i1" }],
    summary: summary({ decisions: 1, actions: 1, total: 2 }),
  });
  const html = needsBody(a, { workspace: w, plan: null });
  const rows = html.split('<li class="need"').slice(1);
  assert.equal(rows.length, 2);
  const [dec, act] = rows;
  // The line: badge, due, title, recommended, control.
  const decLine = dec.slice(0, dec.indexOf("</summary>"));
  assert.match(decLine, /pill kind decision/);
  assert.match(decLine, /Due in 3 days/);
  assert.match(decLine, /Pick one/);
  assert.match(decLine, /Recommended: Option A: pay on Fri 10-16/);
  assert.doesNotMatch(decLine, /Which\?|If you stay silent|Trailer/, "the details are not on the line");
  assert.match(dec, /data-goto="decision:dec1"[^>]*>Compare 2 options and decide/);
  // Behind the toggle.
  const decDetail = dec.slice(dec.indexOf("</summary>"));
  assert.match(dec, /<details class="row-fold"[^>]*><summary[^>]*>[^]*Details/);
  assert.match(decDetail, /Which\?/);
  assert.match(decDetail, /Pay Friday; it clears the queue/);
  assert.match(decDetail, /We ship Monday/);
  assert.match(decDetail, /for[^]*Trailer/i);
  // The five-dimension comparison belongs to the decision card, not to this row.
  assert.doesNotMatch(html, /class="dim"|<dt>Time<\/dt>/);
  // An action keeps its controls, outside the folded part so they stay one click away.
  assert.match(act, /pill kind action/);
  assert.match(act, /data-action-status="done" data-action-id="a1"/);
  const actDetail = act.slice(act.indexOf("</summary>"), act.indexOf("</details>"));
  assert.doesNotMatch(actDetail, /data-action-status/, "the buttons are not inside the folded part");
  assert.match(actDetail, /Trailer/);
});

test("a row with nothing to fold has no Details toggle, and the Overdue group keeps its kind badge once", () => {
  resetNeeds();
  const a = att({
    blockedInitiatives: [{ id: "i1", name: "Trailer", status: "running", start: "2026-10-01", daysToStart: -10, blocker: { id: "g", name: "Gate", kind: "gate", status: "open" } }],
    summary: summary({ blockedInitiatives: 1, total: 1 }),
  });
  const html = needsBody(a, { workspace: ws(), plan: null });
  assert.equal((html.match(/pill kind initiative/g) || []).length, 1);
  assert.match(html, /Waits on[^]*Gate/);
});

test("a row's own toggle is remembered while the page redraws", () => {
  resetHubState();
  const a = att({ gates: [{ id: "g1", name: "Gate one", criteria: "ship it", status: "open", due: "2026-10-10", daysLeft: -1, overdue: true, hours: null, blocks: [] }], summary: summary({ gates: 1, overdueGates: 1, total: 1 }) });
  const closed = needsBody(a, { workspace: ws(), plan: null });
  assert.doesNotMatch(closed, /<details class="row-fold"[^>]* open/);
  setOpen("need:gate:g1", true);
  assert.match(needsBody(a, { workspace: ws(), plan: null }), /<details class="row-fold"[^>]*data-key="need:gate:g1" open/);
  resetHubState();
});

test("foldMain keeps its controls out of the summary and escapes nothing it was given as markup", () => {
  const html = foldMain({ key: "k", head: "<b>head</b>", detail: "<p>more</p>" });
  assert.match(html, /<summary class="row-line"><b>head<\/b>[^]*Details[^]*<\/summary>/);
  assert.match(html, /<div class="row-detail"><p>more<\/p><\/div>/);
  assert.doesNotMatch(foldMain({ key: "k", head: "h", detail: "" }), /<details/);
  assert.equal(isOpen("never-set"), false);
});

// ---- 4. decisions: compact rows, the single most urgent card open ----------------------------------

test("an open decision is a compact row: title, need-by, the recommended option and a Compare cue", () => {
  const full = { time: "t", risk: "r", complexity: "c", bestPractice: "b", maintainability: "m" };
  const d = decision({ needBy: "2026-10-14", recommendedOptionId: "b", options: [option("a", "Option A: pay on Fri 10-16", full), option("b", "Option B: wait", full)] });
  const html = decisionItem(d, { workspace: ws({ decisions: [d] }), today: "2026-10-11" });
  const line = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  assert.match(line, /Pick one/);
  assert.match(line, /Due in 3 days/);
  assert.match(line, /Recommended: Option B: wait/);
  assert.match(line, /Compare 2 options/);
  assert.doesNotMatch(html.slice(0, html.indexOf("</summary>")), /\sopen[\s>]/, "it starts folded");
  assert.match(html, /<dt>Time<\/dt>/, "the five-dimension comparison is in the card behind it");
  assert.doesNotMatch(line, /status-chip open/, "the Open filter already says it is open");
  const decided = decisionItem(decision({ status: "decided", chosen: "a", decidedAt: "2026-10-11T08:00:00.000Z" }), { workspace: ws(), today: "2026-10-11" });
  assert.match(decided, /status-chip decided/, "a decided card keeps its chip and its choice");
});

test("the Open view shows the most urgent decisions as rows and folds the rest behind one button", () => {
  const many = Array.from({ length: OPEN_ROWS + 4 }, (_, n) => decision({ id: "d" + String(n).padStart(2, "0") }));
  const compact = decisionRows(many, false);
  assert.equal(compact.shown.length, OPEN_ROWS);
  assert.equal(compact.hidden, 4);
  assert.deepEqual(compact.shown, many.slice(0, OPEN_ROWS), "the order it was given, most urgent first, is kept");
  const all = decisionRows(many, true);
  assert.equal(all.shown.length, many.length);
  assert.equal(all.hidden, 0);
  const few = decisionRows(many.slice(0, 3), false);
  assert.equal(few.shown.length, 3);
  assert.equal(few.hidden, 0);
});

// ---- 5. actions: what to do now, and the rest folded -------------------------------------------------

test("the default action list is owner steps due within 14 days plus anything doing or blocked", () => {
  const today = "2026-10-11";
  const a = (id, over = {}) => ({ id, projectId: "p", title: id, owner: "owner", status: "todo", ...over });
  const list = [
    a("overdue", { due: "2026-10-01" }),
    a("today", { due: today }),
    a("edge", { due: "2026-10-25" }),
    a("past-edge", { due: "2026-10-26" }),
    a("nodate"),
    a("doing-late", { status: "doing", due: "2027-01-01" }),
    a("doing-nodate", { status: "doing" }),
    a("blocked-late", { status: "blocked", due: "2027-02-01" }),
    a("agent-soon", { owner: "agent", due: "2026-10-12" }),
    a("agent-doing", { owner: "agent", status: "doing" }),
    a("agent-nodate", { owner: "agent" }),
    a("done", { status: "done" }),
    a("dropped", { status: "dropped", owner: "agent" }),
  ];
  assert.equal(NOW_DAYS, 14);
  const s = splitActions(list, today);
  assert.deepEqual(s.now.map((x) => x.id), ["overdue", "today", "edge", "doing-late", "doing-nodate", "blocked-late", "agent-doing"]);
  assert.deepEqual(s.later.map((x) => x.id), ["past-edge", "nodate"]);
  assert.deepEqual(s.agent.map((x) => x.id), ["agent-soon", "agent-nodate"]);
  assert.deepEqual(s.closed.map((x) => x.id), ["done", "dropped"]);
  assert.equal(s.now.length + s.later.length + s.agent.length + s.closed.length, list.length, "every action lands in exactly one place");
  assert.deepEqual(splitActions([], today), { now: [], later: [], agent: [], closed: [] });
});

test("an action row is one line of status, title, owner and due, with the notes and links folded", () => {
  const html = actionRow({ id: "x", projectId: "p", title: "Record it", owner: "owner", status: "todo", due: "2026-10-10", hours: 1.5, notes: "bring the mic", decisionId: "dd" }, { workspace: ws({ decisions: [decision({ id: "dd", title: "Which mic" })] }), today: "2026-10-11" });
  const line = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  assert.match(line, /Record it/);
  assert.match(line, /status-chip todo/);
  assert.match(line, /Overdue 1 day/);
  assert.match(line, /1\.5 h/);
  assert.doesNotMatch(line, /bring the mic|Which mic/);
  const rest = html.slice(html.indexOf("</summary>"), html.indexOf("</details>"));
  assert.match(rest, /bring the mic/);
  assert.match(rest, /Decision: Which mic/);
  assert.doesNotMatch(rest, /data-action-status/);
  assert.match(html, /data-action-status="done" data-action-id="x"/);
  const bare = actionRow({ id: "y", projectId: "p", title: "Plain", owner: "owner", status: "todo" }, { workspace: ws(), today: "2026-10-11" });
  assert.doesNotMatch(bare, /<details class="row-fold"/, "nothing to fold, no toggle");
});

// ---- 6. initiatives: one compact row each, the detail on demand --------------------------------------

test("an initiative is a compact row; hypothesis, links and the note editor sit behind it, a parent starts open", () => {
  const tree = buildTree([
    { id: "root", projectId: "p", name: "Launch", channel: "steam", hypothesis: "Launch hyp", cta: "Wishlist", owner: "owner", status: "running", start: "2026-10-01", end: "2026-11-01", hours: 10, note: "On track" },
    { id: "kid", projectId: "p", name: "Trailer", channel: "video", hypothesis: "Kid hyp", cta: "Watch", owner: "owner", status: "planned", start: "2026-10-05", end: "2026-10-20", note: "" , parentId: "root"},
  ]);
  const plan = { initiatives: [
    { id: "root", hours: 12, progress: { gatesPassed: 1, gatesTotal: 4, actionsDone: 3, actionsTotal: 6 }, rollup: { start: "2026-10-01", end: "2026-11-01", status: "running" }, blocked: false, overCapWeeks: [], blockedBy: [] },
    { id: "kid", hours: 2, progress: { gatesPassed: 0, gatesTotal: 0, actionsDone: 0, actionsTotal: 0 }, blocked: false, overCapWeeks: [], blockedBy: [] },
  ] };
  const w = ws({ initiatives: tree.map((n) => n.initiative).concat(tree[0].children.map((n) => n.initiative)) });
  const html = initiativeNode(tree[0], { workspace: w, planFor: () => plan });
  const rootLine = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  assert.match(rootLine, /Launch/);
  assert.match(rootLine, /running/);
  assert.match(rootLine, /2026-10-01/);
  assert.match(rootLine, /2026-11-01/);
  assert.match(rootLine, /12 h/);
  assert.match(rootLine, /<progress[^>]*value="4"[^>]*max="10"|<progress[^>]*max="10"[^>]*value="4"/, "gates and actions done, together");
  assert.match(rootLine, /On track/);
  assert.doesNotMatch(rootLine, /Launch hyp|name="note"/);
  // A parent opens onto its children first; its own hypothesis, note editor and links are one more toggle below them.
  const own = html.slice(html.indexOf('class="init-own"'));
  assert.ok(html.indexOf("init-children") < html.indexOf('class="init-own"'));
  assert.match(own, /<summary>About Launch/);
  assert.match(own, /Launch hyp/);
  assert.match(own, /data-note-form="root"/);
  assert.match(own, /data-initiative="root"/, "the status select is in the opened part");
  assert.match(html, /data-key="section:init-own:root">/, "and it starts folded");
  // A part with nothing under it has no nested toggle: its detail is the one opened part.
  const kidHtml = initiativeNode(tree[0].children[0], { workspace: w, planFor: () => plan });
  assert.doesNotMatch(kidHtml, /init-own/);
  assert.match(kidHtml, /Kid hyp[^]*data-note-form="kid"/);
  assert.match(html, /<details class="initiative parent"[^>]*data-initiative-card="root"[^>]*data-key="section:init:root" open/, "a parent starts open, so its children show");
  assert.match(html, /<details class="initiative"[^>]*data-initiative-card="kid"[^>]*data-key="section:init:kid">/, "a part starts folded");
  // The child is a row of its own inside the parent's opened part.
  assert.ok(html.indexOf('data-initiative-card="kid"') > html.indexOf("init-children"));
  assert.ok(html.indexOf('data-initiative-card="kid"') < html.indexOf('class="init-own"'));
  // Opening one is remembered in this browser like a section is.
  resetHubState();
  setOpen("section:init:kid", true);
  assert.match(initiativeNode(tree[0], { workspace: w, planFor: () => plan }), /data-initiative-card="kid"[^>]*data-key="section:init:kid" open/);
  resetHubState();
});
