# R3 financial evidence update — read-only

Source reviewed: `ad972e70e0b946eb0c73712ff88a7d6e090f1d1d`. No repository changes, signer calls, broadcasts, credentials access, funds, or database writes. Financial execution remains out of scope. The attached R3 report is supplied evidence; the following two HTTP captures and schema checks were independently executed here on 23 September 2026 at 23:30 UTC.

## F-5: correct the earlier global-window inference

| Public pool | Window | Matching published-row shape | Actual installed `EmberClient.payouts()` result |
|---|---:|---:|---|
| `4isa4qXav8juubpkUduS93hbr72Pm76dLcYTWRCqnAJQ` | 100 rows, 39,487 bytes | 37 signed `payout` / `keep` / WSOL rows with positive amounts accepted by `decimalUnits` | Accepted, 100 rows |
| `6sg6ubMzZKKD5WcpbYDoXTJzzHxSLJ8Huy1agt8cMV9S` | 2 rows, 691 bytes | 0 | `ZodError` at `payouts[0].signature`: expected string, received undefined |

Sources: [first pool window](https://embercurve.fun/api/solana/payouts?pool=4isa4qXav8juubpkUduS93hbr72Pm76dLcYTWRCqnAJQ), [second pool window](https://embercurve.fun/api/solana/payouts?pool=6sg6ubMzZKKD5WcpbYDoXTJzzHxSLJ8Huy1agt8cMV9S). Both returned HTTP 200. The exact supplied live row counts and strict-schema failure are independently reproduced, although the first pool's most recent amounts have changed since the auditor's earlier capture.

The second pool contains a signature-less `sweep` row with mode `keep`, WSOL, and amount `0.0072`; its note describes small-round dust booked to platform treasury. The code requests the pool-filtered window before examining native transfer signatures. A single such row therefore rejects the window before ingestion can proceed. Later matching evidence still cannot reclassify an already persisted review receipt: the ingestion cursor advances and `Engine.ingest` returns on its duplicate ID. This latter lifecycle point was confirmed by source reading, not a new database execution.

The prior historical global window showed no compatible rows; it never established that every real Keep-it pool lacked them. Any broader assertion that the attribution predicate cannot match is superseded. Matching published-row fields is **not** verified project revenue: no on-chain sender, recipient, instruction uniqueness, exact transfer amount, finality, funding route, or project identity was independently checked in this task.

`f5-pool-evidence-results.json` records URLs, exact request/response times, response byte counts and SHA-256 hashes, row counts, three compatible examples, the signature-less row, and the actual schema result. Full response bodies were kept only in memory, not saved. The source body's hashes identify the fetched bytes; the saved samples alone cannot reconstruct those complete bodies.

## F-3: retry margin correction, no policy change

Executed local BigInt arithmetic and the actual `bindNativeCost` admission function, using a 100,000-lamport fee cap and 2,039,280-lamport ATA rent. This does not execute a financial worker, database, chain settlement, or signer.

The current forecast is 23,632,080 lamports. The earlier proposed extra-WSOL-float forecast is 25,671,360. It covers eleven successful swap/buyback transactions and a burn, but only with **zero finalized failure fees at the cap**. After ten successful purchases/buyback transactions at the cap, one failed attempt, and the burn, available cost cash is 4,078,560; the retry needs 4,178,560. The actual admission check rejects it with a 100,000-lamport shortfall.

Adding a single explicit 100,000-lamport retry allowance gives 25,771,360 and passes the one-failure case; two failures exhaust that margin. Generally the arithmetic proposal is `(size + 2) * rent + (size + 2 + k) * maxFee`, with `k` a deliberately chosen bounded retry budget. No value of `k` was selected or implemented. This remains a financial design decision, not an automatic fix or funded-pilot readiness claim.

At 5,000-lamport actual fees and the same 100,000-lamport admission cap, the no-extra-retry proposal passes this ordering with 209 failure fees and fails with 210; relying on low current fees would be unsound. Under the policy's 10% cost ceiling, the minimum implied round for the extra-float proposal is 256,713,600 lamports, or 257,713,600 with one capped retry fee. Holder delivery costs remain separate: four new recipient ATAs plus the capped fee require 8,257,120 lamports above the reserve floor, not from this epoch cost forecast.

## N-M1 through N-M6: source review only

| Finding | Code reviewed | Assessment and execution limit |
|---|---|---|
| N-M1 | `main.ts` swap builder, `control.ts:15-29`, `solana.ts:99-104` | Consistent with source. Build approval is loaded separately; final authorization compares two reads inside its own callback, without binding the built transaction to that generation. No approval-change race was executed. |
| N-M2 | `ingestion.ts:33-45` | Consistent with source. Current-owner account enumeration is followed by whole history on first sight; inbound transfers are credited without an ownership baseline or matching outbound history. No authority-transfer transaction or ledger exploit was executed. |
| N-M3 | `queries.ts:41-43`, `001_initial.sql:17`, `store.ts:7,15,21` | Consistent with source. Health uses maximum `created_at`; ledger timestamps default to `now()` while transactions begin before acquiring control locks. No concurrent PostgreSQL timing test was executed. |
| N-M4 | `main.ts:31,49`, `ingestion.ts:31`, `INTEGRATIONS.md:35` | Confirmed source/document mismatch: the live funding-route call passes `force=true`, using TTL 0; unforced funding-route TTL is 45 seconds. A statement that live financial discovery uniformly uses 60 seconds is inaccurate. |
| N-M5 | `runner.ts:85-96`, `solana.ts:140-144`, `control.ts:15-29` | Confirmed source mechanism: stored-byte resend calls full execution authorization before broadcast, and again at the adapter boundary; denial returns without an explicit reason. No transient-provider or blockhash-expiry reproduction was executed. Changing resend authorization requires a reviewed financial policy; this report does not endorse removing revocation/economic checks automatically. |
| N-M6 | `runner.ts:66-69,101-106`, `store.ts:13-14,27`, `engine.ts:100` | Plausible, narrowed to slow inspect/apply evidence and lease expiry. Tick grants 120 seconds; apply re-fences; caught settlement errors cause a generic incident and pause. No >120-second stall or lease-expiry scenario was executed. |

The public-fix scope remains unchanged. These findings update the audit record and funding blockers; they do not authorize financial remediation or operation.
