# Developer earnings: ledger and worker integration

This module consumes the **existing** 10% OPS/DEV allocation after direct execution costs. It does not change the 80/10/10 split, levy another holder fee or treat funding an operations wallet as developer profit. No mainnet transaction, signer activation or worker deployment is authorized by this implementation.

## Configuration contract (integrator owns config and approval)

Map configuration to `DeveloperPayoutPolicy`:

| Configuration | Policy field | Proposed default |
|---|---|---|
| `DEV_PAYOUT_ENABLED` | `enabled` | `false` |
| `TREASURY` | `treasury` | Existing treasury |
| `DEVELOPER_PAYOUT_WALLET` | `destination` | Unconfigured |
| `DEV_MIN_PAYOUT_LAMPORTS` | `minimumPayoutLamports` | `10000000` |
| `DEV_RETAINED_RESERVE_LAMPORTS` | `retainedReserveLamports` | `100000000` |
| `DEV_PAYOUT_MAX_COST_LAMPORTS` | `payoutCostLamports` | `100000` |
| `MAX_TX_FEE_LAMPORTS` | `maxFeeLamports` | Existing fee cap |
| `DEV_PAYOUT_HOUR_UTC` | `payoutHourUtc` | `0` |

Convert raw integer configuration strings with `BigInt`. Payout cost allowance must cover at least the fee cap. Enabled destination must be valid and different from treasury. The treasury signer signs; the developer destination private key is neither used nor needed. Bind destination, minimum, reserve, cost allowance, fee cap and UTC hour in the reviewed execution approval. Include the developer wallet in the configured reward exclusions.

## Daily reservation and financial formula

`new DeveloperAccounting(store, mode).schedule({policy, lease, now?})` returns an intent ID or `null`. Use the actual worker clock in production; the optional timestamp is a test seam. Scheduling is disabled in prelaunch and when the explicit flag is false. The configured UTC hour starts the day's opportunity; a later worker restart catches up for the current day, without manufacturing missed-day payments.

The scheduler takes the worker fence and the shared control lock. `developer_payout_days.utc_day` is unique and immutable. A concurrent caller gets the same existing intent. An unresolved developer intent from a previous day blocks a new one, including unsigned route failure, unknown outcome and needs-review. There is no automatic cancellation or replacement.

Spendable cash consists only of ledger balances in `operations:<epoch>` plus `ops:available` returned costs. Legacy intents owning those accounts and their costs are excluded. Required reserve is moved to `ops:retained`; it is never a developer transfer. New principal is:

`max(0, unreserved OPS cash − outstanding approved payables − required reserve shortfall − new payout cost allowance)`

The minimum applies to that net principal. Reservation atomically moves principal into `dev:principal:<UTC-day>` and cost allowance into `dev:cost:<UTC-day>`, then creates a job and an existing-kind `operations` intent whose `expected.purpose` is `developer_payout`. Its frozen plan includes policy hash, source treasury, one destination/amount and the daily reservation. No intent-kind enum is changed.

Pending principal and costs already left spendable OPS accounts, so the formula does **not** subtract them a second time. Dedicated holder liabilities, purchase budgets, buyback funds and native execution reserve are never eligible funding sources.

## Required execution hooks

1. Before producing a **new** signed transaction, call `assertDeveloperPayoutAuthorized(store, tx, intent, currentPolicy)` inside the execution authorization transaction, with the control lock already held. It rejects disabled payouts, changed frozen policy or destination, missing dedicated reservation, exhausted cost allowance and newly approved obligations that cannot be covered after this reservation. The normal effective-approval, pause, funding-route and signer checks still apply.
2. Recovery of an existing signed attempt must reconcile that original signature without requiring a new-sign authorization. Unknown outcome retains both reservations. A new date does not authorize a replacement.
3. Inside `Engine.apply`, after generic operations principal and native-network postings, call `finalizeDeveloperPayout(store, tx, intent, outcome)` in the **same transaction** before commit. The hook returns remaining payout cost to `ops:available`, never treasury profit or holder funds. Status/receipt updates and the cost return must commit atomically. It is replay-safe.

A finalized failed transfer consumes only its evidenced network cost and retains principal and the remaining cost allowance for the same intent. When the remaining cost is below the configured fee cap, another signature is blocked; the module does not raid retained reserve or silently increase its payout budget. Configure an allowance sufficient for the approved bounded retry policy. R2 F-11 remains open: the current implementation has no retirement/replenishment route for an exhausted allowance, so a failed daily intent can block later payouts. Evidence-backed recovery still needs implementation and review; it is not an available operator action. Existing `Engine.scheduleOperations` can remain for explicit legacy flows, but the worker must remove its automatic operations-wallet sweep.

## Expense approval and payable accounting

`recordExpense({id,amountLamports,costAllowanceLamports?,payee,description,evidence,actor})` records an immutable approved principal and bounded expense-payment cost allowance. Approval is allowed before funds arrive. Its append-only ledger event records an obligation with **no SOL cash postings**, avoiding fabricated native balances. The unique approval ID is idempotent only for exactly matching approval content.

Outstanding payables include remaining principal and unused approved cost allowance while any principal remains unpaid. Fully settled invoices release unused allowance from the obligation calculation. Expense approval hashes supporting evidence and preserves actor attribution in `operator_audit`; public totals do not contain credentials or signed payloads.

`recordExpensePayment(payment, treasury)` is a bookkeeping hook for an independently verified finalized outgoing payment. It verifies treasury source, approved payee, amount, cost bounds, slot, success, and unique signature/instruction. It posts actual principal and cost out of OPS cash (including retained OPS reserve if needed), then records the immutable settlement. It cannot consume pending developer principal, holder funds or already-accounted execution transactions. A depleted required reserve blocks future developer signing/scheduling until covered.

Any signature already stored in execution attempts is rejected even before local settlement: its existing intent owns reconciliation. For an independently verified transaction containing multiple expense transfers, charge its entire network fee on one recorded transfer only; subsequent transfers must carry zero additional fee and the same finalized slot. The bookkeeping hook prevents charging a positive network fee twice for a signature. A caller that supports only one outgoing transfer can continue rejecting batched transactions entirely.

**Do not expose a client-supplied `finalized: true` field as authority.** An authenticated operator endpoint must independently inspect finalized chain evidence and pass verified fields to this hook. Until that verifier is wired, expose expense approval/read-only accounting only. The hook never signs or sends an expense payment.

## Read/export contract

`summary(policy, tx?)` returns `DeveloperAccountingSummary`; without a transaction it acquires the control lock for a coherent view. Every monetary field is an exact raw **lamport string** with `asset: SOL` and `units: lamports`:

- `allocation`: cumulative OPS allocation postings from revenue, not treasury balance.
- `approvedExpenses`, `paidExpenses`, `operatingExpenseCosts`: approved principal, settled principal and actual expense network costs.
- `outstandingPayables`: unpaid principal plus still-required expense cost allowance.
- `retainedReserve`, `requiredReserve`, `reserveShortfall`: ledger earmark and current policy requirement.
- `availableOperations`, `legacyOperationsReservations`, `operationsWalletFunding`: free cash, legacy claims, and actual finalized legacy operations funding; none is automatically developer profit.
- `withdrawableRemainder`: prospective net principal after the formula above. It does not mean payouts are enabled or signing is approved.
- `pendingTransfers`, `reservedPayoutCosts`, `payoutCostAllowance`: separate pending principal, remaining dedicated cost balance and next configured allowance.
- `finalizedDevPayments`: actual finalized developer intent principal joined to chain receipts.
- `finalizedPayoutCosts`: ledger-posted native network costs, including evidenced finalized failed attempts; never unspent reservations.

`hasRecords` distinguishes an untouched ledger from real allocation/approval/daily records. The authoritative API must reject demo/test database substitution, verify the configured backend's authority, and leave amounts unavailable when no real records exist. Convert lamports to SOL only at the presentation boundary; do not return these raw values as SOL strings accidentally. Configuration fields (`enabled`, destination, UTC hour, minimum) describe policy, not payment evidence. `lastScheduledDay` is a reservation date, not a promised finality time.

## Migration and validation

Migration `006_developer_accounting.sql` adds immutable expense approvals, payment evidence and unique UTC-day reservations, with foreign keys to ledger events/intents. It leaves historical epochs, existing intent kinds and allocation postings unchanged. It has no dependency on migration005; the integrator owns that separate execution migration.

The specialist suite uses isolated PostgreSQL schemas and the existing deterministic test chain. It exercises real scheduler/store/runner/engine methods for concurrent calls, zero/insufficient funds, approved unfunded obligations, reserve accumulation, exactly-once settlement, failures/unknown outcomes, replay, new-day behavior, late obligations, disabled policy, legacy operations separation and stale worker fencing. The isolated branch invokes the finalization hook explicitly after Engine settlement because Engine wiring belongs to the integrator; integrated acceptance must also prove `runIntent` alone releases unused costs atomically. These are mocked-chain tests, not on-chain/mainnet or deployed-payment evidence.
