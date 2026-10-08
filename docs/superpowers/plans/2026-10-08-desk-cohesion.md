# Campaign desk cohesion and usability

Goal: a family studio can choose a project, review its next decision, update a campaign, review multiple reactions without losing work, and import/collect results with clear scope.

Keep native HTML/CSS/ES modules, loopback serving and the evidence schema. Keep the instrument-desk identity: ink #172c46, paper #edf3f7, blue #2459a8, yellow #f3ca52, teal #147d78 and error #ac4355; neutral border/surface tokens support these. Trebuchet MS provides headings, Verdana body copy and Consolas data labels. The signature remains the three-part evidence → next test → decision strip. Reduce competing ornament and let the actual project objective replace the generic studio motto.

Layout: project context → scope controls → five journey tabs → focused content. On phones, controls stack and the decision strip reads in sequence. Campaigns retain initiatives, first use, activity and channel guidance; collected readings, imports and monitoring form a Results & sources view. A second alternative, a permanent sidebar, would consume mobile space and add navigation machinery without helping these five small views. A full framework migration would increase dependencies and maintenance for no required capability.

Plan and verification:

- [x] Reproduce draft loss, keyboard import failure and unclear data-action scope in the current browser; retain a baseline screenshot.
- [x] Extract shared presentation helpers, request/loading state, chart rendering and focused journey renderers. Keep server assets explicitly allowlisted; test serving every module and rejecting unknown paths.
- [x] Preserve reaction drafts across refresh/filter/save, restore focus, serialize writes, and distinguish conflict/retry/import errors. Verify real browser flows and race/failed-load behavior.
- [x] Use accessible tabs, clear action names, bounded busy/status feedback, meaningful empty states and truthful date/scope summaries. Verify keyboard, empty, loading, failure, long text and 390px/1440px layouts.
- [x] Run native tests and resource checks, inspect screenshots, obtain independent review, and document the as-built module boundaries and verified journeys in the wiki.

See [verification and screenshots](../../evaluations/ui-cohesion-2026-10-08.md). Strategy/campaign document persistence and modular social support are recorded as follow-ups; the UI pass is unreleased.

Channel fast follows: channel cards/campaign guidance and normalized imports fit the current evidence contract. TikTok, Reddit, Facebook and X live adapters need platform-specific permissions, paging, rate/cost handling, stable IDs and partial-failure tests. Keep that work in the collector/schema layer; UI views consume normalized observations/reactions/sources. Automatic posting and credential setup are separate work. This pass does not add those integrations.

References: [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Browser checks exercise these patterns; they do not certify complete accessibility conformance.
