---
name: market-setup
description: Install or check the managed agent-marketing runtime before using its CLI, after a plugin update, or when the launcher reports a missing or stale installation.
---

# Marketing setup

Resolve the plugin root from this file: two directories above the skill directory. Node 24+ is required. The runtime has no npm dependencies; setup copies verified content outside the plugin cache.

Run `node "<plugin-root>/scripts/setup.mjs" --check`. If missing or stale, run `node "<plugin-root>/scripts/setup.mjs"`, then check again. Require `ok: true` and report the version/runtime path. `AGENT_MARKETING_HOME` can select a managed install directory.

In other marketing skills, `marketing` means `node "<plugin-root>/scripts/run-managed.mjs"`. Use that absolute launcher path; do not install dependencies into the plugin cache.

Smoke-test `marketing help` and `marketing rules measurement`. Initialize a real ledger with `marketing init --workspace <file>`; use a separate path for `marketing demo` because the demo contains synthetic metrics. Existing files are never overwritten by init/demo.

Setup changes the local runtime only. No scheduler, ad account, publishing connection or outreach is installed. Finish when setup check and both smoke commands succeed.
