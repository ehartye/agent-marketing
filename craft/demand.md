# Finding underserved paying buyers

An opportunity combines an unmet preference, observed ability and willingness to pay, reachable buyers, and delivery economics. This is a **house decision framework**, not a validated market score. A population can spend heavily and still have excellent alternatives. A language with few translated titles can have little demand for your genre. Keep both possibilities open.

## Define the buyer before ranking countries

Describe a cohort as **language × geography/payment access × platform × genre or desired experience × constraint × price/business model**. Keep language and country separate. For example, Arabic-speaking Saudi PC players who recently bought management games but avoid text-heavy English interfaces is a testable hypothesis; “rich Arab gamers” is not a useful segment.

Record the maker's feasible game scope, localization and support capacity, schedule and budget. If these are unknown, state provisional assumptions and identify which could reverse the conclusion. Premium PC purchases and mobile free-to-play spending are different markets. Do not infer disposable income from nationality or infer premium purchase intent from cosmetic spending.

## Build a claim-level evidence table

Use primary platform documentation for platform behavior, actual store listings for available products, original studies for research findings, and first-party sales reports for developer outcomes. Credible market analysts can supply estimates; check methods and commissioning interests. A paywalled summary supports only the claims it exposes. Search snippets and third-party summaries are leads, not checked evidence.

For each material claim, retain the exact source URL, author/organization, publication date, underlying data period, access date, sample/denominator, platform and country/language scope, measurement definition, and limits. Separate:

| Assessment | Question |
|---|---|
| Source credibility | Is this primary, method-transparent and independently corroborated? Is it sponsored or promotional? |
| Relevance | Does it cover this genre, platform, price and buyer cohort, during a useful period? |
| Claim status | Is it an observed result, a modeled estimate, a firsthand anecdote, or our untested hypothesis? |
| Capture fidelity | Did we inspect the actual text/chart, or only an abstract, excerpt or degraded extraction? |

Use high/medium/low credibility with reasons, not invented confidence percentages. A high-credibility platform document can have low relevance to willingness to pay. Contradictory results and unavailable evidence stay visible. Report counts with their denominators and report absolute volume alongside percentage growth when available.

## Audit demand and supply together

1. Choose two or three specific cohorts and a comparable market. Prespecify genre/platform/business model, release window, inclusion rules and search vocabulary, including native-language terms checked by a fluent reader. Search direct games, mods, free substitutes, older favorites and doing nothing. Keep rejected candidates and reasons in the report.
2. Inspect a bounded set of close alternatives. Twenty listings is a practical starting cap, not a statistically representative sample. Record actual interface/subtitle/audio support, quality, regional price, hardware/access requirements, release/update dates and evidence of player use. A translated store description does not establish in-game language support. Verify an alleged missing feature before calling it a gap.
3. Read a prespecified mix of positive and negative native-language reviews over a common time window. Record counts and selection rules; do not select only localization complaints or only most-helpful reviews. Code unmet preferences, satisfied substitutes, purchase evidence and barriers separately, with native review of meaning. Public review counts are not unit sales or a census of buyers.
4. Interview recent buyers about their last comparable purchases, actual price/platform, games they wanted but passed over, and what they used instead. Ask about concrete experience before a hypothetical idea. Recruit beyond fans of your prototype. Separate inability to pay, difficulty paying, difficulty discovering a game, and inability to find a suitable game. Personal financial details are unnecessary when relevant purchase behavior answers the question.
5. Look for convergence: paying users, repeated unmet preferences, inadequate current substitutes, and a reachable channel. If one link is missing, mark the cohort as a hypothesis or reject it. Never claim “underserved” solely from low supply, community requests, survey preference, national income or market growth.

[Steam's current review documentation](https://partner.steamgames.com/doc/webapi/IUserReviewsService) documents language, purchase/free flags, playtime and refunded status. Review language does not identify residence or English proficiency; purchase flags do not reveal the price paid or prove unmet demand. Verify the current interface and filters before collection; the older `/appreviews` documentation currently directs callers to a replacement. Use authorized public access, bounded requests and the platform's limits. Retain source review links and sampling context; do not publish reviewers' personal profiles.

## Validate the game, language and price separately

[Valve's localization guidance](https://partner.steamgames.com/doc/store/localization) recommends translating store content for candidate languages and examining regional wishlists to help prioritize. Store and in-game localization are independent. Represent shipped language support accurately; a translated concept page is not a delivered localized game. Wishlist interest is a discovery signal, not payment evidence.

Use a small localized playable slice and a real regional price proposition before translating a whole game. Native QA should check comprehension, font/rendering, layout, cultural meaning and the actual experience. AI-assisted translation may lower drafting cost; it does not establish quality or eliminate review and update obligations.

Define eligibility, exposure, meaningful play, return interval, paid outcome and refund window. A demo completion, wishlist, interview promise and retained paid purchase answer different questions. Test payment using an honestly described, deliverable paid product or offer; a price survey remains stated willingness to pay. Do not fabricate checkout scarcity or charge for an unfulfillable product.

Compare like-for-like exposure and acquisition sources. To claim a localization effect, randomize eligible users within the same cohort where feasible and plan the analysis before results. Comparing different countries, creators or before/after releases is observational: promotion, launch timing, discounts and existing fan translations can explain differences. Small interviews reveal mechanisms; they do not estimate population demand. An inconclusive test stays inconclusive.

## Check whether the gap can support a business

Estimate **additional fixed cost ÷ net contribution per incremental retained sale** to find incremental break-even units. Include translation, implementation, native QA, localized marketing and future updates. Use realized regional prices after discounts, refunds, applicable taxes, platform deductions and variable costs; do not mechanically convert the US list price. [Valve's pricing documentation](https://partner.steamgames.com/doc/store/pricing) leaves prices with the developer and describes regional management tools.

This arithmetic is a planning estimate, not a sales forecast. Distinguish buyers gained from buyers who would already have bought the English version. Do not justify building a full new game using translation-only break-even costs. Include development costs when the decision is whether to build. Show assumptions and sensitivity; with uncertain demand, report what must be true rather than inventing revenue.

Compare options on time now and later, risk, implementation complexity, best practice and continuing maintenance. For Arabic, budget right-to-left/mixed-direction UI and native review as applicable; for every language, budget terminology, patch translation and support. A local partner can reduce cultural and channel uncertainty while adding coordination and cost. These are delivery considerations, not proof of market demand.

## Market landscape questions

Some questions are about a whole market, not a buyer cohort: which kinds of games do well, which do badly, and where a maker with cheap production should place a bet. Use the [market landscape format](../library/market-landscape-report.md). These rules matter most there.

- **Base rates first.** Give the denominator and the unit for every figure: releases in the period, how a "hit" is defined, and which games are in the sample. Prefer medians and shares under small thresholds to averages and totals, because a few hits dominate any total. A number that arrives without a denominator is a lead, not evidence.
- **Winners per tag are not odds per release.** A tag can top the list of successful games because it is large. Ask for hits divided by releases in that tag, check the sample size, and treat a small cell as noise. Supply growth erodes a demand claim: a rising tag with surging releases is not an underserved one.
- **Breakout lists are survivor lists.** Failures are under-reported, postmortems are selected, and survey respondents skew toward those who did well. Say so wherever a pattern rests on them, and look for counterexamples that broke the pattern.
- **Modeled estimates are modeled.** Many sales and revenue figures are a formula applied to public counts (for example reviews times a multiplier times price). Write the formula, treat the result as order of magnitude, and note who sells it: data vendors and consultants have an interest. A number that drives a decision needs a primary source or a second independent one.
- **Proxy outcomes hide the middle.** A threshold such as a thousand reviews hides outcomes that would still matter to a small maker. State what range the sources do not cover.
- **Check the whole portfolio and the owner's pipeline.** Build the candidate list from every place projects live, not one index. Where building is cheap, the useful output is a staged set of concept tests with a cap and stop rules, because the base rate favors many cheap tries over one large build, and distribution, not production, is the scarce input.

## Produce the decision report

Use the [report format](../library/demand-report.md) for a cohort question or the [market landscape format](../library/market-landscape-report.md) for a market-wide one. Lead with a bounded recommendation and evidence status. Show a compact comparable cohort table, claim/source audit, counterevidence and one cheapest falsifiable next test. Link citations beside the claims they support. State search coverage and what remains unverified; do not substitute a country leaderboard or opaque opportunity score for reasoning.

An initial two-week research window, twenty comparables and five buyer interviews per candidate are **example effort caps**, not universal validation thresholds. Set the actual caps with the owner. The test must name an observation that would change the decision, who owns it, a time/spend ceiling, a review date, and continue/change/stop rules. No outbound recruitment or spending follows automatically from a research recommendation.

See the [worked gamer demand report](../docs/research/gamer-demand-2026-10-08.md) for how trusted regional research and developer cases support hypotheses while leaving current supply and conversion unresolved. [Discovery](discovery.md), [competition](competition.md), [measurement](measurement.md) and [experiments](experiments.md) supply complementary methods.
