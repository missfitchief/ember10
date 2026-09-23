> Current audit corrections and verification: [AUDIT-REMEDIATION.md](AUDIT-REMEDIATION.md). The original figures and walkthrough below are historical; funded operations remain disabled.

# Build verification — 23 September 2026

This is a runnable local controlled-pilot MVP. Synthetic settlement is proven against PostgreSQL. Real funded Solana settlement has **not** been completed here.

| Check | Result |
|---|---|
| `npm run build` | Passed TypeScript checking and Vite production bundle |
| `npm test` | **43 passed**, 3 test files; actual PostgreSQL with an isolated disposable schema |
| `npm test -- tests/hosted.test.ts` | **7 passed**; Vercel runtime context, recorded demo integrity, wallet records, exports, route restrictions and fail-closed backend forwarding |
| Prelaunch startup | API, independent worker, web and persistent UTF-8 PostgreSQL started locally |
| Synthetic demo | One funded epoch, five acquisitions, 15 credits, five payout transactions, unpaid carry and distinct buyback/burn |
| Restart protocol | Real child processes exit at three crash points for both purchase and payout intents; replay retains one economic transaction per successful intent |
| Public UI | Desktop and mobile inspected; prelaunch emptiness, discovery, demo partial delivery, malformed and valid address lookup, epoch inspection and export links |
| Ember reads | Actual current responses and sanitized fixture recorded |
| Mainnet RPC identity | Read-only genesis checked; full observed identity regression-tested against test-mode execution |
| Authenticated Jupiter build | **Not tested**; project API key/taker absent |
| Real creator-fee attribution | **Not tested** for this project; no project pool exists |
| Test-chain settlement | **Not completed**; validator initialization and devnet faucet failed; executable procedure delivered |
| Backup restore / containers | Procedures/configuration included, **not executed** here |
| Funded mainnet transactions | **Not configured, not tested, disabled** |

## Coverage

`core.test.ts` verifies exact allocation across tiny/extreme values, deterministic ties, zero-holder rejection, integer remainder conservation, stale/minimum/cost gates, aggregation before threshold, exclusions, incomplete or inconsistent census rejection, observed market schema parsing, deterministic candidate exclusions, unsupported semantics, exactly-five membership, payout economics and mode gates.

`engine.test.ts` uses actual SQL migrations. It verifies instruction-level receipt deduplication, separate capital/deposits/quarantine, immutable snapshots and ledger, per-source receipt conservation, cost refunds, nonnegative balanced accounts, worker fencing, expired leases, pause behavior, unknown/expired transactions, partial purchase recovery, actual acquired-unit allocation, atomic payout failures, dust after restart/sale/basket rotation, failed burns, deficits, funding-route changes and public/operator separation.

The child-process crash matrix covers both purchases and payouts after signed-byte persistence, after broadcast, and after observing successful execution but before database settlement. The chain is an explicitly synthetic persistent PostgreSQL adapter. This proves the application's recovery protocol, not RPC reliability or live liquidity. An identical-byte resend may occur while resolving uncertainty; each successful logical action retains one signature and economic result.

`integrations.test.ts` checks real test-message signing, full mainnet-genesis rejection, master-pause gates, failed simulation, exact unit conversion, authenticated-client requirements, and decoded Jupiter instructions with wrong signers, destinations, input amounts and slippage. Destination/rent failure behavior uses injected status inputs in engine tests. Actual frozen-account and missing-ATA transactions remain part of funded test-chain validation; fixture coverage is not real chain evidence.

## Demo trace

Open `http://127.0.0.1:5174`. In Rewards, inspect `demo-epoch-001`, then use JSON for the complete trace or CSV for allocation rows. The saved export is `docs/demo/sample-epoch.json`.

- Funding: 1 synthetic SOL creator receipt; 0.2 separate synthetic SOL execution capital.
- Cost allowance: 0.02 SOL. Net distributable: 0.98 SOL.
- Five purchase budgets: 0.1568 SOL each; buyback and operations allocation: 0.098 SOL each.
- Each acquisition: 784 units at six decimals, allocated exactly to three eligible owners.
- Each asset: 641.454546 delivered to two owners; 142.545454 still owed to the third.
- Below-threshold owner: no credits. Alice's two accounts aggregate before eligibility.
- Buyback and burn: separate successful synthetic intents. No fabricated explorer links.

With the demo worker stopped and its lease expired, `npm run demo` replays the same epoch without creating acquisitions, entitlements or deliveries again. For the repeatable crash demonstration on a fresh isolated schema:

```sh
npm test -- tests/engine.test.ts -t "terminates a real child"
```

## Remaining validation

The public catalogue is insufficient for verified comparable liquidity/capitalization ranking. A complete fresh reviewed metrics feed and guaranteed complete finalized holder coverage remain external dependencies. Actual test-chain transfers/burns, real project fee receipts, remote signing, authenticated builds, backup restoration and a separately approved bounded mainnet pilot must pass before launch. See `READINESS.md` for precise configuration requirements.
