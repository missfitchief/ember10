> Historical implementation handoff. Its revision, test counts and local paths refer to that stage. For the current audit snapshot, use [EXTERNAL-AUDIT.md](EXTERNAL-AUDIT.md) and [VERIFICATION.md](VERIFICATION.md).

# EMBER10 frontend audit handoff

This iteration continues deployed baseline `61d265ada62703093c575603f5540e202b64f3c2`. The user approved the supplied frontend audit and warm light direction. The existing real-data API, ranking policy, financial worker and accounting contracts are unchanged.

## Ownership and integration

One PC, one repository, separate Git worktrees. `frontend-light` owns the shell, homepage and styling; `frontend-fixes` owns market identity, details, request states, wallet availability and focused tests. The root integrator cherry-picks reviewed commits into `integration/ember10`, publishes `origin/main`, and deploys Vercel. An independent reviewer reads the integrated source and captured browser evidence. Shared progress, decisions, contracts and evidence are in the sibling `EMBER10-light-review` directory; no transfer ZIPs are required.

## Result

- Original warm canvas/coral identity, compact responsive navigation, original ten-budget diagram, and a ten-observation homepage preview linking to the full explorer.
- Prominent prelaunch and inactive rewards, policy-derived holder threshold and separate eligibility/funding/accounting readiness.
- Mint identity on every market row, visible mobile eligibility and details, observed cap/change/volume together, with optional provenance disclosure.
- Catalogue, ranked and search counts have distinct labels. Search and pagination preserve server ranking, snapshot provenance and immutable funded membership.
- Cold loading, refresh, stale, incomplete, empty and unavailable states remain distinct. Valid cached data stays visible during refresh.
- Reward ledger availability is checked before submitting an address. A disconnected ledger permits address format validation only; unknown balances are never zero. Connected lookup failures retain input and offer retry.
- Initial HTML contains canonical, Open Graph and Twitter metadata. The original 1200 × 630 share image reflects prelaunch. `PUBLIC_SITE_URL` controls the HTTPS origin; `scripts/verify-sharing.mjs` checks served HTML and image bytes without requiring JavaScript.

## Preserved rules

EMBER10 uses ten equal purchase budgets and 80/10/10 after bounded direct execution costs. Developer earnings are the available OPS/DEV remainder after recorded costs, obligations and retained reserves. The interface adds no wallet signing, payments, addresses or artificial live status. Historical reference snapshots and test harness controls are never production data or product controls.

## Validation and deployment

Run `npm run build` and `npm test`. Responsive QA covers Overview, The ten, Rewards, My rewards, Transparency and How it works at 320, 390, 768, 1280 and 1440 CSS pixels. Controlled failure/empty/stale fixtures stay outside the repository and deployment. Browser captures are driven by the integrator because the independent reviewer's browser session exposes no surface; the reviewer independently inspects saved images, DOM measurements, code and HTTP evidence.

Before claiming a public fix, deploy the final source revision with `EMBER10_REVISION`, verify that exact revision using `scripts/verify-public.mjs`, compare served assets with the local build, run `scripts/verify-sharing.mjs` against the actual public origin, and inspect the public desktop/mobile UI. The sibling review package records the exact commit, asset hashes, changed files, tests, limitations and deployment result. This document describes the workflow, not an unverified deployment claim.
