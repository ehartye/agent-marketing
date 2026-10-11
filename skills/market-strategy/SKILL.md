---
name: market-strategy
description: Recommend marketing channels and an affordable distribution approach when asked where to promote, find an audience, launch, or market a tool, app, game or project.
---

# Choose a channel strategy

Read [channel craft](../../craft/channels.md) and [CLI contract](../../docs/CLI.md). Use market-setup, load the project and its saved strategy with `marketing document show strategy <project-id>`, then run `marketing channels <project-id>`. A missing strategy is a new brief to create, not evidence that prior reasoning is recoverable. The channel ordering is a declared planning heuristic, not evidence that one channel will perform best.

Choose a primary test from the actual audience, project readiness, native format, support capacity, time and budget. Compare a plausible alternative and a sustainable follow-up channel. Explain effort now and lag later, spending, concrete risk, setup complexity, channel best practice and maintenance. Keep the next week within the owner's time; do not recommend ten parallel campaigns.

Verify the current official rules for channels you actually recommend, including local community rules. Source policy claims and distinguish your planning inference from published evidence. Show HN needs substantive tryable maker work. Reddit participation must fit the community; Product Hunt votes must not be solicited. A free browser game can test on a web game portal (`crazygames`, `poki`, `newgrounds`, `gamejolt`) or through `press` outreach before it has a store page; read the portal's agreement and AI rules first, because Poki offers web-exclusive and non-exclusive deals, Newgrounds disallows games generated via an AI prompt, and press and showcase gatekeepers publish their own AI stances.

Do not infer a community's platform or posting permission from generic rules. If its platform or access is unverified, keep that option conditional outside the ledger; use a separately verified channel for a runnable plan. The narrative, source and recorded `channel` must agree.

Order the work behind the project's readiness gates. Read them with `marketing plan <project-id>`. An initiative that needs a gate or earlier work lists it in `dependsOn` (gate or initiative IDs in the same project), and each initiative records its planned `hours`: the maker effort for its whole window, never audience time, left unset when you cannot estimate it. Keep the busiest week within the project's `weeklyHours`. Run `marketing plan <project-id>` before delivering, fix every week it marks over the cap by moving, shortening or dropping work or by asking the owner about the cap, and check the budget roll-up against the project budget. Never recommend starting work that waits on an open or failed gate; name the gate to settle first and its pass condition.

`marketing channels` and `marketing advise` read the project's stage: an idea listens before it posts, a prototype gets intended strangers to a first session, a beta widens through the channel with the best observed ratio, and a launched project reads who returns. Keep your plan consistent with them, and say why when it departs. For a game, read [game launch craft](../../craft/games.md): test on a venue that is free to enter before a paid store page, put the store page behind its readiness gates, and plan the Steam clock from the longest figure Valve's pages state.

Deliver an audience → message → asset → CTA → measurement → review plan. Name the result that would change the channel choice. Record planned initiatives with owner, dates, budget and hypothesis. Do not spend, publish or contact anyone unless the owner instructed that action.

Save the full Markdown rationale, source links, assumptions, tradeoffs and next test with `marketing document save strategy <project-id> <strategy.md> --workspace <ledger> --revision <current-revision>`. Follow the CLI contract's conflict handling and read the saved document back. Updating initiatives alone does not preserve the strategy.

Finish when the rationale and tradeoffs are source-backed, the initiative validates, `marketing plan` shows no week over the cap, the saved strategy has been verified, and the owner has one feasible next action with a decision date. Report the workspace and project ID and where to reopen it: Decide & plan → Project strategy.

Keep the desk current while you do this (see market-desk): record each channel choice the owner has to make as a `decisions` record with the five dimensions per option, group the initiatives under a parent, and end with `marketing next`.
