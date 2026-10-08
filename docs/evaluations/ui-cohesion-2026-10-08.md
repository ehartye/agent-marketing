# Campaign desk cohesion and usability review

Implemented on `refactor/campaign-desk-journeys`; not included in the published 0.1.0 release. The pass keeps native HTML/CSS/ES modules, the evidence schema and the desk's ink, blue and yellow identity. The project objective replaces the generic header motto. The evidence → next test → decision strip remains the visual anchor.

## Journeys and module boundaries

Five tabs separate Decide & plan, Review feedback, Research fit, Compare tests, and Results & sources. Data collection, import and downloads now have a dedicated home with explicit workspace-wide scope. Date filters explicitly apply to readings and feedback, while plans and research remain visible.

| File | Responsibility |
| --- | --- |
| `ui/app.js` | Events, selection, tab navigation, busy/error state and serialized writes |
| `ui/state.js` | Complete current request snapshots, stale-response protection and review drafts |
| `ui/shared.js` | Escaping, formatting, links and focus helpers |
| `ui/chart.js` | Existing metric-series selection and chart rendering |
| `ui/views/*.js` | One focused renderer per journey |
| `src/server.mjs` | Explicit module asset allowlist; existing API boundaries |

No framework, dependency, collector or ledger schema was added. The managed installer already copies the UI tree recursively.

## Verified behavior

- Reproduced the original defect: saving one reaction erased another unsaved theme and lost keyboard focus. The revised desk retains the other draft after saving and refreshing, and restores focus to the saved control.
- Drafts survive a revision conflict. After external source text changes, refresh preserves the draft and displays a re-review warning; a subsequent explicit save succeeds. Drafts remain in the current browser tab; leaving warns when edits remain.
- Tabs use associated tablist/tab/tabpanel semantics, one tab stop and Left/Right/Home/End navigation. Import is a native keyboard-operable button.
- Invalid imports expose an error and can be retried with the same file. Successful imports return focus to Import results. Oversized imports are bounded at 2 MB.
- Initiative status persists and focus returns to its selector. Invalid date ranges and network failure hide stale panels; correcting dates or retrying restores the selected view. Project selection and the active tab survive browser reload through the URL.
- Empty workspaces provide a starting path. Collection stays disabled without registered sources. Workspace-wide exports and collection are explicitly distinguished from the visible filters.
- All five views were exercised at 390px; empty and long-content fixtures were also checked at 320px. Final checks found no page-wide horizontal overflow. Long unbroken project text initially overflowed and drove a wrapping fix. Visible buttons, inputs and selects meet the chosen 44px height.
- Print emulation displays all five journeys. Independent review caught a hidden-selector priority conflict; the corrected print rule was rechecked in the browser.
- Native suite: **31 passed, 0 failed**. Resource check: **9 skills, 25 references, 16 rules, 10 channels** valid. Module-serving checks cover every new asset and reject unknown paths. Managed-install/tamper checks remain passing.

An independent reviewer inspected the diff, ran the native suite and used a separate headless browser for empty-state and print checks. The review also caught a control-order defect that enabled collection without sources; fixed and independently rechecked. Root browser checks covered the additional journeys above. No full assistive-technology audit or marketing-effectiveness claim is made.

## Visual evidence

- [Desktop campaign view](../images/desk-cohesion-desktop.png)
- [Mobile results and storage disclosure](../images/desk-cohesion-mobile.png)

These use synthetic demo records; the earlier release screenshots are preserved separately.

## Persistence and follow-ups

Campaign actions live as `initiatives` in the selected workspace, normally `.agent-marketing/workspace.json` relative to the launching directory, overridable with `--workspace`. Full strategy rationale and campaign briefs do not have required linked storage. They may be separately saved or remain in the conversation. A JSON export preserves the ledger, not arbitrary briefs. The UI now states this limitation.

The wiki roadmap records two concrete follow-ups: project-owned strategy/campaign documents with durable links and reopen/export behavior; and modular TikTok, Reddit, Facebook and X guidance/import support, followed by individually justified live adapters. Neither is implemented by this pass. Live adapters add platform-specific credentials, permissions, reconciliation and maintenance work.

The API still reads workspace/report/advice/channels independently. Concurrent external edits can produce a mixed-revision read group even though the client only publishes a complete current request group. A unified server read snapshot is a separate architectural improvement; revision checks continue to protect writes.

## Guidance

[W3C Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) informed keyboard and semantic behavior. [Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) informed save/progress feedback without moving focus to the message. The wiki reused its existing status-message evidence and captured the Tabs Pattern; that clipping omits the live page's keyboard section, a limitation disclosed in its source summary.
