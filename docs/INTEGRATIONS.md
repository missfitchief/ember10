# Integration evidence — verified 23 September 2026 UTC

Raw public responses and timestamps are under `docs/evidence/`. These are untrusted source data, never signing instructions. “Observed” means a real read-only request was made. No mainnet transaction was signed or broadcast.

| Surface | Actual observation | Confidence / execution consequence |
|---|---|---|
| Ember developers / how | HTTP 200 application shells; public JS documentation chunks inspected | High for documented routes, not proof of economic execution |
| `/api/solana/markets` | HTTP 200; initial response 7,876,999 bytes, 3,040 rows; later reads changed | Observed schema; current reader and evidence collector share a 64 MB cap, with a 50,000 row schema bound and warnings at 80% of capacity. All rows remain unverified candidates. |
| `/api/solana/quotes` | HTTP 200; `economics` and 1,291 `quotes` | `shareByMode.keep.pctOfTax=32`; SOL quote support observed; no project launch attempted |
| `/api/solana/configs` | HTTP 200; `program`, `partner`, `feeClaimer`, `configs`, `count`, `updatedAt`; 2,949 configs in initial capture | Off-chain list is checked against decoded on-chain config/pool identity before selection |
| `/api/solana/pools.csv` | HTTP 200; historical CSV with mint, DBC pool/config, DAMM pool and launch metadata | Historical catalogue evidence only |
| `/api/solana/fees/pool/:pool` | HTTP 200 for the observed platform-token pool; decoded fee-source and tax fields captured | API includes graduation/migration-dependent fee fields; our funding route is not configured |
| `/api/solana/payouts` | HTTP 200; latest 100 `payouts` in initial default response | Numeric human-unit amounts require exact chain matching; no proven complete cursor/pagination contract |
| `/api/solana/holders/:pool` | HTTP 200; response reported 22,057 total owners, size 10, pages 5 | Confirms a top-50 display window, **not** a full census |
| Wallet report | Documented, no project-specific wallet available | Not used as authoritative ledger |
| Jupiter v2 `/order` | A real unauthenticated quote-only request returned HTTP 200, `transaction:null`, `taker:null` | Actual quote observed, but not an authenticated build or executable transaction |
| Jupiter v2 `/build` / `/execute` | Current primary docs reviewed; server-side adapters and conservative instruction validation implemented | No project API key/taker configuration; authenticated build/execute **not tested** |
| Solana devnet | `getGenesisHash` succeeded with devnet identity; a fresh test-key faucet request failed with “Internal error” | RPC reachable, no funded test settlement completed |
| Local Solana validator | Installed CLI 4.0.3; startup failed while unpacking genesis with Windows access denied | No local-validator receipts claimed |

## Observed schemas

Market envelope: `{economics, warming, totals, markets:[...]}`. A market contains `mint`, `pool`, `config`, optional `dammPool`, `creator`, `mode`, `quoteMint`, `feeBps`, `createdAt`, `graduated`, and reported price/volume/capitalization/holder fields. `tests/fixtures/ember-market.observed.json` preserves three actual rows with source/date; synthetic eligibility overrides are explicitly separate in tests.

Payout envelope: `{payouts:[{kind, mode, pool, quoteMint, amount, signature, at, ...}]}`. The API amount is human units, not authoritative raw transfer units. The ingestion adapter recognizes only uniquely matched finalized native SOL Keep-it transfers. Other representations or ambiguous aggregation stay out of free revenue.

Observed fee state includes `feeSource`, `dammPool`, `graduated`, `taxBps`, `creatorSideBps` and published payouts. The platform token observed in the catalogue is `5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6`; this is a source observation, not a guarantee that it qualifies for our basket.

Jupiter build schema includes quote mints/amounts, `otherAmountThreshold`, `slippageBps`, `priceImpactPct`, raw instructions, lookup-table addresses, and blockhash metadata. The implementation asks for direct V1 exact-input routes and zero platform referral fee, independently decodes the Jupiter instruction, constructs ATA/SOL wrapping locally, resolves actual lookup tables, checks allowed executable programs, simulations, current fees and minimum output. New/unknown route formats are rejected, not signed optimistically.

## Fee and rate assumptions

The 32% Keep-it figure is a dated platform observation. Some descriptions still refer to “80%”; this inconsistency is preserved as an uncertainty. No forecast fee percentage creates spendable funds. Our 80/10/10 is a separate versioned project policy applied only after verified funding and direct costs.

Ember's developer documentation says reads are cached for 5–60 seconds and recommends no more than one request per second per endpoint. The financial EmberClient discovery cache is 60 seconds; the separate public MarketDataService cache is normally 45 seconds (bounded to 30–60 seconds); other reads use conservative caches and bounded retries with backoff for 429/5xx. No private RPC proxy is reused. Jupiter documentation says to use `x-api-key`, while the public quote-only probe happened to work without one. The pilot adapter still requires a key. Router `/build` is documented without a Jupiter swap platform fee; network, priority, rent and route-specific trading costs must still be inspected. Metis v2 order/execute has separate platform fees and RFQ expiry rules; the baseline executor uses self-managed `/build` and the original blockhash lifetime.

## Unresolved evidence

There is no project mint, pool, treasury, operating wallet, approved signer or funded mainnet pilot. Keep-it's actual recipient behavior for **our** pool, graduation/migration effects, receipt attribution and live payouts are unverified. The catalogue does not establish complete, comparable circulating capitalization or verified current pool liquidity. The reviewed metrics feed contract in `provenance.ts` is required until a provider is connected and its coverage is validated. Stale/incomplete metrics prevent selection; zero/FDV is never silently substituted for unavailable market cap.

The full-holder adapter uses one finalized, context-bearing mint-filtered `getProgramAccounts` response, aggregates by owner, checks mint/program/state and compares supply. A provider completeness contract must be explicitly configured; pagination and `minContextSlot` are not represented as historical exact-slot queries. Supply's separate returned slot is retained.

Primary references: [Ember developers](https://embercurve.fun/developers), [Ember economics](https://embercurve.fun/how), [Jupiter Swap v2](https://developers.jup.ag/docs/swap), [Jupiter build](https://developers.jup.ag/docs/swap/build), [Jupiter instruction parser](https://github.com/jup-ag/instruction-parser), [Meteora SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk), [Solana program accounts](https://solana.com/docs/rpc/http/getprogramaccounts), [signature status](https://solana.com/docs/rpc/http/getsignaturestatuses), [transaction evidence](https://solana.com/docs/rpc/http/gettransaction), [token accounts](https://solana.com/docs/tokens/basics/create-token-account).
