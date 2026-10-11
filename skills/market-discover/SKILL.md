---
name: market-discover
description: Build a marketing brief for a tool, app, game or family project when its audience, useful outcome, readiness or success measure needs to be established.
---

# Discover the project

Read [discovery craft](../../craft/discovery.md) and [ledger/CLI contract](../../docs/CLI.md). Use market-setup before CLI commands. Inspect the actual project, README and try path; distinguish implemented behavior from intended features.

Capture the intended person, recent task/desire, useful payoff, credible proof, current alternatives, first meaningful action, stage, device/access needs, maker time, budget and the decision marketing should inform. For games ask about play/genre/discovery rather than inventing a work problem. Use available context; ask only for constraints that materially change the plan.

Check existing wiki/project evidence where available. Browse current official product and channel sources for claims that need verification. Separate observed facts, owner assumptions and open questions. A kind reaction or large view count does not establish demand.

When the question is which product to build, who would pay, an underserved population or a non-English opportunity, use market-research's [demand methodology](../../craft/demand.md) and [report format](../../library/demand-report.md) before treating an audience hypothesis as a market finding.

Create one `projects` record with a stable ID and a measurable objective, plus source-linked `evidence` records for what is actually known. Use `marketing put` or a single validated import; do not fabricate observations. Keep raw personal interview data local and use appropriate source access.

When the project will go through a store page, a web portal or any public launch, name its readiness gates: what must be true before public work starts. Save each as a `gates` record with `marketing put gates <gate.json>`, status `open`, and `criteria` that can be checked with a number: a name decision (0 live same-name listings on Steam, itch.io and the trademark register), a truth sheet (README, About page and store copy state the same chapter count and download size as the pinned build), a pinned marketing build, an outside playtest (at least 5 of 8 outside players finish the first chapter in one session), store assets that meet the store's current rules, working measurement (counters for first play and return) and a privacy stance for the audience. Take thresholds from what you measured or read; where you do not know one, write that it is an owner decision instead of inventing a number. Never record a gate as `passed` without an evidence record in `evidenceIds` that shows it, and never as `waived` without a `notes` reason. market-strategy and market-campaign sequence work behind these gates.

Deliver a short brief with readiness, audience hypothesis, viability evidence gaps and one affordable next test. Finish when the ledger validates, every gate has a pass condition with a number or an owner decision, and another agent could choose a distribution test from the brief without guessing the intended user or outcome.
