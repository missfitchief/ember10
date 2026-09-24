# R3 independent public correction review

Reviewed revision: **e55be0f8f26e637ef5771d18df42604183a5c5f9**. Reviewed 24 September 2026 by a separate internal specialist session that did not author the R3 public code. This is a same-vendor implementation review, not an independent external audit. External re-audit is pending.

## Exact source scope

The accompanying independent-public-review-hashes.json identifies every reviewed file by Git blob object and SHA-256 of the exact committed bytes obtained with git show REV:path. It does not hash CRLF-converted working files. Final integration's frontend/test files match specialist commit 8d1928be8d687bd6a56fffb45adf6b5b6f71acd5. The relay implementation and test bytes match the separately reviewed 1f6d283 integration stage. No financial-code difference was present from ad972e7 in apps/worker, packages/core, packages/db or Jupiter/Solana/ingestion/provenance adapters.

Later documentation/evidence-only commits may identify the delivered package. They are not new runtime reviews. The final package must preserve the reviewed runtime blobs or obtain a new review; these exact hashes supersede reliance on the intermediate R2 working-file hashes. Financial implementation, full security audit, deployment artifact attestation and unrelated inherited defects are outside this review.

## Source review and result

No material blocking defect found in the bounded public changes reviewed.

- Request generation advances and the active request is aborted when the parent actually replaces the default snapshot or the user explicitly refreshes. Late matching and nonmatching responses cannot restore the old generation even when transport cancellation is ignored. Paging is single-flight; successful retained-page merges preserve the newer-observation notice.
- Query/page errors are separated from background source failure. An independently successful searched list keeps its own observation status/provenance with a separate background-health notice. Empty selection policy takes precedence over search wording.
- Successful ready/warming observations permit failed avatars to restart bounded retries. Healthy images retain their state/DOM. Context covers the orbit, homepage list, market table and open asset details.
- Origin image authorization, approved content addressing, canonical upstream selection, raster limits, bounded concurrency, deadlines and fail-closed no-store errors remain. Successful responses now request a 300-second shared-cache lifetime and 60-second stale revalidation window; version-3 browser URLs separate the policy from old entries. CDN hits intentionally do not execute origin membership checks. Last-good membership can continue during source outages, so no universal 360-second removal/revocation bound is claimed.

Vercel's primary Cache-Control documentation confirms that its CDN consumes s-maxage and stale-while-revalidate: https://vercel.com/docs/caching/cache-control-headers . Actual CDN HIT behavior still needs deployed evidence; a header unit assertion cannot prove edge caching. Known-catalogue floods, per-instance image limits and cross-observation pagination remain documented limitations.

## Independently executed

1. Token relay unit suite: 22 of 22 tests passed against the same relay bytes later committed in e55be0f8f26e637ef5771d18df42604183a5c5f9. No database suite was run by this reviewer.
2. Built hosted preview at http://127.0.0.1:5196 using the final integrated build: scripts/audit/public-browser.mjs passed at 1440, 375 and 320 pixels. All ten actual catalogue logos decoded; no horizontal overflow or page errors. Asset details, unavailable reward history and keyboard skip behavior passed. Results and four captures are under independent-browser/.
3. Independently opened and visually inspected those desktop, 375px, 320px and 375px-detail captures. Logos, responsive navigation, orbit, market rows, allocation and footer fit the viewport. The 320px heading wraps without clipping. The detail view retains readable metrics, wrapped mint and both actions. No material visual defect found.
4. tests/ui-r3.browser.mjs passed all five controlled scenarios against the final built preview, including abort-ignoring late page completions, explicit refresh, independent query health, selection-empty copy and exhausted 503 avatar failures recovering on a good poll. Healthy image DOM continuity passed. These fixtures are browser-only behavior evidence, not live financial records.

Playwright used the installed 1.61.1 module with the system Chrome channel. Browser widths are emulations, not physical-device tests. Capture hashes and exact reviewed source hashes are in the companion JSON.

## Review limits

This reviewer did not edit application code, install dependencies, run the complete Vitest/database suite, contact a signer, broadcast, fund, deploy or verify the eventual public deployment. The actual upstream catalogue and logos were read by the local hosted preview; browser race/recovery APIs were explicitly intercepted. Final production revision, asset equality, actual CDN HIT/MISS/latency and unlisted-CID behavior must be recorded by the integrator after deployment. Open F-1 through F-14 and N-M1 through N-M6 are not remediated or approved by this review.
