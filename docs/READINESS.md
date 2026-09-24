> Current deployed revision: see [deployment identity](deployment.json). Read [Round 3 corrections and blockers](AUDIT-R3.md) before any financial work. External re-audit of this public correction is pending.

# Readiness as of 24 September 2026

| Area | Status |
|---|---|
| Public UI | Implemented; desktop and mobile inspected, real prelaunch discovery, empty/error/unavailable states checked; ordinary UI refuses demo financial records |
| Vercel deployment | Published and verified on the existing URL at e55be0f; see deployment.json and the latest public proof. No financial worker or signing |
| API and operator boundary | Implemented; address/limit validation, rate limiting, bearer authentication and public write rejection tested |
| Core accounting | Existing PostgreSQL tests pass, but R2/R3 identify open reconciliation, attribution and recovery defects; not financially ready |
| Durable worker | Not deployed; open R2/R3 forecast, expiry, WSOL and commitment-lifecycle blockers prevent a funded pilot |
| Local/test-chain settlement | Real transfer/burn/signer adapters and executable exercise included; **not executed to settlement** here because validator initialization and devnet faucet failed |
| Live market reads | Real Ember catalogue/config/quotes/payout/fee/holder responses observed and recorded; discovery works in the prelaunch UI |
| Live authenticated quote/build | **Blocked:** audit-reported live build instruction variants are rejected. No keyed project build acceptance test has passed |
| Real creator-fee ingestion | Conservative finalized matching/cursor implementation exists; **not tested for our pool**, which does not exist |
| Verified automatic basket selection | Deterministic policy implemented; needs a complete fresh reviewed liquidity/capitalization metrics feed and full-census RPC coverage before live commitments |
| Funded mainnet payouts | **Not configured, not tested, disabled** |
| Container deployment | Configuration provided; **not run** in this environment |
| Backup restoration | Guarded helper and procedure included; **not run**; standard PostgreSQL client tools required |
| Security audit | External R2 reviewed the previous revision; internal public corrections and financial failure reproduction are recorded. External re-audit pending; F-1 through F-14 remain open |
| Dependency audit | Fresh production scan: 5 high entries in the bigint-buffer chain, no moderate/critical entries; not clean. See `docs/evidence/r2/dependency-audit.json` |

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
