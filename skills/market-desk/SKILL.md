---
name: market-desk
description: Keep the campaign desk current. Use at the start and end of any marketing session, and whenever a decision, next step, gate check, document or collateral candidate appears, so the owner sees what needs them now and every record has a parent initiative.
---

# Keep the desk current

Read [desk craft](../../craft/desk.md) and [CLI contract](../../docs/CLI.md). Use market-setup. The owner works from the desk (**Decide & plan → Needs you now**, and **Collateral**), so the ledger has to hold every decision, step and candidate you create, under an initiative.

Start: run `marketing next <project-id> --workspace <ledger>` and open your reply with what it lists. Before starting work, make sure it has an initiative (group related ones under a parent) and a status note.

During: put each question to the owner into a `decisions` record with every option stated on time, risk, complexity, best practice and maintainability, your recommendation, a `needBy` and a `defaultIfSilent`; record their answer with `marketing decide` in their words (`defer` when they say later). Record each next step as an `action` and keep its status true. Record gate checks with `gate set` and anything else with `update add`. Save every report with `--initiative`, `--gate` or `--decision`. Put collateral in slots: add every candidate with `asset add`, record the owner's choice with `asset pick` and the reason for each turned-down one with `asset reject`; never delete a candidate, and link an artifact as an asset rather than relying on it.

End: run `marketing next` again; tell the owner what was decided, what you added and what waits on them, most urgent first, with where to find it in the desk. Validate with `--strict`. Never decide for the owner, treat a default as an answer, pass a gate without evidence, or describe a record you did not save.
