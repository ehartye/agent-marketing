import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collections, patchWarnings, workspaceWarnings, validateWorkspace } from "../src/schema.mjs";
import { createWorkspace, importRecords, readWorkspace } from "../src/store.mjs";
import { parseImport } from "../src/import.mjs";
import { startServer } from "../src/server.mjs";
import { importMessage } from "../ui/state.js";
import { ledger, observation } from "./fixtures.mjs";

const evidence = (extra = {}) => ({
  id: "e1",
  projectId: "game",
  claim: "A claim",
  dimension: "channel",
  result: "supports",
  strength: "secondary",
  url: "https://example.com/e",
  checkedAt: "2026-10-11",
  ...extra,
});
const withEvidence = (extra) => ({ ...ledger(), evidence: [evidence(extra)] });

test("a misspelled optional field is reported with a did-you-mean, and the ledger still validates", () => {
  const w = withEvidence({ credibilty: "banana" });
  assert.equal(validateWorkspace(w), w);
  assert.deepEqual(workspaceWarnings(w), ['evidence.e1: unknown field "credibilty"; did you mean "credibility"?']);
});

test("unsupported fields are reported without a guess", () => {
  const w = ledger();
  // hours and dependsOn were unsupported until gates and the plan check read them; targets still is.
  w.initiatives = [{ ...w.initiatives[0], platforms: ["web"], targets: { wishlists: 270 } }];
  const warnings = workspaceWarnings(w);
  assert.deepEqual(warnings, [
    'initiatives.video: unknown field "platforms"; nothing reads it',
    'initiatives.video: unknown field "targets"; nothing reads it',
  ]);
});

test("hours and dependsOn on an initiative are fields the plan check reads, so they raise no warning", () => {
  const w = ledger();
  w.gates = [{ id: "g1", projectId: "game", name: "Playtest", criteria: "5 of 8 finish", status: "open" }];
  w.initiatives = [{ ...w.initiatives[0], hours: 4, dependsOn: ["g1"] }];
  assert.deepEqual(workspaceWarnings(w), []);
});

test("every record type reports unknown fields", () => {
  const patch = Object.fromEntries(collections.map((k) => [k, [{ id: "r1", zzzExtra: 1 }]]));
  const warnings = patchWarnings(patch);
  for (const k of collections)
    assert.ok(warnings.includes(`${k}.r1: unknown field "zzzExtra"; nothing reads it`), k);
  assert.equal(warnings.length, collections.length);
});

test("near-misses across record types suggest the closest field", () => {
  const cases = [
    ["evidence", "relevence", "relevance"],
    ["evidence", "Credibility", "credibility"],
    ["initiatives", "chanel", "channel"],
    ["initiatives", "hypothesys", "hypothesis"],
    ["observations", "defintion", "definition"],
    ["observations", "colectedAt", "collectedAt"],
    ["observations", "ulr", "url"],
    ["experiments", "targetPerarm", "targetPerArm"],
    ["experiments", "randomised", "randomized"],
    ["sources", "targets", "target"],
    ["reactions", "sentimnet", "sentiment"],
    ["competitors", "positionning", "positioning"],
    ["projects", "weeklyHour", "weeklyHours"],
    ["reports", "vaulturl", "vaultUrl"],
  ];
  for (const [collection, field, expected] of cases)
    assert.deepEqual(
      patchWarnings({ [collection]: [{ id: "r1", [field]: 1 }] }),
      [`${collection}.r1: unknown field "${field}"; did you mean "${expected}"?`],
      `${collection}.${field}`,
    );
});

test("a field the record already has is never suggested", () => {
  const warnings = patchWarnings({ evidence: [{ id: "e1", credibility: "high", credibilty: "high" }] });
  assert.deepEqual(warnings, ['evidence.e1: unknown field "credibilty"; nothing reads it']);
});

test("nested claims and arms are checked too", () => {
  const patch = {
    competitors: [{ id: "c1", claims: [{ dimension: "d", value: "v", url: "https://e.x", checkedAt: "2026-10-11", note: "x" }] }],
    experiments: [{ id: "x1", arms: [{ name: "a", trials: 1, sucesses: 0 }] }],
  };
  assert.deepEqual(patchWarnings(patch), [
    'competitors.c1.claims: unknown field "note"; nothing reads it',
    'experiments.x1.arms: unknown field "sucesses"; did you mean "successes"?',
  ]);
});

test("the same unknown field on many records is one warning that names the first few", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `o${i}`, DateLocal: "2026-10-01" }));
  const warnings = patchWarnings({ observations: rows });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^observations\.o0, o1, o2 and 97 more: unknown field "DateLocal"; nothing reads it$/);
});

test("clean ledgers, the demo ledger and every example import produce no warnings", () => {
  assert.deepEqual(workspaceWarnings(ledger()), []);
  const demo = JSON.parse(readFileSync("examples/studio.json", "utf8"));
  assert.deepEqual(workspaceWarnings(demo), []);
  for (const name of readdirSync("examples").filter((f) => f.endsWith(".csv")))
    assert.deepEqual(
      patchWarnings(parseImport(readFileSync(`examples/${name}`, "utf8"), "csv")),
      [],
      name,
    );
});

test("importRecords returns the workspace with its warnings, and --strict refuses before writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-warn-")), file = join(dir, "w.json");
  try {
    createWorkspace(file, ledger());
    const clean = importRecords(file, { observations: [observation("a", "views", 1)] }, 0);
    assert.deepEqual(clean.warnings, []);
    assert.equal(clean.revision, 1);
    const typo = importRecords(file, { evidence: [evidence({ credibilty: "high" })] }, 1);
    assert.equal(typo.revision, 2);
    assert.equal(typo.evidence[0].credibilty, "high");
    assert.match(typo.warnings[0], /did you mean "credibility"/);
    assert.throws(
      () => importRecords(file, { evidence: [evidence({ id: "e2", credibilty: "high" })] }, 2, { strict: true }),
      /Strict mode.*evidence\.e2: unknown field "credibilty"; did you mean "credibility"\?/,
    );
    assert.equal(readWorkspace(file).revision, 2);
    assert.equal(readWorkspace(file).evidence.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the printout of put or import can be imported again like an export", () => {
  const w = ledger();
  const printed = JSON.stringify({ ...w, warnings: ["evidence.e1: unknown field \"x\"; nothing reads it"] });
  assert.deepEqual(parseImport(printed).projects, w.projects);
});

const cli = (file, ...args) =>
  spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });

test("validate, put and import report warnings; --strict turns them into errors without writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-warn-")), file = join(dir, "w.json"), record = join(dir, "e.json");
  try {
    writeFileSync(file, JSON.stringify(ledger()));
    writeFileSync(record, JSON.stringify(evidence({ credibilty: "banana" })));
    const strict = cli(file, "put", "evidence", record, "--strict");
    assert.equal(strict.status, 2);
    assert.match(strict.stderr, /Strict mode/);
    assert.match(strict.stderr, /did you mean \\"credibility\\"/);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).evidence.length, 0);
    const put = cli(file, "put", "evidence", record);
    assert.equal(put.status, 0, put.stderr);
    assert.deepEqual(JSON.parse(put.stdout).warnings, ['evidence.e1: unknown field "credibilty"; did you mean "credibility"?']);
    const validate = cli(file, "validate");
    assert.equal(validate.status, 0, validate.stderr);
    const out = JSON.parse(validate.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.records.evidence, 1);
    assert.deepEqual(out.warnings, ['evidence.e1: unknown field "credibilty"; did you mean "credibility"?']);
    const refused = cli(file, "validate", "--strict");
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /Strict mode/);
    const csv = join(dir, "vendor.csv");
    writeFileSync(
      csv,
      "id,projectId,channel,metric,value,start,end,kind,definition,url,collectedAt,DateLocal\n" +
        "a,game,steam,wishlists,3,2026-10-01,2026-10-01,period,Adds,https://example.com/a,2026-10-02T00:00:00Z,2026-10-01\n" +
        "b,game,steam,wishlists,4,2026-10-02,2026-10-02,period,Adds,https://example.com/a,2026-10-03T00:00:00Z,2026-10-02\n",
    );
    const imported = cli(file, "import", csv);
    assert.equal(imported.status, 0, imported.stderr);
    assert.deepEqual(JSON.parse(imported.stdout).warnings, ['observations.a, b: unknown field "DateLocal"; nothing reads it']);
    const tidy = join(dir, "tidy.csv");
    writeFileSync(
      tidy,
      "id,projectId,channel,metric,value,start,end,kind,definition,url,collectedAt\n" +
        "c,game,steam,wishlists,5,2026-10-03,2026-10-03,period,Adds,https://example.com/a,2026-10-04T00:00:00Z\n",
    );
    const clean = cli(file, "import", tidy);
    assert.equal(clean.status, 0, clean.stderr);
    assert.deepEqual(JSON.parse(clean.stdout).warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("help shows the --strict flag on validate, import and put", () => {
  const help = JSON.parse(spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), "help"], { encoding: "utf8" }).stdout);
  for (const command of ["validate", "import", "put"])
    assert.ok(help.commands.some((c) => c.startsWith(command) && c.includes("[--strict]")), command);
});

test("the desk returns warnings from record and import writes, and refuses a strict import", async () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-warn-")), file = join(dir, "w.json");
  createWorkspace(file, ledger());
  const running = await startServer(file, { port: 0 });
  const post = (path, body) =>
    fetch(running.url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    let revision = readWorkspace(file).revision;
    const record = await post("/api/record", { collection: "evidence", record: evidence({ credibilty: "x" }), revision });
    assert.equal(record.status, 200);
    const saved = await record.json();
    assert.match(saved.warnings[0], /did you mean "credibility"/);
    revision = saved.revision;
    const text = JSON.stringify({ evidence: [evidence({ id: "e2", relevence: "high" })] });
    const strict = await post("/api/import", { text, format: "json", revision, strict: true });
    assert.equal(strict.status, 400);
    assert.match((await strict.json()).error, /Strict mode/);
    assert.equal(readWorkspace(file).revision, revision);
    const imported = await post("/api/import", { text, format: "json", revision });
    assert.equal(imported.status, 200);
    assert.match((await imported.json()).warnings[0], /did you mean "relevance"/);
  } finally {
    running.server.close();
    running.server.closeAllConnections?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the desk's import message shows the first warnings and counts the rest", () => {
  assert.equal(importMessage({ warnings: [] }), "Results imported. Records with matching IDs were updated.");
  assert.equal(importMessage({}), "Results imported. Records with matching IDs were updated.");
  const one = importMessage({ warnings: ['evidence.e1: unknown field "credibilty"; did you mean "credibility"?'] });
  assert.match(one, /^Results imported\. Records with matching IDs were updated\. 1 warning: evidence\.e1/);
  const many = importMessage({ warnings: ["a", "b", "c", "d", "e"] });
  assert.match(many, /5 warnings: a \| b \| c; and 2 more\.?$/);
});

test("docs/CLI.md documents the warnings, the did-you-mean and --strict", () => {
  const cli = readFileSync("docs/CLI.md", "utf8").replace(/\s+/g, " ");
  assert.match(cli, /marketing validate --workspace <file> \[--strict\]/);
  assert.match(cli, /marketing import <patch\.json-or-observations\.csv> --workspace <file> \[--revision n\] \[--strict\]/);
  assert.match(cli, /marketing put <collection> <record\.json> --workspace <file> \[--revision n\] \[--strict\]/);
  assert.match(cli, /## Unknown fields/);
  assert.match(cli, /did you mean "credibility"\?/);
  assert.match(cli, /`--strict`[^.]*turns the warnings into an error before anything is written/);
  assert.match(cli, /`recordFields` in `src\/schema\.mjs`/);
});

test("a very long unknown field name is reported at a bounded length and does not stall the did-you-mean", () => {
  const key = "x".repeat(1000000);
  const started = Date.now();
  const warnings = patchWarnings({ evidence: [{ id: "e1", [key]: 1 }] });
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].length < 300, `warning is ${warnings[0].length} characters`);
  assert.match(warnings[0], /^evidence\.e1: unknown field "x{20,}[^"]*"; nothing reads it$/);
  assert.match(warnings[0], /…/);
  // A name that fits is quoted whole, and a near miss still gets its suggestion.
  assert.deepEqual(patchWarnings({ evidence: [{ id: "e1", credibilty: 1 }] }), ['evidence.e1: unknown field "credibilty"; did you mean "credibility"?']);
});
