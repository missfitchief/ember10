# Current verification - 24 September 2026

Tested/deployed application: e55be0f8f26e637ef5771d18df42604183a5c5f9. Subsequent audit-package commits change documentation, evidence and reviewer tooling only. See deployment.json for the unique deployment and actual public verification time.

| Check | Result | Evidence |
|---|---|---|
| TypeScript and production build | Passed | [validation](evidence/r3/validation.json) |
| Complete Vitest run |258 passed, 20 files, 0 failures; isolated PostgreSQL schemas | [tests](evidence/r3/tests.json) |
| Controlled browser tests |5 R3 scenarios + 11 R2 assertions passed against integrated built app | [R3](evidence/r3/frontend-r3-browser.json), [R2](evidence/r3/frontend-browser.json) |
| Exact-revision independent internal review |11 reviewed Git blobs hash-matched; no blocking issue within scope | [review](evidence/r3/independent-public-review.md), [hashes](evidence/r3/independent-public-review-hashes.json) |
| Actual candidate/public revision and assets |8 build files byte-identical; 10 real logos decoded; prelaunch/paused/worker inactive/broadcast disabled | [candidate](evidence/r3/candidate-verification.json), [public](evidence/r3/public-verification.json) |
| Live desktop/mobile |1440/375/320px; 10 logos each, 0 overflow/page errors; token details and ledger unavailable states | [browser](evidence/r3/public-browser.json) |
| CDN behavior |10/10 second-pass HIT; observed median 54 ms versus first-pass 3342 ms MISS | [after](evidence/r3/logo-after.json) |
| Error boundary |Unauthorized logo 404/no-store, invalid URL 400, public writes 405, operator GET 404 | [checks](evidence/r3/public-api-checks.json) |
| Production dependency audit |5 high, 0 moderate/critical; not clean | [scan](evidence/r3/dependency-audit.json) |
| Financial deployment, signing, production migration, funded settlement |Not performed; financial source unchanged | [financial evidence limits](evidence/r3/financial-evidence.md) |

Before-cache requests were all MISS with medians 663/429 ms in two batches. The new cold batch was slower; measurements are uncontrolled live observations, not a first-load speedup claim or latency guarantee. Warm requests had matching per-mint bytes and CDN HITs. CDN cache may display removed membership through its cache window; stale last-good authorization can extend this during outages. N-P4 and N-P6 remain documented residuals.

The first ad-hoc API check incorrectly expected POST /api/operator/pause to return 404. Source inspection confirms the method guard runs first and correctly returns 405; GET returns 404. [Initial failed harness result](evidence/r3/public-api-checks-initial.json) is preserved, and the corrected test passes without any application change.

Before screenshots: [desktop](evidence/r3/before-1440.png), [mobile](evidence/r3/before-375.png). After: [desktop](evidence/r3/public-1440.png), [375px](evidence/r3/public-375.png), [320px](evidence/r3/public-320.png), [details](evidence/r3/public-375-detail.png). These are Chrome viewport checks, not physical iPhone Safari tests. Screenshots are observations, never production seeds.

[Reproduction commands](AUDIT-REPRODUCE.md) distinguish fixtures from live requests. Financial evidence was executed on 23 September and prepared here on 24 September; it is not a new chain-attribution or settlement result. R2 evidence stays historical. Internal reviews are same-vendor and scoped; external re-audit remains pending. Server functions have no cryptographic artifact attestation.
