# Durable strategy and campaign briefs

Implemented on `feat/durable-marketing-briefs`, based on the campaign-desk cohesion branch. Not included in published 0.1.0.

## Resolved gap

The full strategy now has a durable home on `projects[].strategy`; each initiative's campaign brief lives on `initiatives[].brief`. Both are `{markdown, updatedAt}` documents inside the active workspace. Project and initiative IDs supply the association, without external file pointers. The strategy and campaign skills save and read back their full output and report where to reopen it.

The desk exposes saved strategy and campaign brief disclosures and Markdown downloads in Decide & plan. Missing briefs stay visibly missing; historical reasoning is not fabricated. Markdown is displayed as escaped text, including any HTML it contains. External assets are not embedded or bundled.

The CLI adds `document save/show/export`. Saving requires the current workspace revision and uses the existing validated atomic store. Full JSON backup/restore includes document text; CSV remains observation-only. Documents are limited to 100,000 characters. Existing ledgers need no migration, and updated-runtime imports of legacy records preserve document fields when omitted. Older runtime binaries do not provide this preservation guarantee. An exported Markdown file is an editable copy, with explicit resaving; document version history is not added.

This chooses one authoritative atomic store over separately linked Markdown files. The tradeoff is larger JSON and no direct file synchronization, while avoiding missing links, two-file commit problems and incomplete backups.

## Verification

- Native suite: 35 tests pass, including malformed-document rejection, missing document handling, unrelated-record preservation, stale-write rejection, fresh-process readback, complete JSON backup/restore and HTTP restart/download behavior.
- Resource checks validate all nine skills and linked resources. Both edited skills pass the skill-creator validator. Library metadata remains 139–209 description characters and 17–21 lines per skill; no Unicode tag/zero-width markers were found in the bounded structural scan. This is not a safety certification.
- Browser: opened saved project and initiative documents, downloaded byte-exact Markdown, reloaded, downloaded the complete workspace, imported it into a separate empty desk, and reopened both documents. Changing project selects the correct strategy. Keyboard disclosure controls work.
- Browser: missing-brief directions are truthful; HTML/script/image text produces no executable elements; long unbroken text fits 320px; mobile and desktop document views were inspected. No full assistive-technology audit is claimed.
- Independent code review found a destructive export destination edge: writing a Markdown export over the active workspace. The fix checks filesystem identity before writing. A red-then-green regression covers the exact workspace path and a hard-link alias; the reviewer confirmed resolution. The same guard also protects JSON/CSV exports, with a regression for CSV overwriting the workspace. No outstanding findings from the bounded review.

[Saved strategy in the desk](../images/durable-briefs-desktop.png).

## Paired skill evaluation

Four synthetic tasks cover new and revised strategy and campaign work. The with-skill and baseline agents started in the same turn with independent copies of the same fixtures. Both could use the CLI contract; the baseline did not read marketing skill/craft files. Each agent handled four tasks in separate directories, so this is not a fresh-agent-per-prompt study. Artifacts retain actual command output, saved documents and final responses; grading is independent of the two producing agents.

All eight ledgers validate and contain full saved documents matching the generated Markdown. Initial independent scores were 23/24 with skills and 20/24 baseline across six binary criteria per task: persistence, usable honest content, task/constraint consistency, prior-record preservation, evidenced readback/location, and valid revision-aware execution. The baseline deductions all concern missing actual readback command/output in the retained response logs; its saved persistence was independently confirmed. The totals do not measure a general skill advantage.

The with-skill campaign revision failed constraint retention: it kept a one-hour preparation limit but allowed support/review under the larger three-hour project allowance, weakening the existing campaign support cap. The campaign skill now explicitly preserves limits, attribution and stopping rules unless the owner requests changes, and flags conflicts rather than loosening caps. Original artifacts and scores are retained; fresh paired follow-ups check this correction separately.

Both fresh follow-up cases passed 6/6 and retained the original support/preparation cap. Both also retained readback assertion scripts and successful verification output, although their PowerShell transcripts omit native CLI stdout. The correction passes this targeted exercise; the paired result does not establish causation or superiority. All ten final ledgers validate.

The [evidence archive](durable-briefs-evidence.zip) contains prompts, fixtures, briefs, command records, initial and follow-up independent grades, and the final candidate skill/CLI snapshots. It retains the original failure and discloses the transcript limitations.

These selected synthetic exercises do not establish commercial effectiveness, automatic host triggering or safety.

## Separate follow-up: provider connections

The owner requested modular account/credential management by provider. No account manager is implemented here. The wiki roadmap specifies individual provider modules owning setup, auth/refresh, permission checks and collection. A shared Connections view handles listing and lifecycle/status; secrets stay outside the exported workspace behind a credential-store boundary, and sources retain opaque connection references. Adding a provider must not require extending a central multi-key form. Live social adapters remain separate work.
