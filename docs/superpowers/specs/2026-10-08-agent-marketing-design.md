# Agent Marketing design

Build a portable agent plugin for the family's tools, apps, games and other AI-assisted projects. Success means an agent can produce a researched strategy, plan and review a campaign, collect and import results, examine reception and competitors, decide the next experiment, and hand the owner an interactive view of the evidence. Local code and documentation are authorized; outreach, ad purchases and public posting require the owner's instruction for that action.

## Product choice

Use an evidence ledger plus a local command center. A skills-only plugin would ship quickly but leave monitoring, provenance and comparisons scattered. A hosted social automation suite would introduce accounts, secrets, hosting cost and permission maintenance. The local ledger takes more implementation time now than skills alone, but keeps data portable, requires no subscription, and makes the same analysis available to CLI and UI. Its limitation is that API/export access varies by platform; do not pretend inaccessible metrics are zero.

## Durable contract

`marketing/workspace@1` is a JSON file containing projects, initiatives, observations, reactions, competitors, experiments, research evidence, and monitoring sources. Every record has a stable ID. Observation records identify a metric, value, time window, channel, initiative, source URL and definition. Snapshots replace by stable ID; repeated collection must not inflate totals. Import is atomic and validated, including cross-record references. Revisions detect conflicting UI edits. Atomic replacement and an exclusive process lock preserve a previous workspace on failed writes.

Projects name audience, problem, promise, stage, category, budget, weekly time and measurable objective. Initiatives name hypothesis, channel, CTA, dates, budget, owner and status. Experiments name primary conversion, prespecified sample target, two arms with trials/successes, and a stopping rule. Reactions retain source text, URL, capture date, human sentiment review and theme; machine lexical suggestions stay visibly unreviewed. Competitor records cover direct alternatives, substitutes and doing nothing, with dated evidence rather than invented feature scores.

## Analysis

Keep views, impressions, visitors and engagements separate. Do not estimate unique people across platforms. Conversion rates require compatible denominator and time window; summed channel totals never imply causal attribution. Wilson intervals and conservative difference intervals show uncertainty for two-arm experiments. Repeated peeking and nonrandom assignment cannot establish a winning intervention. Viability is an evidence checklist covering problem, activation, retention and willingness to pay, not a popularity score. Next actions connect an observed bottleneck or evidence gap to a bounded experiment and a stop condition.

Channel selection uses declared audience, format, project category, time and budget. Rankings are explicit planning heuristics with reasons, tradeoffs and research references; current platform policies are checked when the plan is used. The craft library separates external evidence, inference and house heuristics.

## Interfaces

Node 24 ES modules, native filesystem/fetch/HTTP/test; no build step or runtime npm dependencies. CLI offers init/demo/validate/import/put/report/advise/channels/experiment/utm/monitor/serve/export/rules. Monitoring adapters read public HN items and GitHub repository/traffic APIs; manual JSON/CSV imports cover analytics and platform exports. Partial collection errors are retained per source and do not erase previous successful readings. No background scheduler is installed implicitly.

The browser command center filters project, initiative and time, charts activity by metric definition, shows a channel funnel and source-linked reception, compares alternatives, reviews experiments, and edits initiative status and reaction labels through the same validated operations. CSV/JSON upload and report download support normal owner workflows. It binds to loopback with strict Host/Origin checks and bounded request bodies.

Visual direction: blue drafting board and citrus annotations for a family studio's campaign desk. Palette: ink #172c46, paper #edf3f7, blue #2459a8, citrus #f3ca52, teal #147d78, alert #ac4355. Display uses Trebuchet MS, body uses Verdana, utility uses Consolas. The signature is a decision strip connecting evidence → bottleneck → next test, with source links alongside each claim. Favor a spacious working surface over a dense wall of totals. Keyboard operation, readable chart tables, mobile layout and empty/error states are required.

## Plugin packaging

Match sibling `.claude-plugin/plugin.json`, standalone `skills/`, `craft/` and a managed runtime outside the plugin cache. Setup fingerprints shipped runtime content and writes a verified receipt under `~/.agent-marketing/releases/`; launcher refuses stale or missing runtime. No machine-specific source paths in distributed skills. Optional siblings agent-vids/prose/beeps produce collateral; they are suggestions, not required dependencies.

## Completion evidence

Verify ledger validation, atomic imports, revision conflicts, duplicate collection, unavailable sources, compatible metrics, small-sample experiment intervals, JSON/CSV CLI journeys, actual network adapters, UI filtering/editing/import/export at desktop and mobile, runtime version/hash parity, skill behavior compared with baseline, reference integrity, and wiki discovery/ingestion/architecture/roadmap. Keep the full goal active until these outcomes are proven.
