# DATA-01 schema, provenance and ranking mapping

The hosted failure was mode selection, not evidence that the old rank sort was wrong. In baseline `e67ed95ff9d6783f4583bc832a33270e26c32ac5`, `vercel.json` rewrites `/api/*` to `api/index.ts`; the wrapper calls `apps/api/hosted.ts`. That file statically imported `deploy/hosted-demo.json` and returned it whenever `EMBER5_API_ORIGIN` was absent. It did not invoke `EmberClient`, read a production database, or run discovery. The frontend fetched those ordinary API routes and displayed their five synthetic basket members, demo mint and historical demo ledger. The recorded-demo notice was accurate; the ordinary public mode was wrong for this requirement. No seed migration or stale upstream cache was necessary for the fixture to appear.

The replacement production entry never imports the demo archive. `/api/overview` fetches the actual read-only Ember catalogue and configs, normalizes the full response, ranks, evaluates evidence and then projects bounded pages. Missing external ledger configuration produces nullable unavailable responses. Configured ledger forwarding first verifies `mode` is prelaunch/live and rejects demo/test/hosted archives. Demonstration scripts, fixtures, existing database namespaces and immutable history remain separate.

## Verified current source (23 September 2026)

- Catalogue: https://embercurve.fun/api/solana/markets . Complete response captured at `2026-09-23T15:03:19.224Z`, 7,937,295 bytes, 3,062 rows, `warming:false`.
- Config registry: https://embercurve.fun/api/solana/configs . Captured at `2026-09-23T15:03:19.943Z`, 2,966 entries, count2,966, `updatedAt:1790175809`.
- Documentation: https://embercurve.fun/developers . Current first-party JS `DevelopersPage-CbrXjcgu.js` describes the endpoint as all coins, refreshed every15seconds. Notes say reads use5–60second server snapshots and request cadence no greater than1request/second/endpoint. No markets pagination, total-count contract or catalogue as-of time is documented or returned. Catalogue response cache-control is `public,max-age=5`; config response60seconds. Our normal cadence45seconds, configurable30–60, with one retry after1second and8second attempt deadlines.
- Complete public JSON fixtures are in `tests/fixtures/ember-catalogue-2026-09-23.json` and `ember-configs-2026-09-23.json`. They contain only the public provider response. Production imports neither file. Hashes, per-mint exclusion evidence and raw/filtered top-ten comparisons are in `DATA-FIX-PROOF.json`.

## Mapping

| Source | Public field / handling |
|---|---|
| `markets[].mint` | Full base58 32-byte mint identity; symbols never identify assets. |
| `pool`, `dammPool`, `graduated` | Documented DAMM after graduation is the display canonical pool when present and valid; otherwise curve pool. This is a source claim, not verified on-chain pool provenance. |
| `config` + registry `configs[].config` | Catalogue registration check only; on-chain pool/config derivation and fee claimer remain unknown. |
| `marketCapUsd` | Decimal string normalized directly in USD, no second multiplication by SOL/quoteUsd. Missing/empty/formatted/nonfinite/negative/excessive exponent values become null. `marketCapUsd` does not establish circulating-supply basis. |
| `priceUsd`, `volume24hUsd`, `change24h` | Nullable validated decimal strings; change permits negatives. Absent `change24h` is null. |
| `createdAt` | Epoch seconds → creation date. Never presented as a market observation time. |
| `holders`, `holdersCapped` | Low reported holder count may exclude; a positive count never establishes full census or passing holder eligibility. |
| `quoteReserve` | NOT used as comparable USD liquidity. Its units and one-sided reserve do not prove required market depth. |
| `suspect` | Source-defined rankability exclusion; values and mint retained for inspection/search with rank null and reason. |
| `warming`, invalid rows, incomplete config fetch | Explicit warming/partial coverage; no new commitments. |
| HTTP request completion | `fetchedAt` and `lastSuccessfulAt` only. Cached/stale replies preserve this timestamp; `sourceTimestamp` stays null. |
| `economics`, `totals`, modules, platform payments | Not mapped to EMBER10 revenue, balances, or payments. |

Every source row is schema-checked. Bad rows are counted, coverage becomes partial, and new commitments stay blocked. A duplicate mint with the same canonical pool and market-cap value is collapsed, never summed. Conflicting pools/configs/caps cause a null rank/value and explicit reason rather than an arbitrary canonical choice. Current duplication is one identical HEATBLAST pool/mint record with a1second creation-time difference. There are3,061unique mints.

## Why raw top ten differs from Ember's displayed list

The current first-party `https://embercurve.fun/assets/index-BnVC4qJ7.js` filters `suspect:true` in the market context and again in its market-filter helper. Two such rows (AR and CLANKER in this observation) carry very high reported values but do not appear in the source's normal list. This implementation applies that source-defined flag, not a name list, and retains them as excluded inspectable records. Raw top ten including them is retained in proof. The source UI displays3,060rows after removing2suspect rows; we rank3,059mints after also deduplicating1row. Parent browser evidence at15:05:18Z agrees on the displayed leaders. Market values change between reads; no historical screenshot value is seeded or expected in production.

## Market, eligible and funded are separate

Observed ranking uses source-filtered reported USD market cap and deterministic binary mint tie-break. It does not claim verified circulating cap or reward eligibility. Existing acceptance thresholds are unchanged: Ember/on-chain origin, graduation,24hour age,$10k liquidity,$5k24hvolume,50owner complete census, supported SPL with revoked mint/freeze authorities, category, budget-sized route, own-token exclusion, fresh/comparable basis. Missing evidence is unknown; it is never converted to a pass. No current source row has all required evidence, so eligible count is0 and new purchases pause. This is not a five-member or synthetic fallback.

Policy2 selects the first TEN fully eligible candidates from the entire verified candidate universe,1000bps each. Policy1 is retained for immutable historical five-member records and explicitly named legacy demos/chain regression. New live commitments reject policy1. Exact budget arithmetic uses policy size, preserving80/10/10 and rounding attribution. Settlement completion reads each epoch's immutable policy rather than today's leaderboard; OPS/DEV scheduling formulas are unchanged.

Public funded-basket and accounting data are unavailable without a verified project ledger. No fresh market list becomes an epoch. Browser navigation, public address lookup and candidate inspection never require wallet permissions.

## Resource bounds

Read timeout8seconds per attempt,2attempts,1second backoff, no redirects,12MB streaming source cap,20,000row schema cap. Concurrent reads share one in-flight request and45second instance cache. Unavailable initial reads return no markets. Failed refreshes retain explicitly stale last-good data only in memory, preserving original fetchedAt. Cold starts do not import a seed fixture.

`/api/overview?q=&offset=&limit=` searches/ranks the full normalized catalogue before returning at most100rows and explicit `marketPage` counts. No selection is limited to the first page. This avoids Vercel's response-size limit; the full per-mint proof remains an operator artifact. Currency values retain source JSON precision (binary numeric values already rounded upstream); no claim of arbitrary original-source precision is made.
