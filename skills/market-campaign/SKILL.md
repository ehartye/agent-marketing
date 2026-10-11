---
name: market-campaign
description: Plan or revise a launch, promotion initiative, or marketing campaign with a hypothesis, channel-native assets, measurement and a review date.
---

# Plan a campaign

Read [campaign craft](../../craft/campaigns.md) and [CLI contract](../../docs/CLI.md). Use market-setup and inspect the project's saved strategy, evidence and running initiatives. Read an existing initiative's saved brief with `marketing document show campaign <initiative-id>` before revising it. Carry forward its existing limits, attribution plan and stopping rules unless the owner asks to change them; flag conflicts rather than silently loosening a campaign cap to the larger project allowance. If the audience/channel is unresolved, use market-discover or market-strategy for that gap.

Work backwards from the review decision. Set an audience, hypothesis, native message/asset, one CTA, useful primary outcome, start/end, maker-time cap, budget, owner and stopping/review conditions. A campaign can include several related initiatives; each channel/test gets its own stable record. Do not fill the available week with more actions than the owner can support: record the maker-time cap as the initiative's `hours` (the effort for its whole window, never audience time) and what it waits on as `dependsOn` (gate or initiative IDs in the same project).

Respect the project's readiness gates. Before setting an initiative to `running`, run `marketing plan <project-id>`; if the initiative is blocked, do not start it. Settle the gate first by recording the check with `marketing put gates <gate.json>`: `passed` only with the evidence that shows it in `evidenceIds`, `failed` when the check did not pass, `waived` only when the owner decides to go on and the reason is in `notes`. After adding or moving an initiative, run the plan again and fix every week it marks over the project's `weeklyHours` before delivering the brief.

Prepare the try path and support responses. Generate post-specific links with `marketing utm`; preserve original queries and avoid tags on internal navigation. Record the raw metric definitions and product outcome/cohort to be measured. Keep reach/likes separate from activation and repeat use.

Deliver a concrete campaign brief and apply the validated `initiatives` patch and read its `warnings` (a misspelled field is saved but ignored). Save each initiative's full Markdown execution brief with `marketing document save campaign <initiative-id> <campaign.md> --workspace <ledger> --revision <current-revision>`, then read it back. Include audience, rationale, evidence/assumptions, assets or asset links, measurement and continue/change/stop criteria; related initiatives share the saved project strategy and keep their own channel-specific briefs. Follow the CLI contract's revision/conflict handling. Draft the chosen collateral through market-collateral and save the resulting copy or artifact links in the brief. Keep failed, paused and completed initiatives in the ledger. Drafting and planning are allowed by a marketing task; executing a public post, ad spend or contact requires the owner's instruction for that action.

Finish with a verified saved brief, runnable measurement commands, a review date, criteria for continue/change/stop, and a `marketing plan` that shows the initiative unblocked or names the gate it waits on. Report the workspace and initiative ID and where to reopen it: Decide & plan → the initiative → Read saved campaign brief.
