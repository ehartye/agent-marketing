import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url),
  refs = JSON.parse(readFileSync(new URL("craft/references.json", root)));
const body =
  "# References\n\nVerified research access: 2026-10-08. Quality indicates source credibility, not applicability to every project. Working papers and practitioner guidance are labeled. Recheck changing policies and metric definitions when planning a real initiative.\n\n" +
  refs
    .map(
      (r) =>
        `- **${r.id}** — [${r.title}](${r.url}) (${r.quality}; checked ${r.checkedAt}). Supports: ${r.supports}. Limit: ${r.limit}.`,
    )
    .join("\n") +
  "\n";
const target = new URL("craft/REFERENCES.md", root);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== body)
    throw new Error(
      "REFERENCES.md is stale; run node scripts/build-references.mjs",
    );
} else writeFileSync(target, body);
