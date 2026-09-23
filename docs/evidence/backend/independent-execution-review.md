# Independent execution and integration review

Date: 23 September 2026.

**Review closed: facda1edd5507f74d8f9c3bf0a367f0c0103bcbc. All findings raised in this execution/integration review are resolved. Final integrated validation passed: 208/208 tests across 13 files, zero failed or skipped; typecheck and production build passed.**

Reviewer: /root/review_finish, author of developer accounting, reviewing the separate execution specialist and integrator code. This is not independent self-approval of the developer module or reviewer-authored watermark fix. The separate /root/light_design reviewer owns independent developer review.

## Scope

Read worker runner/recovery/main/control/commit, execution and reconciliation portions of core Engine, admission and execution-cost helpers, Solana/Jupiter preparation/inspection/broadcast, authenticated capital/recovery/expense endpoints, operator evidence validation, related migrations and execution/orchestration regressions.

No frontend edits, deployment, mainnet execution, real funds, signer activation or financial-worker activation formed part of this review. Local tests and source inspection do not establish deployed payment behavior or live eligibility.

## Closed findings

| Finding | Verified disposition |
| --- | --- |
| Shared reserve incorrectly served as one transaction's possible debit | f852b9b: separate native transaction caps; zero-rent burn/native transfers are fee-only and token transactions include bounded ATA rent. Actual adapter regression uses large reserve/small fee. |
| Older RPC observations compared with newer inbound or expense movements | 4be02ad: the locked watermark includes finalized attempts, incoming receipts and expense payments. Three focused PostgreSQL regressions distinguish stale observations from genuine deficits. This reviewer authored that fix; integrator owns its independent review. |
| New caps prevented legacy SPL/swap original-signature finality | 6babebc: derive finalized cost evidence from immutable signed bytes/hash/signature and canonical original ATA instructions, preserving the original plan and attempt. |
| Delayed recovery omitted rent after recipient closed its ATA | 6babebc: original finalized token identities/pre-post balances determine rent; no present-day account lookup. Tests cover payout and Jupiter recovery, wrong message hash, full rent and exactly-once accounting. |
| New developer/holder reservations reused old loop authorization | 0fabce7: authorize immediately before scheduling and recheck holder policy identity. |
| Funding route was read before slow intent checks | 0fabce7: observe route afterward; test changes route during the async conditions and denies execution. |
| Holder reservation could race persisted pause | 0fabce7: pause is checked inside the control-locked reservation transaction, preserving liabilities. |
| Operator capital/expense evidence trusted configured network labels/incomplete metadata | 0fabce7: require actual genesis, present successful metadata, safe slot and exact requested signature. Shared parsed-transfer validation protects ingestion too. |
| Self/circular capital instruction could invent reserve without treasury gain | 64b2922: positive treasury balance increase must exactly equal admitted incoming transfers. The reviewed regression rejects self/circular flows without credit and accepts a matching positive seed. **Closed.** |
| Public accounting labeled stale/in-flight observations reconciled | 67fce25: explicit stale/pending states; reconciled only for balanced reports. |
| External waits could stale the developer ledger check | 11329d6 and final adapter follow-up: final locked obligations/fence check after external authorization, including the actual signer and send boundaries. Separate developer reviewer independently reproduced and rechecked this race. |
| An expense-owned signature could later be attributed to an intent | 11329d6 plus apply-time defense: reciprocal exclusion under the control lock, pause/incident before attempt persistence, and settlement defense. Separate developer reviewer independently verifies both orderings. |
| Adapter validity RPC calls followed the final send authorization | Final facda1e integration invokes the callback after cluster/blockhash/height RPC checks, directly before sendRawTransaction. Existing broadcast/master-pause guards are retained. Actual adapter tests introduce an expense/pause during the height RPC and prove no send. |

## Other reviewed safeguards

- Durable bounded backoff permits unrelated due unsigned work after a route failure.
- Recovery-only does not prepare, sign, invoke send authorization or rebroadcast. It still handles late original finality while paused or without active signing approval.
- Unknown/expired outcomes retain reservations and never authorize blind replacement.
- New epoch commitment forces current intended-budget selection, reauthorizes and freezes policy/basket/snapshot identity; historical funded epochs remain unchanged.
- Authenticated recovery accepts identifiers/evidence references rather than caller terminal outcomes. Expense settlement independently fetches proof and checks one native transfer and the full treasury debit.
- Temporary WSOL rent is separately checked for upfront cash and excluded from net rent after the same transaction returns it.
- Execution reviewer read the final locked-check/replay and broadcast callback changes; independent developer approval belongs to the separate reviewer.

## Validation

Reviewer-run PostgreSQL checks: watermark plus execution **12/12**, two files, 5.13s; typecheck passed. Developer hardening plus watermark **21/21**, two files, 7.33s; typecheck passed. These developer checks are implementation validation, not independent self-approval.

Shared full run before the last guards: 199 passing tests across 13 files. A later run reached 204/206 because two generic specialist fixtures incorrectly claimed a configured developer reservation; those fixtures were corrected. That intermediate run is not represented as a final pass.

Independent developer reviewer recheck at 11329d6 passed all five boundary/replay probes and 20 targeted developer-related tests (36 unrelated skipped). The final adapter callback and expense/pause-during-RPC tests were read and cleared.

Final integrated run for facda1edd5507f74d8f9c3bf0a367f0c0103bcbc was independently read from the saved raw artifacts: npm.cmd test exit0, success=true, **208/208 tests across 13 files** (25 reporter suites), zero failed or skipped. The JSON spans approximately45.30s. npm.cmd run build completed typecheck and Vite successfully, transforming24 modules and building in202ms. Evidence: integrated-tests.json and build-output.txt in this review directory. These results supersede the intermediate runs above. No additional code finding remains in this review's scope.

The independent developer reviewer also closed both of its findings on this exact source: all six actual affordability/replay boundary probes passed, including the real Solana adapter's late-RPC boundary with zero wire sends/signer calls and retained original reservations. See independent-developer-review.md and its bound probe JSON. This is separate from this reviewer's authorship.

All automated financial scenarios use isolated local PostgreSQL, deterministic test-chain fixtures and mocked RPC responses. They do not claim real payout, funded production basket, deployed backend verification, or safe replacement of an unknown original transaction.
