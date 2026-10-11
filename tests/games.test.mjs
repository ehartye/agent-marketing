import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const references = JSON.parse(readFileSync("craft/references.json", "utf8")),
  rules = JSON.parse(readFileSync("craft/rules.json", "utf8")),
  ref = (id) => references.find((r) => r.id === id),
  read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : ""),
  guide = read("craft/games.md"),
  flat = guide.replace(/\s+/g, " "),
  section = (heading) => {
    const start = guide.indexOf(`## ${heading}`);
    if (start < 0) return "";
    const next = guide.indexOf("\n## ", start + 4);
    return guide.slice(start, next < 0 ? undefined : next);
  },
  squash = (text) => text.replace(/\s+/g, " ");

// The primary pages the game launch guide and its rules rest on. Each was read on the date shown
// by the research crew and re-read by an independent verifier, and each keeps the caveat that
// the verifier found in its limit so the guide never promises more than the page says.
const gameReferences = {
  "steam-assets-standard": /920x430/,
  "steam-assets-library": /3840x1240/,
  "steam-assets-rules": /game artwork, the game name/,
  "steam-trailer": /5,000/,
  "steam-coming-soon": /unless the game changes a lot/,
  "steam-next-fest-oct-2026": /October 19/,
  "steam-next-fest-jun-2027": /June 14/,
  "steam-review-process": /Steam Wallet/,
  "steam-onboarding": /21-day/,
  "steam-gs-faq": /2-7 business days/,
  "steam-content-survey": /Pre-Generated/,
  "steam-subscriber-agreement": /under the age of 13/,
  "itch-html5": /1,000/,
  "itch-quality-guidelines": /AI Disclosure/,
  "itch-ai-disclosure-post": /Text & Dialog/,
  "itch-terms": /13 or older/,
  "github-pages-limits": /100 GB/,
  "coppa-rule-2025": /April 22, 2026/,
  "coppa-312-2": /persistent identifier/,
  "gamediscoverco-ai-poll": /43%/,
  "quantic-gen-ai-survey": /85%/,
  "game-oracle-ai-disclosure": /53%/,
  "arxiv-genai-steam-reviews": /508,192/,
  "steam-tag-search": /sort/,
  "uspto-trademark-search": /federal/,
  "webkit-itp-storage": /seven days/,
};

test("the game launch references are dated, https, and say what they support", () => {
  for (const [id, supports] of Object.entries(gameReferences)) {
    const r = ref(id);
    assert.ok(r, `missing reference ${id}`);
    assert.match(r.checkedAt, /^2026-10-1[01]$/, id);
    assert.match(r.url, /^https:\/\//, id);
    assert.match(`${r.supports} ${r.limit}`, supports, id);
    assert.ok(["high", "medium", "low"].includes(r.quality), id);
    assert.ok(r.limit.length > 30, `${id} should state a real limit`);
  }
});

test("references that a verifier corrected keep the correction in their limit", () => {
  // Valve's own pages disagree, and the guide states both rather than picking one.
  assert.match(ref("steam-onboarding").limit, /30-day|30 days/);
  assert.match(ref("steam-gs-faq").limit, /10 to 15|10-15/);
  assert.match(ref("steam-assets-standard").limit, /steam-assets-rules/);
  // Secondary or partial reads say so.
  assert.match(ref("quantic-gen-ai-survey").limit, /secondary|relayed|Cloudflare/i);
  assert.match(ref("game-oracle-ai-disclosure").limit, /cause/i);
  assert.match(ref("gamediscoverco-ai-poll").limit, /denominator/i);
  assert.match(ref("steam-tag-search").limit, /Reviews_DESC|under 10 reviews/);
  assert.match(ref("uspto-trademark-search").limit, /not legal|automated/i);
  // A forum reply and a preprint are not platform rules or peer-reviewed findings.
  assert.equal(ref("itch-ai-disclosure-post").quality, "medium");
  assert.match(ref("arxiv-genai-steam-reviews").limit, /preprint|not peer/i);
});

// ---- the guide ---------------------------------------------------------------------------

const headings = [
  "Free web first, store second",
  "What Steam requires and costs",
  "Store-asset conformance",
  "Trailer anatomy",
  "Measuring a game with no analytics",
  "AI-assistance disclosure",
  "Name and trademark check",
  "Base rates and tag counts",
  "Readiness gates",
  "What this guide does not cover",
];

test("the game guide is linked from the craft guide and keeps documented, measured and heuristic apart", () => {
  assert.ok(guide.length > 5000, "craft/games.md should exist");
  assert.match(read("craft/GUIDE.md"), /\]\(games\.md\)/);
  for (const kind of ["Documented", "Measured", "Heuristic"]) assert.match(guide, new RegExp(`\\*\\*${kind}\\*\\*`), kind);
  assert.match(flat, /not legal or tax advice/i);
  assert.match(flat, /2026-10-1[01]/);
  for (const h of headings) assert.ok(guide.includes(`## ${h}`), h);
});

test("every external link in the game guide is a dated reference, so nothing rests on an unrecorded page", () => {
  const known = new Set(references.map((r) => r.url.replace(/\/$/, "")));
  const urls = [...guide.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 25, `expected the guide to cite its sources, found ${urls.length}`);
  const missing = urls.filter((u) => !known.has(u.replace(/\/$/, "")));
  assert.deepEqual(missing, []);
});

test("the Steam section states the fee, the clock and Valve's contradictions without picking a side", () => {
  const steam = squash(section("What Steam requires and costs"));
  for (const fact of [
    /\$100 per product/,
    /\$1,000 adjusted gross revenue/,
    /30-day/,
    /21-day/,
    /2-7 business days/,
    /10 to 15 business days/,
    /1-5 days/,
    /7 business days/,
    /at least two weeks/,
    /Steam Wallet/,
    /advertising-based business models/,
    /Subscriber/,
    /Valve's own pages disagree/,
    /plan on/i,
    /February 22/,
    /January 10/,
    /October 19/,
    /June 14/,
    /April 25/,
    /prologue, chapter 1/,
    /already-public|already public/,
    /ask Valve/i,
  ])
    assert.match(steam, fact, String(fact));
});

test("the free-web section prices the venues and ties them to the stage", () => {
  const free = squash(section("Free web first, store second"));
  for (const fact of [
    /\$100/,
    /\$99 a year/,
    /\$25/,
    /Basic Launch/,
    /Poki/,
    /itch\.io/,
    /50 MB/,
    /1,000 files/,
    /marketing advise/,
    /no in-app purchases/i,
    /commercial/i,
  ])
    assert.match(free, fact, String(fact));
});

test("the asset checklist carries every size and the capsule text rules", () => {
  const assets = squash(section("Store-asset conformance"));
  for (const fact of [
    /920x430/,
    /462x174/,
    /1232x706/,
    /748x896/,
    /1438x810/,
    /600x900/,
    /3840x1240/,
    /860x380/,
    /1280/,
    /720/,
    /1920x1080/,
    /at least 5 screenshots/i,
    /four/,
    /5,000 Kbps/,
    /game artwork, the game name/,
    /official subtitle/,
    /title only/i,
    /concept art/,
    /Wishlisting now available/,
    /315x250/,
    /microtrailer/,
  ])
    assert.match(assets, fact, String(fact));
});

test("the trailer section gives both samples with n, median, the list and the limits", () => {
  const trailer = squash(section("Trailer anatomy"));
  for (const fact of [
    /n = 27/,
    /67\.8 s/,
    /55\.75/,
    /82\.65/,
    /18 of 27/,
    /17\.8, 29\.5/,
    /182\.0/,
    /n = 17/,
    /80 s/,
    /11 of 17/,
    /10 of 16/,
    /3\.8 s/,
    /-14\.1 LUFS/,
    /floors/,
    /music was not heard/i,
    /update, teaser|teaser, update/i,
    /judg/i,
  ])
    assert.match(trailer, fact, String(fact));
});

test("the measuring section covers hosting, the tagged link, each dashboard, children and Safari", () => {
  const m = squash(section("Measuring a game with no analytics"));
  for (const fact of [
    /100 GB/,
    /Traffic graph/,
    /address bar/,
    /logged in to Steam|logged-in/,
    /72 hours/,
    /Day 1 retention/,
    /500 players/,
    /persistent identifier/,
    /IP address/,
    /13/,
    /counsel/,
    /seven days of Safari use/,
    /0 cookies/,
    /returnRates/,
    /Time:/,
    /Risk:/,
    /Best practice:/,
  ])
    assert.match(m, fact, String(fact));
});

test("the AI section names every population, the spread and the Steam against itch.io difference", () => {
  const ai = squash(section("AI-assistance disclosure"));
  for (const fact of [
    /43%/,
    /26%/,
    /31%/,
    /about 3,800/i,
    /85%/,
    /63%/,
    /1,799/,
    /5% casual/,
    /508,192/,
    /53%/,
    /denominator/i,
    /cozy/i,
    /large language model|LLM/,
    /efficiency/,
    /Live-Generated/,
    /Wholesome/,
    /concealment/i,
    /inventory/i,
  ])
    assert.match(ai, fact, String(fact));
});

test("the name check is a gate before registration and says it is not legal clearance", () => {
  const name = squash(section("Name and trademark check"));
  for (const fact of [/not legal clearance/i, /trademark register/i, /exact-title/i, /domain/i, /handle/i, /counsel/i, /date/i])
    assert.match(name, fact, String(fact));
});

test("the base-rate section shows how the sort order moved a count", () => {
  const b = squash(section("Base rates and tag counts"));
  for (const fact of [/Reviews_DESC/, /Released_DESC/, /relevance/, /\b18\b/, /\b30\b/, /\b60\b/, /\b53\b/, /44 of 53/, /median 21/, /\b33\b/, /unsourced/i])
    assert.match(b, fact, String(fact));
});

test("the gate table gives each gate a numeric pass criterion and says where the number comes from", () => {
  const gates = section("Readiness gates"),
    rows = gates.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Gate") && !l.startsWith("|---"));
  assert.ok(rows.length >= 9, `expected at least nine gates, found ${rows.length}`);
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    assert.equal(cells.length, 3, row);
    assert.match(cells[1], /\d/, `${cells[0]} needs a number`);
    assert.match(cells[2], /^(Documented|Measured|Owner decision)/, `${cells[0]} source`);
  }
  for (const fact of [/50 MB/, /5 of 8/, /0 same-name/, /marketing put gates/]) assert.match(squash(gates), fact);
});

test("the game rules are queryable, sourced and carry their working", () => {
  const ids = [
    "store-assets-conform",
    "calendar-from-the-longest-wait",
    "trailer-benchmarks-are-descriptive",
    "base-rates-need-a-fixed-denominator",
    "ai-disclosure-follows-shipped-content",
    "ai-sentiment-has-a-population",
    "no-identifiers-where-children-may-play",
    "venue-dashboards-first",
    "check-the-name-before-registering",
    "readiness-gates-carry-a-number",
    "free-web-before-store-page",
    "store-page-after-gates",
  ];
  const known = new Set(references.map((r) => r.id));
  for (const id of ids) {
    const r = rules.find((x) => x.id === id);
    assert.ok(r, id);
    assert.equal(r.topic, "games", id);
    assert.ok(["external", "heuristic", "derived"].includes(r.kind), id);
    assert.ok(r.referenceIds.length && r.referenceIds.every((x) => known.has(x)), `${id} references`);
    if (r.kind !== "external") assert.ok(r.reason?.length > 40, `${id} needs its working`);
  }
  assert.equal(rules.filter((r) => r.topic === "games").length, ids.length);
  assert.equal(rules.find((r) => r.id === "calendar-from-the-longest-wait").kind, "derived");
  assert.match(rules.find((r) => r.id === "calendar-from-the-longest-wait").reason, /30.*21|21.*30/s);
  assert.match(rules.find((r) => r.id === "base-rates-need-a-fixed-denominator").reason, /18.*30.*60/s);
  assert.match(rules.find((r) => r.id === "trailer-benchmarks-are-descriptive").reason, /67\.8/);
  assert.equal(rules.find((r) => r.id === "store-assets-conform").kind, "external");
});

// ---- the skills and docs point at the guide --------------------------------------------------

const skillNames = [
  "market-campaign",
  "market-collateral",
  "market-discover",
  "market-experiment",
  "market-insights",
  "market-monitor",
  "market-research",
  "market-setup",
  "market-strategy",
];
const skill = (name) => read(`skills/${name}/SKILL.md`);
const description = (name) => /^description: (.+)$/m.exec(skill(name))?.[1].trim() ?? "";

test("the five skills that meet a game point at the game guide", () => {
  for (const name of ["market-research", "market-strategy", "market-campaign", "market-collateral", "market-monitor"])
    assert.match(skill(name), /\]\(\.\.\/\.\.\/craft\/games\.md\)/, name);
  assert.match(skill("market-strategy"), /marketing advise/);
  assert.match(skill("market-strategy"), /stage/);
  assert.match(skill("market-campaign"), /marketing advise/);
  assert.match(skill("market-campaign"), /Next Fest/);
  assert.match(skill("market-collateral"), /capsule/i);
  assert.match(skill("market-collateral"), /AI/);
  assert.match(skill("market-monitor"), /returnRates/);
  assert.match(skill("market-monitor"), /private repository/i);
  assert.match(skill("market-research"), /query, sort|sort order/i);
});

test("skill descriptions stay short and trigger-accurate after the game changes", () => {
  for (const name of skillNames) {
    const d = description(name);
    assert.ok(d.length >= 100 && d.length <= 215, `${name}: ${d.length} characters`);
    assert.doesNotMatch(d, /games\.md/, name);
    assert.ok(skill(name).split("\n").length < 500, name);
  }
  assert.match(description("market-collateral"), /store-page assets/);
  assert.match(description("market-monitor"), /no analytics/);
  // The routing words that the Yoda audit checked for the other skills are unchanged.
  assert.match(description("market-research"), /who would pay, what game to build/);
  assert.match(description("market-strategy"), /where to promote/);
});

test("the craft guides send a game to the game guide for the part they leave out", () => {
  for (const file of ["channels", "collateral", "measurement", "campaigns"])
    assert.match(read(`craft/${file}.md`), /\]\(games\.md\)/, file);
});

test("docs/CLI.md states the GitHub adapter's private repository limit and that Pages has no visit analytics", () => {
  const cli = squash(read("docs/CLI.md"));
  assert.match(cli, /private repository answers HTTP 404/i);
  assert.match(cli, /GitHub Pages/);
  assert.match(cli, /no visit analytics/i);
  assert.match(cli, /Traffic graph/);
  assert.match(cli, /no Pages adapter/i);
  assert.match(cli, /craft\/games\.md/);
});

test("the README lists the stage-aware advice, the game guide and the revised skill rows", () => {
  const readme = squash(read("README.md"));
  assert.match(readme, /\]\(craft\/games\.md\)/);
  assert.match(readme, /`advise` and `channels` read the project's stage/);
  assert.match(readme, /free web release/i);
  assert.match(readme, /store-page assets/i);
  assert.match(readme, /no analytics/i);
  for (const name of skillNames) assert.match(readme, new RegExp(`\| ${name} \|`), name);
});
