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
marketing document save report <report-id> <report.md> --title <title> --workspace <file> --revision n [--project id --kind k --vault-url u --initiative id --gate id --decision id]
marketing document show report <report-id> --workspace <file>
marketing document export report <report-id> --workspace <file> [--out report.md]
marketing report --workspace <file> [--project id --initiative id --from YYYY-MM-DD --to YYYY-MM-DD]
marketing advise <project-id> --workspace <file>
marketing plan <project-id> --workspace <file>
marketing next [project-id] --workspace <file> [--today YYYY-MM-DD]
marketing decide <decision-id> --option <option-id> --workspace <file> [--rationale text] [--change] [--revision n]
marketing defer <decision-id> --workspace <file> [--until YYYY-MM-DD] [--note text] [--revision n]
marketing action add --id <id> --title <text> --workspace <file> [--owner owner|agent] [--due YYYY-MM-DD] [--hours n] [--initiative id] [--gate id] [--decision id] [--note text] [--project id] [--revision n]
marketing action status <action-id> <todo|doing|done|blocked|dropped> --workspace <file> [--note text] [--revision n]
marketing gate set <gate-id> --status <open|passed|failed|waived> --workspace <file> [--note text] [--evidence id,id] [--revision n]
marketing update add --text <text> --workspace <file> [--kind note] [--initiative id] [--ref id] [--project id] [--revision n]
marketing asset slot add --id <id> --name <text> --kind <image|video|document|text|link> --workspace <file> [--spec text] [--initiative id] [--project id] [--note text] [--revision n]
marketing asset add --slot <slot-id> --label <text> (--file <path> | --url <https-url> | --text <copy>) --workspace <file> [--source text] [--id id] [--supersedes asset-id] [--revision n]
marketing asset pick <asset-id-or-slot-id> --workspace <file> [--rationale text] [--revision n]
marketing asset reject <asset-id> --rationale <text> --workspace <file> [--revision n]
marketing asset restore <asset-id> --workspace <file> [--revision n]
marketing asset retire <asset-id> --workspace <file> [--rationale text] [--revision n]
marketing asset list --workspace <file> [--project id] [--slot id] [--status candidate|selected|rejected|retired]
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

A research report is workspace-level Markdown that you read in the desk: it appears under **Research fit → Research reports**, with tables, links and a download. It needs no project, so a market analysis that spans projects is a valid report; `--project` scopes one to a project. The record is `reports[]`: `{ id, title, markdown, updatedAt, kind?, projectId?, vaultUrl?, initiativeId?, gateId?, decisionId? }`. `initiativeId`, `gateId` and `decisionId` give the report a parent, so no document floats free: each must exist in the report's project, which therefore has to be set (see [Decisions, actions and progress](#decisions-actions-and-progress)). `kind` is `market-landscape`, `demand`, `competition`, `positioning` or `other`. `vaultUrl` is an optional `obsidian://`, `http` or `https` link to the source note in the owner's wiki; the desk shows it as **Open in vault**. Saving with an existing ID replaces that report and requires the current revision, like a brief. Markdown is limited to 100,000 characters and is rendered with every character escaped; only `http(s)` links become anchors; a leading YAML frontmatter block is not shown. Workspaces saved before reports existed gain an empty collection and need no migration. Reports are included in JSON backups.

```powershell
marketing document save report game-market-2026 report.md --title "Game market landscape" --kind market-landscape --workspace <ledger> --revision <current-revision>
```

A report belongs to something. Pass `--project` with `--initiative`, `--gate` or `--decision` to file it under that initiative, gate or decision (each must exist in the project); the desk then shows it there, and saving the same report again without them keeps the parent it had. Saving a report that has a project also logs a `document` update.

## Record fields

The example [studio.json](../examples/studio.json) is a fully validated ledger. Its metrics and competitor entries are illustrative, not real family results. Fields below are required unless marked optional. Counts must be safe nonnegative integers; currency values and hours may be nonnegative decimals. Dates use actual `YYYY-MM-DD`; collection timestamps use ISO UTC. URLs use HTTP(S).

| Collection | Required fields beyond `id` |
|---|---|
| projects | name, audience (nonempty text array), category (`tool/app/game/creative/education`), problem, promise, stage (`idea/prototype/beta/launched`), objective, weeklyHours, budget, currency; optional strategy document |
| initiatives | projectId, name, channel, hypothesis, cta, status (`planned/running/paused/complete`), start, end, budget, owner; optional brief document, hours (nonnegative number: total planned maker-hours), dependsOn (array of gate or initiative IDs in the same project; see [Gates, dependencies and weekly hours](#gates-dependencies-and-weekly-hours)), parentId (an initiative of the same project that groups this one; see [Parent initiatives](#parent-initiatives)), note (a line of text: the current status the owner reads) |
| gates | projectId, name, criteria (the pass condition, with a number where one exists), status (`open/passed/failed/waived`); optional checkedAt (`YYYY-MM-DD`), evidenceIds (evidence IDs of the same project), notes, due (`YYYY-MM-DD`), hours (nonnegative number: owner maker-hours to pass the gate), initiativeId (the initiative the gate belongs to) |
| decisions | projectId, title, question, status (`open/decided/deferred/superseded`), options (array of `{id, label}`, unique option IDs, may be empty while a question is still being framed); optional initiativeId, needBy (`YYYY-MM-DD`), defaultIfSilent, recommendation, chosen (an option ID; required when `decided`), rationale, decidedAt (timestamp; required when `decided`), reportId (a report of the same project, or a workspace-level one, holding the full memo), gateIds (gates of the same project), supersededBy (another decision of the same project; required when `superseded`), history (array of `{chosen, rationale?, decidedAt}`: the earlier choices of a decision that was changed). Each option may carry `summary` and the owner's five dimensions `time`, `risk`, `complexity`, `bestPractice` and `maintainability`, all text |
| actions | projectId, title, owner (`owner/agent`), status (`todo/doing/done/blocked/dropped`); optional initiativeId, gateId, decisionId (each must exist in the project), due (`YYYY-MM-DD`), hours (nonnegative number), notes, doneAt (timestamp), blockedBy (text) |
| updates | projectId, at (timestamp), kind (`decision/gate/initiative/action/asset/document/note`), text; optional initiativeId, refId (an ID, not checked against a collection) |
| assetSlots | projectId, name, kind (`image/video/document/text/link`), status (`open/picked`); optional initiativeId, spec (text: size, format, safe area), selectedAssetId (required when `picked`, forbidden when `open`: a selected asset of this slot), decisionId (the decision that records the pick), notes. See [Collateral](#collateral-slots-candidates-and-picks) |
| assets | projectId, slotId (a slot of the same project), label, kind (`image/video/document/text/link`), status (`candidate/selected/rejected/retired`), createdAt (timestamp), and exactly one of file (a path inside the assets folder), url (an https link) or text (copy, at most 4000 characters); optional mediaType (required with a file), bytes, sha256, width, height, rationale, source, decidedAt (timestamp), supersedes (another asset of the same slot) |
| observations | projectId, channel, metric, value, start, end, kind (`period/snapshot`), definition, url, collectedAt; optional initiativeId, cohort; snapshot requires series; cost/revenue require currency |
| reactions | projectId, text, url, collectedAt, sentiment (`positive/negative/neutral/mixed/unknown`), reviewed (boolean), theme; optional initiativeId, channel |
| competitors | projectId, name, kind (`direct/substitute/do-nothing`), positioning, url, checkedAt, claims (array of `{dimension,value,url,checkedAt}`) |
| experiments | projectId, name, hypothesis, primaryMetric, stoppingRule, targetPerArm (positive integer), randomized (boolean), arms (exactly two `{name,trials,successes}` with successes ≤ trials); optional initiativeId |
| evidence | projectId, claim, dimension (`problem/activation/retention/payment/positioning/channel`), result (`supports/contradicts/unknown`), strength (`primary/secondary/anecdote/hypothesis`), url, checkedAt; optional initiativeId, publishedAt (`YYYY-MM-DD`), dataPeriod, denominator, limit (text), credibility and relevance (`high/medium/low`, judged separately), status (`observed/modeled-estimate/documented-rule/anecdote/hypothesis/product-fact`). The audit fields keep a researched claim's trail with it and appear on the evidence card in the desk. `product-fact` is a verified fact about the project itself, such as its download size or what its live page says: its `url` may be a build or live-page URL or a repository-relative path like `src/game/ui/settings-screen.ts` or `README.md#L10-L20` (letters and digits of any script and `. _ - @ + ~`; no scheme, drive letter, leading slash, `..`, space or name starting with `~`, so a local file location or home directory is refused), the desk shows a path as text rather than a link, and because it describes the project and not its audience it never fills a viability gap in `advise`. Every other status still needs an http(s) `url` |
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

- **Gates.** A `gates` record is a pass condition the project must meet before some work starts: `{ id, projectId, name, criteria, status, checkedAt?, evidenceIds?, notes?, due?, hours?, initiativeId? }`. Write `criteria` as the test, with a number wherever there is one ("at least 5 of 8 outside players finish chapter one in one session", not "the playtest goes well"). `status` is `open` (not checked), `passed`, `failed` (checked and not met) or `waived` (the owner decided to go on without it; say why in `notes`). `checkedAt` is the date of the last check, and `evidenceIds` names evidence records of the same project that show the result, so a passed gate points at what passed it. `due` is the date the check should be done by and `hours` the owner's maker-hours to pass it (the playtest to run, the truth sheet to write); a gate with both puts those hours in the week it is due in the weekly load below, and a gate with `due` and no `hours` is simply a deadline. `initiativeId` names the initiative the gate belongs to, which counts it in that initiative's progress. Record a check with `marketing gate set <gate-id> --status passed --note "6 of 8 finished" --evidence e1,e2`: it sets the status, today's date as `checkedAt`, the note and evidence you give (evidence and notes you leave out are kept), appends an `updates` entry in the same write, and prints the same warning `plan` would give when a passed gate cites no evidence or a waived gate has no note (the gate is still saved). Setting a gate to what it already is on the same day writes nothing. A gate ID may not equal an initiative ID in the same project, so a dependency never names two things.
- **Dependencies.** An initiative's optional `dependsOn` lists the gate or initiative IDs in its own project that it waits on. Every ID must exist, and an initiative cannot depend on itself, list an ID twice or sit on a cycle. A gate's `evidenceIds` must be evidence of its own project. Any breach, like any dangling reference in another collection, rejects the whole write and leaves the file untouched.
- **Hours.** An initiative's optional `hours` is its total planned maker-hours, a nonnegative decimal: the effort to do the work, never audience time (that is the `hours` observation metric). An initiative without `hours` is unknown, not zero; use `0` only for work that really takes none.

An initiative is **blocked** while it has an unmet dependency: a gate that is `open` or `failed` (`passed` and `waived` are met) or an initiative that is not `complete`. A `complete` initiative is never blocked. Workspaces saved before gates existed gain an empty `gates` collection the first time the new runtime writes them, whatever the write (an evidence record, an import, a saved document), and need no migration; initiatives without `hours` or `dependsOn` behave as before. Gates travel in JSON exports and imports like every other collection. An older runtime refuses any ledger that has a `gates` key as an unknown collection, so update every runtime that reads the ledger (a stale install, a second machine, anyone sharing the studio file) before the new runtime writes to it, not only before the first gate is recorded. The same holds for `decisions`, `actions`, `updates`, `assetSlots` and `assets`: any write by a runtime that has them, even an evidence record, adds those empty collections, and an older runtime then refuses the file. Reading a workspace never rewrites it, so an old file stays byte for byte as it was until something writes it. `hours` and `dependsOn` are now validated fields: an initiative that already kept free text under either name (an `hours` of "2-3", a `dependsOn` of one ID instead of a list) is refused with the path and a hint, and the workspace cannot be read until you rename that field or make it a number or a list.

```text
marketing plan <project-id> --workspace <file>
```

`plan` checks one project and prints JSON; it reads the ledger and writes nothing.

- `gates`: each gate with `status`, `criteria`, `checkedAt`, `evidenceIds`, `notes`, `due`, `hours` and `initiativeId` (each `null` when unset), `overCapWeeks` (the over-cap week its hours fall in) and `requiredBy` (the initiatives that list it).
- `initiatives`: each with `status`, `start`, `end`, `hours` (`null` when unset), `budget`, `note`, `parentId`, `children`, `dependsOn`, `blocked`, `blockedBy` (the unmet dependencies, each `{ id, kind, name, status }` with `kind` `gate`, `initiative` or `missing`), `overCapWeeks` (the over-cap weeks it adds hours to), `rollup` and `progress` (see [Parent initiatives](#parent-initiatives)). `blockedBy` lists direct dependencies only, so a chain shows one link at each step.
- `load`: the maker hours per calendar week, with `method`, `weeklyHours`, `totalHours` (leaf initiatives plus dated gate hours), `gateHours` (the part of it from gates), `capacityHours` (the cap times the number of weeks), `unknownHours` (leaf initiatives with no hours), `omittedWeeks` and `weeks`, each `{ start, end, hours, cap, overCap, overBy, initiatives, gates, unknownHours }`; `gates` lists the `{ id, hours }` of the gates due in that week. Weeks run without a gap from the Monday of the earliest start to the Sunday of the latest end, up to 260 weeks (five years) from the earliest start. Later weeks are left out and counted in `omittedWeeks` (0 otherwise), and a warning names the span and says to check the initiative dates; `totalHours` still counts every initiative. A week that crosses the ends of the calendar (0000-01-01, 9999-12-31) is cut there.
- `budget`: `{ currency, cap, planned, remaining, overBudget, overBy }`, comparing the sum of the project's initiative budgets with its `budget`.
- `summary`: gate counts by status, the number of blocked initiatives and over-cap weeks, the `peakWeek` and how many initiatives have no hours.
- `warnings`: running or complete work whose dependency is unmet, an initiative that starts before an unfinished dependency ends (a same-day handoff is allowed), a `passed` gate with no `evidenceIds`, a `waived` gate with no `notes`, a gate with `hours` but no `due` (its hours cannot be placed in a week, so they are not counted), a parent initiative that records `hours` of its own (ignored), initiatives without hours, and weeks left out of a very long span. A warning or advice that lists initiatives or dependencies names the first five, or three for running work, and counts the rest.

**How weekly hours are computed.** An initiative's `hours` are spread evenly over the days from its `start` to its `end`, both included, and weekends count. A calendar week (Monday to Sunday) receives the hours times the days of the initiative that fall in it, divided by its total days: 14 hours over Monday to the Sunday after is 7 and 7, and 4 hours over a Sunday and the Monday after is 2 and 2. A gate with both `due` and `hours` puts all its hours in the week of its due date (a Sunday belongs to the week it ends); a gate missing either adds nothing. Only leaf initiatives are spread: a parent's own `hours` are ignored. Initiatives and gates of every status are included in `load`, since the ledger records plans, not time spent; `advise` leaves complete initiatives and passed or waived gates out of its capacity action, because finished work cannot be moved out of a week. Action `hours` are not added to the load: an action is a step of an initiative or gate whose hours already cover it. Budgets are not rolled up the parent tree: every initiative's own `budget` counts once in `budget`. Totals are rounded to two decimals after a week is summed, and a week is over the cap when its rounded total exceeds the project's `weeklyHours`, so floating-point noise cannot flag it. Maker hours are never converted to money, because the ledger has no hourly rate; `budget` rolls up initiative budgets only, and recorded spending is read in `report`. The plan is even spreading, not a schedule: it does not move work or suggest a start date.

`advise` reads the same plan. It adds a `readiness` action when running work waits on an unmet dependency (priority 1) or planned work is held by an open or failed gate (priority 2, naming the gate that holds the earliest start and its pass condition), and a `capacity` action when weeks are over the cap counting only work that is not complete (priority 2, naming up to three weeks). A ledger with no gates, dependencies or hours gets the advice it always did. The desk shows the same plan under **Decide & plan** for a project that records any of the three: **Readiness gates** with status chips, **Weekly maker hours** with one column per week against the cap, and Blocked and Over cap chips on the initiatives. The panels are read-only; change a gate with `marketing gate set` or, for its other fields, `marketing put gates`. When the owner has open decisions, owner actions or gates due, `advise` leads with an `attention` action (priority 0) that says what and points at `marketing next`; blocked initiatives are not repeated there, since the `readiness` actions already name them.

```powershell
marketing put gates playtest-gate.json --workspace <ledger>
marketing plan <project-id> --workspace <ledger>
```

## Parent initiatives

An initiative's optional `parentId` names another initiative of the same project that it belongs to, so a launch can be read as one thing made of several. It groups for reading only; ordering is still `dependsOn`. An initiative cannot be its own parent and parents cannot form a cycle; there is no depth limit. `note` is a line of text for the owner: the current status of that initiative. Set it with `put initiatives` (a full-record upsert), or with `setInitiativeNote` in `src/progress.mjs`, which also logs the change as an update.

`plan` adds to each initiative `parentId` (`null` at the top), `children` (the IDs below it, in record order), `progress` and, for a parent only, `rollup` (`null` otherwise).

- The weekly load counts **leaf initiatives only**. A parent's own `hours` are ignored (with a warning) because its children carry the work, and a parent without hours is not an initiative with unknown hours. A parent's `hours` in the plan is the sum of the hours of the leaves below it.
- `rollup`: `{ start, end, hours, unknownHours, status, progress }`. `start` and `end` are the earliest start and latest end among the leaves below; `hours` the sum of their hours (`null` when none has hours) and `unknownHours` the leaves without any. `status` is derived from the children, not the parent's own recorded status: `complete` when every child is complete, `running` when any is running, otherwise `planned` while any child is planned and `paused` for the rest. A child that is itself a parent counts as its own derived status.
- `progress`: `{ gatesPassed, gatesTotal, actionsDone, actionsTotal }`. For a leaf it counts the gates it lists in `dependsOn` plus the gates whose `initiativeId` is that initiative (passed or waived counts as passed), and the actions that name it (a `dropped` action is not counted). For a parent it counts the same over itself and every initiative below it, each gate and action once. The parent's `overCapWeeks` are those of its leaves.

## Decisions, actions and progress

Three collections track what the owner has to decide, what the owner and agent have to do, and what has happened. They sit beside gates: a gate is a pass condition for work, a decision is a choice between options, an action is a step.

**Decisions.** `decisions[]` is `{ id, projectId, title, question, status, options, ... }` (all fields in the table above). State what the owner must choose in `question` and give the options in `options`. Every option should state the owner's five dimensions, each one concretely and none as a one-word label: `time` (how long it takes now and what lag it adds later), `risk` (what can go wrong, how likely, how severe), `complexity` (how much harder the system gets to build or reason about), `bestPractice` (how far it sits from the right way) and `maintainability` (what it costs to live with later). They are optional so a draft can be saved, but a decision put to the owner should have all five on every option. `recommendation` is the option you would take and why; `defaultIfSilent` is what happens if the owner does not answer by `needBy`. `reportId` points at the report that holds the full memo, and `gateIds` at the gates it affects. Option IDs are unique within a decision and labels are nonempty.

```text
marketing decide <decision-id> --option <option-id> [--rationale text] [--change]
marketing defer <decision-id> [--until YYYY-MM-DD] [--note text]
```

`decide` sets `status` to `decided`, `chosen`, the `rationale` and `decidedAt` (now), and appends an update, all in one locked write. It refuses a decision that is already decided unless `--change` is given; the old choice is then kept in `history` (`{ chosen, rationale?, decidedAt }`, oldest first) and the update says "Changed". A superseded decision is refused: decide its `supersededBy` instead. `defer` sets `status` to `deferred`, moves `needBy` to `--until` when given and logs the note; it refuses a decided decision. Deferring a deferred decision to the date it already has, with no note, writes nothing.

**Actions.** `actions[]` is the concrete next steps. `owner` is `owner` (the person) or `agent`; only `owner` actions are shown to the owner by `next`. `gateId`, `decisionId` and `initiativeId` tie an action to what it serves and must exist in the project.

```text
marketing action add --id record-trailer --title "Record the trailer" --owner owner --due 2026-10-20 --hours 2 --initiative launch
marketing action status record-trailer done
marketing action status record-trailer blocked --note "needs the final build"
```

`action add` creates the action (`todo`, owned by the owner unless `--owner agent`) in the only project of the workspace, or the project of the initiative, gate or decision it names, or `--project`; it refuses an ID already in use. `action status` sets the status; `done` stamps `doneAt` (an action already done is left alone, so a repeat changes nothing), any other status clears it, and a `--note` is kept as `blockedBy` for a `blocked` action (leaving `blocked` clears it) and as `notes` otherwise.

**Updates.** `updates[]` is the progress log, written by the commands above and by `marketing update add --text "Cut the first teaser" --initiative video [--kind note] [--ref id]`. An update is `{ id, projectId, initiativeId?, at, kind, refId?, text }`, with IDs like `u-<time in base 36>-<n>`. The log is append-only in practice: no command edits or removes an entry. `refId` is not checked against a collection, so the log stays valid if a record it names is removed by hand.

All of these accept `--workspace`/`--studio`, print JSON `{ workspace, record, update, warnings, changed, revision }` and honour `--revision n` (they re-read under the lock, so without it they apply to the current revision; with it a stale revision fails and changes nothing). `changed: false` (with `update: null`) means the request already held and nothing was written. The same functions are exported from `src/progress.mjs` for the desk.

## What needs the owner now

```text
marketing next [project-id] --workspace <file> [--today YYYY-MM-DD]
```

`next` prints `attention(workspace, projectId, today)` as JSON, reading the ledger and writing nothing. Without a project ID it uses the workspace's only project and otherwise lists the projects to choose from. `today` defaults to the local date; every `daysLeft` is whole days from it to a date, negative once the date has passed. The result is `{ projectId, today, decisions, actions, gates, blockedInitiatives, picks, stale, recent, summary }`, each list most urgent first:

- `decisions`: open decisions, and deferred ones whose `needBy` has arrived, by `needBy` (undated last), each `{ id, title, question, status, needBy, daysLeft, overdue, recommendation, defaultIfSilent, optionCount, initiativeId, reportId }`.
- `actions`: owner actions that are `todo`, `doing` or `blocked` and are due within 14 days, overdue or blocked, by `daysLeft` (undated last), each `{ id, title, status, due, daysLeft, overdue, reason, blockedBy, hours, initiativeId, gateId, decisionId }` with `reason` `overdue`, `due-soon` or `blocked`.
- `gates`: `open` or `failed` gates due within 14 days or overdue, each `{ id, name, criteria, status, due, daysLeft, overdue, hours, initiativeId, blocks }` where `blocks` lists the incomplete initiatives that wait on it as `{ id, name, status }`.
- `picks`: open collateral slots with two or more candidates, by slot name, each `{ slotId, name, candidates, candidateIds, initiativeId }` where `candidates` is the number of assets in the slot with status `candidate` (rejected and retired ones are out of the running); see [Collateral](#collateral-slots-candidates-and-picks). A slot with one candidate, none, or a pick already made is not listed.
- `blockedInitiatives`: blocked initiatives that are running, or planned and starting within 14 days (or already past their start), by start date, each `{ id, name, status, start, daysToStart, blocker }` with `blocker` the first unmet dependency `{ id, kind, name, status }`.
- `stale`: open decisions whose `needBy` passed more than 7 days ago, the longest waiting first, each `{ id, title, needBy, daysOverdue }`. They are also in `decisions`.
- `recent`: the last 10 updates, newest first.
- `summary`: `{ decisions, overdueDecisions, actions, overdueActions, gates, overdueGates, blockedInitiatives, picks, stale, total }`; `total` adds decisions, actions, gates, blocked initiatives and picks.

It is pure: the same ledger and date always give the same result, and nothing but the `today` argument is read from a clock.

## Collateral: slots, candidates and picks

Capsule art, banners, thumbnails, trailers and copy variants are tracked in the ledger so that choosing between candidates is a recorded decision and the candidates that were not chosen are kept. A **slot** (`assetSlots[]`) is a place a piece of collateral goes: `{ id, projectId, initiativeId?, name, kind, spec?, status, selectedAssetId?, decisionId?, notes? }`, for example "Steam main capsule", `image`, spec "1232x706 PNG, no text outside the safe area". An **asset** (`assets[]`) is one candidate for a slot: `{ id, projectId, slotId, label, kind, file? | url? | text?, mediaType?, bytes?, sha256?, width?, height?, status, rationale?, source?, createdAt, decidedAt?, supersedes? }`. `source` says who or what made it ("agent pixel composite v3"), `rationale` why it was picked or rejected, and `supersedes` the earlier asset of the same slot it replaces. Both collections are optional: a workspace saved before collateral existed is read unchanged and gains two empty collections on its first write by this release, and an older release then refuses the file, as it does for `decisions` (update every runtime that reads the ledger first). Reading, `asset list` and `next` never rewrite the file.

An asset has exactly one payload. A **file** is a path inside the assets folder; a **link** is an `https` URL (an artifact, a page) with no credentials in it; **text** is short copy of at most 4000 characters. A file asset also carries its `mediaType`, and `kind` has to fit it (`image` for an image type, `video` for a video type, `document` for a PDF, text or Markdown file, `text` for inline copy, `link` for a URL). Statuses: `candidate` (in the running), `selected` (the one in use; at most one per slot, and the slot names it), `rejected` (turned down, with a reason) and `retired` (taken out of the running without a verdict, for example replaced by a newer version). A slot is `picked` exactly when it has a selected asset.

**Files.** They live beside the workspace in a folder named after it: `hullgrown.json` has `hullgrown.assets/`. `asset add --file` copies the source file to `<slot-id>/<asset-id>.<ext>` in that folder and stores the relative path with forward slashes (`capsule/v3.png`). The original is never moved or deleted. The copy is written first, then the ledger record; if the ledger write fails, the copy (and any folder made for it) is removed again. Nothing deletes a file in the assets folder when an asset is rejected or retired: keeping them is the point. The command records `sha256`, `bytes` and, for PNG, JPEG, WebP and GIF, `width` and `height` read from the file header (left out when the header cannot be read). A file whose sha256 is already in the same slot, in any status, is refused with a message naming the asset that has it; the same file in a different slot is allowed.

**What is accepted.** Only these extensions and media types: `.png` (image/png), `.jpg` and `.jpeg` (image/jpeg, stored as `.jpg`), `.webp`, `.gif`, `.mp4` (video/mp4), `.webm`, `.pdf` (application/pdf), `.txt` (text/plain) and `.md` or `.markdown` (text/markdown). There is no SVG, HTML, script or executable, and a text file that opens like HTML or SVG is refused too. The media type comes from the extension and is checked against the first bytes of the file, so a `.png` that is really a JPEG is refused. A file may be at most 50 MB (`maxAssetBytes`, 52428800 bytes) and not empty. In the ledger a `file` must be relative, use forward slashes and have no `..`, empty or `.` segment, no drive letter and no character a Windows file name cannot hold (a colon included); `put` and `import` enforce the same, so a hand-written record cannot point outside the folder.

```text
marketing asset slot add --id capsule --name "Steam main capsule" --kind image --spec "1232x706 PNG" --initiative store-page
marketing asset add --slot capsule --label "Pixel composite v3" --file art/capsule-v3.png --source "agent pixel composite v3"
marketing asset add --slot capsule --label "Artifact preview" --url https://claude.ai/artifact/abc
marketing asset add --slot blurb --label "Calm blurb" --text "Grow a tiny planet in five minutes."
marketing asset pick capsule-1 --rationale "Reads best at thumbnail size"
marketing asset reject capsule-2 --rationale "Title unreadable at 231px"
marketing asset list --slot capsule --status rejected
```

`asset add` gives the asset the ID `<slot-id>-<n>` unless `--id` is given, makes it a `candidate`, and warns (the asset is still saved) when its kind differs from the slot's; a link may stand in for any kind. `asset pick` takes an asset ID, or the ID of a slot that has exactly one candidate. It marks the asset `selected`, sends the previously selected one back to `candidate` with a rationale saying it was replaced (and what its reason had been), and sets the slot to `picked`. In the same write it records the pick as a **decision**: the first pick creates `pick-<slot-id>` (the next free ID if that is taken), titled "Pick <slot name>", status `decided`, with one option per asset in the slot (`id` the asset ID, `label` its label, `summary` its `source`), `chosen` the asset, the rationale, `decidedAt` and the slot's initiative, and the slot's `decisionId` points at it. Picking again changes that decision exactly as `decide --change` does (the code is shared): the old choice goes to `history` and the options are rebuilt from every asset now in the slot, so a candidate added after the first pick appears in them. A pick without `--rationale` is allowed. Picking what is already picked writes nothing, unless a new `--rationale` is given, which updates the reason in place. A retired asset must be restored before it can be picked; a rejected one can be picked directly.

`asset reject` needs `--rationale` and keeps the file. Rejecting the selected asset opens its slot again (`open`, no `selectedAssetId`); its decision stays as the record of what had been chosen, and the next pick changes it, so the rejected choice lands in `history`. `asset restore` makes a rejected or retired asset a `candidate` again and clears its rationale and `decidedAt` (the log keeps the old reason); a candidate or selected asset is left alone. `asset retire` takes an asset out of the running (an optional `--rationale` is kept) and reopens the slot if it was the selected one. `asset list` prints `{ workspace, slots, assets }`, filtered by `--project`, `--slot` and (for assets) `--status`.

Every write command takes `--workspace` or `--studio` and `--revision n`, appends an `updates` entry of kind `asset` (its `refId` the asset or slot) in the same write, and prints `{ workspace, record, update, warnings, changed, revision }`; the commands that touch a slot add `slot`, and `asset pick` also `decision`. `changed: false` means the request already held and nothing was written. The functions are exported from `src/assets.mjs` for the desk: `assetsDir(workspacePath)`, `addSlot`, `addAsset`, `pickAsset`, `rejectAsset`, `restoreAsset`, `retireAsset`, `listAssets`, `listSlots` and `resolveAssetFile(workspacePath, asset)`. The last returns the absolute path of an asset's file only when it is a regular file that is still inside the assets folder after every symbolic link is resolved, and `null` for a missing file, a link or text asset, a path that climbs out, or a symbolic link that leads outside. Anything that serves these files must go through it and must not serve other types than the whitelist above.

`next` lists open slots with two or more candidates under `picks`; see [What needs the owner now](#what-needs-the-owner-now).

## Stage-aware advice and channels

A project's `stage` (`idea`, `prototype`, `beta`, `launched`) is read by `advise` and `channels`, so a live game is no longer told to collect the viability evidence an idea needs. The stage playbook is a house planning inference built on the discovery rubric. Every piece of advice cites the rules it rests on, and `marketing rules stage` and `marketing rules games` print them with their kind (`external`, `heuristic` or `derived`), the working in `reason` and their references; `marketing rules` without a topic still prints every rule.

- **`advise` reads the project's `stage`.** The viability action still lists the missing primary-support dimensions in the fixed order (`problem, activation, retention, payment`) and adds a sentence saying which of them the stage can act on. An `idea` has nothing to try, so it leads with a viability action ("Check the promise matters before building more", priority 1) and a channel action that listens before it posts. A `prototype` with no recorded starts gets a `stage` action to get intended strangers to a first session (priority 1); it steps aside once starts exist, and a weak funnel then leads as the `activation` action. A `beta` gets a `stage` action to widen through the channel with the highest observed visitors-and-starts ratio, or to run a first tagged test when no channel has a comparable pair (priority 2). A `launched` project gets a `stage` action to read the cohort return rate (`returnRates` in `report`) and the reviewed reactions (priority 1). For a game, the beta action also reads the project's gates: a free web release (an itch.io page, a web portal's own test) comes before a paid store page, and the store page waits for its readiness gates. Actions keep the fields they had and add a new action kind `stage` and `ruleIds`, the IDs of the rules the action rests on (empty for actions from the plan check). A project with no usable stage, such as a hand-made record without one, gets the advice it got before stages were read.
- **`channels` scores the stage.** Each card in the library has `stages` and, for the three stores that charge before release, `paidEntry`. `stages` lists the stages where the card's own approach can be carried out, in order. The planning score adds +1 when the card suits the project's stage and −2 when it does not, and takes 1 off a `paidEntry` card for a game that has not launched; the rationale says why. Each channel result carries `ruleIds` naming the rules in `craft/rules.json` behind those terms (`stage-sets-the-next-test` when the stage term applies; `free-web-before-store-page` and `store-page-after-gates` when the paid-entry term applies), so `marketing rules stage` and `marketing rules games` show the working. The three original terms are unchanged, a project with no usable stage is scored on them alone, and its `ruleIds` is empty.

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

**GitHub adapter limits.** The adapter reads `api.github.com/repos/<owner>/<repository>` and sends `GITHUB_TOKEN` when it is set. A private repository answers HTTP 404 to a call without credentials, so the collector reports `HTTP 404 at api.github.com/repos/<owner>/<repository>`, exits 1 and records nothing; this was seen on a game's private repository. A token that can read the repository is the way in, but that was not tested against a private repository. A game served from GitHub Pages has no visit analytics from GitHub to collect: the repository Traffic graph shows full clones, visitors from the past 14 days, referring sites and popular content for the repository, GitHub's documentation describes no visit counts for a Pages site (an inference from silence, backed by a 2020 community answer), and the plugin has no Pages adapter. For a game, read each venue's own dashboard and record it as an import; see [craft/games.md](../craft/games.md).

For an owner-chosen scheduler, invoke the one-shot monitor command weekly for GitHub traffic. An API failure does not delete prior readings. The browser's Collect now uses the same collector and writes. There is no automatic scheduling or social posting.

## CSV and recovery

CSV imports observations only. Use the exact headers shown in [observations.csv](../examples/observations.csv); quoted commas/newlines and escaped quotes are supported. Include `series` for snapshots and `currency` for cost/revenue. Blank optional fields are omitted. Normalize native analytics exports to this contract; the CLI does not guess a vendor export format. Use direct JSON for other record types.

Writes use an exclusive `.lock`, a validated temporary file and atomic rename. If a process dies with a lock, inspect the recorded PID and confirm that process is stopped before removing that exact lock file; never steal a live writer's lock. Keep a normal filesystem backup for recovery. The ledger has no deletion command; use an intentional reviewed file edit for removals, then validate it. Imports cannot roll back someone else's later edits.

The desk binds to loopback, rejects foreign Host/Origin requests, limits imports to 2 MB and detects stale edits. Export downloads the complete ledger; date filters include only entire observation windows, never prorated counts. Free-text experiment stopping conditions still require human/agent review. JSON remains the complete round-trip export; CSV is an observation interchange format.
