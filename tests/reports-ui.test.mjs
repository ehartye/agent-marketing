import { test } from "node:test";
import assert from "node:assert/strict";
import { auditNote } from "../ui/views/research.js";
import { visibleReports } from "../ui/views/reports.js";

test("evidence cards show audit fields only when the record has them", () => {
  assert.equal(auditNote({ claim: "x" }), "");
  const html = auditNote({
    status: "modeled-estimate",
    credibility: "medium",
    relevance: "high",
    publishedAt: "2026-01-27",
    dataPeriod: "2025 releases",
    denominator: "608 of 20,282",
    limit: "<b>labels</b> are one author's",
  });
  for (const part of ["Status: modeled-estimate", "Credibility: medium", "Relevance: high", "Published 2026-01-27", "Data: 2025 releases", "Denominator: 608 of 20,282"])
    assert.ok(html.includes(part), part);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;labels&lt;\/b&gt;/);
});

test("workspace-wide reports always show; project reports show for their project or when none is chosen", () => {
  const r = (id, updatedAt, projectId) => ({ id, updatedAt, ...(projectId ? { projectId } : {}) });
  const workspace = { reports: [r("a", "2026-01-01T00:00:00Z"), r("b", "2026-03-01T00:00:00Z", "p1"), r("c", "2026-02-01T00:00:00Z", "p2")] };
  assert.deepEqual(visibleReports(workspace, {}).map((x) => x.id), ["b", "c", "a"]);
  assert.deepEqual(visibleReports(workspace, { projectId: "p1" }).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(visibleReports(workspace, { projectId: "p3" }).map((x) => x.id), ["a"]);
});

test("every evidence dimension the ledger accepts has a place in the research view", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("ui/views/research.js", "utf8");
  for (const dimension of ["problem", "activation", "retention", "payment", "positioning", "channel"])
    assert.ok(source.includes(`"${dimension}"`), dimension);
});
