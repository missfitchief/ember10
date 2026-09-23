> Historical first-round claims below are superseded where noted by [Round 2](AUDIT-R2.md). In particular, S1-06 is **open**: the forecast is one WSOL float short; do not fund an epoch.

# Audit remediation — 23 September 2026

The supplied audit inspected `db041a0`. This correction starts from `4d36e54`, retaining the newer backend, Orbit frontend and same-origin token logos. One PC, one integrating worktree, no transfer packages. This is a read-only prelaunch release, **not closure of the financial-service audit**.

## Corrections in this release

| Finding | Change and evidence |
|---|---|
| S1-01 | Authenticate by registered route, including encoded and absolute-form operator URLs. Tests use a configured nonempty token and assert rejection. |
| S1-02 | Supply RPC uses the documented commitment string; reject a supply observation older than the holder census. A real web3 Connection with a mock transport verifies serialized RPC parameters. |
| S1-03 | Both catalogue clients allow a bounded 64 MB response. The public parser retains its 20,000-row bound. Oversize or invalid data remains unavailable/stale and emits a bounded diagnostic. Test includes a valid response above 12 MB. Grouping no longer repeatedly copies arrays. |
| S1-04 | Record and skip zero transfers. Advance native and token cursors per fully processed signature, including failed and recognized internal transactions. Missing evidence retains the last successful position. Native replay regression included. |
| S1-05 | Handle idle pg pool errors without exposing connection details; API container restarts unless stopped. Pool event regression included; container restart and real network outage not exercised. |
| S1-06 | Forecast epoch swaps, buyback, burn and treasury ATA funding; holder payouts remain separately reserve-gated. Default forecast is 23,632,080 lamports, independent of holder count. |
| S2-01 | Retain expanded lists on parent refresh and incompatible continuation pages; show an explicit refresh notice instead of silently collapsing them. Cross-observation paging still requires identical evidence. |
| S2-03 | Public JSON routes always report installation mode/testOnly. Ordinary UI refuses demo/test accounting; CLI synthetic exercises remain supported. |
| S2-05 | Validate epoch pages, distinguish unavailable/failed/empty history, expose cursor-based older rounds, and show failures/retry in Transparency. A failed status request clears the unverified explorer network. |
| S2-06, partial | Proxy status and data requests share a 25-second deadline and caller cancellation. CSV downloads retain a safe attachment header. The 4 MB buffered export limit remains; large exports require a separate paginated/streaming design. |
| S2-07/08/10/11 | Skip link focuses without changing history; search input is bounded at 100 characters with an explicit hosted validation message; compact rounding promotes unit boundaries; basket universe exposes pagination/completeness metadata. |
| L-03 | Migration 008 stores only the latest operational catalogue, selection and worker-readiness record. Funded basket, snapshot and policy documents remain immutable. Legacy observation records remain readable and are not deleted. |
| L-04 | Deduplicate open incidents by kind under the control lock. Authenticated incident resolution requires a reason and evidence reference, writes an audit event and does not resume execution. The full reconciliation documents retain asset-level evidence. |
| L-07, partial | Exact, bounded exponent-form amounts are accepted; sub-base-unit precision is rejected. Quarantined receipt re-attribution and malformed payout-row isolation remain open. |
| L-08/09/10 | Reject zero holder thresholds; simulate/size-check and check expiry before signing, then reauthorize and rebind cost limits; capture holder snapshot and SOL price after catalogue selection. Tests verify sequencing and that failed unsigned simulation never calls the signer. |
| L-13/D-04, partial | CSV neutralizes formula prefixes behind whitespace/control characters. Canonical JSON preserves Date values. Other database/operational subfindings are not claimed closed. |

## Already corrected before this release

The current app prevents overlapping overview refreshes (S2-02), configured hosted overview uses the authoritative API (S2-04), and avatars reset/retry their real logo sources (S2-09). Existing execution tests cover persisted retry/backoff, original-signature recovery, locked expense checks, bounded native reconciliation costs and original-message ATA rent reconstruction. OPS/DEV accounting remains expenses/obligations/reserve first, then only the withdrawable remainder. Same-origin logos also address the nginx image-source mismatch.

## Remaining work before funded use

- Review and implement safe pre-existing WSOL account handling (L-02); current behavior still fails closed.
- Implement append-only verified attribution of previously quarantined fees and isolated malformed payout-row handling (L-07). Do not rewrite incoming receipts or count quarantined balances as revenue.
- Finish large export pagination/streaming (S2-06), stable multi-page catalogue observations (S2-01), nginx client-rate-limit attribution (L-11), and remaining policy revision, database-role/TRUNCATE, test-chain replay and Windows graceful-shutdown findings in L-13.
- L-12 remains open: the builder receives the same mutable intent that later economic-identity comparisons use. Independently inspect and test against malicious builder mutation; this release does not claim an immutable pre-build guard.
- Re-audit remaining L/D subfindings and dependency advisories against this revision. Historical documents and sample outputs are not current verification results.
- Provide the previously documented project identity, verified source coverage, fresh evidence providers and separately approved live infrastructure. No funded chain settlement or production database migration was performed.
- Obtain independent review of this new audit patch. The attempted specialist review was unavailable due to the account usage limit. Root performed the review and validation reported here; it is not an independent sign-off.

## Validation and release procedure

242 tests across 18 files passed against isolated PostgreSQL schemas. TypeScript and Vite build passed. Chromium at 1440 and 375 pixels loaded all ten real logos without overflow or page errors; skip history behavior and a failed epoch request were exercised. These are browser emulations, not physical iPhone tests.

Before/after screenshots, browser JSON and deployment verification are stored in `outputs/EMBER10-audit-review` in the shared workspace. The deployment is promoted only after checking the exact revision and byte hashes of the built assets; a status environment variable alone is not proof. Verify the public alias after promotion. Backend migration 008 is included in source but is not applied to any production database by the Vercel frontend deployment.

For a separately managed backend upgrade, back up the database, keep it paused, run the normal migration command, and restart the API/worker together. Public test JSON is labelled; demo is not a real-rewards browser walkthrough. Resolve an incident with authenticated `POST /operator/incidents/:id/resolve` containing `reason` and `evidenceReference`; investigate its underlying cause before the separate resume operation.
