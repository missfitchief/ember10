> Current audit corrections and verification: [AUDIT-REMEDIATION.md](AUDIT-REMEDIATION.md). The original figures and walkthrough below are historical; funded operations remain disabled.

# Readiness as of 23 September 2026

| Area | Status |
|---|---|
| Public UI | Implemented; desktop and mobile inspected, real prelaunch discovery, empty/error/demo states verified |
| Vercel deployment | EMBER10 real-source prelaunch correction prepared for existing URL; exact publication result is recorded in deployment evidence; no financial worker or signing |
| API and operator boundary | Implemented; address/limit validation, rate limiting, bearer authentication and public write rejection tested |
| Core accounting | Implemented and tested against PostgreSQL: integer allocation, budgets, source attribution, liabilities, immutable records and recovery |
| Durable worker | Runs independently; persisted intents, signed bytes, lease fencing, restart reconciliation and synthetic replay tested |
| Local/test-chain settlement | Real transfer/burn/signer adapters and executable exercise included; **not executed to settlement** here because validator initialization and devnet faucet failed |
| Live market reads | Real Ember catalogue/config/quotes/payout/fee/holder responses observed and recorded; discovery works in the prelaunch UI |
| Live authenticated quote/build | Current Jupiter v2 adapters and instruction tests implemented; **not tested** with a project key/taker. One unauthenticated quote-only read succeeded |
| Real creator-fee ingestion | Conservative finalized matching/cursor implementation exists; **not tested for our pool**, which does not exist |
| Verified automatic basket selection | Deterministic policy implemented; needs a complete fresh reviewed liquidity/capitalization metrics feed and full-census RPC coverage before live commitments |
| Funded mainnet payouts | **Not configured, not tested, disabled** |
| Container deployment | Configuration provided; **not run** in this environment |
| Backup restoration | Guarded helper and procedure included; **not run**; standard PostgreSQL client tools required |
| Security audit | **Not audited** |
| Dependency audit | npm reported 17 advisories (10 high, 7 moderate) in the dependency tree; review/remediation required before funded use; report saved under `docs/evidence/dependency-audit.json` |

## External configuration required

- EMBER10 is the current product name. Do not use the competing EMBER5 mint as this project identity or buy URL.
- Create/verify our own mint and pool in a separately approved launch; confirm actual supply, decimals, legacy SPL semantics, authorities and quote asset.
- Configure a dedicated treasury, operations recipient, approved fee sender, confirmed Keep-it module and actual migration/fee route.
- Publish treasury, operations, team, vault, escrow and other justified exclusions. Custody owners are treated as owners; beneficial ownership is not invented.
- Supply primary and independent archival RPC endpoints with adequate history and a proven complete finalized token-account census contract.
- Supply a Jupiter API key, supported direct-route/program allowlist, and validate quote/build behavior for the actual amounts and all selected assets.
- Connect the metrics feed defined in `provenance.ts`. Current public market-cap fields have an unverified supply basis; missing verified liquidity/capitalization is a real remaining integration dependency.
- Configure a remote signer/secret store, server-side auth tokens, approved mints/programs, reserve, round/day caps and a time-limited approval file matching every actual address and limit. File test keys are not a mainnet option.
- Independently fund a limited keeper reserve, classify that capital from finalized evidence, and complete the actual five-test-mint exercise and restoration check.
- Run a separately approved, bounded funded pilot that verifies real fee attribution, acquisitions, actual payouts, costs, burn and archival recovery. Do not infer these results from passing synthetic tests.

## Limits deliberately enforced

No token extensions, transfer hooks/taxes, rebasing assets, claim flow or native Ember Stock Basket integration. Jupiter routes outside the decoded direct exact-input subset remain pending. No automatic replacement for an ambiguously expired transaction. Treasury operations serialize while unresolved. Current implementation prioritizes correct obligations over high-volume throughput.

`APPROVAL_FILE` has a strict schema in `packages/core/approval.ts`; setting its filename alone does not authorize a pilot. The application checks identities, approved assets, expiry, budget bounds and mandatory exclusions. Real signing additionally requires the remote signer and master broadcast switches. This source delivery is not approval to deploy or spend.

## EMBER10 correction

New prospective purchases use policy version 2 with ten equal basket budgets; historical version-one five-asset records remain intact. Real catalogue availability does not verify investment eligibility. The hosted ledger and OPS/DEV amounts are unavailable until an actual authoritative backend is configured. User confirmed that the existing OPS/DEV rules remain unchanged.
