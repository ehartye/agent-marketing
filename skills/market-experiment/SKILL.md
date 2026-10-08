---
name: market-experiment
description: Design or assess a marketing A/B test, small validation experiment, conversion comparison or stopping decision when uncertainty and sample size matter.
---

# Run a test worth learning from

Read [experiment craft](../../craft/experiments.md) and [CLI contract](../../docs/CLI.md). Use market-setup. Identify the decision, audience, independent unit, assignment, primary outcome, duration, target per arm and stop rule before creating an `experiments` record.

If allocation is not randomized, set `randomized: false` and treat the result as observational. Do not compare different audiences as though changing the creative was the only difference. At low traffic, a qualitative usability probe may answer the immediate question better than an underpowered lift test; name the tradeoff and keep the operator's objective.

Run `marketing experiment <id>` for counts, Wilson intervals and conservative difference bounds. A zero denominator is unknown. The runtime enforces the recorded sample target but cannot infer fulfillment of the free-text duration/stopping conditions: inspect those explicitly. `review-winner` is a request to review the design and conditions, not a statistically certified winner or permission to increase spending.

Do not repeatedly peek and stop on the best-looking result while calling it a fixed-design inference. Explain independence, repeated users, allocation and missing outcome data. The illustrative target of 100 is not a power calculation.

Deliver a compact experiment memo: hypothesis, design, raw counts, uncertainty, limitations, fulfilled/unfulfilled stopping conditions, decision and next observation. Keep a new hypothesis under a new ID. Finish when the decision is proportionate to the evidence and the stopping conditions were actually checked.
