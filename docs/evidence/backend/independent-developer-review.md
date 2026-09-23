# Independent developer accounting review

Reviewer: selection specialist (`/root/light_design`), independent of the developer-accounting author. Reviewed 23 September 2026, around 17:13–17:17 UTC, in `work/backend-integration`; the integration checkout was changing during review and HEAD was `6babebc7734621e3a92818f562a2747540ecb896` at the final inventory. Findings refer to the source exercised by the accompanying probes, before the requested corrections.

**Final disposition, 17:24 UTC:** both findings are corrected and independently verified at `facda1edd5507f74d8f9c3bf0a367f0c0103bcbc`. All six focused integrated recheck cases passed. No unresolved finding remains in this bounded developer-accounting review.

Scope: `packages/core/developer.ts`, `developer-config.ts`, migration `006_developer_accounting.sql`, API expense approval/settlement in `apps/api/server.ts`, `operator-evidence.ts`, and the actual worker authorization/runner/finality-hook integration. No implementation files were edited. Probes created and removed isolated local PostgreSQL schemas containing synthetic ledger entries only. They used no real signer, network transaction, chain mutation or funds.

## Original findings

1. **Developer affordability could change during the final asynchronous authorization.** `apps/worker/control.ts` called `conditions(intent, approval)` before awaiting the funding-route read and a second approval read. The developer condition checked new expenses and retained reserve under the control lock, but a subsequently approved expense could arrive during that network request. The authorization then returned success although the same financial check already rejected the payout. `developer-boundary-probe.mjs` reproduced this: `conditionsPassed=true`, `authorizeResolved=true`, and an immediate current check failed with `new operating obligations or required reserve block developer signing`. The test reserved 880,000 principal and 20,000 cost against a 100,000 reserve, then added a 50,000 expense during the route read. Requested correction: recheck financial conditions in the runner's final control-locked transaction after external awaits, at preparation/signing and rebroadcast boundaries. The integrator accepted the finding and assigned that change. This diagnostic script exercises the old external authorizer, so the new regression must cover the actual added locked callback rather than simply rerunning that helper in isolation.

2. **An expense booked first could be double-accounted by a later intent with the same signature.** The expense path correctly rejected signatures already known in `attempts` or `chain_receipts`; the inverse path lacked the reciprocal check. Native transactions with the same payer, recipient, amount, instructions and recent blockhash have the same message/signature. In the controlled original-signature fixture, an external expense reimbursement of 200,000 plus a 5,000 fee was recorded first. A later developer intent with that same transfer signature was accepted by the runner and finalized by `Engine.apply`, reporting another 200,000 of developer earnings and another 5,000 cost without any new broadcast. `developer-replay-order-probe.mjs` reproduced `broadcast=0`, `error=null`, the same signature in both payment tables, and both expense/developer payment totals. Requested correction: under the shared control lock, reject `operating_expense_payments` signatures before attempt persistence and defensively in `Engine.apply` for any historical attempt. Keep the reservation and require review; do not silently relabel the already-booked expense. The integrator and original developer author were notified.

## Other reviewed controls

No additional material gap was identified in this bounded review of the following paths:

- Available funds come from existing OPS allocation accounts or returned developer costs; dedicated pending principal/cost accounts are outside that pool.
- Payables, cost allowances and retained-reserve shortfall are deducted once. New expense obligations do not fabricate cash balances.
- Scheduling uses the worker fence and control lock, a unique UTC-day reservation, and an unresolved developer intent blocks a replacement on a later day. Disabled, paused and prelaunch paths do not schedule.
- Failed/unknown attempts preserve principal. Finalized success posts actual principal/cost and returns unused cost atomically; only finalized receipts count as developer payments.
- Expense principal/fee totals are bounded by approval, append-only records are protected by migration triggers, and replay identity is signature plus instruction. The existing forward known-attempt guard and one-fee-per-transaction guard were reviewed, but were not mistaken for complete bidirectional replay protection.
- API expense settlement independently fetches finalized transaction metadata, checks the expected chain genesis and exact requested signature, requires one native treasury transfer, matches the treasury fee payer, and checks its debit equals principal plus fee. Request bodies cannot assert their own successful finality.

The initial review inspected the existing 18 developer tests and endpoint tests. Original failing outputs remain in `developer-boundary-probe.json` and `developer-replay-order-probe.json`; they were not overwritten with passing results.

## Independent integrated recheck

At revision `11329d632b90cd58c320bb97e615b2f861bbc48c`, the independent reviewer first exercised the actual `controlledExecutionTick` / `runIntent` and `Engine.apply` paths with isolated PostgreSQL schemas and controlled adapters. Those five cases were then rerun successfully against the final broadcast-callback integration `facda1edd5507f74d8f9c3bf0a367f0c0103bcbc`, together with a sixth case through the actual `SolanaChain.broadcast` adapter:

| Case | Actual outcome |
| --- | --- |
| Expense arrives during external authorization before preparation | Passed: no preparation, signing, broadcast or attempt; intent deferred and 880,000 principal / 20,000 cost retained. |
| Expense arrives during the adapter's final signing authorization | Passed: preparation started, but signing and broadcast stayed zero; no attempt was persisted and reservations remained. |
| Expense arrives during external authorization before rebroadcast | Passed: no broadcast; the one original unknown attempt and its reservations remained. |
| Newly prepared signature was already booked as an expense | Passed: no attempt or receipt added, no broadcast, paused for review, 200,000 principal / 20,000 cost retained and developer payments remained zero. |
| A historical stored attempt shares an already-booked expense signature | Passed: `Engine.apply` rejected settlement; one original attempt remained, no receipt/payment/cost was counted again, paused for review and reservations preserved. |
| Expense arrives during the broadcast adapter's last awaited RPC | Passed: the actual adapter invoked fresh authorization after the locally replaced `getBlockHeight` call recorded the expense; zero signer calls and zero wire sends, with one original unknown attempt and 880,000 principal / 20,000 cost retained. |

Exact passing evidence and executable probes are `developer-boundary-recheck.{mjs,json}` and `developer-replay-recheck.{mjs,json}`. The legacy replay fixture initially tried to change its plan after inserting an attempt; the database correctly rejected that fixture setup as an immutable signed plan. The fixture was corrected to bind its plan before attempt insertion, then both replay cases passed. No application code was changed by this reviewer.

The reviewer also independently ran `npm test -- tests/developer-accounting.test.ts tests/backend-orchestration.test.ts -t developer` at this revision: **20 passed, 36 unrelated tests skipped**. This includes the 18 developer-accounting tests and two matching orchestration tests. The added root orchestration regression records an expense during a funding-route lookup and verifies the locked callback prevents preparation; the independent probe additionally checks the later signing callback.

The final adapter-level evidence is `developer-adapter-broadcast-recheck.{mjs,json}`. Every RPC method used by that probe was replaced locally; it exercised the real adapter's ordering but made no real RPC request or transaction. The late expense was observed exactly once, the final authorization was invoked once after it, and its external financial condition correctly rejected before another locked check was needed. Separately, the other expense-during-route cases demonstrate that the locked check catches changes arriving after the earlier external financial condition. Inspection of the integrated adapter confirmed the original `BROADCAST_ENABLED` / `MASTER_PAUSE` guard remains in place, live broadcasting requires an authorization callback, and the callback runs after chain/blockhash/height reads and before `sendRawTransaction`.

Final review status: **both developer findings fixed and verified; six focused cases passed at `facda1edd5507f74d8f9c3bf0a367f0c0103bcbc`.** Full-suite acceptance remains the integrator's responsibility. None of these checks is a live financial-launch approval.
