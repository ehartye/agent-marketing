import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { advise } from "../src/analysis.mjs";
import { recommendChannels, channelLibrary } from "../src/channels.mjs";
import { ledger, project as baseProject, observation } from "./fixtures.mjs";

const STAGES = ["idea", "prototype", "beta", "launched"];
const rules = JSON.parse(readFileSync("craft/rules.json", "utf8")),
  references = JSON.parse(readFileSync("craft/references.json", "utf8"));

// A ledger with one project at a stage and no initiatives, so every action that depends on
// "nothing is running" can appear.
const at = (stage, category = "game", extra = {}) => {
  const w = ledger();
  w.projects = [{ ...baseProject, stage, category, ...extra }];
  w.initiatives = [];
  return w;
};
const first = (w, kind) => advise(w, "game").find((a) => a.kind === kind);
const gate = (id, status, extra = {}) => ({
  id,
  projectId: "game",
  name: `${id} gate`,
  criteria: `pass condition of ${id}`,
  status,
  ...extra,
});
const reaction = (id, over = {}) => ({
  id,
  projectId: "game",
  text: "The first level was confusing",
  url: "https://example.com/r/" + id,
  collectedAt: "2026-10-08T12:00:00Z",
  sentiment: "negative",
  reviewed: true,
  theme: "onboarding",
  ...over,
});

// ---- advise: the project stage changes the advice ------------------------------------------

test("the same game at idea, prototype, beta and launched gets four different pieces of advice", () => {
  const outputs = STAGES.map((s) => JSON.stringify(advise(at(s), "game")));
  assert.equal(new Set(outputs).size, 4);
});

test("an idea is told to check the promise, not to measure activation or return it cannot have", () => {
  const actions = advise(at("idea"), "game");
  const [head] = actions;
  assert.equal(head.kind, "viability");
  assert.equal(head.priority, 1);
  assert.match(head.title, /before building more/i);
  assert.match(head.reason, /Missing primary support: problem, activation, retention, payment/);
  assert.match(head.reason, /cannot be observed/i);
  assert.doesNotMatch(head.next, /second-session|cohort/i);
  assert.match(head.next, /intended players/i);
  assert.ok(!actions.some((a) => a.kind === "stage"), "no stage action before something can be tried");
  const channel = actions.find((a) => a.kind === "channel");
  assert.match(channel.title, /listen/i);
  assert.match(channel.next, /do not post a link/i);
});

test("a prototype with no recorded starts is sent to get intended strangers to a first session", () => {
  const stage = first(at("prototype"), "stage");
  assert.equal(stage.priority, 1);
  assert.match(stage.title, /first session/i);
  assert.match(stage.reason, /no starts/i);
  assert.match(stage.next, /five intended strangers/);
  assert.match(stage.next, /free to start/);
  assert.match(stage.next, /itch\.io/);
  assert.match(stage.stop, /five observed first sessions or two weeks/);
  assert.deepEqual(stage.evidence, []);
});

test("once starts exist a prototype no longer gets the first-session action, and a weak funnel leads", () => {
  const w = at("prototype");
  w.observations = [observation("s", "starts", 8)];
  assert.ok(!first(w, "stage"));
  w.observations.push(observation("v", "visitors", 90));
  const [head] = advise(w, "game");
  assert.equal(head.kind, "activation");
  assert.ok(!advise(w, "game").some((a) => a.kind === "stage"));
});

test("a beta widens on the channel with the highest observed ratio and says it is not causal", () => {
  const w = at("beta");
  w.observations = [
    observation("yv", "visitors", 90),
    observation("ys", "starts", 8),
    observation("iv", "visitors", 100, { channel: "itch" }),
    observation("is", "starts", 40, { channel: "itch" }),
  ];
  const stage = first(w, "stage");
  assert.equal(stage.priority, 2);
  assert.match(stage.title, /widen/i);
  assert.match(stage.reason, /itch has the highest observed ratio \(40 starts \/ 100 visitors, 40%\)/);
  assert.match(stage.reason, /youtube \(9%\)/);
  assert.match(stage.reason, /different people|observational/i);
  assert.match(stage.next, /next test to itch/);
  assert.deepEqual(stage.evidence.toSorted(), ["is", "iv", "ys", "yv"]);
});

test("a beta with one measured channel adds a second, and with none starts the first", () => {
  const one = at("beta");
  one.observations = [observation("v", "visitors", 100), observation("s", "starts", 40)];
  const a = first(one, "stage");
  assert.match(a.reason, /youtube is the only channel with a recorded ratio/);
  assert.match(a.next, /add one more channel/i);
  const none = first(at("beta"), "stage");
  assert.match(none.reason, /no channel has a comparable visitors-and-starts pair/i);
  assert.match(none.next, /one tagged test/i);
});

test("a game at beta is steered to a free web release first and to its readiness gates before a store page", () => {
  const w = at("beta");
  w.gates = [gate("name", "open"), gate("assets", "failed"), gate("truth", "passed", { evidenceIds: [] })];
  const stage = first(w, "stage");
  assert.match(stage.next, /free/i);
  assert.match(stage.next, /itch\.io|web portal/i);
  assert.match(stage.reason, /name gate \(open\)/);
  assert.match(stage.reason, /assets gate \(failed\)/);
  assert.doesNotMatch(stage.reason, /truth gate/);
  assert.match(stage.next, /store page only after/i);
  assert.ok(stage.ruleIds.includes("free-web-before-store-page"));
  assert.ok(stage.ruleIds.includes("store-page-after-gates"));
});

test("a beta game with every gate passed, or with none recorded, is told the right next step", () => {
  const passed = at("beta");
  passed.gates = [gate("name", "passed", { evidenceIds: [] }), gate("assets", "waived", { notes: "owner accepts" })];
  assert.match(first(passed, "stage").reason, /every recorded readiness gate is passed or waived/i);
  const none = first(at("beta"), "stage");
  assert.match(none.reason, /no readiness gates are recorded/i);
  assert.match(none.next, /marketing put gates/);
});

test("a beta that is not a game hears nothing about store pages or free web releases", () => {
  const w = at("beta", "tool");
  w.gates = [gate("name", "open")];
  const stage = first(w, "stage");
  assert.doesNotMatch(`${stage.reason} ${stage.next}`, /store page|free web|itch|portal|gate/i);
  assert.ok(!stage.ruleIds.includes("free-web-before-store-page"));
});

test("a launched project reads the cohort return rate and the reviewed reactions", () => {
  const w = at("launched");
  w.observations = [
    observation("s", "starts", 40, { cohort: "week-1", definition: "first sessions in week 1" }),
    observation("r", "returns", 10, { cohort: "week-1", definition: "day 1 return" }),
  ];
  w.reactions = [reaction("x1"), reaction("x2", { sentiment: "positive" }), reaction("x3", { reviewed: false })];
  const stage = first(w, "stage");
  assert.equal(stage.priority, 1);
  assert.match(stage.title, /who returns/i);
  assert.match(stage.reason, /10 of 40 starts returned \(25%\)/);
  assert.match(stage.reason, /cohort week-1/);
  assert.match(stage.reason, /2 reviewed reactions and 1 not yet reviewed/);
  assert.deepEqual(stage.evidence.toSorted(), ["r", "s", "x1", "x2"]);
});

test("a launched project with no return data is told how to record a cohort", () => {
  const stage = first(at("launched"), "stage");
  assert.match(stage.reason, /no cohort return rate can be derived/i);
  assert.match(stage.next, /returnRates|returns divided by starts/);
});

test("the same stage reads differently for a game and for a tool", () => {
  for (const stage of ["prototype", "beta", "launched"]) {
    const game = first(at(stage, "game"), "stage"),
      tool = first(at(stage, "tool"), "stage");
    assert.notEqual(game.next, tool.next, stage);
  }
  const game = first(at("prototype", "game"), "viability"),
    tool = first(at("prototype", "tool"), "viability");
  assert.match(game.next, /second-session return/);
  assert.match(tool.next, /Interview intended users/);
});

test("the viability reason still lists the gaps in its fixed order, whatever the stage", () => {
  for (const s of STAGES)
    assert.match(first(at(s), "viability").reason, /Missing primary support: problem, activation, retention, payment\./, s);
});

// ---- advise: old callers ------------------------------------------------------------------

test("a project with no usable stage still gets the advice it always got", () => {
  for (const stage of [undefined, "", "soft-launch"]) {
    const w = at("prototype");
    w.projects[0].stage = stage;
    const actions = advise(w, "game");
    assert.deepEqual(actions.map((a) => a.kind), ["viability", "channel"]);
    const viability = actions[0];
    assert.equal(viability.title, "Collect missing viability evidence");
    assert.equal(viability.priority, 2);
    assert.equal(
      viability.next,
      "Measure second-session return in a defined player cohort and ask intended players what would make them come back.",
    );
    assert.doesNotMatch(viability.reason, /stage/i);
    assert.equal(actions[1].title, "Run one focused channel test");
  }
});

test("every action keeps its fields, stays sorted by priority and cites rules that exist", () => {
  const known = new Set(rules.map((r) => r.id));
  for (const stage of STAGES)
    for (const category of ["game", "tool", "creative"]) {
      const w = at(stage, category);
      w.gates = [gate("g", "open")];
      w.observations = [observation("v", "visitors", 90), observation("s", "starts", 8)];
      w.reactions = [reaction("x1")];
      const actions = advise(w, "game");
      assert.deepEqual(
        actions.map((a) => a.priority),
        actions.map((a) => a.priority).toSorted((a, b) => a - b),
      );
      for (const a of actions) {
        for (const key of ["kind", "title", "reason", "next", "stop"])
          assert.equal(typeof a[key], "string", `${stage}/${category} ${a.kind}.${key}`);
        assert.ok([1, 2, 3].includes(a.priority), `${stage}/${category} ${a.kind}`);
        assert.ok(Array.isArray(a.evidence) && Array.isArray(a.referenceIds), `${stage}/${category} ${a.kind}`);
        assert.ok(Array.isArray(a.ruleIds), `${stage}/${category} ${a.kind} ruleIds`);
        for (const id of a.ruleIds) assert.ok(known.has(id), `${a.kind} cites unknown rule ${id}`);
        for (const id of a.referenceIds)
          assert.ok(references.some((r) => r.id === id), `${a.kind} cites unknown reference ${id}`);
      }
    }
});

test("the stage action never outranks running work that waits on a gate", () => {
  const w = at("prototype");
  w.initiatives = [
    {
      id: "itch",
      projectId: "game",
      name: "itch page",
      channel: "itch",
      hypothesis: "h",
      cta: "Play",
      status: "running",
      start: "2026-10-12",
      end: "2026-10-18",
      budget: 0,
      owner: "me",
      dependsOn: ["playtest"],
    },
  ];
  w.gates = [gate("playtest", "open")];
  const [head] = advise(w, "game");
  assert.equal(head.kind, "readiness");
});

// ---- channels: stage and category change the order ----------------------------------------

const players = (stage, category = "game") => ({
  ...baseProject,
  audience: ["players"],
  weeklyHours: 4,
  category,
  stage,
});
const scores = (project) => Object.fromEntries(recommendChannels(project).map((c) => [c.id, c.planningScore]));
const card = (project, id) => recommendChannels(project).find((c) => c.id === id);

test("every channel card says at which stages its own approach can be carried out", () => {
  for (const c of channelLibrary) {
    assert.ok(Array.isArray(c.stages) && c.stages.length, `${c.id}.stages`);
    for (const s of c.stages) assert.ok(STAGES.includes(s), `${c.id}: ${s}`);
    assert.deepEqual(c.stages, STAGES.filter((s) => c.stages.includes(s)), `${c.id} lists stages in order`);
  }
  const stagesOf = (id) => channelLibrary.find((c) => c.id === id).stages;
  for (const id of ["steam", "apple-app-store", "google-play", "poki", "crazygames", "press"])
    assert.ok(!stagesOf(id).includes("idea") && !stagesOf(id).includes("prototype"), id);
  for (const id of ["reddit", "discord"]) assert.ok(stagesOf(id).includes("idea"), id);
  assert.ok(stagesOf("itch").includes("prototype") && !stagesOf("itch").includes("idea"));
});

test("exactly the three stores that charge before release are marked as paid entry", () => {
  const paid = channelLibrary.filter((c) => c.paidEntry).map((c) => c.id);
  assert.deepEqual(paid.toSorted(), ["apple-app-store", "google-play", "steam"]);
  for (const c of channelLibrary.filter((c) => c.paidEntry)) assert.match(c.cost, /\$\d/, c.id);
});

test("channel scores add +1 for a suitable stage and -2 for an unsuitable one", () => {
  // Steam for a game of players on 4 hours: category 3 + audience 2 + hours 1 = 6, and it is a paid store.
  assert.equal(scores(players("idea")).steam, 3); // 6 - 2 stage - 1 paid
  assert.equal(scores(players("prototype")).steam, 3);
  assert.equal(scores(players("beta")).steam, 6); // 6 + 1 stage - 1 paid
  assert.equal(scores(players("launched")).steam, 7); // 6 + 1 stage, no paid-first penalty once launched
  // itch.io is free to enter and suits every stage from prototype on.
  assert.equal(scores(players("idea")).itch, 4);
  assert.equal(scores(players("prototype")).itch, 7);
  assert.equal(scores(players("launched")).itch, 7);
  // Reddit is a conversation channel, so it is the one an idea can use.
  assert.equal(scores(players("idea")).reddit, 5);
});

test("a free web release outranks a paid store page until the game has launched", () => {
  for (const stage of ["idea", "prototype", "beta"]) {
    const s = scores(players(stage));
    assert.ok(s.itch > s.steam, `${stage}: itch ${s.itch} should outrank steam ${s.steam}`);
  }
  const order = (stage) => recommendChannels(players(stage)).map((c) => c.id);
  assert.notDeepEqual(order("idea"), order("beta"));
  assert.notDeepEqual(order("beta"), order("launched"));
  assert.equal(order("idea").slice(0, 2).includes("reddit"), true);
});

test("a store page for a game says to test free first and to wait for the gates, and a launched game does not", () => {
  const steam = card(players("beta"), "steam").rationale.join(" · ");
  assert.match(steam, /Suits the beta stage/);
  assert.match(steam, /free web release/i);
  assert.match(steam, /readiness gates/i);
  const idea = card(players("idea"), "steam").rationale.join(" · ");
  assert.match(idea, /more finished project than the idea stage/);
  assert.match(idea, /usually run from the beta stage on/);
  const launched = card(players("launched"), "steam").rationale.join(" · ");
  assert.doesNotMatch(launched, /free web release/i);
  const tool = card({ ...players("beta", "tool"), audience: ["learners"] }, "apple-app-store").rationale.join(" · ");
  assert.doesNotMatch(tool, /free web release/i);
});

test("an app is not penalised for the paid-store ordering that applies to games", () => {
  const app = { ...players("beta", "app"), audience: ["learners"] };
  // The paid-store-first penalty is for games only; an app keeps the original three terms plus its stage term.
  const legacy = (c) =>
    (c.categories.includes("app") ? 3 : 0) +
    (c.audiences.some((a) => "learners".includes(a)) ? 2 : 0) +
    (c.hours <= 4 ? 1 : -2);
  for (const id of ["apple-app-store", "google-play"]) {
    const c = channelLibrary.find((x) => x.id === id);
    assert.equal(scores(app)[id], legacy(c) + (c.stages.includes("beta") ? 1 : -2), id);
  }
});

test("channels still work for a hand-made project with no stage, with the original three reasons", () => {
  const old = { audience: ["developers"], category: "tool", weeklyHours: 3 };
  const ranked = recommendChannels(old);
  assert.equal(ranked.length, channelLibrary.length);
  const github = ranked.find((c) => c.id === "github");
  assert.equal(github.planningScore, 3 + 2 + 1);
  assert.equal(github.rationale.length, 3);
  assert.match(github.scoreMeaning, /House planning heuristic/);
  for (const c of ranked) {
    assert.equal(typeof c.planningScore, "number");
    assert.ok(Array.isArray(c.rationale) && c.rationale.length >= 3);
  }
  assert.deepEqual(
    recommendChannels({ ...old, stage: "soft-launch" }).map((c) => [c.id, c.planningScore]),
    ranked.map((c) => [c.id, c.planningScore]),
  );
});

// ---- the command line ---------------------------------------------------------------------

const run = (file, ...args) =>
  spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });

test("marketing channels and advise differ by stage from the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-stage-"));
  try {
    const outputs = {};
    for (const stage of ["idea", "launched"]) {
      const w = at(stage);
      w.projects[0].audience = ["players"];
      const file = join(dir, `${stage}.json`);
      writeFileSync(file, JSON.stringify(w));
      const channels = run(file, "channels", "game"),
        advice = run(file, "advise", "game");
      assert.equal(channels.status, 0, channels.stderr);
      assert.equal(advice.status, 0, advice.stderr);
      outputs[stage] = { channels: channels.stdout, advice: advice.stdout };
    }
    assert.notEqual(outputs.idea.channels, outputs.launched.channels);
    assert.notEqual(outputs.idea.advice, outputs.launched.advice);
    assert.ok(JSON.parse(outputs.launched.advice).some((a) => a.kind === "stage"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the rules behind the advice ----------------------------------------------------------

const stageRules = ["stage-sets-the-next-test", "measure-what-can-occur", "widen-by-observed-ratio"],
  gameStoreRules = ["free-web-before-store-page", "store-page-after-gates"];

test("the stage and store-order rules are queryable with their provenance", () => {
  for (const [topic, ids] of [["stage", stageRules], ["games", gameStoreRules]]) {
    const out = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "rules", topic], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    const got = JSON.parse(out.stdout);
    for (const id of ids) assert.ok(got.some((r) => r.id === id), `${topic} lacks ${id}`);
  }
  const known = new Set(references.map((r) => r.id));
  for (const id of [...stageRules, ...gameStoreRules]) {
    const r = rules.find((x) => x.id === id);
    assert.ok(r, id);
    assert.ok(["external", "heuristic", "derived"].includes(r.kind), id);
    assert.ok(r.referenceIds.length && r.referenceIds.every((x) => known.has(x)), `${id} references`);
    if (r.kind !== "external") assert.ok(r.reason && r.reason.length > 40, `${id} needs its working in reason`);
  }
  assert.equal(rules.find((r) => r.id === "free-web-before-store-page").kind, "derived");
  assert.match(rules.find((r) => r.id === "free-web-before-store-page").reason, /\$100/);
  assert.match(rules.find((r) => r.id === "free-web-before-store-page").reason, /\$1,000/);
});

test("the original sixteen rules are untouched and ids stay unique", () => {
  assert.ok(rules.length >= 21);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  for (const id of ["behavior-before-praise", "activation-investigation", "viability-dimensions", "incremental-localization-economics"])
    assert.ok(rules.some((r) => r.id === id), id);
  const out = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "rules"], { encoding: "utf8" });
  assert.equal(JSON.parse(out.stdout).length, rules.length);
});

// ---- the docs say what the code does -------------------------------------------------------

const flat = (path) => readFileSync(path, "utf8").replace(/\s+/g, " ");

test("craft/channels.md states every term of the planning score and the stage table", () => {
  const guide = flat("craft/channels.md");
  assert.match(guide, /\+1 when the card suits the project's stage or [−-]2 when it does not/);
  assert.match(guide, /[−-]1 on a store that charges before release/);
  assert.match(guide, /## By stage/);
  for (const stage of STAGES) assert.match(guide, new RegExp(`\| ${stage} \|`), stage);
  assert.match(guide, /marketing rules stage/);
});

test("docs/CLI.md documents the stage action, ruleIds, the card fields and the rule topics", () => {
  const cli = flat("docs/CLI.md");
  assert.match(cli, /## Stage-aware advice and channels/);
  assert.match(cli, /`advise` reads the project's `stage`/);
  assert.match(cli, /kind `stage`/);
  assert.match(cli, /`ruleIds`/);
  assert.match(cli, /`stages` and, for the three stores that charge before release, `paidEntry`/);
  assert.match(cli, /marketing rules stage/);
  assert.match(cli, /marketing rules games/);
  assert.match(cli, /no usable stage/i);
});
