# Self-healing managed runtime

## Problem

After a plugin update the first CLI call fails with `E_RUNTIME` until someone runs `market-setup`. The launcher (`scripts/run-managed.mjs`) already detects every stale case through `inspectInstallation`: no receipt, version or fingerprint mismatch, modified runtime. The failure is safe but pushes a manual step onto people who did nothing wrong, and the README has to tell them about it.

## Goal

After an update, the next CLI call just works. Nobody needs to know `market-setup` exists unless something is actually broken.

## Non-goals

- Changing what the runtime contains, how it is fingerprinted, or where it lives.
- Deleting or pruning old releases. Setup deliberately never recursively deletes, and releases are about 1 MB each.
- Repairing a runtime whose files were modified. That stays a visible failure, because tampering or corruption should not be silently overwritten.

## Behavior

`run-managed.mjs` calls `inspectInstallation`. If it is not ok and the case is one the launcher may heal, it calls the existing `installRuntime(source)`, re-inspects, and launches. Otherwise it prints the current `E_RUNTIME` error unchanged.

**May heal:** the receipt is missing, or its version or source fingerprint differs from the source being run. These are the normal after-update cases.

**Must not heal:** the installed release directory exists but its content no longer matches its own fingerprint (modified or missing files), Node is older than 24, or the home directory is not writable. These print the existing error plus the reason.

**Source must be an installed plugin.** Heal only when the source path contains `plugins/cache` and the source has no `.git` entry; I checked that an installed copy has no `.git`. A checkout under development changes its fingerprint on every edit, so healing there would install a new release on every run and, because the receipt is single, would flip it back and forth with the installed plugin. Checkouts keep today's behavior: run `setup.mjs` yourself.

**Output.** Heal progress goes to stderr, never stdout, so JSON from commands such as `channels` stays parseable. One line is enough: `Updating managed runtime to <version>...`.

**Concurrency.** Two launchers can start together (a desk running while a script calls the CLI). `installRuntime` already takes `setup.lock` with an exclusive create and fails if it exists. Healing must wait for a short bounded time for the other install and re-inspect, not fail. A lock left by a crashed install must not block forever: record the pid, and treat a lock whose process is gone as stale. The current rule of never removing a lock automatically changes only for a lock whose pid is provably dead.

**Running desks.** A desk started before the update keeps running from the old release directory. Old releases are never removed, so this stays safe.

## Options

| Option | Time | Risk | Complexity | Best practice | Maintainability |
|---|---|---|---|---|---|
| Keep the error and the hint | None. | None, but every update costs a manual step and a README caveat. | None. | Fails safe but unfriendly. | Lowest. |
| **Heal in the launcher (this spec)** | Small: one branch in `run-managed.mjs`, a lock wait and stale-pid check, tests. | Low to medium. Setup then runs unprompted and copies about 1 MB into `~/.agent-marketing`. The lock logic is the part most likely to be wrong. | Moderate: one more path in a security-relevant script. | Common for managed runtimes, provided it is bounded, quiet and refuses to touch modified content. | A few more cases to keep tested. |
| Plugin hook that runs setup on update | Small, if the host supports it. | Depends on host behavior I have not verified here. | Adds a second trigger beside the launcher. | Runs even when nothing is needed. | Depends on the host. |
| Run straight from the plugin cache, no managed copy | Larger: touches install, launch, receipts and tests. | Medium. The managed copy exists for a reason I could not confirm; do not remove it until that is known. | Less code afterward. | Simplest model. | Simplest. |

Recommendation: heal in the launcher.

## Open questions

- **Why the managed copy exists.** The code and docs say setup copies the runtime "outside the plugin cache", but I found no recorded reason. Please confirm it before building, since the "no managed copy" option depends on it.
- **Installed-versus-checkout test.** The rule above matches the one layout I inspected. If a host layout differs, healing silently stays off for that user and they see today's error, which is the safe direction.

## Acceptance

- After simulating an update (a stale receipt with an installed-plugin source), `run-managed.mjs channels` exits 0 with valid JSON on stdout and one progress line on stderr.
- A modified installed release, an old Node, or an unwritable home still fails with `E_RUNTIME` and a reason.
- A checkout source never heals.
- Two launchers started together both succeed and install once.
- A lock from a dead pid is cleared; a lock from a live pid is waited on, then fails with a clear message after the bound.
- The README and `market-setup` skill drop the "rerun after updates" instruction. `market-setup` stays as the explicit check and repair command.
- `npm test` and `npm run check` pass.
