# Round 2 remediation and review handoff

The supplied second audit reviewed source `4f9fba2` and deployed application `1f67d0d`. It confirmed the public source/deployment match and identified further public defects and financial blockers. This round implements public corrections; it does not authorize or enable financial execution. Financial policy, ten equal purchase budgets, 80/10/10 allocation and OPS/DEV rules are unchanged.

## Public findings

| Finding | Implementation / remaining limit |
|---|---|
| P-1: expanded search collapses on polling | Searches and filtered views retain their observation and expanded rows. A changed parent observation presents an explicit refresh notice. The executable browser regression retains 140 default and searched rows through a 45-second poll, then explicitly refreshes back to 20. Cross-instance pages still require identical observation identity; mismatches are rejected rather than silently merged. |
| P-2: catalogue growth limits | Shared 64 MB / 50,000-row bounds, 80% capacity warning, public coverage note, explicit row-limit failure and stale-data retention. The evidence collector uses the same byte limit. This is a bounded headroom increase, not an unlimited catalogue or an external alert service. Operators must monitor structured capacity warnings. The separate financial metrics/Jupiter provider limits remain 20,000 and are not changed by the public catalogue cap. |
| P-3: arbitrary approved-host image CIDs | See image-proxy implementation and regression evidence in this round. Catalogue membership constrains upstream work; it does not make known-catalogue traffic immune to denial of service. |
| P-4: inconsistent multiword search | Client field order matches the server: mint, name, symbol. Regression compares results against the actual overview function. |
| P-5: timeout, partial loading, outage and accessibility | API requests have a 28-second deadline, beyond the server's shared 25-second proxy budget. Ledger, epoch and status requests update independently. Unavailable basket projections are never called complete. Semantic hero groups and a persistent mobile navigation target replace invalid/absent ARIA targets. Index HTML is included in deployed byte comparison. |

P-5's server identity limitation remains: an environment revision plus byte-identical frontend assets does not cryptographically attest the deployed server function. Vercel deployment identity and source metadata are recorded; no independent server artifact attestation is claimed. The configured backend's 4 MB export cap and generic error classification also remain open.

## Financial findings: no funded-pilot approval

| Finding | Current status / required next evidence or work |
|---|---|
| F-1 | Open: built-in evidence cannot verify all policy requirements; no complete reviewed metrics service exists in this delivery. A provider/product decision is required without silently relaxing policy. |
| F-2 | Open: both audit-reported Jupiter discriminators fail the installed decoder. Need a read-only keyed build capture and a reviewed compatible validator for actual allowed routes, amounts and accounts. Unknown instructions remain rejected. |
| F-3 | Reproduced independently: current 23,632,080-lamport forecast fails the eleventh build. An additional WSOL float gives 25,671,360 in the tested assumptions. The financial implementation is unchanged this round; do not treat the earlier S1-06 closure claim as valid. |
| F-4 | Open: no evidence-backed terminal retirement/release path for ambiguously expired attempts; priority-fee handling also requires review. |
| F-5 | Open: historical payout window has no matching keep/payout/WSOL rows, and malformed irrelevant rows reject the strict window. Need an actual configured Keep-it pool sample plus finalized chain attribution and safe quarantine re-attribution. |
| F-6 | Open: existing/prefunded WSOL accounts can block builds; stranded commitments and residual WSOL accounting need lifecycle and original-transaction evidence fixes. |
| F-7 | Open: missing ATAs for registered assets and own-token/burn reconciliation. |
| F-8 | Open: noncanonical token-account dust attribution and fee-race surplus handling. |
| F-9 | Open: repeated full-catalogue reads on funding-route authorization. |
| F-10 | Open: cap changes do not invalidate old pending commitments; deferred daily spend can combine. |
| F-11 | Open: one failed DEV payout can exhaust its retry allowance without a retirement/replenishment path. |
| F-12 | Open: inconsistent selection-cache budgets and slow revalidation can expire a quote. |
| F-13 | Open: operator pause can race after authorization and before sign/send. |
| F-14 | Open: status-observation I/O, zero-value storage, generic errors, Retry-After parsing, ingestion lease scope, capital attribution, policy-version and database-role/platform safeguards. |

The independent money-path review and executable eleven-build harness are in `evidence/r2/`. Their mock instructions/RPC prove the forecast failure, not live Jupiter compatibility or finalized settlement. F-7 through F-14 retain the supplied auditor's findings and were not independently re-executed in this remediation round. The five high dependency entries also remain disclosed.

## One-PC ownership and integration

The integrator owns `audit/r2-integration`. The frontend specialist implemented P-1/P-4/P-5 in `audit/r2-public`; a separate specialist reviewed F-1 through F-6 and implemented the bounded image authorization change in the reused specialist worktree after frontend handoff. Only the integrator merges, publishes and records the final revision. Shared API meanings stay unchanged: observed ranking is not verified eligibility or a funded basket. No manual two-PC transfer is needed.

## Review request

Review the complete frozen package identified by `deployment.json` and its manifest. Re-run public regressions and inspect desktop/mobile screenshots. Distinguish developer implementation claims, independently executed local evidence and unexecuted external dependencies. Keep financial work disabled; no live signing, broadcast, funding or production migration occurred in this round. This package is prepared for review; it is not a passed independent external audit.
