# CLI and ledger contract

Node 24+ is required. Resolve the plugin root from the installed skill and run `node "<plugin-root>/scripts/setup.mjs"`; other commands use `node "<plugin-root>/scripts/run-managed.mjs"` (shown below as `marketing`). Development can run `node scripts/marketing.mjs` directly. The managed launcher refuses missing, stale or modified runtime content. `AGENT_MARKETING_HOME` defaults to `~/.agent-marketing`.

Every command prints JSON except CSV and Markdown export; errors print a JSON error to stderr with exit 2. Monitor partial/source failures exit 1 with a report, while retaining prior readings. All ledger commands accept `--workspace <file>`; default `.agent-marketing/workspace.json` is relative to the caller's current directory. Be explicit when switching projects.

```text
marketing init --workspace <file>
marketing demo --workspace <different-file>
marketing validate --workspace <file> [--strict]
marketing import <patch.json-or-observations.csv> --workspace <file> [--revision n] [--strict]
marketing put <collection> <record.json> --workspace <file> [--revision n] [--strict]
marketing document save <strategy|campaign> <record-id> <brief.md> --workspace <file> --revision n
marketing document show <strategy|campaign> <record-id> --workspace <file>
marketing document export <strategy|campaign> <record-id> --workspace <file> [--out brief.md]
marketing document save report <report-id> <report.md> --title <title> --workspace <file> --revision n [--project id --kind k --vault-url u]
marketing document show report <report-id> --workspace <file>
marketing document export report <report-id> --workspace <file> [--out report.md]
marketing report --workspace <file> [--project id --initiative id --from YYYY-MM-DD --to YYYY-MM-DD]
marketing advise <project-id> --workspace <file>
marketing plan <project-id> --workspace <file>
marketing channels [project-id] --workspace <file>
marketing experiment <experiment-id> --workspace <file>
marketing utm <url> --source youtube --medium organic-video --campaign launch --content clip-a
marketing monitor --workspace <file> [--source id]
marketing serve --workspace <file> [--port 4318] [--idle-minutes 30]
marketing export --workspace <file> [--format json|csv] [--out path]
marketing rules [topic]
marketing help
```

`init` creates an empty ledger. `demo` creates a complete synthetic studio. Neither overwrites an existing file. `put` upserts a full record; `import` merges an object of collection arrays such as `{"observations":[...]}`. A whole exported workspace is validated and its collection arrays are merged into an existing ledger; the destination revision remains local. Record IDs are stable within each collection. Reimporting the same ID replaces that record, including all its fields. Duplicate incoming IDs, dangling references and invalid values reject the whole transaction; unknown fields only produce [warnings](#unknown-fields). Revisions prevent stale UI/CLI writes; reload and reconcile on conflict.

## Saved strategy and campaign briefs

Save the full Markdown strategy on the project and a runnable brief on each initiative. `strategy` takes a project ID; `campaign` takes an initiative ID. Related initiatives share their project's strategy, with channel-specific execution and review criteria in each brief. Read an existing document before revising it; if none is saved, `document show` reports that explicitly. Do not fabricate a historical strategy from the summary fields.

```text
marketing validate --workspace <ledger>
marketing document save strategy <project-id> <strategy.md> --workspace <ledger> --revision <current-revision>
marketing document show strategy <project-id> --workspace <ledger>
marketing document save campaign <initiative-id> <campaign.md> --workspace <ledger> --revision <current-revision>
marketing document show campaign <initiative-id> --workspace <ledger>
marketing document export campaign <initiative-id> --workspace <ledger> --out campaign.md
```

Use the revision returned by the latest successful write or validation; every save increments it. A stale revision fails without changing the ledger. On conflict, reread both the record and saved document, reconcile, then save against the current revision. The result names the absolute workspace, record location, revision and saved document. Read it back and verify the content before claiming completion.

The authoritative document is stored as optional `projects[].strategy` or `initiatives[].brief`, each `{ "markdown": "# Full brief…", "updatedAt": "2026-10-08T12:00:00.000Z" }`. Markdown is nonempty and limited to 100,000 characters. Existing workspaces require no migration. Imports of older project/initiative records that omit these fields preserve saved documents; explicitly supplied documents replace them and must validate. `null` is not a deletion request. Other record fields retain full-record upsert semantics. Use the updated runtime for writes: older binaries do not implement document validation or preservation. Markdown and workspace exports reject the active workspace, including filesystem aliases, as their output file.

In the desk, choose the project under **Decide & plan** to read/download its strategy, then the initiative for its campaign brief. The workspace JSON export includes document text and can be imported into a fresh workspace; CSV only carries observations. Downloaded `.md` files are editable copies: saving them back is explicit, with no automatic file synchronization. External images and linked assets are not bundled. The ledger stores the latest document, not document history; keep workspace backups for earlier versions. The HTTP importer remains limited to 2 MB, so larger complete backups can be restored with the CLI.

## Desk lifetime

`serve` is a one-shot local process, not a service. It stops itself after `--idle-minutes` (default 30) with no requests; `--idle-minutes 0` keeps it running. A desk page that is open and visible sends a quiet heartbeat (`/api/ping`, no data) once a minute, so a desk you are reading stays up and a forgotten one does not linger. If the desk stops while a page is still open, the page says so; run `serve` again and refresh. The process exits normally and prints why on stderr.

The desk header offers a workspace selector when more than one workspace is available: the studio file, every `*.json` file under `~/.agent-marketing/workspaces/` (or `$AGENT_MARKETING_HOME/workspaces/`), and the file the desk was launched on. It lists them through `GET /api/workspaces`; files that cannot be read are shown as unavailable. `POST /api/workspace/select` takes only an id from that list, never a path. Writes from the page carry the id of the workspace they were showing, and the desk refuses with a conflict if it has switched since, so a tab left on one workspace cannot save into another. A workspace kept elsewhere is reachable only by launching the desk on that file.

The gear in the desk header opens Settings. Its Theme setting is Match system (the default), Dark or Light; the choice is kept in that browser only (`localStorage`), so it never reaches the workspace file, and the desk still works if storage is blocked.

## The studio workspace

Records that belong to no project, such as a market analysis, have an official home: the studio workspace at `<plugin home>/studio/workspace.json` (by default `~/.agent-marketing/studio/workspace.json`; `AGENT_MARKETING_HOME` relocates it). Pass `--studio` instead of `--workspace` to any command. `marketing init --studio` creates it once and is safe to repeat; it reports the existing file and revision. Setup and updates manage only `releases/` and the receipt next to it and never read or write the studio, so a plugin update cannot touch your data. Back it up like any ledger with `export`. `--studio` and `--workspace` cannot be combined. Project work still belongs in its own workspace file.

```powershell
marketing init --studio
marketing document save report game-market-2026 report.md --title "Game market landscape" --kind market-landscape --studio --revision 0
marketing serve --studio
```

## Saved research reports

A research report is workspace-level Markdown that you read in the desk: it appears under **Research fit → Research reports**, with tables, links and a download. It needs no project, so a market analysis that spans projects is a valid report; `--project` scopes one to a project. The record is `reports[]`: `{ id, title, markdown, updatedAt, kind?, projectId?, vaultUrl? }`. `kind` is `market-landscape`, `demand`, `competition`, `positioning` or `other`. `vaultUrl` is an optional `obsidian://`, `http` or `https` link to the source note in the owner's wiki; the desk shows it as **Open in vault**. Saving with an existing ID replaces that report and requires the current revision, like a brief. Markdown is limited to 100,000 characters and is rendered with every character escaped; only `http(s)` links become anchors; a leading YAML frontmatter block is not shown. Workspaces saved before reports existed gain an empty collection and need no migration. Reports are included in JSON backups.

```powershell
marketing document save report game-market-2026 report.md --title "Game market landscape" --kind market-landscape --workspace <ledger> --revision <current-revision>
```

## Record fields

The example [studio.json](../examples/studio.json) is a fully validated ledger. Its metrics and competitor entries are illustrative, not real family results. Fields below are required unless marked optional. Counts must be safe nonnegative integers; currency values and hours may be nonnegative decimals. Dates use actual `YYYY-MM-DD`; collection timestamps use ISO UTC. URLs use HTTP(S).

| Collection | Required fields beyond `id` |
|---|---|
| projects | name, audience (nonempty text array), category (`tool/app/game/creative/education`), problem, promise, stage (`idea/prototype/beta/launched`), objective, weeklyHours, budget, currency; optional strategy document |
| initiatives | projectId, name, channel, hypothesis, cta, status (`planned/running/paused/complete`), start, end, budget, owner; optional brief document, hours (nonnegative number: total planned maker-hours), dependsOn (array of gate or initiative IDs in the same project; see [Gates, dependencies and weekly hours](#gates-dependencies-and-weekly-hours)) |
| gates | projectId, name, criteria (the pass condition, with a number where one exists), status (`open/passed/failed/waived`); optional checkedAt (`YYYY-MM-DD`), evidenceIds (evidence IDs of the same project), notes |
| observations | projectId, channel, metric, value, start, end, kind (`period/snapshot`), definition, url, collectedAt; optional initiativeId, cohort; snapshot requires series; cost/revenue require currency |
| reactions | projectId, text, url, collectedAt, sentiment (`positive/negative/neutral/mixed/unknown`), reviewed (boolean), theme; optional initiativeId, channel |
| competitors | projectId, name, kind (`direct/substitute/do-nothing`), positioning, url, checkedAt, claims (array of `{dimension,value,url,checkedAt}`) |
| experiments | projectId, name, hypothesis, primaryMetric, stoppingRule, targetPerArm (positive integer), randomized (boolean), arms (exactly two `{name,trials,successes}` with successes ≤ trials); optional initiativeId |
| evidence | projectId, claim, dimension (`problem/activation/retention/payment/positioning/channel`), result (`supports/contradicts/unknown`), strength (`primary/secondary/anecdote/hypothesis`), url, checkedAt; optional initiativeId, publishedAt (`YYYY-MM-DD`), dataPeriod, denominator, limit (text), credibility and relevance (`high/medium/low`, judged separately), status (`observed/modeled-estimate/documented-rule/anecdote/hypothesis/product-fact`). The audit fields keep a researched claim's trail with it and appear on the evidence card in the desk. `product-fact` is a verified fact about the project itself, such as its download size or what its live page says: its `url` may be a build or live-page URL or a repository-relative path like `src/game/ui/settings-screen.ts` or `README.md#L10-L20` (no scheme, drive letter, leading slash, `..` or space, so a local file location is refused), the desk shows a path as text rather than a link, and because it describes the project and not its audience it never fills a viability gap in `advise`. Every other status still needs an http(s) `url` |
| sources | projectId, name, adapter (`github/hn`), channel, target (`owner/repository` for GitHub, integer item ID for HN); optional initiativeId, traffic (GitHub boolean), lastCheckedAt, lastError |

Channels: `youtube, tiktok, facebook, steam, google-play, apple-app-store, bluesky, twitch, instagram, x, reddit, hacker-news, github, search, email, itch, discord, linkedin, product-hunt, poki, crazygames, newgrounds, gamejolt, press, mastodon, direct`. `poki`, `crazygames`, `newgrounds` and `gamejolt` are web game portals, `press` covers press, creators, curators and showcases, and `mastodon` is the fediverse; each has a channel card and an example import. Metrics: `views, impressions, visitors, clicks, starts, signups, returns, purchases, revenue, cost, hours, stars, votes, comments, clones, uniqueVisitors, wishlists, installs, unsubscribes, follows, plays, ratings`. `installs` counts first-time installs or downloads of an app from a store, `unsubscribes` counts people who opted out of a list, `follows` counts new followers, `plays` counts launches or started play sessions as the platform counts them, and `ratings` counts ratings or reviews posted by players; each platform's own definition still goes in `definition`. Preserve vendor-specific meaning in `definition`. The common names `visitors` and `starts` are used for the observed funnel only when windows/attribution match. Use `cohort` only for actually verified cohort membership.

## Game metrics, time and rates

A game needs a few more names than a web page, and the ledger keeps them to counts so that every reading can be added up or refused honestly.

- **Plays and sessions.** A player who launches the game three times is three `plays` unless the platform says otherwise, so copy its wording into `definition` (a Poki play, a CrazyGames play, an itch.io browser play). There is no separate sessions metric: a session count from your own analytics is also `plays`, with "sessions" in the definition, and a different definition keeps it apart from a platform's plays so the two are never summed. `starts` stays the first-use count behind the funnel; a person who launches again adds a play, not a start.
- **Playtime.** There is no separate playtime or watch-time metric. `hours` is time your audience spent watching or playing, in hours with decimals allowed, never the maker's own effort (that is the project's `weeklyHours`). Platforms usually report an average playtime, which cannot be added up: put the average in `definition`, or record the total as `hours` only when you can compute it for the same window (average minutes × plays ÷ 60) and say that it is derived.
- **Ratings.** `ratings` is the number of ratings or reviews players posted in the window (stars, likes and dislikes, written reviews), never their average or a platform score. Keep the average in `definition`, and keep votes on a post under `votes`.
- **Rates are not metrics.** The ledger stores no percentages, so `returns` of 0.31 is refused. A day-1 or day-7 return rate is returns divided by starts for the same project, channel, cohort and window. Record `starts` (the size of the cohort) and `returns` (those of that cohort who came back on day 1 or day 7, with "day 1 return" or "day 7 return" in `definition`), both with the same `cohort` and the same start and end (the window of the cohort's first sessions; the follow-up day goes in `definition`), then read `returnRates` in `report`. Each entry shows the two counts, their definitions and the rate, and the rate is withheld when the cohort or window differs, two starts definitions match, returns exceed starts or readings overlap. Without a cohort the ratio may count people who started before the window. A dashboard that shows only a percentage (a day-1 retention of 12%) is recorded as the counts it implies, with "derived: 12% of 400 players" in `definition`; expect rounding error.

## Gates, dependencies and weekly hours

A launch is a gated sequence under a weekly time cap, and the ledger can say so. Three fields carry it.

- **Gates.** A `gates` record is a pass condition the project must meet before some work starts: `{ id, projectId, name, criteria, status, checkedAt?, evidenceIds?, notes? }`. Write `criteria` as the test, with a number wherever there is one ("at least 5 of 8 outside players finish chapter one in one session", not "the playtest goes well"). `status` is `open` (not checked), `passed`, `failed` (checked and not met) or `waived` (the owner decided to go on without it; say why in `notes`). `checkedAt` is the date of the last check, and `evidenceIds` names evidence records of the same project that show the result, so a passed gate points at what passed it. A gate ID may not equal an initiative ID in the same project, so a dependency never names two things.
- **Dependencies.** An initiative's optional `dependsOn` lists the gate or initiative IDs in its own project that it waits on. Every ID must exist, and an initiative cannot depend on itself, list an ID twice or sit on a cycle. A gate's `evidenceIds` must be evidence of its own project. Any breach, like any dangling reference in another collection, rejects the whole write and leaves the file untouched.
- **Hours.** An initiative's optional `hours` is its total planned maker-hours, a nonnegative decimal: the effort to do the work, never audience time (that is the `hours` observation metric). An initiative without `hours` is unknown, not zero; use `0` only for work that really takes none.

An initiative is **blocked** while it has an unmet dependency: a gate that is `open` or `failed` (`passed` and `waived` are met) or an initiative that is not `complete`. A `complete` initiative is never blocked. Workspaces saved before gates existed gain an empty `gates` collection and need no migration, and initiatives without `hours` or `dependsOn` behave as before. Gates travel in JSON exports and imports like every other collection. An older runtime refuses a ledger that holds gates as an unknown collection, so update the installed runtime before recording the first gate.

```text
marketing plan <project-id> --workspace <file>
```

`plan` checks one project and prints JSON; it reads the ledger and writes nothing.

- `gates`: each gate with `status`, `criteria`, `checkedAt`, `evidenceIds`, `notes` and `requiredBy` (the initiatives that list it).
- `initiatives`: each with `status`, `start`, `end`, `hours` (`null` when unset), `budget`, `dependsOn`, `blocked`, `blockedBy` (the unmet dependencies, each `{ id, kind, name, status }` with `kind` `gate`, `initiative` or `missing`) and `overCapWeeks` (the over-cap weeks it adds hours to). `blockedBy` lists direct dependencies only, so a chain shows one link at each step.
- `load`: the maker hours per calendar week, with `method`, `weeklyHours`, `totalHours`, `capacityHours` (the cap times the number of weeks), `unknownHours` (initiatives with no hours) and `weeks`, each `{ start, end, hours, cap, overCap, overBy, initiatives, unknownHours }`. Weeks run without a gap from the Monday of the earliest start to the Sunday of the latest end.
- `budget`: `{ currency, cap, planned, remaining, overBudget, overBy }`, comparing the sum of the project's initiative budgets with its `budget`.
- `summary`: gate counts by status, the number of blocked initiatives and over-cap weeks, the `peakWeek` and how many initiatives have no hours.
- `warnings`: running or complete work whose dependency is unmet, an initiative that starts before an unfinished dependency ends (a same-day handoff is allowed), a `passed` gate with no `evidenceIds`, a `waived` gate with no `notes`, and initiatives without hours.

**How weekly hours are computed.** An initiative's `hours` are spread evenly over the days from its `start` to its `end`, both included, and weekends count. A calendar week (Monday to Sunday) receives the hours times the days of the initiative that fall in it, divided by its total days: 14 hours over Monday to the Sunday after is 7 and 7, and 4 hours over a Sunday and the Monday after is 2 and 2. Initiatives of every status are included, since the ledger records plans, not time spent. Totals are rounded to two decimals after a week is summed, and a week is over the cap when its rounded total exceeds the project's `weeklyHours`, so floating-point noise cannot flag it. Maker hours are never converted to money, because the ledger has no hourly rate; `budget` rolls up initiative budgets only, and recorded spending is read in `report`. The plan is even spreading, not a schedule: it does not move work or suggest a start date.

`advise` reads the same plan. It adds a `readiness` action when running work waits on an unmet dependency (priority 1) or planned work is held by an open or failed gate (priority 2, naming the gate that holds the earliest start and its pass condition), and a `capacity` action when weeks are over the cap (priority 2, naming up to three weeks). A ledger with no gates, dependencies or hours gets the advice it always did. The desk shows the same plan under **Decide & plan** for a project that records any of the three: **Readiness gates** with status chips, **Weekly maker hours** with one column per week against the cap, and Blocked and Over cap chips on the initiatives. The panels are read-only; change a gate with `marketing put gates`.

```powershell
marketing put gates playtest-gate.json --workspace <ledger>
marketing plan <project-id> --workspace <ledger>
```

## Stage-aware advice and channels

A project's `stage` (`idea`, `prototype`, `beta`, `launched`) is read by `advise` and `channels`, so a live game is no longer told to collect the viability evidence an idea needs. The stage playbook is a house planning inference built on the discovery rubric. Every piece of advice cites the rules it rests on, and `marketing rules stage` and `marketing rules games` print them with their kind (`external`, `heuristic` or `derived`), the working in `reason` and their references; `marketing rules` without a topic still prints every rule.

- **`advise` reads the project's `stage`.** The viability action still lists the missing primary-support dimensions in the fixed order (`problem, activation, retention, payment`) and adds a sentence saying which of them the stage can act on. An `idea` has nothing to try, so it leads with a viability action ("Check the promise matters before building more", priority 1) and a channel action that listens before it posts. A `prototype` with no recorded starts gets a `stage` action to get intended strangers to a first session (priority 1); it steps aside once starts exist, and a weak funnel then leads as the `activation` action. A `beta` gets a `stage` action to widen through the channel with the highest observed visitors-and-starts ratio, or to run a first tagged test when no channel has a comparable pair (priority 2). A `launched` project gets a `stage` action to read the cohort return rate (`returnRates` in `report`) and the reviewed reactions (priority 1). For a game, the beta action also reads the project's gates: a free web release (an itch.io page, a web portal's own test) comes before a paid store page, and the store page waits for its readiness gates. Actions keep the fields they had and add a new action kind `stage` and `ruleIds`, the IDs of the rules the action rests on (empty for actions from the plan check). A project with no usable stage, such as a hand-made record without one, gets the advice it got before stages were read.
- **`channels` scores the stage.** Each card in the library has `stages` and, for the three stores that charge before release, `paidEntry`. `stages` lists the stages where the card's own approach can be carried out, in order. The planning score adds +1 when the card suits the project's stage and −2 when it does not, and takes 1 off a `paidEntry` card for a game that has not launched; the rationale says why. The three original terms and the output fields are unchanged, and a project with no usable stage is scored on the original terms alone.

```powershell
marketing rules stage
marketing rules games
marketing advise <project-id> --workspace <ledger>
```

## Unknown fields

`validate`, `put` and `import` warn about a field that no record type defines; `put` and `import` still save the record. A warning names the record and the field and, for a near-miss by edit distance (about one typo per four letters, ignoring case, and never a field the record already has), suggests the field you probably meant: `evidence.e1: unknown field "credibilty"; did you mean "credibility"?`. A field with no close match, such as `targets` or `platforms` on an initiative, reads `unknown field "targets"; nothing reads it`: it is stored, but no command or desk view uses it. The same field on many records is one warning that names the first three, so a CSV with a stray vendor column prints one line.

`validate` returns `warnings` for the whole workspace. `import` and `put` print the workspace followed by `warnings` for the records they wrote (that printout still imports like an export), and the desk's `/api/import` and `/api/record` responses carry the same array; the desk's import message shows the first three. Warnings never reject a write or change a saved record, so every existing workspace keeps validating. `--strict` (or `"strict": true` in the body of those two desk requests) turns the warnings into an error before anything is written. Every record type is checked, and so are a competitor's `claims` and an experiment's `arms`. The accepted fields are `recordFields` in `src/schema.mjs`, and a feature that adds a field must add it there.

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
