import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metrics, validateWorkspace } from "../src/schema.mjs";
import { report } from "../src/analysis.mjs";
import { ledger, observation } from "./fixtures.mjs";

const cli = readFileSync("docs/CLI.md", "utf8");
const withObservations = (...rows) => {
  const w = ledger();
  w.observations = rows;
  return w;
};

test("plays and ratings are counts the ledger accepts; sessions and playtime reuse existing names", () => {
  for (const metric of ["plays", "ratings"]) {
    assert.ok(metrics.includes(metric), metric);
    validateWorkspace(withObservations(observation("o", metric, 12)));
    assert.throws(
      () => validateWorkspace(withObservations(observation("o", metric, 1.5))),
      /nonnegative integer/,
    );
  }
  // A started session is a play, and time spent is the existing decimal metric `hours`.
  assert.ok(!metrics.includes("sessions"));
  assert.ok(!metrics.includes("playtime"));
  validateWorkspace(withObservations(observation("o", "hours", 52.5)));
});

test("a rate is not a metric: returns stay integer counts", () => {
  assert.ok(!metrics.some((m) => /rate|day1|day7|retention/i.test(m)));
  assert.throws(
    () => validateWorkspace(withObservations(observation("o", "returns", 0.31))),
    /nonnegative integer/,
  );
});

test("docs/CLI.md lists exactly the metrics the ledger accepts", () => {
  const listed = /Metrics: `([^`]+)`/.exec(cli)?.[1].split(", ");
  assert.deepEqual(listed?.toSorted(), metrics.toSorted());
});

test("docs/CLI.md defines plays, ratings, player time and how a return rate is formed", () => {
  const text = cli.replace(/\s+/g, " ");
  assert.match(text, /`plays` counts launches or started play sessions/);
  assert.match(text, /`ratings` counts ratings or reviews posted/);
  assert.match(text, /`hours` is time your audience spent[^.]*never the maker's own effort/);
  assert.match(text, /returns divided by starts for the same project, channel, cohort and window/);
  assert.match(text, /sessions/);
  assert.match(text, /playtime/);
});

const cohortRows = (extra = {}) => [
  observation("start", "starts", 100, { definition: "first plays", cohort: "first session 2026-10-01", ...extra }),
  observation("day1", "returns", 31, { definition: "day 1 return", cohort: "first session 2026-10-01", ...extra }),
];

test("report derives a return rate as returns divided by starts for the same cohort and window", () => {
  const r = report(withObservations(...cohortRows()));
  assert.equal(r.returnRates.length, 1);
  const [x] = r.returnRates;
  assert.equal(x.rate, 0.31);
  assert.equal(x.returns, 31);
  assert.equal(x.starts, 100);
  assert.equal(x.returnsDefinition, "day 1 return");
  assert.equal(x.startsDefinition, "first plays");
  assert.equal(x.cohort, "first session 2026-10-01");
  assert.equal(x.interpretation, "Cohort return rate");
  assert.deepEqual(x.evidence.toSorted(), ["day1", "start"]);
});

test("day 1 and day 7 returns each get a rate against the same starts", () => {
  const rows = [
    ...cohortRows(),
    observation("day7", "returns", 12, { definition: "day 7 return", cohort: "first session 2026-10-01" }),
  ];
  const rates = report(withObservations(...rows)).returnRates;
  assert.deepEqual(
    rates.map((x) => [x.returnsDefinition, x.rate]),
    [["day 1 return", 0.31], ["day 7 return", 0.12]],
  );
});

test("without a cohort the rate is an observed ratio that may include earlier players", () => {
  const rows = cohortRows().map(({ cohort, ...o }) => o);
  const [x] = report(withObservations(...rows)).returnRates;
  assert.equal(x.rate, 0.31);
  assert.match(x.interpretation, /may include people who started outside this window/);
});

test("no rate when the cohort, the window or the channel differs", () => {
  const variants = [
    cohortRows().map((o) => (o.metric === "returns" ? { ...o, cohort: "first session 2026-10-02" } : o)),
    cohortRows().map((o) => (o.metric === "returns" ? { ...o, start: "2026-10-08", end: "2026-10-14" } : o)),
    cohortRows().map((o) => (o.metric === "returns" ? { ...o, channel: "itch" } : o)),
  ];
  for (const rows of variants) {
    const [x] = report(withObservations(...rows)).returnRates;
    assert.equal(x.rate, null);
    assert.equal(x.starts, null);
    assert.equal(x.interpretation, "No compatible denominator");
  }
});

test("no rate when returns exceed starts, starts are zero, or two starts definitions match", () => {
  const exceed = report(withObservations(...cohortRows().map((o) => (o.metric === "returns" ? { ...o, value: 140 } : o))));
  assert.equal(exceed.returnRates[0].rate, null);
  assert.match(exceed.returnRates[0].interpretation, /exceed starts/);
  const zero = report(withObservations(...cohortRows().map((o) => (o.metric === "starts" ? { ...o, value: 0 } : o))));
  assert.equal(zero.returnRates[0].rate, null);
  const two = report(
    withObservations(...cohortRows(), observation("alt", "starts", 90, { definition: "engaged first plays", cohort: "first session 2026-10-01" })),
  );
  assert.equal(two.returnRates[0].rate, null);
  assert.match(two.returnRates[0].interpretation, /more than one starts definition/i);
});

test("overlapping period readings are not turned into a rate, and ledgers without returns report none", () => {
  const rows = [
    ...cohortRows(),
    observation("again", "returns", 5, { definition: "day 1 return", cohort: "first session 2026-10-01", start: "2026-10-05", end: "2026-10-09" }),
  ];
  const [x] = report(withObservations(...rows)).returnRates;
  assert.equal(x.rate, null);
  assert.deepEqual(report(withObservations(observation("v", "views", 5))).returnRates, []);
});
