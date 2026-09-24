> Historical implementation handoff. Its revision, test counts and local paths refer to that stage. For the current audit snapshot, use [EXTERNAL-AUDIT.md](EXTERNAL-AUDIT.md) and [VERIFICATION.md](VERIFICATION.md).

> R3 qualification, 24 September 2026: the implementation claims below do not close the approval-generation, custody-baseline, health-timestamp, forced-cache, resend-authorization or lease-timing findings N-M1–N-M6. See the [read-only financial evidence update](evidence/r3/FINANCIAL-EVIDENCE-UPDATE.md). Financial code remains unchanged.

# EMBER10 backend correction handoff

This change continues the existing repository on one PC. Backend specialists used separate Git worktrees; the integrator merged their changes into `backend/corrections`. No frontend visual files were changed. The public deployment and financial worker were not updated by this handoff.

## Audit reference and scope

The backend at the starting revision `db041a0cd3f986c36504e07288ab7d2b705841b6` was unchanged from the supplied audit base `61d265ada62703093c575603f5540e202b64f3c2`. The pasted requirements were available. `EMBER10-BACKEND-AUDIT.md`, `audit-regressions.test.ts` and the two referenced reports were not present in the supplied attachment directories; their location was requested. The original tests have been preserved. The seven missing audit probes have **not** been represented as passing.

The following B01–B11 mapping is provisional, following the requirement order in the pasted handoff. Reconcile these labels against the missing original audit before claiming closure of its numbered findings.

| Provisional finding | Implementation and evidence |
| --- | --- |
| B01 — unsigned retry starvation | Durable due times, capped backoff and oldest-attempt scheduling in `apps/worker/runner.ts`; real PostgreSQL restart/fairness regressions. Unresolved signed work remains serialized. |
| B02 — ambiguous/review recovery | Original signature inspection includes `needs_review`, even while paused. Authenticated `/operator/recovery` requests inspection only. Original signed-message and finalized metadata prove legacy ATA rent, including a recipient ATA closed later. Unknown outcomes retain reservations; no automatic replacement or absence-based release. |
| B03 — stale authorization | Actual worker uses `controlledExecutionTick`. Approval, effective funding route and pause are checked before new execution; route is read after slow conditions; final locked checks protect developer obligations. The Solana adapter reauthorizes after RPC checks immediately before signing and sending. Recovery-only configuration needs no signer. Holder/dev reservations check pause in their ledger transaction. |
| B04 — reconciliation | One control-locked ledger/in-flight view; all token intents contribute their transaction-specific native fee/rent bound. Watermark includes finalized attempts, incoming receipts and operating expense payments. Stale samples are retried. Unknown legacy rent bounds are explicit review states, not a reason to mask deficits. |
| B05 — epoch eligibility | `commitFreshEpoch` forces exact-budget verification for every new round. `Engine.plan` rechecks all gates and atomically freezes policy, full evidence universe, ten equal members, holder snapshot and funding references. Two persisted-epoch tests cover rotation/new discovery/restart and unchanged old obligations. |
| B06 — authoritative API | Local `/api/overview` reads current selection, immutable funded epoch and ledger-backed accounting. Hosted overview forwards to a configured production backend after mode checks. No-backend fallback remains truthful prelaunch; demo/test backends are rejected. Public evidence exports exclude raw provider bodies, credentials and signed payloads. |
| B07 — developer earnings | `core/developer.ts`, migration 006 and worker hooks: approved expense/payable ledger, retained reserve, daily UTC reservation, exact finalized transfer evidence and returned unused payout cost. No additional holder fee; operations-wallet funding is not developer profit. Cross-path signature guards prevent expense/developer double accounting. |
| B08 — USD 50 | Prospective live EMBER10 commitments require a basket of at least 50,000,000 micro-USD and the unchanged 80/10/10 split. Stored v1/v2 policies, five-asset epochs, credits and signed transactions are not rewritten. |
| B09 — trusted proxy limits | Backend ignores raw caller forwarding headers. Vercel adapter signs its platform-supplied client identity, timestamp, method and exact target path with a private shared HMAC secret. PostgreSQL buckets are shared across backend instances. Spoofing, tampering, expiry and replica continuity are tested. |
| B10 — dependencies | Compatible TOML/Jayson/cross-fetch upgrades preserve current Solana SDKs. Actual web3 localhost JSON-RPC and SDK compatibility tests pass. Production audit falls from 17 findings to five high findings in the still-unpatched bigint-buffer chain. See `backend-dependency-review.md`. |
| B11 — automatic full-universe selection | Full Ember observations refresh ordinarily every 45 seconds with bounded caching/backoff. An automated on-chain producer and built-in Jupiter batch collector replace manual metrics-file maintenance. Missing/partial/stale verification blocks commitments with explicit reasons. No symbol or permanent mint allowlist determines admission. |

## Three distinct records

1. `observed_market`: full Ember catalogue normalized by mint and numeric reported USD cap. Fetched time, source timestamp availability, duplicate/exclusion evidence and supply-basis limitations remain explicit.
2. `eligible_selection`: current policy hash, source hash, candidate evidence, exclusions/unknown checks, budget-sized routes and an optional ready basket. Persisted old records are not trusted after restart; a new round forces fresh production of all evidence.
3. Funded `epochs`: immutable document references plus funding receipt allocations, ten 1,000-bps members and holder snapshot. A current rank change cannot change a funded basket or erase credits.

`assetAdmission.version = "ember-provenance-v1"` is required for new live commitments. The reviewed policy, proven Ember launch/config/pool, supported token semantics, complete census and current route admit a new mint automatically. Transaction program, treasury signer, ATA destination, amount, slippage, impact and spending limits remain enforced. Already funded purchases use their frozen admission evidence plus current execution safety checks. Legacy `approvedMints` remains readable for compatibility; it is not the new selection authority.

## Provider evidence and actual observations

The built-in provider is selected explicitly with `selectionEvidence.provider = "jupiter-tokens-v2"` and approved origin `https://api.jup.ag`. It batches the current catalogue in groups of at most 100, paces requests, preserves provider `updatedAt`, and caches/backoffs boundedly. It never fabricates provider assertions.

The read-only probe on **2026-09-23 17:10:35–17:11:38 UTC** fetched **3,073 mints in 31 HTTP 200 responses**. Only 24 rows were fresh within 180 seconds; 3,049 were stale. The evidence hash is `61bd8edefa3c037b717b1e6f13da1813e4f8b05b7ebbe54103c2eec68cf2905b`. These are dated provider observations, not production asset names or a funded basket.

The reviewed [Jupiter Tokens schema](https://developers.jup.ag/docs/openapi-spec/tokens/v2/tokens.yaml) does not substantiate circulating-supply methodology, complete 24-hour volume boundaries or complete ordinary-token/stablecoin/LP classification. The built-in collector therefore reports these as unknown and cannot alone authorize purchases. A reviewed automatic custom provider can supply the strict evidence contract documented in `AUTOMATIC-SELECTION.md`; no local metrics JSON file is read. Complete-census RPC service and the catalogue completeness contract are also required. No ten-asset eligibility or working live financial service is claimed from the read-only probe.

At keyless provider limits the full probe took about 63 seconds; refresh requests are coalesced, so work never overlaps to fake a 45-second guarantee. Custom provider/chain failures, stale fields and fewer than ten verified assets remain blockers. No safety gate was removed to fill the basket.

## Schema and API migration

Apply the normal transactional migration runner against the intended backend database after a verified backup and controlled stop of new work:

```text
npm ci --ignore-scripts
npm run db:migrate
```

The migration command uses `DATABASE_URL`; keep it pointed at an isolated test database during validation. This handoff applied migrations only to isolated test schemas, never a production ledger.

- **005** adds persistent unsigned retry fields and append-only recovery records.
- **006** adds expense approvals/payments and UTC developer payout identities. Existing OPS accounts remain historical allocation; migration does not transfer money or reclassify operations-wallet funding as profit.
- **007** adds shared API rate-limit buckets. They are operational counters, not financial journal records.
- Public contract stays `schemaVersion: 1` with additive fields and explicit state unions. All accounting amounts are decimal-string **lamports** (`accounting.unit = "lamports"`), not SOL decimals. Allocation fields do not claim delivered payments. Empty/unconnected amounts remain null. Current selection, funded basket and settlement states are separate. Reconciliation health checks fresh balanced observations against maximum ledger `created_at`; that field is a transaction-start timestamp. A later commit from a transaction already waiting on the control lock can evade this test. The label is not proof of no later committed journal movement (open N-M3).
- `/operator/recovery` accepts request/intent/signature IDs, reason and evidence reference. It accepts no outcome, replacement transaction, signed payload or reservation-release command. Stop competing worker work to obtain the recovery lease; pausing does not delete liabilities.
- `/operator/expenses` records an authenticated payable. `/operator/expenses/settlement` fetches and verifies the original finalized transfer, actual genesis, signature, treasury debit, recipient and fee. A caller cannot assert finality. Capital classification also requires a matching positive treasury balance increase; self/circular instruction amounts cannot create reserve.
- Raw provider bodies, credentials and signed bytes are withheld from public exports. Public source attribution and hashes remain available. Private operator records remain local to the authoritative backend.

Frontend integration should consume these additive API fields and exact units. No frontend visual source was edited. The existing read-only public host remains unchanged until a separate deployment decision.

## R3 qualifications to the historical handoff

The following are source-reviewed open limitations, not newly executed financial tests:

- **N-M1:** reauthorization compares approval reads within its own callback; it does not bind the already-built message to the approval generation used by the builder. B03's checks remain present, but do not cover that change window.
- **N-M2:** initial unsolicited token ingestion uses current account ownership and full prior inbound history without establishing a custody baseline. A current owner match alone cannot establish the booked deposit balance.
- **N-M3:** the health timestamp caveat above is distinct from B04's finalized chain-slot watermark and control-locked reconciliation.
- **N-M4:** the live funding-route helper is forced with TTL 0; the unforced helper uses 45 seconds, even though `EmberClient.read()` defaults to 60 seconds. The financial cache/rate issue remains open.
- **N-M5:** resending stored bytes still depends on full execution authorization twice; provider failure can prevent resend before blockhash expiry. Conditional resend is not guaranteed delivery or a resolved expiry lifecycle.
- **N-M6:** an inspection/apply delay beyond the 120-second tick lease can fail settlement fencing and leave a generic incident and pause. The narrowed timing scenario remains unexecuted.

The R3 evidence independently reproduces the pool-specific strict payout-schema failure and the forecast's retry-margin counterexample. These results do not change the 80/10/10 policy, ten equal purchase budgets, OPS/DEV rules, or disabled financial execution.

## Developer policy and pause semantics

`DEV_PAYOUT_ENABLED=false` remains the default. `DEVELOPER_PAYOUT_WALLET` is a destination, never a signing key. Configurable minimum, retained reserve, payout-cost allowance and UTC hour are in `.env.example`; enabling requires matching approval fields and a holder-reward exclusion for the developer destination, treasury and operations wallets. The treasury/approved remote signer signs payments. The allocation remains 80% rewards / 10% buyback and burn / 10% OPS/DEV after bounded direct costs.

Pending principal and cost have dedicated accounts. The withdrawable remainder deducts expenses/payables, the reserve shortfall, existing reservations and the next payout cost exactly once. Only a finalized verified native transfer counts as developer payment. Failed fees consume the reserved cost allowance; unknown outcomes retain principal/cost. A depleted allowance blocks retry instead of drawing an unapproved subsidy from reserve. Existing signed outcomes can settle while disabled or paused; new preparation and resend cannot.

## Proxy deployment boundary

Set the same private `EMBER10_PROXY_SECRET` on the Vercel read adapter and authoritative backend. The edge signs only the [platform-overwritten client header](https://vercel.com/docs/headers/request-headers); outside the Vercel runtime it does not trust that header. The backend accepts the signed identity only for public GET routes within 30 seconds and otherwise limits by the actual socket peer. Never configure blanket `trustProxy: true` or forward caller credentials.

Without the shared secret, all requests arriving from an indistinguishable reverse-proxy peer share that peer's limit. The no-backend Vercel fallback has no shared PostgreSQL limiter; platform rate controls are required for global protection there. No production proxy secret, platform rule or authoritative origin was configured by this task.

## Verification boundaries

The shared local `outputs/EMBER10-backend-review` folder contains exact test output, dependency audits, dated source observations, changed-file/revision manifests and independent review notes. Original tests are retained; new tests use isolated PostgreSQL schemas and controlled chain/RPC fixtures, including actual worker scheduling and two persisted funded epochs. Real web3 transport compatibility is exercised against a localhost RPC fixture. Public Ember/Jupiter source reads are real read-only HTTP observations.

The repository's `docs/evidence/backend` directory contains the final test/build summary, source observation report and independent review dispositions for remote auditing. Full raw provider observations and reproducible independent probe scripts remain in the shared local evidence folder. Test report filenames are made repository-relative in the published copy; assertion results are unchanged.

No token was created, no production signer enabled, no funds used, no financial worker deployed and no on-chain transfer test was performed. The missing original audit/probes, unsupported provider assurances and residual dependency advisory prevent claiming full production readiness. Do not use a passing local test suite as evidence that the public deployment changed.
