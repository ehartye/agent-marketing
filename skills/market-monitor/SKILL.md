---
name: market-monitor
description: Collect or import campaign results and audience reactions, register GitHub or HN monitoring sources, or open the local marketing dashboard.
---

# Monitor the evidence

Read [measurement craft](../../craft/measurement.md), [reception craft](../../craft/reception.md) and [CLI contract](../../docs/CLI.md). Use market-setup and an explicit real workspace path. Keep demo data in a separate file.

Register `sources` for the owner's GitHub repository or HN launch thread, then run `marketing monitor`. GitHub public stars work without a token; optional traffic needs appropriately scoped `GITHUB_TOKEN` in the environment. HN comments are bounded at 100 items. Check source errors, sample completeness and collection dates. Preserve previous successful readings; absent/forbidden data is unknown.

For other platforms use authorized exports. Normalize CSV/JSON to observations with exact definitions, source URLs and reporting windows. Treat a cumulative reading as a snapshot with a stable series. Stable IDs replace existing records; do not add a rolling total on every collection. The import is atomic, so validate before applying. Review lexical sentiment suggestions in context before marking them reviewed.

Run `marketing serve --workspace <file>` to open the loopback campaign desk; it stops itself after 30 idle minutes (`--idle-minutes` changes this, 0 disables), so start it again when the owner returns. It filters evidence, changes initiative status, reviews reactions, imports files and exports the ledger. Periodic collection can use an owner-chosen scheduler calling the one-shot monitor command; no scheduler is installed implicitly. Recommend weekly GitHub traffic capture because its history is only 14 days, and wait for complete reporting days where analytics is delayed.

Finish by reporting source coverage/errors, validating the ledger, and recording the next review date. Do not imply unrestricted social-listening API access or automatically publish replies.
