# Durable strategy and campaign briefs implementation plan

**Goal:** Reopen strategy rationale and campaign briefs after restarting the tool, with complete workspace backup/restore.

**Architecture:** Store optional `{ markdown, updatedAt }` documents on `projects[].strategy` and `initiatives[].brief`. These are backward-compatible record fields within `marketing/workspace@1`, not external file pointers. The existing atomic ledger write and revision check own persistence. Each initiative owns its brief; related initiatives share the project's strategy. Markdown exports are editable copies, not a second authoritative store.

**Stack:** Native Node.js, HTML/CSS/ES modules; no dependencies. Execute inline with test-first validation. Existing feature branch UI is the base; no release or real-workspace migration is part of this change.

External Markdown files plus links would allow direct file editing, but add missing-file, multi-file transaction and backup consistency risks. A new documents collection would require a broader schema contract and migration. Embedded Markdown minimizes current effort and maintenance while preserving portability; it makes the workspace JSON larger and requires an explicit save after editing an exported copy. Documents are bounded to 100,000 characters; existing 2 MB HTTP import limits still apply. External image/asset links are references, not bundled files. This feature stores the latest document, not version history.

- [x] Add meaningful failing tests for document validation, legacy record compatibility, stale-write protection, preservation across unrelated upserts, CLI restart and JSON round trip.
- [x] Implement schema checks and a small `src/documents.mjs` module using the existing store; add CLI save/show/export commands with required save revision. Preserve saved documents when older record updates omit their fields.
- [x] Expose safe Markdown downloads from the local server. Add read/download disclosures beside the project strategy and each initiative; show unsaved state truthfully. Keep Markdown escaped, with no executable HTML rendering.
- [x] Update strategy/campaign skills to save and read back documents and report the durable location. Keep detailed commands in CLI documentation, update demonstration data, and run paired Yoda checks for both changed skills.
- [x] Run native tests/resource checks, verify restart/download/import/conflict journeys in the browser, inspect mobile layout, obtain independent review, and update the wiki architecture and roadmap.

See [verification and retained Yoda evidence](../../evaluations/durable-briefs-2026-10-08.md). Provider-specific account/credential modules are recorded as a separate follow-up, not implemented here.

Success: a strategy and initiative brief saved through the CLI remain byte-exact after restart and JSON export/import; the desk opens/downloads them from their own records; a stale save fails without changing bytes; legacy workspaces load without rewriting; prior briefs survive unrelated full-record updates; updated skills actually persist and read back their output.
