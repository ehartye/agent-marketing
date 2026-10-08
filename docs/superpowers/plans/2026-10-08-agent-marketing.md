# Agent Marketing implementation plan

**Goal:** Deliver the plugin described in the adjacent design with verifiable CLI, monitoring and browser workflows.

**Architecture:** One validated ledger and shared analysis module power every entry point. Research and skills are packaged with the runtime; the wiki records evidence and project intent.

**Tech stack:** Node 24 native ES modules, HTTP, fetch, filesystem, node:test; browser HTML/CSS/JS.

Execution is inline under existing authorization. Research perspectives are delegated as required by wiki-discover; no implementation teams are needed.

- [x] Ledger (`src/schema.mjs`, `src/store.mjs`, `tests/store.test.mjs`): write tests rejecting dangling IDs, negative counts and conflicting revisions; observe failure; implement validated atomic merge and locking; verify persisted state after rejected operations.
- [x] Analysis (`src/analysis.mjs`, `tests/analysis.test.mjs`): test empty/zero denominators, incompatible time windows, repeated snapshots, low sample uncertainty and observed bottleneck advice; implement intervals and evidence-linked reports; compare hand calculations.
- [x] CLI and monitoring (`src/collectors.mjs`, `scripts/marketing.mjs`, `tests/cli.test.mjs`, `tests/collectors.test.mjs`): test full temporary-workspace journey and API fixtures, partial failure and stable collection IDs; implement commands and bounded fetch; run live HN/GitHub reads.
- [x] UI (`src/server.mjs`, `ui/`, `tests/server.test.mjs`): test data/edit/import routes, conflict and Host/Origin rejection; implement working dashboard; verify browser interactions at desktop/mobile and save screenshots.
- [x] Research/skills (`craft/`, `library/`, `skills/`): independently grade candidate sources, capture and ingest supported claims; write references and craft guides; compare realistic with/without-skill runs and inspect triggers.
- [x] Packaging (`scripts/setup.mjs`, `scripts/run-managed.mjs`, `.claude-plugin/plugin.json`, `tests/runtime.test.mjs`): test install/check/launch and changed-content rejection; implement receipt and immutable content fingerprint; validate the shipped copy.
- [x] Completion (`README.md`, `scripts/check.mjs`, wiki authored pages): exercise every documented command, check skill/resource/source targets, run tests, review changes, document actual architecture and roadmap, commit feature work and wiki main separately.
