# Social channel modules: TikTok, Facebook, X

## Goal

Add TikTok, Facebook and X as first-class channels, one at a time, in the same shape Reddit already has: guidance, evidence definitions and a normalized import. The roadmap calls these relatively small additions; this spec fixes what "a channel module" contains so each one is mechanical and checkable.

## Non-goals

- Live API adapters, OAuth or credentials. Those belong to the provider-module work and need a real campaign need first.
- Posting, scheduling or outreach automation.
- Claims about reach or effectiveness. Guidance describes how to test a channel, not that it works.

## What a channel module contains

Each channel changes the same six places, so review is a checklist:

1. `library/channels.json`: one entry in the existing shape (categories, audiences, hours, cost, approach, measure, risk, complexity, maintainability, `referenceIds`).
2. `craft/references.json`: at least two dated primary sources per channel (platform rules or ads/commercial-content policy, plus the platform's own metric definitions). Each carries `quality`, `checkedAt`, `supports` and `limit`, as `scripts/check.mjs` already requires.
3. `craft/channels.md`: a section covering audience fit, native creative formats, what counts as evidence, and rule and spam risk. Every policy claim cites a reference ID; planning inferences are labeled as inference.
4. `src/schema.mjs` channel list and the channel list in `docs/CLI.md`. Existing workspaces stay valid because the list only grows.
5. An example import, `examples/observations-<channel>.csv`, plus a test that imports it and checks the definition field.
6. A one-line mention in `skills/market-strategy/SKILL.md` where channels are listed, if it names them.

## Evidence definitions

Channel-native counts are not interchangeable: views, impressions, reach and plays differ per platform, and attention is not first use, retention or payment. Each module's example import records the platform's own metric name in `definition`, and the existing compatible-metrics rule keeps different definitions from being summed or trended together. No new metric names are added unless the platform's primary measure fits none of the existing ones; that case is decided in that channel's research, not here.

## Per-channel starting hypotheses

These are things to confirm or refute from official sources during each channel's research. None is a claim yet.

- **TikTok:** short vertical video with a link in profile or bio; likely fits games and creative projects; commercial-content disclosure and age-related rules probably matter for family-made and children's content.
- **Facebook:** Groups and Pages; organic Page reach is likely low, so group rules and community fit dominate; Meta's ad and commercial rules apply to promotion.
- **X:** short posts with links and replies in builder communities; API access and automation rules have changed repeatedly and are the main maintenance risk.

## Order and delivery

TikTok, then Facebook, then X. TikTok is the largest gap (a distinct creative format and attention-versus-use problem); X goes last because its policy surface changes most and benefits from the pattern being settled.

Each channel is its own branch and squash-merged PR, so one can be dropped without touching the others. The three together are released as 0.3.0.

## Acceptance (per channel)

- `npm run check` and `npm test` pass, including the new import test.
- Every policy statement traces to a reference with a `checkedAt` date; unreachable or degraded sources are said so in `limit`.
- A workspace saved before the change still validates.
- The wiki roadmap and architecture are updated in the same operation as the release.
- One bounded smoke check: the strategy skill, asked about a project that suits the channel, recommends it with cited rules and does not invent a posting-automation step. This is not evidence of marketing effectiveness.

## Upkeep

Policies drift. Each reference carries `checkedAt`, and the existing stale-reference practice applies. No scheduler is added.
