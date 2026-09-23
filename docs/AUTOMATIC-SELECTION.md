# Automatic selection and evidence

This implementation separates the observed Ember ranking, current eligible selection, and immutable funded epoch. It does not authorize a signer or supply a missing provider contract.

`MarketDataService` fetches the full markets/config endpoints ordinarily every 45 seconds. Numeric values and mint identities retain the existing normalization, deterministic ranking, suspect exclusions and explicit undocumented supply basis. Concurrent reads coalesce. Failed refreshes retain the original successful timestamp and back off exponentially to 300 seconds.

`AutomaticSelectionService(policy, ownMint, provider)` produces a persistable `SelectionObservation`. Use `read(routeBudget)` for the current view and `revalidate(routeBudget)` immediately before each new commitment. The latter bypasses successful caches, refreshes the full catalogue and every candidate gate, verifies that all ten routes match the actual per-asset budget, and returns a new basket. A previous day's or hour's basket is never reused as current evidence. `revalidateBasket` returns a freshly evaluated basket; callers must freeze that return value rather than a historical input. Root integration persists observations and atomically freezes the new epoch. Existing epoch members, policy bodies, evidence, credits and obligations are not rewritten.

Ordinary reads cache for 45 seconds; provider failure backs off to 300 seconds. Concurrent forced checks serialize, including different budgets. No persisted selection is trusted after process restart: the first commitment must fetch evidence again. The provider traverses the complete normalized universe using three candidate verifiers concurrently (configurable only within 1–8). Unsupported/unknown candidates remain explicit exclusions. Incomplete catalogue/config/metric coverage blocks all new commitments. Complete evidence with fewer than ten qualifying mints also blocks them.

## Approved automated metric contract

The approval needs `selectionEvidence` with `version: "ember-evidence-v1"`, an HTTPS `metricsEndpoint`, an explicit `allowedOrigins` array of exact HTTPS origins, and `catalogueCompleteContract: true` only after reviewing that coverage contract. Endpoint credentials must not be embedded in public output; returned source references strip URL queries. Redirects are rejected and response size is capped at 12 MB. There is no metrics-file reader in the automatic path. An old `metricsFile` field cannot authorize new observations.

The machine feed responds with `schemaVersion: 1`, `observedAt` in Unix milliseconds, `complete`, `catalogueHash`, and `candidates`. The hash must equal the project's canonical SHA-256 of the sorted unique mint array from the current full catalogue. Each current mint must appear exactly once; extra/missing/duplicate records fail the contract. Every candidate record has:

- `mint`, canonical graduated `pool`, `at`, approved HTTPS `source`, and a 64-character SHA-256 `evidenceHash` referring to the provider's evidence.
- Exact nonnegative integer strings `liquidityMicroUsd`, `volumeMicroUsd`, `rankValue`, `priceMicroUsd`, and `supplyAmountRaw`; integer `supplyDecimals` from 0 through 18.
- `rankBasis` of `circulating_market_cap` or `total_supply_fdv`; a documented `supplyBasis` that is neither unknown nor undocumented; `category` of `token`, `stock`, `stablecoin`, `lp`, or `unverified`.
- `volumeWindowStart`, `volumeWindowEnd`, and `volumeComplete`. The interval must be exactly 24 hours and end at a fresh time, never in the future.

The producer recomputes rank from supplied units and USD price, checks freshness against the approved policy, binds pool identity to the current catalogue, checks supply against the on-chain mint, and requires exact total supply when using FDV. Circulating supply, classification and complete 24-hour volume history remain **reviewed provider attestations**, not facts inferred from a ticker or vault balance. HTTPS/origin/schema validation does not independently certify those facts. A real reviewed service implementing this contract must be configured; none was supplied with this task. The public Ember `marketCapUsd` value is never relabeled as verified circulating market cap.

## Independent on-chain checks

The read-only producer uses the installed Meteora SDK and Solana RPC to verify DBC program ownership, pool PDA, base mint/config, expected Ember fee claimer, migration flag, derived DAMM v2 pool, enabled pool state, mint pair, standard SPL semantics and vault authority. Unknown migration configurations and DAMM v1 routes remain blocked. It verifies revoked base mint/freeze authorities through the existing selection gates, excludes extensions, obtains a supply-matched complete holder census, and caps provider liquidity by observed vault USD value after known protocol fee balances.

Pool age requires a successful finalized DBC SPL pool initializer whose decoded account positions match this config, mint and pool, with a funded post-state. An arbitrary old transaction mentioning the PDA cannot establish age. The producer checks the source signature first, then at most three oldest transactions from a bounded 100-signature pool history. A busy pool without its initializer in that bounded search remains unverified rather than accepting a catalogue age assertion.

Budget route checks decode the supported direct Jupiter instruction and verify amounts, signer, output mint/destination, minimum output, slippage/impact and approved executable programs. No transaction is signed or submitted. Execution must still run the normal fresh swap builder, program, signer, destination, asset-semantics, cost and spend controls before signing. Admission comes from fresh verified selection evidence or an existing frozen obligation, never catalogue listing alone.

Evidence RPC requests have an 8-second timeout, disable unbounded rate-limit retries, and cap each response at 24 MB. The configured RPC endpoint must provide the approved complete-census contract. Oversized/incomplete responses do not truncate into a purported complete census.

## Validation and limits

New automatic-selection tests cover A leaving/B entering within one day, new mint discovery, identical symbols, conflicting mint evidence, partial/warming coverage, stale metrics, fewer than ten, budget/route failures, provider outage/backoff, cold restart, bounded parallel work and every eligibility gate rechecked before freeze. These coordinator/provider tests use controlled evidence; they are not claims of live eligibility or funded execution. Existing core selection/accounting tests remain intact.

A read-only source fetch on 23 September 2026 is recorded outside the repository in `outputs/EMBER10-backend-review/selection-readonly-source.json`. It confirms a real current catalogue and the still-undocumented supply basis. No reviewed metrics feed, complete-census RPC contract, live signer or financial-worker deployment was supplied or enabled. The chain verifier is implemented and typechecked, but not independently validated on a chain in this task. The original backend audit/probe files were not included in the provided attachment; exact B01–B11 mapping belongs in the integrator's final report after reconciling those documents.

Primary implementation references: [Meteora's DBC migration guide](https://github.com/MeteoraAg/meteora-invent/blob/main/skills/meteora/references/dbc.md), [Meteora DAMM v2 SDK](https://github.com/MeteoraAg/damm-v2-sdk), and the installed `@meteora-ag/dynamic-bonding-curve-sdk` 1.5.12 account IDLs/derived-address functions. SDK-defined token/PDA fields are checked directly; unknown semantics fail closed.
