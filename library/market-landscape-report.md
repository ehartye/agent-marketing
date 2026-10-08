# Market landscape report format

Use this for a question about what is doing well or badly in a market and where the owner should place a bet: "which kinds of games sell", "which of our projects should go first", "is there demand worth building to". For an underserved-population or language question use the [demand report](demand-report.md) instead. Keep the decision and the comparison readable first, with the audit trail below. Save it where the owner can read it (see Evidence retention). A finding of insufficient evidence is a valid result.

## Evidence status

Say first how the sources were read: verbatim captures, fetch-tool summaries, or search snippets. State who sells the numbers (vendors that sell data, tools or consulting have an interest), which figures are modeled estimates and by what formula, and what was not reached. A reader should know how far to trust every number before reading one.

## Decision and scope

The recommended next action; whether demand is established or only a hypothesis; what would reverse it. Name the as-of date, platform and business model in scope, and the maker's constraints and assumptions. Say what the owner's production capacity changes: lower build cost favors many cheap tests, not a bigger single bet.

## What wins and what loses

Report base rates before stories, each with its denominator and unit.

| Question | Finding | Denominator and definition of "hit" | Credibility and why |
|---|---|---|---|
| How crowded is the market | Counts per period, by source | Releases counted, tracker, pull date | Observed or modeled |
| How many succeed | Share reaching the stated threshold | Hits over all releases in the same window | A proxy such as reviews is not revenue |
| Typical outcome | Median, not mean; share under small thresholds | Which games are in the sample | Modeled? Show the formula |
| Per-tag or per-genre odds | Hit rate per release, with the sample size | Hits over releases in that tag | Tiny cells are noise |

Then three short lists: **what winners share**, **what failures share**, and **what is rising** (with a note on supply, because a rising tag with surging supply is not an underserved one). Winners-per-tag counts are not odds per release; say which one a source gives. Failures are under-reported, and breakout lists are survivor lists; say so wherever a pattern rests on them.

## Where each candidate fits

One row per project or concept the owner could place. Build the list from the owner's wiki and repository list together, because neither is complete.

| Candidate (stage, activity) | Genre and tags | What the evidence says about it | Provisional route and why |
|---|---|---|---|

Mark the stage as observed from the repository or the owner's word, and say that finished-ness decides the order, not the table.

## Building to emerging demand

Optional, when the maker can build cheaply. List the demand signals with their trust level, which concept types the maker's pipeline fits, and a concept-test funnel: one-page concepts, a vertical slice and a short capture for each, a free hook test first, a paid page only for the best, a cap on live tests, and a stop rule per concept. Treat everything here as hypotheses.

## Delivery, economics and options

| Option | Time now and later | Risk: likelihood and consequence | Complexity | Best practice | Maintenance |
|---|---|---|---|---|---|

Show the arithmetic with its assumptions and a sensitivity range, and label it as arithmetic, not a forecast. Costs not covered by the sources (platform share, tax, refunds, packaging) are listed as unknown, not guessed.

## Evidence audit

| Claim | Source (URL, author, publication date, data period) | Method, sample, denominator | Credibility and relevance, separately | Status |
|---|---|---|---|---|

Status is one of observed, modeled-estimate, documented-rule, anecdote, hypothesis. Keep contradictions between sources visible, with the cause if known. Store the claims that drive the decision as `evidence` records using the audit fields in the [CLI contract](../docs/CLI.md).

## Search coverage and gaps

Search terms by lens, sources reached, sources that failed to load, and the questions no source answered. If only English search was used, say so.

## One falsifiable next test

Hypothesis, eligible audience, deliverable, source of traffic, primary outcome, cap on time and spend, owner, decision date, and continue, change and stop thresholds with the source of each threshold. No spend, outreach or publication follows automatically from a recommendation.

## Evidence retention

Save the report so the owner can read it in the campaign desk: `marketing document save report <id> <file.md> --title ... --kind market-landscape`, with `--studio` when it has no project home (a market-wide analysis usually does). It appears in the Research fit tab and is included in workspace backups. Keep the Markdown source in the owner's wiki: a synthesis page for reusable outside knowledge, and project notes or decisions for the owner's own choices. Do not put an owner's analysis in the plugin's own `docs/research`, which ships to every install.
