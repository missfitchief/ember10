> Historical implementation handoff. Its revision, test counts and local paths refer to that stage. For the current audit snapshot, use [EXTERNAL-AUDIT.md](EXTERNAL-AUDIT.md) and [VERIFICATION.md](VERIFICATION.md).

# DATA-01 handoff — same repository, one-PC worktree

Owner: DATA-01. Branch: `data-01`. Baseline: `e67ed95ff9d6783f4583bc832a33270e26c32ac5`. Canonical integration owner is the root agent; no manual file transfer or ZIP is required.

## Commits

- `a7a7025`: public typed read contract.
- `07b6cf6`: explicit full-universe search/pagination metadata.
- `121c8dc`: production real catalogue integration, removal of hosted demo fallback, ten-asset versioned policy, complete observed fixtures and tests.
- Evidence and this handoff are committed after the implementation so `DATA-FIX-PROOF.json.implementationCommit` can bind the actual code commit without a self-referencing hash. Canonical cherry-pick hashes will differ; the integrator records those in shared orchestration/deployment evidence.

## Shared API contract

`packages/shared/public.ts`, GET `/api/overview?q=&offset=&limit=&view=`. Limits1–100, offset0–999999, query≤100characters, view`all|selection|excluded`. Full catalogue normalization/eligibility occurs before page/search projection. Market ranks remain global when searching. Public identity is independent of discovery and settlement. Decimal values are strings/null; `sourceTimestamp` null is not replaced with fetchedAt. `marketPage` declares result counts and view. `/api/wallets/:address/rewards` never invents zero rewards; it reports unavailable when no ledger is connected. Other legacy public reads remain compatible or explicitly unavailable. Privileged routes and writes are rejected.

The frontend must display source-filtered reported USD market ranking separately from eligible selection and any immutable funded epoch. Current source cannot certify required financial eligibility; selection correctly contains0of10 and commitments are disabled. Candidate addresses remain inspectable. There is no configured project mint or copyable fixture identity. Source failure returns unavailable or dated stale observations. No preview/demo control is added.

## Actual changed files

- `packages/shared/public.ts`
- `packages/integrations/market-data.ts`
- `apps/api/hosted.ts`, `overview.ts`, `queries.ts`, `server.ts`
- `packages/core/model.ts`, `selection.ts`, `money.ts`, `engine.ts`, `approval.ts`
- `apps/worker/main.ts`
- `scripts/test-chain.ts` (explicit historical v1 regression retained)
- `tests/hosted.test.ts`, `market-data.test.ts`, `engine.test.ts`, `fixtures/synthetic.ts`
- `tests/fixtures/ember-catalogue-2026-09-23.json`, `ember-configs-2026-09-23.json`
- `scripts/market-proof.ts`
- `docs/DATA-SCHEMA-MAPPING.md`, `DATA-FIX-PROOF.json`, `DATA-01-HANDOFF.md`

No frontend, lockfile or database migration was rewritten. Existing OPS/DEV transfer behavior and80/10/10 distribution are unchanged. Version2 changes basket dimension to ten equal1000bps budgets. Historical policy1 remains five2000bps; its fixtures and old liabilities are retained. New live commitments require policy2.

## Validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`:5testfiles,57tests passed, including existing PostgreSQL crash/recovery/idempotency, exact accounting and historical five-member cases.
- New PostgreSQL test funds ten equal78,400,000lamport legs under the1SOL receipt/0.02SOLcost fixture; it verifies30holder-credit rows, settlement completion after ten legs and unchanged frozen basket after a later discovery document.
- Data tests cover full real3062row schema,3059source-filtered unique ranks, numeric sorting, deterministic mint ties, null/nonfinite/blank/formatted values, decimal-expansion bounds, duplicate symbols/mints/conflicts, conservative duplicate safety flags, mixed quotes without double conversion, own token/unsupported exclusions, malformed dates/rows, trusted-image origin, all candidates considered before selecting ten, honest unavailable/stale/warming behavior, concurrent cache coalescing and full-universe search.
- Hosted tests reject synthetic configured backends, remove demo identity/payment fallback, reject writes/operator paths and preserve safe public forwarding.
- `npx.cmd tsx scripts/market-proof.ts`: generated complete operator evidence bound to the implementation commit. Includes full per-mint reason codes, raw top ten and source-filtered top ten, full-source/registry hashes, coverage and limitations.

## Independent review and outstanding integration

REV-01 independently reproduced current source counts and ranking. Reviewer found conservative duplicate-flag aggregation and arbitrary image origins; both were corrected and regression-tested. Parent owns final independent UI/desktop/mobile review and actual deployment revision verification.

This owner has NOT deployed or claimed the public issue resolved. Parent should integrate, build, smoke-test `/api/overview` at the actual public URL, match its revision to the tested source commit and capture final desktop/mobile screenshots. No signing, payments, funded round, project contract launch or credentials were introduced.

Provider gaps remain explicit: circulating-supply basis, comparable liquidity, on-chain origin/authorities, full holder census, budget-sized routing, independently complete universe and market observation timestamp. The displayed list is honest real market data; it is not a certification of a funded or eligible reward basket. No acceptance rule was loosened to populate ten.
