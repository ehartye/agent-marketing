import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateWorkspace } from "../src/schema.mjs";
import { advise } from "../src/analysis.mjs";
import { auditNote } from "../ui/views/research.js";
import { sourceLink } from "../ui/shared.js";
import { ledger } from "./fixtures.mjs";

const evidence = (extra = {}) => ({
  id: "e1",
  projectId: "game",
  claim: "The game loads in under 5 MB before the title screen",
  dimension: "activation",
  result: "supports",
  strength: "primary",
  url: "https://example.com/game",
  checkedAt: "2026-10-11",
  ...extra,
});
const withEvidence = (...rows) => {
  const w = ledger();
  w.evidence = rows;
  return w;
};

test("product-fact is an accepted evidence status beside the existing five", () => {
  for (const status of ["observed", "modeled-estimate", "documented-rule", "anecdote", "hypothesis", "product-fact"])
    validateWorkspace(withEvidence(evidence({ status })));
  assert.throws(() => validateWorkspace(withEvidence(evidence({ status: "fact" }))), /evidence\.e1\.status/);
});

test("a product-fact may cite a live page, a build, or a repository path", () => {
  for (const url of [
    "https://ehartye.github.io/space2grow/",
    "https://ehartye.github.io/space2grow/offline-pack.json",
    "src/game/ui/settings-screen.ts",
    "public/concepts/habitat-interiors.prompt.json",
    "README.md#L10-L20",
    "ehartye/space2grow/src/panel-data.mjs",
  ])
    validateWorkspace(withEvidence(evidence({ status: "product-fact", url })));
});

test("a product-fact path must be portable: no scheme, no absolute or parent path, no spaces", () => {
  for (const url of [
    "C:/Users/ehart/repos/space2grow/README.md",
    "C:\\Users\\ehart\\README.md",
    "/etc/passwd",
    "../secret.txt",
    "src/../../secret.txt",
    "file:///tmp/x",
    "javascript:alert(1)",
    "ftp://example.com/x",
    "src/my file.ts",
    "",
  ])
    assert.throws(
      () => validateWorkspace(withEvidence(evidence({ status: "product-fact", url }))),
      /evidence\.e1\.url: expected http\(s\) URL or a repository-relative path/,
      JSON.stringify(url),
    );
});

test("every other status still needs an http(s) URL, so existing records behave the same", () => {
  for (const status of [undefined, "observed", "documented-rule", "anecdote"])
    assert.throws(
      () => validateWorkspace(withEvidence(evidence({ status, url: "src/game/ui/settings-screen.ts" }))),
      /evidence\.e1\.url: expected http\(s\) source URL/,
      String(status),
    );
});

test("the evidence card shows the product-fact status and keeps a repository path as plain text", () => {
  assert.match(auditNote({ status: "product-fact" }), /Status: product-fact \(about the project itself\)/);
  const web = sourceLink("https://example.com/a?b=1&c=2", "Evidence source");
  assert.match(web, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2"/);
  const path = sourceLink("src/<b>game</b>.ts", "Evidence source");
  assert.doesNotMatch(path, /<a |href=/);
  assert.match(path, /<code>src\/&lt;b&gt;game&lt;\/b&gt;\.ts<\/code>/);
});

test("a product-fact describes the project and never fills a viability gap in advise", () => {
  const viability = (w) => advise(w, "game").find((a) => a.kind === "viability");
  const fact = viability(withEvidence(evidence({ status: "product-fact" })));
  assert.match(fact.reason, /Missing primary support: problem, activation, retention, payment/);
  assert.deepEqual(fact.evidence, ["e1"]);
  const observed = viability(withEvidence(evidence({ status: "observed" })));
  assert.match(observed.reason, /Missing primary support: problem, retention, payment/);
});

test("the docs and research skill name the product-fact status", () => {
  const cli = readFileSync("docs/CLI.md", "utf8").replace(/\s+/g, " "),
    skill = readFileSync("skills/market-research/SKILL.md", "utf8");
  assert.match(cli, /status \(`observed\/modeled-estimate\/documented-rule\/anecdote\/hypothesis\/product-fact`\)/);
  assert.match(cli, /product-fact[^|]*repository-relative path/);
  assert.match(skill, /documented-rule, anecdote, product-fact or hypothesis/);
});

test("put stores a product-fact with a repository path and refuses the same path on an observed record", () => {
  const dir = mkdtempSync(join(tmpdir(), "marketing-fact-")),
    file = join(dir, "w.json"),
    record = join(dir, "fact.json"),
    run = (...args) =>
      spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
  try {
    writeFileSync(file, JSON.stringify(ledger()));
    const path = "public/concepts/habitat-interiors.prompt.json";
    writeFileSync(record, JSON.stringify(evidence({ status: "product-fact", url: path })));
    const saved = run("put", "evidence", record);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).evidence[0].url, path);
    writeFileSync(record, JSON.stringify(evidence({ id: "e2", status: "observed", url: path })));
    const refused = run("put", "evidence", record);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /evidence\.e2\.url: expected http\(s\) source URL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
