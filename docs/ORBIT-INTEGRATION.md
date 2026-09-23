> Historical implementation handoff. Its revision, test counts and local paths refer to that stage. For the current audit snapshot, use [EXTERNAL-AUDIT.md](EXTERNAL-AUDIT.md) and [VERIFICATION.md](VERIFICATION.md).

# Orbit frontend integration

The supplied frontend patch was applied with `git apply --check` to the existing repository in a separate one-PC worktree based on backend revision `e4e08ca1abed7f2f2008d1067c11dc340fe28d7e`. The patch's original base was `db041a0cd3f986c36504e07288ab7d2b705841b6`; its SHA-256 matched the supplied manifest: `000175f414387454e2674889e41dff8f3aaa3a91bc26526e1b701ab259659f07`. The initial rebuilt JS and CSS matched the supplied build exactly. Subsequent changes below resolve integration findings.

## Product changes

- Warm ivory layout, original flame mark and ten floating market nodes, responsive down to 320 px.
- A compact ten-row homepage, concise 80/10/10 explanation, full secondary market/rewards/wallet/transparency pages and matching favicon/social artwork.
- Current source-ranked observations are deduplicated by mint, preserving duplicate symbols. Animation is illustrative and clearly distinct from funded holdings.
- 45-second non-overlapping polling with a 15-second timeout, unchanged source timestamps on failure and truthful unavailable/empty/stale states. No static market snapshot is used as a production fallback.
- Motion pause, visibility/intersection pause, keyboard dialogs, focus restoration and emulated reduced-motion behavior.

## Independent review fixes

The supplied web files were built against an earlier backend contract. Independent component probes identified and reproduced four integration issues; all were corrected:

1. Available ledger amounts are now converted from explicitly labeled lamports to exact SOL. Missing units or amounts remain Unreported; zero and values beyond Number precision are preserved.
2. Project, settlement and developer-payout labels follow authoritative API fields. Configured/enabled is not represented as a delivered payment. An unreported developer destination is not invented.
3. Current selection and membership in an immutable funded epoch are displayed separately, including overlap of the same mint.
4. A successful empty ranking is distinct from a source outage.

Small labels and primary actions use darker text within the supplied warm palette. This includes the Wallet action, plus its hover state. Backend/API/policy files were not changed during this frontend integration; the prior execution and accounting corrections remain intact.

## Validation

`npm.cmd test`: **215 passed, zero failed/skipped, across 15 files**. `npm.cmd run build`: typecheck and production build passed. Four new actual-component regressions cover the backend-contract corrections; three supplied Orbit tests verify rank, mint identity and changed leaders.

Browser checks passed all six routes at 320, 390, 768, 1280 and 1440 px: **30 layouts without horizontal page overflow**. Keyboard dialog open/close/focus, mobile menu Escape/focus, pause/resume, reduced-motion emulation, changed API ranks updating both visualizations, stale refresh timestamp preservation and initial failure without replacement tokens passed. No JavaScript runtime errors were recorded. Independent source rechecks passed 22 assertions.

The shared `outputs/EMBER10-orbit-review` directory contains exact output, before/after screenshots, controlled browser fixture evidence, independent review and the final deployment verification. These results describe the integrated source; deployment is only established by that separate verification.

## Deployment boundary

Only the read-only Vercel frontend/API entry is updated. It has no signer, financial worker, operator routes or local database. No authoritative backend origin or credentials are added. The 80/10/10 rules, ten equal budgets, default-disabled developer payments and legacy obligations are preserved. Automatic eligibility still requires the provider evidence described in the backend handoff; this visual update does not establish an investable or funded basket.
