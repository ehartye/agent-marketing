# Launching a game

A game launch has decisions that a tool or an app does not: whether to release free on the web before a store page, what a store requires and charges, which assets a store refuses, what a trailer looks like in the wild, how to learn anything about a game that has no analytics, what to say about AI, and whether the name is free. This guide gathers what a research crew read on 2026-10-10 and 2026-10-11. It keeps three kinds of statement apart.

- **Documented** is something a platform or a regulator writes down. Each has a link and a check date in [References](REFERENCES.md). Platform pages change, so recheck every figure in the store's own tools before paying or submitting.
- **Measured** is a count from a sample, with its n and its limits. It describes games that exist, not what worked.
- **Heuristic** is a house planning rule. The rules are queryable with `marketing rules games` and `marketing rules stage`, and numbers inside a heuristic are defaults to change, not benchmarks.

Where two Valve pages disagree this guide states both and chooses neither. It is not legal or tax advice: each "ask counsel" is a question to bring, not an answer. Localization, regional pricing and the choice of market are in [demand research](demand.md); channels are in [channels](channels.md).

## Free web first, store second

**Heuristic.** For a free game, test on a venue that costs nothing to enter, and open a paid store page once first-session and return evidence exist. The ordering is arithmetic on documented fees: Steam charges [$100 per product](https://partner.steamgames.com/steamdirect), not refundable and recouped only once the product has $1,000 adjusted gross revenue from the store and in-app purchases, so a free game with no in-app purchases has nothing to recoup it from. Apple's membership is [$99 a year](https://developer.apple.com/help/account/membership/program-enrollment) and Google Play's registration is a [one-time $25](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en), with testing requirements for new personal accounts before release.

| Venue | Cost to enter | What it can tell you | What it needs |
|---|---|---|---|
| itch.io page | $0 to publish; HTML5 uploads take donations only, so selling needs a downloadable build | Views, downloads, purchases and referrers; not play sessions | A [ZIP with index.html](https://itch.io/docs/creators/html5), relative paths, at most 1,000 files, 500 MB extracted and 200 MB per file |
| CrazyGames Basic Launch | $0; ads off, no revenue | Average play time, Day 1 retention and conversion over [7 to 21 days](https://docs.crazygames.com/resources/basic-launch-metrics/) | [50 MB without the SDK](https://docs.crazygames.com/requirements/technical/); with it, 50 MB initial and 250 MB total; PEGI 12 |
| Poki tests | $0 | A 500-player playtime test, then a [web fit test](https://developers.poki.com/guide/how-testing-works) of about 7 days | SDK events, no in-app purchases, no external requests unless approved |
| Steam coming-soon page | $100 per product plus bank, tax and identity onboarding | Wishlist additions and deletions, tracked visits | Store assets, the content survey and a reviewed page; a release also needs a build that starts on every OS listed |
| Apple App Store | $99 a year | App Analytics by source | A listing that matches the app and passes App Review |
| Google Play | $25 once | Play Console listing visitors and first-time installers | A signed build, the listing and the testing requirements |

**Documented.** GitHub Pages is a free host with a [soft limit of 100 GB of bandwidth a month and 1 GB of site size](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), and is not intended for running an online business or other commercial transactions; if the plan is to sell from that URL the term applies.

**By stage.** `marketing advise` and `marketing channels` read the project's stage: an idea listens before it posts and opens no store page, since Steam screenshots must show gameplay and a page may list only features available at launch; a prototype gets intended strangers to a first session on a free venue; a beta widens through the best-evidenced channel and names the readiness gates still open before a store page; a launched project reads who returns. This plan is not against early store pages: Valve sees [no strong downside to an early coming-soon page](https://partner.steamgames.com/doc/store/coming_soon) unless the game changes a lot, and suggests waiting until the art direction and core features are settled. The gates below are how you decide that.

## What Steam requires and costs

Valve's own pages disagree on several figures, so the clock is a table. Plan on the more cautious reading in the last column and ask Valve before paying.

| Item | One Valve page | Another | Plan on |
|---|---|---|---|
| Wait between paying the fee and a first release | A 30-day waiting period ([Steam Direct](https://partner.steamgames.com/steamdirect)) | A 21-day waiting period ([Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)) | 30 days; both pages say it applies to your first few titles |
| Tax information verification | 2-7 business days ([Getting Started FAQ](https://partner.steamgames.com/doc/gettingstarted/faq)) | 10 to 15 business days (Onboarding) | 15 business days; the FAQ says a recently issued taxpayer number can take up to 30 days |
| Page and build review | 1-5 days (Steam Direct, Onboarding) | Typically 3-5 business days, and plan 7 ([Review Process](https://partner.steamgames.com/doc/store/review_process)) | Request review 7 business days before each go-live |
| Text on a capsule | The name only ([Store Graphical Assets](https://partner.steamgames.com/doc/store/assets/standard)) | Artwork, the name and any official subtitle ([Graphical Asset Rules](https://partner.steamgames.com/doc/store/assets/rules)) | The name only |

- **Documented.** The fee is $100 per product by any method except Steam Wallet, not refundable, and recouped in the payment made after the product has $1,000 adjusted gross revenue.
- **Documented.** A new product needs a public coming-soon page for at least two weeks before release, after the store page is reviewed and approved. The [Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) must be completed before page and build go to review.
- **Documented.** The build must start properly on every operating system listed on the store page, listed features must exist, and in-game transactions must use Steam Wallet, so a build cannot link to other stores that do not offer it. Steam's list of what you shouldn't publish includes applications with advertising-based business models. No Steamworks page read mentions Electron, NW.js or HTML5 wrappers, so a browser game that needs a desktop build has neither a ban nor a confirmation until a build passes review.
- **Documented.** Steam [Subscribers must be 13 or older](https://store.steampowered.com/subscriber_agreement/). The minimum age of a seller is in the Distribution Agreement, which is behind a Steamworks login and was not read; plan on an adult as the account holder and ask Valve.
- **Heuristic.** The earliest release date is the latest of the fee date plus 30 days, the date the page goes public plus 14 days, and the review request plus 7 business days (`calendar-from-the-longest-wait`).

[Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027) dates, read 2026-10-11 and perishable:

| Edition | Runs | Registration closes | Other dates |
|---|---|---|---|
| [October 2026](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october) | October 19 to 26 | August 31, closed | Items were due September 28 |
| February 2027 | February 22 to March 1 (10:00 AM PST) | January 10, 11:59pm PST | Page and demo for the press preview by January 25; all items by February 8 |
| [June 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027) | June 14 to 21 | April 25, 11:59pm PDT | Not recorded |

Eligibility for February 2027: a published, public store page; a publicly playable demo by the start; not a prologue, chapter 1 or otherwise a demo version of existing content available to customers; a release after the festival ends; and a game may appear in only one Next Fest. Whether an already-public free browser version counts as existing content available to customers is not stated. Nobody has asked, so ask Valve before planning around a Next Fest for a game that is already playable on the web.

## Store-asset conformance

**Documented.** Steam's required store assets, from the [standard](https://partner.steamgames.com/doc/store/assets/standard) and [library](https://partner.steamgames.com/doc/store/assets/libraryassets) pages. An August 2024 callout in one capture said larger sizes are accepted and old dimensions no longer are, so check the current templates in Steamworks.

| Asset | Size | Rule |
|---|---|---|
| Header capsule | 920x430 | Name only, logo legible |
| Small capsule | 462x174 (smaller sizes are generated) | Logo nearly fills it and stays readable at the smallest size |
| Main capsule | 1232x706 | Name only |
| Vertical capsule | 748x896 | Name only |
| Screenshots | 1920x1080 minimum at 16:9 | You must provide at least 5 screenshots; gameplay only; mark at least four suitable for all ages or the game may not appear in some front-page places |
| Page background | 1438x810, optional | Ambient, not competing with the page |
| Library capsule | 600x900 | The logo, and a subtitle at most |
| Library hero | 3840x1240 with an 860x380 safe area | Artwork only, no words |
| Library logo | 1280 px wide and/or 720 px tall, transparent PNG | The logotype only |
| Trailer | Up to 1920x1080, 30 or 60 fps, at least 5,000 Kbps; .mov, .wmv or .mp4 | The first video also becomes the 6-second microtrailer; see Trailer anatomy |

The [Graphical Asset Rules](https://partner.steamgames.com/doc/store/assets/rules) limit base capsules to game artwork, the game name and any official subtitle. They exclude review scores, award names or logos, discount copy, calls to action such as "Wishlisting now available", promotion of another product and any other text. Text for a major update is allowed only in a temporary Artwork Override, localized to the game's languages. Capsules need a readable name or logo, accurate dimensions and PG-13 art. A game that breaks the rules can lose store visibility and eligibility for official sales and events. Neither Valve page says whether a tagline counts as an official subtitle, so plan title only on every store capsule.

Screenshots must show gameplay: no concept art, pre-rendered cinematic stills, awards, marketing copy or written descriptions; menu screens only if they are a unique part of the game. A crop of a title screen with a tagline and Start, Load and Settings buttons fails the capsule rule, and as a screenshot it passes only if that menu is a unique part of the game. The [review](https://partner.steamgames.com/doc/store/review_process) also asks that the page list only features available at launch.

- **Before submitting.** Every capsule is the exact size above; the name is readable at 462x174; no capsule carries a tagline, score, award or call to action; at least 5 gameplay screenshots, at least four flagged all-ages; the first trailer is mostly gameplay; the page lists nothing the build lacks; localized text matches the languages the game supports.
- **Other venues.** itch.io wants a [315:250 cover](https://itch.io/docs/creators/getting-started), 315x250 at least and 630x500 better, and recommends 3 to 5 screenshots. Poki's [player fit test](https://developers.poki.com/guide/how-testing-works) needs a thumbnail, and [Game Jolt](https://gamejolt.com/help-docs/creators/add-game) asks for a 16:9 thumbnail of at least 588x331.

## Trailer anatomy

**Documented.** Steam shows the first two valid trailers before any screenshot, and Valve [highly recommends](https://partner.steamgames.com/doc/store/trailer) the first be primarily gameplay, noting that a customer may give a game less than 10 seconds or watch without audio. Steam builds a 6-second microtrailer from six 1-second clips of the first video, and it cannot be customized. A custom poster must be a 1920x1080 frame from the video, and a game cannot be released while a trailer is converting.

**Measured.** Two samples of comparable cozy and farming games on Steam, read 2026-10-10: the first (page-lead) trailer on each of 27 pages, and 17 trailers of 16 of those games read frame by frame. The page-lead lengths in seconds (n = 27), sorted: 17.8, 29.5, 44.7, 48.2, 49.3, 54.7, 54.9, 56.6, 60.0, 60.1, 60.7, 61.0, 64.6, 67.8, 68.5, 70.0, 78.4, 80.0, 80.3, 82.5, 82.8, 83.0, 84.2, 92.0, 102.3, 102.8, 182.0.

| Measure | Result | Sample |
|---|---|---|
| Page-lead trailer length | Median 67.8 s, quartiles 55.75 and 82.65 s, range 17.8 to 182.0 s; 18 of 27 over 60 s | n = 27 pages |
| Coded trailer length | Median 80 s, range 48.2 to 182.0 s | n = 17 trailers of 16 games |
| Gameplay within about 5 s | 11 of 17 trailers (10 of 16 games); six open on a studio card, a rating card, a logo or a cutscene | n = 17 |
| Average shot | Median 3.8 s; 1.7 s to 14.6 s | n = 17 |
| Premise captions (short second-person lines) | 8 of 16 games; none of the polished 3D trailers | n = 16 games |
| End card | 7 availability lines, 3 launch dates, 3 logo only, 1 "coming soon", 1 verb-first "wishlist", 1 URL, 1 none | n = 17 |
| Loudness | -9.9 to -25.6 LUFS, median -14.1 LUFS | n = 17 |

Limits: the 27 mix launch, teaser, update and sales trailers, so the median is not a launch-trailer benchmark. The structure sample coded some trailers that are not the page-lead one, so the gameplay split moves by about one game depending on which trailer is coded (one game's page-lead trailer opens on gameplay while the one coded opened on a rating card). Cut counts are floors from scene detection, shot lengths and captions were read by eye, music was not heard, only its presence and loudness, and which trailers are the most instructive is a judgment, not a measured effect. Nothing here says what a trailer did for wishlists.

**Heuristic.** Defaults drawn from the sample, to change with evidence: show gameplay inside the first 5 seconds; make it work muted, with one or two short caption lines that carry the premise; end on availability, a date or a verb-first wishlist line; skip a rating card or studio card as the opener; start from the 55 to 83 second middle of the sample. A video tool's generic rules can disagree: a 60-second limit would flag 18 of the 27 page-lead trailers and a verb-first call to action would flag 15 of the 16 games coded, so override them for a store page.

## Measuring a game with no analytics

A static game host gives no visit counts, and a game that sends nothing has no counters. The answer is to read what each venue measures, tag the links the venues read and record the rest by hand.

- **Documented.** GitHub's [Traffic graph](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository) shows full clones, visitors from the past 14 days, referring sites and popular content for a repository, to people with push access. The two GitHub Pages documentation pages checked describe no visit analytics, so "Pages has none" is an inference from that silence, backed only by a 2020 community answer that the Insights tab shows repository traffic, not the Pages site. The plugin's GitHub adapter reads the repository, not the site (see docs/CLI.md). The host also has a soft bandwidth limit of 100 GB a month, which a heavy first-visit download can use up, so measure the weight as well as the visits.
- **Measured.** A `?utm_` query on one static game survived unchanged in the address bar after load, online and in an offline reload, and the game ignored it, so the tag was visible to nobody. A tag counts only where a venue or a script reads it.
- **Documented.** Safari deletes a site's script-writable storage after [seven days of Safari use without interaction](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) on the site; home-screen web apps have their own counter. A day-7 return signal kept in local storage can vanish.

| Venue | Its own dashboard gives | It cannot give |
|---|---|---|
| itch.io | [Views, downloads and purchases](https://itch.io/docs/creators/getting-started), with [referrers](https://itch.io/updates/referrers-and-share-buttons) (a 2013 post, so confirm the screens) | Play sessions, completion, return |
| Steam | [Wishlist additions, deletions and purchases](https://partner.steamgames.com/doc/marketing/wishlist/reporting) for the previous day; [UTM visits](https://partner.steamgames.com/doc/marketing/utm_analytics) and conversions within 72 hours of the click | Visits by people not logged in to Steam, so tracked traffic is a lower bound |
| CrazyGames | Average play time, Day 1 retention (players who return the day after their first session) and conversion (play at least one minute) | Tagged visits, and returns beyond Day 1 |
| Poki | A player fit test of 500 players that measures playtime only, then a web fit test of click-through, time on page and conversion to play | Your own analytics: Poki blocks [external requests](https://developers.poki.com/guide/external-resources-policy) by default |
| Newgrounds, Game Jolt | Views, votes, follows and ratings on the page, with names the pages do not define | Anything beyond attention; copy the label you read |

Record each reading under that venue's own definition and never add one venue's counts to another's (`venue-dashboards-first`). For your own first sessions and returns, record `plays`, `starts` and `returns` with one cohort and window, and read `returnRates` in `marketing report` (see docs/CLI.md, Game metrics, time and rates).

**Children.** Decide the audience before choosing measurement. Under [COPPA](https://www.ecfr.gov/current/title-16/part-312/section-312.2), personal information includes a persistent identifier that can recognize a user over time and across sites, such as a cookie value, an IP address or a device identifier, and whether a service is child-directed weighs marketing materials and plans. The [amended rule](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) took effect June 23, 2025 with a compliance date of April 22, 2026. Steam accounts and [itch.io users](https://itch.io/docs/legal/terms) must be 13 or older, but an HTML5 game plays in a browser with no account, so an account age gate does not protect a page. YouTube makes the [made-for-kids setting](https://support.google.com/youtube/answer/9528076?hl=en) the creator's responsibility, and [Google Play Families](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) limits advertising SDKs and the advertising ID for apps aimed at children. Whether the IP address a static host logs counts when the game itself collects nothing is a question for counsel; the UK Children's Code and GDPR Article 8 were not researched.

**Measured.** One browser game made 525 GET requests, all to its own host, set 0 cookies and had 0 local storage keys until the player chose sound. That is the baseline an analytics choice changes.

Three ways to measure, in the form that an owner can choose between:

- **First-party aggregate counters** with no identifier, counting events. Time: 4 to 8 hours plus somewhere to receive the counts (a crew estimate, not a measurement). Risk: any identifier you add re-opens the children question, and Safari storage limits affect a local return signal. Complexity: one endpoint to host. Best practice: privacy by design. Maintainability: one more service to keep running.
- **A third-party privacy analytics script** at page level. Time: an hour or two. Risk: the vendor's terms for child-directed use were not evaluated. Complexity: low. Best practice: acceptable where the audience is not children. Maintainability: a vendor dependency, and no chapter or day-1 funnel.
- **Venue dashboards only.** Time: none. Risk: first-session and return are unmeasurable on your own site, so a gate that needs them cannot pass. Complexity: lowest. Best practice: weak for retention. Maintainability: nothing to maintain.

## AI-assistance disclosure

**Documented.** What each venue asks.

- **Steam.** The Content Survey's [generative AI part](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) is about content that ships with the game and is consumed by players, such as artwork, sound, narrative and localization. It says efficiency gains from AI-powered development tools are not its focus. Pre-Generated is content made with AI tools during development. Live-Generated is content made while the game runs and also needs guardrails described. Valve evaluates AI output like any other content and holds the developer to the promise that the game is non-infringing and consistent with its marketing materials. Live store pages show the developer's own text in an AI Generated Content Disclosure section (observed).
- **itch.io.** The [quality guidelines](https://itch.io/docs/creators/quality-guidelines) ask creators to tag generative AI accurately; self-contained algorithms such as procedural generation and dynamic music need no tag. The field has four kinds: graphics, sound, text and dialog, and code, and a yes puts the page on the AI Assisted browse page ([staff post](https://itch.io/t/4309690)). The guidelines also list projects predominantly created by algorithms or AI with minimal human intervention among content that may be removed from browse and search, and say AI use should be clear in the description, so the page needs a human-curation story as well as the tag.
- **Newgrounds.** The [game guidelines](https://www.newgrounds.com/wiki/help-information/terms-of-use/game-guidelines) say not to share games generated via an AI prompt, to disclose AI use in the author commentary, and that AI-assisted work may be removed at its discretion. [Poki](https://developers.poki.com/guide/content-player-safety) asks an AI-heavy game to show its own perspective and which tools it used, and CrazyGames asks for [original content](https://docs.crazygames.com/requirements/gameplay/).
- **Gatekeepers.** [Wholesome Games](https://wholesomegames.com/) says it stands against AI-generated art and its publishing form asks whether generative AI was used; [Comfy Cozy Gaming](https://www.comfycozygaming.com/2026/07/31/cozy-games-coming-august-2026/) says in one roundup that it does its best not to highlight cozy games that use generative AI at any level of development or marketing. [Kotaku](https://kotaku.com/opening-night-live-2026-genai-slop-games-geoff-keighley-2000728477) reported developers who had not disclosed on Steam until they were caught, so concealment is the larger risk.

**Where the venues differ.** Steam does not make efficiency tools its focus; an itch.io staff reply says code synthesized by a large language model counts as generative AI content, and asks creators to use their judgment. A statement written for one venue can misjudge the other's Code box, so answer each from its own text.

**Measured.** Audience sentiment differs by who was asked, and none of these samples is a cozy or casual audience.

| Population | Result | n and limits |
|---|---|---|
| Steam players, [GameDiscoverCo panel](https://newsletter.gamediscover.co/p/what-do-steam-fans-really-think-about), June 25 to July 2, 2026 | 43% have no major issue buying a game with an AI disclosure, 26% neutral, 31% negative; 8% would refuse to buy; 56% say AI coding helpers should be disclosed and 8% disagree; 17% believe developers fully disclose | About 3,800 respondents from a panel of about 16,000 that the publisher calls more committed than the average Steam player; the 8% denominator is reported as all respondents by one write-up and as a share of the negatives by another |
| Core gamers, [Quantic Foundry](https://www.gamesmarket.global/quantic-foundry-most-gamers-are-negative-about-the-use-of-gen-ai-in-video-games), October to December 2025 | 85% negative toward Gen AI in games, 63% at the most negative option; AI quests 77% and dialogue 83% negative; Story and Design motivations correlate negatively (r = -0.12 each) | 1,799 respondents: 74% core, 21% hardcore, 5% casual; 90% PC; aged 13 and over; read through a secondary write-up |
| Reviews of Steam games that disclosed, [arXiv preprint](https://arxiv.org/abs/2608.11539) | Lower recommendation rates and more negative sentiment than procedural-generation games; players read it as low developer investment | 508,192 English reviews; abstract only; not peer reviewed |
| Steam releases, January to October 2025, [Game Oracle](https://www.windowscentral.com/gaming/pc-gaming/ai-game-development-stigma-study) | Disclosing games averaged 4 first-month reviews against 7; about 53% fewer reviews in its model, with large drops for established studios and little for inexperienced ones with no marketing budget | Almost 10,000 releases; a vendor model reported by a news site; the cause is not established |

**Heuristic.** Build an inventory of what ships (art, sound, text and dialogue, code, localization), mark each AI-assisted or not and say what a person chose, edited or approved, then answer every venue from that one inventory so the statements agree and are refreshed when content changes. Disclose plainly and specifically, do not lead with it, and do not go quiet. To learn how your own audience reacts, ask outside players unprompted before and after they are told, and read the first 20 store comments; no source read measures that.

## Name and trademark check

**Heuristic.** Treat the name as a gate before any store fee, capsule or trailer, because all of them are spent against it. This is marketing prior-art research, not legal clearance.

1. Search the exact title on each store you will list on (Steam, itch.io, Google Play and the App Store), and record the query and the date. Note which listing comes first.
2. Search the [trademark register](https://tmsearch.uspto.gov/) in a browser for the exact words, close spellings and sounds, and for the classes that cover game software and entertainment or education services. Automated readers return no results even for a known mark, and this covers US federal marks only.
3. Check domains and handles on the sites and platforms you will use, with the registry itself rather than a redirecting lookup, which can return a false "not found".
4. Check near titles: a similar name in your genre or on your stores can confuse search and players even where the exact name is free.
5. Decide: keep, add a distinguishing subtitle, or rename, before the fee and the assets. A same-name game, a live registration of the same words in an adjacent class or no free handle is a decision for the owner and counsel.

In one dry run an exact-title search found a game with the same title on Steam (2021, 16 reviews), three itch.io pages and a Google Play app, and a live US registration of the same words in a service class for a non-game program. Whatever a lawyer concludes, the older game was listed first in store search, so the collision splits search, wishlists and reviews.

## Base rates and tag counts

A launch plan needs the odds of the niche, and a tag count is only as good as its query. **Measured.** Steam's tag search for Farming Sim plus Space returned 18 games sorted by Reviews_DESC, which silently drops games with fewer than 10 reviews, 30 sorted by Released_DESC (released games only) and 60 by relevance (which includes unreleased pages). A first count of 33 Farming Sim plus Space-or-Sci-fi games with a median of 48 reviews became 53 released games, 44 of 53 with under 100 reviews, median 21 and one with 1,000 or more, under a second sort. The direction survived and the headline did not. Record the [query, sort and date](https://store.steampowered.com/search/?tags=87918%2C1755&category1=998) with every count (`base-rates-need-a-fixed-denominator`), and clean the set by hand, since tag searches return unrelated titles.

- **Estimate, not a measurement.** Reviews are not sales. A convention multiplies reviews by 30 to 55 to get owners, and the top of that range is one developer's reported ratio of 350,000 units on 6,279 reviews. Treat the result as an order of magnitude from a data vendor's formula.
- **Measured.** 18 paid comparables had a median list price of $19.99 and a range of $6.99 to $29.99. It describes the niche, not a price your game can hold.
- **Unsourced numbers.** A pair of 14-day wishlist bands in one plan (270 to continue, under 150 to stop) had no source and borrowed a festival yield. Write a threshold from a measured denominator or call it an owner decision.

## Readiness gates

**Heuristic.** A gate is a check with a number. Each pass criterion below is an example: its source column says whether the number is a documented limit, one measured on a project, or the owner's to set. Record one with `marketing put gates`, set it `passed` only with the evidence that shows it in `evidenceIds` and `waived` only with a reason in `notes`, and let initiatives wait on it with `dependsOn`; `marketing plan` shows what is blocked.

| Gate | Pass criterion | Where the number comes from |
|---|---|---|
| Name | 0 same-name live listings in the exact-title search of each store you will list on, and 0 live registrations of the same words for games, or a recorded decision to add a distinguishing subtitle | Owner decision |
| Truth sheet | 0 differences between the pinned build and every number in the README, the About page, the store copy and the trailer captions (chapter count, download size, price, platforms) | Measured: a diff of the copy against the build |
| Pinned build | 1 build hash named identically in the trailer capture, the screenshots and the store build, unchanged through the test window | Owner decision |
| Outside playtest | At least 5 of 8 outside players finish the first session in one sitting | Owner decision: 5 of 8 is an example, not a benchmark |
| First-session weight | Initial download to first gameplay at most 50 MB and the first screen within a time you set on the slowest device you target | Documented: CrazyGames' initial-download limit, 20 MB for its mobile homepage |
| Store assets | 0 assets off the sizes above, 0 capsules with text beyond the name, at least 5 gameplay screenshots of 1920x1080 or more, at least 4 flagged all-ages, trailer at least 5,000 Kbps | Documented: Steam's asset pages |
| Steam clock | Fee paid at least 30 days before the target release, coming-soon page public at least 14 days, review requested at least 7 business days before each go-live | Documented: the longest figure Valve states |
| Measurement works | 1 test play and 1 test day-1 return from a clean device appear in the dashboard or counter within 1 day, and the tagged link shows in at least 1 venue's dashboard | Owner decision |
| Privacy | A fresh-profile network log shows 0 third-party origins and 0 cookies before and after play, or a counsel-reviewed stance is recorded | Measured: one game logged 525 requests to 1 origin and 0 cookies |
| AI disclosure | 1 inventory of shipped content marked AI-assisted or not per class, and 0 venue answers that contradict it | Owner decision |

Weight is worth measuring on the real build. One game transferred 4.97 MB to reach its first screen and about 94 MB more in the background, with no prompt, because an offline pack downloaded on every first visit; at GitHub Pages' soft 100 GB a month that is about 1,000 first visits as an upper bound (100 GB divided by about 99 MB), before returning visitors fetch a new pack after each deploy. A first-session-weight gate exists to catch that before traffic arrives.

```json
{"id":"assets","projectId":"my-game","name":"Store assets conform","criteria":"0 assets off Steam's sizes, 0 capsules with text beyond the name, at least 5 gameplay screenshots of 1920x1080 or more, trailer at least 5,000 Kbps","status":"open"}
```

## What this guide does not cover

Epic, GOG, console and mobile review beyond the fees above; Kongregate, whose developer pages sit behind a login and a bot challenge; the revenue shares of CrazyGames and Poki, which their pages leave to the agreement; what wrapping a web game for Steam costs; the UK and EU rules for children's data; rules for gifting copies to creators; localization. Steam's Distribution Agreement and the Content Survey questions are behind a Steamworks login. Every date and figure above was read on 2026-10-10 or 2026-10-11 and some will have changed.
