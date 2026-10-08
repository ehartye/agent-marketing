# agent-marketing

An evidence-led marketing plugin for the tools, apps, games and projects your family makes with AI. It helps an agent choose an audience and channels, research alternatives, plan campaigns and collateral, collect results, inspect reception, and decide what to try next.

The local campaign desk connects each recommendation to a source. It shows activity, attributed first-use paths, reviewed reactions, viability evidence, alternatives and experiment uncertainty. CLI and UI share one portable JSON ledger. No account subscription or runtime npm dependency is required.

![The campaign desk with synthetic project evidence](docs/images/campaign-desk-desktop.png)

## Try the desk

Node 24+:

```powershell
node scripts/setup.mjs
node scripts/run-managed.mjs demo --workspace .agent-marketing/demo.json
node scripts/run-managed.mjs serve --workspace .agent-marketing/demo.json
```

Open `http://127.0.0.1:4318`. Demo metrics are synthetic. Use a different file for a real studio:

```powershell
node scripts/run-managed.mjs init --workspace .agent-marketing/workspace.json
node scripts/run-managed.mjs help
```

Setup installs a content-verified runtime under `~/.agent-marketing/releases/` and writes a receipt. The launcher checks it against the source; rerun setup after updates. `AGENT_MARKETING_HOME` can relocate the install. Existing init/demo files are preserved.

## Skills

| Skill | Outcome |
|---|---|
| market-setup | Install/check the managed runtime |
| market-discover | Audience, value, readiness and evidence brief |
| market-strategy | Channel choice with effort, risk and maintenance tradeoffs |
| market-research | Prior art, alternatives, sourced comparison and positioning |
| market-campaign | Testable campaign, CTA, tagged links and review plan |
| market-collateral | Actual reviewable copy, demo/asset brief or creator kit |
| market-monitor | Supported API collection, export imports and local desk |
| market-insights | Reach/reception/viability review and a bounded next action |
| market-experiment | Experiment design, counts, uncertainty and stop review |

The `.claude-plugin` manifest follows the sibling agent projects. Load this repository as a local plugin in a compatible host; the skills use relative resources and the absolute managed launcher. Skill folders are also portable Agent Skills entry points. The plugin has not been published to a marketplace. Optional agent-vids/prose/sprites/beeps integrations are advisory and do not affect core operation.

## What the tools do

`init`, `demo`, `validate`, `import`, `put`, `report`, `advise`, `channels`, `experiment`, `utm`, `monitor`, `serve`, `export`, `rules`, `help`. See the [complete CLI and record contract](docs/CLI.md), [example ledger](examples/studio.json) and [CSV example](examples/observations.csv).

Monitoring reads public GitHub stars, optional repository traffic with an appropriately scoped `GITHUB_TOKEN`, and public HN threads through official APIs. Other platform results use authorized JSON/CSV exports normalized to the documented observation schema. Collection errors preserve previous readings; repeated snapshots do not inflate totals. Monitoring is one-shot; an owner-chosen scheduler can call it periodically. No social posting, outreach, ad spending or scheduler is installed.

## Marketing craft

[Craft guides](craft/GUIDE.md), [queryable rules](craft/rules.json), [channel cards](library/channels.json) and [dated research references](craft/REFERENCES.md) cover discovery, positioning, competition, campaigns, collateral, measurement, reception and experiments. They separate research findings from planning heuristics and explain transfer limits.

Views, likes and comments describe attention or a captured feedback sample. They do not establish market viability, unique cross-platform reach or causal ad lift. The desk keeps those meanings separate. The English lexical sentiment helper is an unvalidated suggestion; review labels in source context. Experiment intervals display uncertainty; free-text duration/stopping rules require operator review.

## Development

```powershell
npm test
npm run check
node scripts/build-references.mjs --check
```

Node's native test runner exercises ledger integrity, compatible metrics, experiment bounds, CSV/JSON journeys, collector failures, shared UI routes and runtime receipts. The [verification report](docs/VERIFICATION.md) records all 27 passing tests, browser interactions, live API checks, independent review and the paired skill evaluation. No build step is required. MIT license.
