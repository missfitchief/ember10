# Exact accounting rules

All quantities are bigint in TypeScript and `numeric(78,0)` in PostgreSQL. Public money fields are decimal strings. USD values are separate integer microdollar valuations with source and time. Reported public-market USD numbers are informational; they never determine holder entitlements.

## Source recognition

A creator fee requires a successful finalized transfer to the configured treasury, the configured fee sender, exact raw amount, quote-asset identity and unambiguous matching Keep-it publication for the configured pool. One signature may contain several receipts; `(signature, instruction identity, asset, destination)` is the deduplication identity. Ambiguous fee-sender transfers go to quarantine. Unrelated funding goes to deposits. Explicitly verified operator seed funding goes to reserve, never reward revenue.

The current native-SOL recognizer deliberately does not infer fees from a balance increase, volume, fee estimates or unmatched wrapped-SOL movements. Published ledger windows can be incomplete; the chain cursor drives ingestion, and unmatched candidate fees remain held for review. A missing historical transaction prevents cursor advancement.

## Journal convention

Each event sums to zero **for each asset separately**. Positive postings increase an account; negative postings decrease it. Internal accounts cannot become negative. `external:*` accounts are signed counterparts for receipts, swaps, network fees, rent, deliveries and burn. Corrections are new linked events; old postings and entitlements cannot be edited.

For an asset at a verified observation slot:

```
expected treasury units = sum(all internal account balances for that asset)
unexplained delta = verified chain units - expected treasury units
```

Internal accounts include free revenue, capital reserve, unclassified deposits, quarantine, per-epoch purchase/buyback/operations/cost/rounding budgets, unpaid liabilities, active payout reservations and acquired units awaiting burn. These are **partitions** of asset ownership, not a second set of amounts to subtract from an already net free balance. Summing different token units is prohibited.

Known in-flight actions cause reconciliation to report `in_flight`, not a fictitious deficit. Reconcile those signatures first, then take another chain observation. A finalized unexplained debit or surplus opens an incident and pauses new commitments. A surplus is not automatically revenue.

## Funding example

The deterministic demo has 1,000,000,000 synthetic receipt lamports and a separate 200,000,000-lamport capital reserve. Its round reserves 20,000,000 lamports for direct costs. The remaining 980,000,000 is split into:

| Account | Lamports |
|---|---:|
| Basket purchases | 784,000,000 |
| Each of five legs | 156,800,000 |
| Our-token buyback | 98,000,000 |
| Operations | 98,000,000 |
| Integer remainder | 0 |

In the general case, floor each policy share, floor each equal basket leg, and keep all remainder in `rounding:<epoch>`. That account is reserved and is not silently given to operations or another member. Unused direct-cost allowance can be returned to revenue only after its cost-bearing intents finish. The refund is allocated back to original fee-receipt funding sources proportionally and recorded as negative `funding_receipt_uses` entries. Already booked holder entitlements are never reduced for costs.

## Credits and payments

Only the actual finalized acquired amount is allocated. For acquired `Q`, owner balances `b`, and total eligible balance `B`, start with `floor(Q*b/B)`. Give remaining units to descending fractional remainders, breaking ties lexicographically by wallet address. The final sum equals `Q`, including tiny amounts and large balances.

The demo acquires 784,000,000 raw units of each six-decimal reward asset. Three eligible owners receive all units; a fourth owner is below threshold and treasury is excluded. Two owners receive synthetic finalized transfers. The third carries **142,545,454 raw units per asset** forward. Its $0.02 synthetic unit valuation is below the new-ATA delivery threshold. These credits survive selling, a basket change or worker restart.

Creating a batch moves its exact liabilities into `reserved:<batch>` and exclusively links each contributing entitlement. Atomic on-chain failure pays none; a finalized network fee is still booked. A finalized successful batch must match the exact mint, source, destination and amount for every instruction before paid balances change. A batch can aggregate several epochs without losing component attribution.

`settled` means every purchase leg in the epoch's saved policy has been accounted for (five for legacy version 1; ten for new version 2). It never means all owners were paid. UI and exports show unpaid units separately. Transaction counts count signatures, not entitlement rows. Acquisition value and delivery value are never summed as two rewards.

## Costs and burn

Direct cost forecasts are bounded at 10% of round funding. A minimum unencumbered SOL reserve is preserved; the signing path checks current rent and fee allowance before signing. Unsupported/frozen accounts or failed simulation leave reservations in place. Actual network/rent costs are posted separately. Historical USD payment value is only meaningful when a settlement-time valuation exists; otherwise the application displays raw units and unavailable valuation.

Buyback acquires our mint into its own `burn-units:<intent>` account. A distinct checked-burn intent can burn only that acquired quantity. Failed burn does not create a new buyback or consume unrelated holdings. Operations have their own reserved budget and deterministic transfer intent, with a fixed approved recipient.

## Prospective EMBER10 policy

Version 2 preserves 80% reward purchases, 10% buyback/burn and 10% OPS/DEV after bounded direct costs. Its basket contains ten assets, with equal 1,000-basis-point purchase weights. Each leg is floor(basket budget / 10); remainder stays in the rounding partition. This is 8% of net new creator revenue per purchase budget, not 10% of all revenue.

The worked five-leg example above is explicitly historical version 1. Its stored policy, basket, snapshots, entitlements and liabilities are not rewritten by the upgrade. Settlement reads the epoch's saved policy dimension. New live commitments require version 2.

OPS/DEV rules have not changed in this update. The public dashboard does not derive a withdrawable payout from the headline allocation. Approved expenses, retained reserve, pending transfers and finalized developer payments are separate presentation fields; an unavailable authoritative breakdown remains unreported. The hosted prelaunch app has no configured receiving wallet or payment capability.
