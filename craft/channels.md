# Channels and approaches

[Channel cards](../library/channels.json) include audience cues, category, effort, cost, risk, complexity and maintenance. `marketing channels <project-id>` orders these with a transparent house heuristic: +3 category match, +2 audience cue, +1 within weekly time or −2 over it. This is a starting hypothesis, not a forecast. Audience membership, format quality and current local norms matter more than the score.

| Project and situation | First hypothesis to test | Evidence that changes the choice |
|---|---|---|
| Developer tool with a working example | GitHub docs/example, then an eligible Show HN | Successful installs, useful objections, repeat use |
| Playable game with readable genre/payoff | Player community or video of the actual loop | Qualified plays, first-round completion, return cohort |
| Educational app | Intended learners/parents and useful teaching examples | Observed learning task, accessibility, repeated use |
| Professional workflow app | Specific professional community and before/after demo | Completed workflow and credible interest at a price |
| Existing users | Opt-in email or the community they already use | Reactivation, useful replies, unsubscribes |

These recommendations are original planning inferences. No bundled source proves a universal best channel. SEO introduces a longer feedback lag; a launch community can respond quickly but needs active support. A new Discord server adds ongoing moderation before demand is established. Paid promotion adds spending risk and requires a useful outcome measure before scaling.

Check [Show HN eligibility](https://news.ycombinator.com/showhn.html): substantive maker work people can try, rather than a signup-only landing page or a quickly generated one-off. Inspect each community's own rules as well as [Reddit's spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam). Do not turn the CLI into a promotion bot. [Product Hunt](https://www.producthunt.com/launch) permits maker launches but prohibits upvote solicitation. Platform rules and access can change; check them on the actual planning date.

## TikTok

TikTok suits a game, creative project or app whose payoff shows in a few seconds of real play or use: a short vertical clip with one tryable next step in the profile link or caption. Treat that fit as a planning inference to test, not a finding. Parent and learner audiences are reachable, but do not target or collect data from children; read the platform's age and minor-safety rules before building a campaign around young viewers.

- **Rules.** A post that promotes a brand, product or service needs the [content disclosure setting](https://ads.tiktok.com/help/article/about-the-content-disclosure-setting-for-creators) on; the page notes that legal requirements vary by country and that the US FTC Endorsement Guides apply. Confirm in the app how promoting your own app is labelled. Bots, bulk automation and bought or traded engagement are prohibited and manipulative engagement bait can lose For You eligibility ([integrity policy](https://www.tiktok.com/safety/en/policies-and-engagement/integrity-authenticity), whose live text you should read before relying on exact wording). Do not run a posting bot.
- **Evidence.** Record the platform's own measure in `definition`. TikTok's [ads-side definitions](https://ads.tiktok.com/help/article/video-play?lang=en) count video views as playback starts with replays excluded, and "video views at 100%" as full-length plays; in-app creator analytics use different terms and may not match, so copy the label you actually read. Compare watch measures only between videos of similar length. Views and full plays are attention. A tagged profile-link visit is the first step toward use; first use, return and payment still come from your own product analytics (see [the example import](../examples/observations-tiktok.csv)).
- **First test.** One clip format, three to five videos over two weeks, one tagged link, a stated stopping rule. A cluster of views with no tagged visits is a finding about the clip or the link, not a reason to buy engagement.
