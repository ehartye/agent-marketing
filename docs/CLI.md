# CLI and ledger contract

Node 24+ is required. Resolve the plugin root from the installed skill and run `node "<plugin-root>/scripts/setup.mjs"`; other commands use `node "<plugin-root>/scripts/run-managed.mjs"` (shown below as `marketing`). Development can run `node scripts/marketing.mjs` directly. The managed launcher refuses missing, stale or modified runtime content. `AGENT_MARKETING_HOME` defaults to `~/.agent-marketing`.

Every command prints JSON except CSV export; errors print a JSON error to stderr with exit 2. Monitor partial/source failures exit 1 with a report, while retaining prior readings. All ledger commands accept `--workspace <file>`; default `.agent-marketing/workspace.json` is relative to the caller's current directory. Be explicit when switching projects.

```text
marketing init --workspace <file>
marketing demo --workspace <different-file>
marketing validate --workspace <file>
marketing import <patch.json-or-observations.csv> --workspace <file> [--revision n]
marketing put <collection> <record.json> --workspace <file> [--revision n]
marketing report --workspace <file> [--project id --initiative id --from YYYY-MM-DD --to YYYY-MM-DD]
marketing advise <project-id> --workspace <file>
marketing channels [project-id] --workspace <file>
marketing experiment <experiment-id> --workspace <file>
marketing utm <url> --source youtube --medium organic-video --campaign launch --content clip-a
marketing monitor --workspace <file> [--source id]
marketing serve --workspace <file> [--port 4318]
marketing export --workspace <file> [--format json|csv] [--out path]
marketing rules [topic]
marketing help
```

`init` creates an empty ledger. `demo` creates a complete synthetic studio. Neither overwrites an existing file. `put` upserts a full record; `import` merges an object of collection arrays such as `{"observations":[...]}`. A whole exported workspace is validated and its collection arrays are merged into an existing ledger; the destination revision remains local. Record IDs are stable within each collection. Reimporting the same ID replaces that record, including all its fields. Duplicate incoming IDs, dangling references and invalid values reject the whole transaction. Revisions prevent stale UI/CLI writes; reload and reconcile on conflict.

## Records

The example [studio.json](../examples/studio.json) is a fully validated ledger. Its metrics and competitor entries are illustrative, not real family results. Fields below are required unless marked optional. Counts must be safe nonnegative integers; currency values and hours may be nonnegative decimals. Dates use actual `YYYY-MM-DD`; collection timestamps use ISO UTC. URLs use HTTP(S).

| Collection | Required fields beyond `id` |
|---|---|
| projects | name, audience (nonempty text array), category (`tool/app/game/creative/education`), problem, promise, stage (`idea/prototype/beta/launched`), objective, weeklyHours, budget, currency |
| initiatives | projectId, name, channel, hypothesis, cta, status (`planned/running/paused/complete`), start, end, budget, owner |
| observations | projectId, channel, metric, value, start, end, kind (`period/snapshot`), definition, url, collectedAt; optional initiativeId, cohort; snapshot requires series; cost/revenue require currency |
| reactions | projectId, text, url, collectedAt, sentiment (`positive/negative/neutral/mixed/unknown`), reviewed (boolean), theme; optional initiativeId, channel |
| competitors | projectId, name, kind (`direct/substitute/do-nothing`), positioning, url, checkedAt, claims (array of `{dimension,value,url,checkedAt}`) |
| experiments | projectId, name, hypothesis, primaryMetric, stoppingRule, targetPerArm (positive integer), randomized (boolean), arms (exactly two `{name,trials,successes}` with successes ≤ trials); optional initiativeId |
| evidence | projectId, claim, dimension (`problem/activation/retention/payment/positioning/channel`), result (`supports/contradicts/unknown`), strength (`primary/secondary/anecdote/hypothesis`), url, checkedAt; optional initiativeId |
| sources | projectId, name, adapter (`github/hn`), channel, target (`owner/repository` for GitHub, integer item ID for HN); optional initiativeId, traffic (GitHub boolean), lastCheckedAt, lastError |

Channels: `youtube, reddit, hacker-news, github, search, email, itch, discord, linkedin, product-hunt, direct`. Metrics: `views, impressions, visitors, clicks, starts, signups, returns, purchases, revenue, cost, hours, stars, votes, comments, clones, uniqueVisitors`. Preserve vendor-specific meaning in `definition`. The common names `visitors` and `starts` are used for the observed funnel only when windows/attribution match. Use `cohort` only for actually verified cohort membership.

## Monitoring example

```json
{"id":"my-repo","projectId":"my-tool","name":"Repository reception","adapter":"github","channel":"github","target":"owner/repository","traffic":false}
```

Save this to a file and `marketing put sources <file> --workspace <ledger>`. Public stars need no credential. `traffic:true` reads daily views/clones with `GITHUB_TOKEN` from the environment; never put tokens in records, CLI arguments or committed files. Traffic access is repository-scoped and its rolling history is 14 days. Repeated daily imports replace by stable source/metric/date IDs. HN collects root score/comments and traverses at most 100 comment items; partial errors and sample truncation are visible. These signals measure repository/discussion attention, not app use.

For an owner-chosen scheduler, invoke the one-shot monitor command weekly for GitHub traffic. An API failure does not delete prior readings. The browser's Collect now uses the same collector and writes. There is no automatic scheduling or social posting.

## CSV and recovery

CSV imports observations only. Use the exact headers shown in [observations.csv](../examples/observations.csv); quoted commas/newlines and escaped quotes are supported. Include `series` for snapshots and `currency` for cost/revenue. Blank optional fields are omitted. Normalize native analytics exports to this contract; the CLI does not guess a vendor export format. Use direct JSON for other record types.

Writes use an exclusive `.lock`, a validated temporary file and atomic rename. If a process dies with a lock, inspect the recorded PID and confirm that process is stopped before removing that exact lock file; never steal a live writer's lock. Keep a normal filesystem backup for recovery. The ledger has no deletion command; use an intentional reviewed file edit for removals, then validate it. Imports cannot roll back someone else's later edits.

The desk binds to loopback, rejects foreign Host/Origin requests, limits imports to 2 MB and detects stale edits. Export downloads the complete ledger; date filters include only entire observation windows, never prorated counts. Free-text experiment stopping conditions still require human/agent review. JSON remains the complete round-trip export; CSV is an observation interchange format.
