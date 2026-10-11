import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const references = JSON.parse(readFileSync("craft/references.json", "utf8")),
  ref = (id) => references.find((r) => r.id === id);

// The primary pages the game launch guide and its rules rest on. Each was read on the date shown
// by the research crew and re-read by an independent verifier, and each keeps the caveat that
// the verifier found in its limit so the guide never promises more than the page says.
const gameReferences = {
  "steam-assets-standard": /920x430/,
  "steam-assets-library": /3840x1240/,
  "steam-assets-rules": /game artwork, the game name/,
  "steam-trailer": /5,000/,
  "steam-review-process": /Steam Wallet/,
  "steam-onboarding": /21-day/,
  "steam-gs-faq": /2-7 business days/,
  "steam-content-survey": /Pre-Generated/,
  "steam-subscriber-agreement": /under the age of 13/,
  "itch-html5": /1,000/,
  "itch-quality-guidelines": /AI Disclosure/,
  "itch-ai-disclosure-post": /Text & Dialog/,
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
