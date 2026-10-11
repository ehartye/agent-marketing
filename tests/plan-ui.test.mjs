import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeskClient } from "../ui/state.js";
import { plan as buildPlan } from "../src/analysis.mjs";
import { hasPlanData, gateChip, gateCard, loadStrip, weeksTable, initiativeFlags, planSummary } from "../ui/views/plan.js";

const demo = () => JSON.parse(readFileSync("examples/studio.json", "utf8"));
const harbor = () => buildPlan(demo(), "harbor");
const orbit = () => buildPlan(demo(), "orbit");

test("the plan panel appears only for a project that records gates, hours or dependencies", () => {
  assert.equal(hasPlanData(null), false);
  assert.equal(hasPlanData([]), false);
  assert.equal(hasPlanData(orbit()), false, "the existing demo project has none of the three");
  assert.equal(hasPlanData(harbor()), true);
  const onlyHours = demo();
  onlyHours.initiatives.find((i) => i.id === "orbit-video").hours = 2;
  assert.equal(hasPlanData(buildPlan(onlyHours, "orbit")), true);
  const onlyDependency = demo();
  onlyDependency.initiatives.find((i) => i.id === "orbit-playtest").dependsOn = ["orbit-video"];
  assert.equal(hasPlanData(buildPlan(onlyDependency, "orbit")), true);
});

test("a gate status chip says the status in words and carries a shape, not only a colour", () => {
  for (const [status, glyph] of [["open", "○"], ["passed", "✓"], ["failed", "✕"], ["waived", "↷"]]) {
    const html = gateChip(status);
    assert.match(html, new RegExp(`class="pill gate-chip ${status}"`));
    assert.ok(html.includes(glyph), status);
    assert.ok(html.includes(`</span> ${status}</span>`), status);
    assert.ok(html.includes('aria-hidden="true"'), "the glyph is decoration, the word is the label");
  }
  assert.doesNotMatch(gateChip('x"><script>'), /<script>/);
});

test("a gate card shows its pass condition, check date, evidence, the work that needs it and its note", () => {
  const w = demo(), p = harbor();
  const html = gateCard(p.gates.find((g) => g.id === "harbor-gate-assets"), p, w);
  assert.match(html, /Store assets conform/);
  assert.match(html, /failed/);
  assert.match(html, /5 gameplay screenshots at 1920x1080/);
  assert.match(html, /Checked 2026-10-09/);
  assert.match(html, /href="https:\/\/example\.com\/demo-capsule-rules"/);
  assert.match(html, /Needed by[^<]*Free browser page on itch\.io/);
  assert.match(html, /The capsule still shows the tagline/);
  const repoPath = gateCard(p.gates.find((g) => g.id === "harbor-gate-truth"), p, w);
  assert.doesNotMatch(repoPath, /href="README\.md/, "a repository path is shown as text, not a link");
  assert.match(repoPath, /README\.md#L10-L20/);
  const bare = gateCard(p.gates.find((g) => g.id === "harbor-gate-playtest"), p, w);
  assert.match(bare, /open/);
  assert.doesNotMatch(bare, /Checked/);
  assert.doesNotMatch(bare, /Evidence/);
});

test("gate text from a ledger is escaped", () => {
  const w = demo(), p = harbor();
  const g = { ...p.gates[0], name: "<img src=x onerror=alert(1)>", criteria: "a & b", notes: '"quoted"', evidenceIds: ["<b>"] };
  const html = gateCard(g, p, w);
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /a &amp; b/);
});

test("the weekly strip draws one column per week, marks over-cap weeks and shows the cap", () => {
  const p = harbor();
  const html = loadStrip(p);
  assert.equal((html.match(/<g class="week/g) || []).length, p.load.weeks.length);
  assert.equal((html.match(/<g class="week over"/g) || []).length, 2);
  assert.match(html, /<line class="cap"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="[^"]*6 hour weekly cap[^"]*2 of 9 weeks[^"]*"/);
  assert.match(html, /<title>Week of 2026-10-12: 7 h, 1 h over the 6 h cap<\/title>/);
  assert.match(html, /<title>Week of 2026-10-19: 3 h<\/title>/);
  assert.doesNotMatch(html, /<script/);
});

test("the strip is safe under the desk's content security policy and legible at phone width", () => {
  const html = loadStrip(harbor());
  assert.doesNotMatch(html, /\sstyle=/, "the policy allows no inline style attribute");
  const width = Number(/<svg[^>]*\swidth="(\d+)"/.exec(html)[1]), viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(html);
  assert.equal(Number(viewBox[1]), width, "one SVG unit is one pixel, so text keeps its size and a long plan scrolls");
  assert.ok(width > 0);
});

test("columns widen to fill a wide box but never past a readable width, and never below the minimum", () => {
  const p = harbor(), n = p.load.weeks.length;
  const width = (html) => Number(/<svg[^>]*\swidth="(\d+)"/.exec(html)[1]);
  const narrow = width(loadStrip(p)), phone = width(loadStrip(p, 312)), desktop = width(loadStrip(p, 631)), huge = width(loadStrip(p, 4000));
  assert.equal(narrow, 16 + 30 * n, "with no measurement, the minimum column");
  assert.ok(phone >= narrow && phone <= 312, "a plan that fits a phone box fills it without scrolling");
  assert.ok(desktop > phone && desktop <= 631, "a desktop box is filled, not exceeded");
  const w = demo();
  w.initiatives.find((i) => i.id === "harbor-devlog").end = "2027-03-28";
  const long = buildPlan(w, "harbor");
  assert.ok(long.load.weeks.length > 20);
  assert.equal(width(loadStrip(long, 312)), 16 + 30 * long.load.weeks.length, "a long plan keeps the minimum column and scrolls instead of shrinking");
  assert.equal(huge, 16 + 64 * n, "columns stop widening at a readable width");
  assert.ok(Number.isInteger(desktop));
});

test("strip shapes never reuse a class the page stylesheet already sizes, such as the funnel's .bar", () => {
  const html = loadStrip(harbor());
  assert.doesNotMatch(html, /class="bar/);
  const css = readFileSync("ui/style.css", "utf8");
  for (const name of ["col", "week", "cap", "unknown", "value", "tick", "month", "base"])
    assert.doesNotMatch(css.replace(/\.load-plot\s+(\.over\s+)?\.\w+/g, ""), new RegExp(`(^|[\\s,}])\\.${name}[\\s,{.:]`, "m"), name);
});

test("weeks with initiatives that have no hours show a dashed unknown block, and are not drawn as zero", () => {
  const html = loadStrip(harbor());
  assert.equal((html.match(/class="unknown"/g) || []).length, 7);
  assert.match(html, /<title>Week of 2026-10-26: 6 h, plus hours not yet set for 1 initiative<\/title>/);
  const quiet = loadStrip(orbitWithHours());
  assert.doesNotMatch(quiet, /class="unknown"/);
});

function orbitWithHours() {
  const w = demo();
  for (const i of w.initiatives.filter((x) => x.projectId === "orbit")) i.hours = 1;
  return buildPlan(w, "orbit");
}

test("a week with no hours is a quiet tick, and month labels appear where the month changes", () => {
  const html = loadStrip(harbor());
  assert.match(html, />Oct 2026</);
  assert.match(html, />Nov</);
  assert.match(html, />Dec</);
  const w = demo();
  w.initiatives.find((i) => i.id === "harbor-playtest").hours = 0;
  w.initiatives = w.initiatives.filter((i) => i.projectId !== "harbor" || i.id === "harbor-playtest");
  const quiet = loadStrip(buildPlan(w, "harbor"));
  assert.match(quiet, /<title>Week of 2026-10-12: 0 h<\/title>/);
  assert.doesNotMatch(quiet, /class="week over"/);
});

test("with no dated work the strip says so instead of drawing an empty chart", () => {
  const w = demo();
  w.initiatives = w.initiatives.filter((i) => i.projectId !== "harbor");
  const html = loadStrip(buildPlan(w, "harbor"));
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /class="empty"/);
});

test("the weekly table repeats every number of the strip for readers who skip the graphic", () => {
  const p = harbor();
  const html = weeksTable(p, demo());
  assert.equal((html.match(/<tr>/g) || []).length, p.load.weeks.length + 1);
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /<td>2026-10-12 → 2026-10-18<\/td><td>7<\/td><td>1<\/td>/);
  assert.match(html, /Outside playtest of the web build[^<]*3 h/);
  assert.match(html, /Weekly devlog posts/);
});

test("an initiative shows when it is blocked and by what, and which over-cap weeks it adds to", () => {
  const p = harbor();
  const itch = initiativeFlags(p.initiatives.find((i) => i.id === "harbor-itch"));
  assert.match(itch.chips, /class="pill flag blocked">Blocked</);
  assert.doesNotMatch(itch.chips, /Over cap/);
  assert.match(itch.notes, /Waits on/);
  assert.match(itch.notes, /Outside playtest \(open\)/);
  assert.match(itch.notes, /Store assets conform \(failed\)/);
  const steam = initiativeFlags(p.initiatives.find((i) => i.id === "harbor-steam"));
  assert.match(steam.notes, /Free browser page on itch\.io \(planned\)/);
  assert.match(steam.chips, /Over cap/);
  assert.match(steam.notes, /week of 2026-11-16/i);
  const assets = initiativeFlags(p.initiatives.find((i) => i.id === "harbor-assets"));
  assert.match(assets.chips, /Over cap/);
  assert.doesNotMatch(assets.chips, /Blocked/);
  const free = initiativeFlags(p.initiatives.find((i) => i.id === "harbor-devlog"));
  assert.deepEqual(free, { chips: "", notes: "" });
  assert.deepEqual(initiativeFlags(undefined), { chips: "", notes: "" });
});

test("the headline counts say what to look at first", () => {
  const s = planSummary(harbor());
  assert.equal(s.gates, "4 gates · 2 not passed");
  assert.equal(s.load, "2 weeks over the 6 h cap · peak 7 h");
  const w = demo();
  for (const i of w.initiatives.filter((x) => x.projectId === "orbit")) i.hours = 1;
  w.gates.push({ id: "orbit-gate", projectId: "orbit", name: "G", criteria: "c", status: "passed" });
  const calm = planSummary(buildPlan(w, "orbit"));
  assert.equal(calm.gates, "1 gate · all passed or waived");
  assert.equal(calm.load, "within the 3 h cap");
  assert.equal(planSummary(buildPlan(demo(), "orbit")).load, "no hours recorded yet");
});

test("the desk client asks for the plan of the chosen project and publishes it in the snapshot", async () => {
  const urls = [];
  const stub = { projectId: "sketch", gates: [], initiatives: [] };
  const workspace = { revision: 1, projects: [{ id: "orbit" }, { id: "sketch" }], initiatives: [] };
  const client = createDeskClient(async (url) => {
    urls.push(url);
    return url === "/api/workspace" ? workspace : url.startsWith("/api/plan") ? stub : [];
  });
  const snapshot = await client.load({ projectId: "sketch" });
  assert.ok(urls.includes("/api/plan?projectId=sketch"));
  assert.equal(snapshot.plan, stub);
});

test("the desk serves its plan module and the page has a place for the panel", () => {
  const html = readFileSync("ui/index.html", "utf8");
  for (const id of ["plan-view", "gates", "load", "gate-summary", "load-summary"])
    assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(readFileSync("src/server.mjs", "utf8").includes('"views/plan.js"'));
});

// WCAG 2.x: 4.5:1 is the minimum for text under 18.66px bold or 24px, and a chip's 11px label is small text.
const luminance = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1),
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// The declarations of the rule whose selector is exactly `selector` (the first one in the file).
const ruleBody = (css, selector) => {
  const at = css.search(new RegExp(String.raw`(^|\n)` + selector.replace(/[[\]().]/g, String.raw`\$&`) + String.raw`\s*\{`)),
    open = css.indexOf("{", at);
  return at < 0 ? "" : css.slice(open + 1, css.indexOf("}", open));
};
const tokensIn = (css, selector) =>
  Object.fromEntries(
    [...ruleBody(css, selector).matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]),
  );

test("every gate chip and positive pill reads at 4.5:1 or better against its pill background in both themes", () => {
  const css = readFileSync("ui/style.css", "utf8"),
    dark = tokensIn(css, ":root"),
    themes = { dark, light: { ...dark, ...tokensIn(css, ':root[data-theme="light"]') } },
    pill = ruleBody(css, ".pill").match(/background:\s*var\((--[\w-]+)\)/)?.[1];
  assert.equal(pill, "--paper", "the chip sits on the pill background");
  for (const selector of [".gate-chip.open", ".gate-chip.passed", ".gate-chip.failed", ".gate-chip.waived", ".pill.positive"]) {
    const colour = ruleBody(css, selector).match(/(?:^|[\s;])color:\s*var\((--[\w-]+)\)/)?.[1];
    assert.ok(colour, `${selector} sets a text colour from a token`);
    for (const [name, tokens] of Object.entries(themes))
      assert.ok(
        contrast(tokens[colour], tokens[pill]) >= 4.5,
        `${selector} in the ${name} theme: ${tokens[colour]} on ${tokens[pill]} is ${contrast(tokens[colour], tokens[pill]).toFixed(2)}:1`,
      );
  }
});
