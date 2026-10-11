# Keep the desk current

The owner reads the desk, not the chat history. If a question, a choice, a step or a file exists only in a conversation, it is lost the next day, and the owner is left reading documents with nothing to say which one matters. The ledger is where the work is kept, and **Decide & plan → Needs you now** is the first thing the owner sees. Your job in every session is to leave it truer than you found it.

## Everything has a parent

```text
project
 └ parent initiative (a launch, a campaign)         note: one line of current status
    └ child initiatives (a channel, a test)         hours, dates, dependsOn
       ├ gates       pass conditions                due, hours, initiativeId
       ├ decisions   choices the owner makes        options, recommendation, needBy
       ├ actions     steps for the owner or agent   due, hours, status
       ├ reports     the memo behind a decision     --initiative / --gate / --decision
       └ collateral slots and their candidates      a pick is a decision
```

A document, decision, action or slot with no initiative is a loose end. Give new work its initiative first (group related ones under a parent with `parentId`), then attach the rest. A report with no parent shows under "Unassigned" in the desk; treat that as a to-do for you.

## Start of a session

Run `marketing next <project-id> --workspace <ledger>` before planning anything. Open your reply with what it lists: overdue and due-soon decisions, owner actions, gates, collateral waiting for a pick, then blocked work. Do not ask the owner something the ledger already holds as an open decision, and do not propose work the plan shows is blocked.

## While you work

- **A question for the owner is a decision record.** Put it in `decisions` with the question and every option, and for each option the five dimensions stated concretely: time (now, and the lag it adds later), risk (what, how likely, how severe), complexity, best practice, maintainability. Add your `recommendation`, a `needBy` date and `defaultIfSilent` (what you would do without an answer; never treated as an answer). Attach the memo as a report with `--decision`. Then ask in one line and point at the desk.
- **The owner's answer is recorded when it is given.** `marketing decide <id> --option <option> --rationale "<their words>"`, even when they answered in chat. If they say later, `marketing defer <id> --until <date>`. A changed mind is `decide --change`, which keeps the history.
- **Every next step is an action.** Owner steps and your own, with `--due`, `--hours` and the initiative, gate or decision it serves. Move its status as you go (`action status <id> doing|done|blocked`, with `--note` for a blocker). Do not leave a finished step open or an abandoned one as a ghost: mark it `dropped`.
- **A gate check uses `gate set`.** `passed` only with the evidence in `--evidence`, `failed` when it did not pass, `waived` only when the owner chose to go on, with the reason in `--note`.
- **Anything else that happened** (a pause, a finding, a conversation) is `update add --initiative <id> --text "..."`. Commands that change a record already log themselves; do not log those twice.
- **Documents live under their parent.** Save a report with `document save report ... --project <p> --initiative <i>` (or `--gate`, `--decision`) and `--vault-url` for the wiki note it mirrors. A brief belongs to its initiative, a strategy to its project.
- **Keep one line of status on each initiative** (`note`) that says where it stands and what it waits on.

## Collateral

Capsule art, banners, thumbnails, trailers and copy variants belong in slots, not in an artifact or a folder only you know about.

1. One slot per place the asset goes (`asset slot add`, with its size and format in `--spec` and its initiative). Name it the way the platform does.
2. Add every candidate, including the ones you expect to lose, with `--source` saying how it was made (`asset add --file`, `--url` for an artifact or any https page, `--text` for copy). Files are copied into the workspace's assets folder; never delete from it.
3. Ask the owner to compare them in the desk's **Collateral** view. When they choose, in the desk or in chat, run `asset pick` with their reason, which also records the decision. When they turn one down, `asset reject` with the reason. Alternates stay, so the next test or the next game can reuse them.
4. A new version of a candidate is added with `--supersedes`; the old one is retired with `asset retire`, not removed.
5. An artifact may be linked as a candidate or in a report, but the ledger holds the choice.

## End of a session

Run `marketing next` again and tell the owner, in this order: what was decided or done (new records with their IDs), what you added for them, and what now waits on them, most urgent first, with the desk location (**Decide & plan → Needs you now**, or **Collateral**). Check that nothing you created is parentless and that `marketing validate --strict` reports no warnings. If a write was refused for an old runtime or a stale revision, say so; do not describe a record you did not save.

## Limits

The desk is a record, not a scheduler. It sends nothing and calls no one. A decision's `defaultIfSilent` is a proposal: act on it only when the owner has agreed it may apply, and record that agreement. Never decide for the owner, never `decide` an option they did not choose, and never mark a gate `passed` to unblock work.
