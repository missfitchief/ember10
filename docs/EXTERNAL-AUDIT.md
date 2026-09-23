# EMBER10 external audit brief

Review the complete frozen source package. The manifest identifies the package commit and per-file hashes. The deployed application is **ed67a05f7b676108a98dcaf29460d2fdc60fecc6**; subsequent audit preparation changes documentation and reviewer tooling only. Public application, financial code, policy and migrations remain byte-identical to that application revision.

Repository: https://github.com/missfitchief/ember10

Read-only pilot: https://ember5-pilot.vercel.app/

## Start here

1. [Package entry point](../AUDIT-START-HERE.md), [current findings register](AUDIT-FINDINGS.json) and [R2 correction](AUDIT-R2.md).
2. [Reproduction commands](AUDIT-REPRODUCE.md), [verification](VERIFICATION.md), [deployment identity](deployment.json) and [readiness](READINESS.md).
3. [Supplied R2 audit](evidence/r2/supplied-audit.md), plus [the original audit](evidence/external-audit/original-audit-redacted.md). The [first-round register](evidence/external-audit/findings.json) describes application 1f67d0d and is historical. Its S1-06 implementation claim is superseded by open F-3; its D-04 status is superseded by R2's fixed finding.
4. [R2 changed files](evidence/r2/changed-files.txt) and [R2 patch](evidence/r2/changes.patch), covering 4f9fba2 through ed67a05. The [earlier patch](evidence/external-audit/changes-since-original-audit.patch) covers db041a0 through 1f67d0d. The manifest describes the entire delivered tree, including later audit documents and tooling; neither patch is the full scope of review.

## Current review priorities

The public fixes address search retention, capacity warnings, catalogue-bound images, query parity, independent bounded requests, outage reporting and accessibility. Recheck changing observations, failed/slow responses, 320px layouts, actual logos, duplicate symbols and mint identity. Cross-instance pagination still rejects different observations; the configured backend retains its 4 MB export limit and generic error message. Old CDN URLs are not claimed to be purged. Known-catalogue image traffic remains a possible resource-exhaustion vector.

Financial findings **F-1 through F-14 remain open**. The funding forecast failure F-3 is independently reproduced, not a claimed fix: the current 23,632,080-lamport forecast fails the eleventh adapter build under the all-new-ATA fixture. F-1 lacks a complete reviewed evidence service; F-2 rejects the audit's live Jupiter instruction variants. F-4/F-6 lack adequate expiry/WSOL lifecycle recovery. The detailed register preserves attribution, reconciliation, caps, developer-cost allowances, quote freshness and pause-boundary findings. Also retain inherited nginx identity, output-price independence, policy publication, database-role and test-oracle concerns.

Do not infer funded readiness from 258 passing tests. Five high dependency entries remain in the raw production scan. No production database migration, real funded settlement, signer activation or financial-worker deployment occurred.

## Product invariants

- EMBER10 has ten equal purchase budgets. Net creator fees allocate 80% to holder rewards, 10% to buyback/burn and 10% to OPS/DEV; historical five-member funded records remain immutable.
- OPS/DEV payouts use only the withdrawable remainder after recorded expenses, obligations and retained reserves. No invented destination or automatic sweep of the allocation.
- Current market rank, verified eligibility and immutable funded membership remain separate. Mint identifies an asset; historical screenshots do not seed rankings.
- No synthetic public fallback. Missing/stale evidence is unavailable, not zero or an eligibility pass. Public address lookup never requests wallet signing.

## Current evidence

[Packet checks](evidence/audit-ready/checks.json), [separate packet review](evidence/audit-ready/packet-review.md) and [fresh financial failure reproduction](evidence/audit-ready/harness-recheck.json) document this audit-preparation update.

- [Complete test report](evidence/r2/tests.json), [validation metadata](evidence/r2/validation.json), [dependency scan](evidence/r2/dependency-audit.json).
- [Latest public recheck](evidence/audit-ready/public-proof.json), [candidate proof](evidence/r2/candidate-verification.json), [publication proof](evidence/r2/public-verification.json), [API/logo checks](evidence/r2/public-api-checks.json).
- [Public browser checks](evidence/r2/public-browser.json), [local checks](evidence/r2/local-browser.json), [fixture interaction checks](evidence/r2/frontend-browser.json).
- Before: [desktop](evidence/r2/before-1440.png), [mobile](evidence/r2/before-375.png). After: [desktop](evidence/r2/public-1440.png), [375px](evidence/r2/public-375.png), [320px](evidence/r2/public-320.png), [asset details](evidence/r2/public-375-detail.png). These are dated browser emulations, not physical-device tests.
- Internal specialist reviews: [public/data/UI](evidence/r2/independent-public-review.md), [image relay](evidence/r2/independent-image-review.md), [financial blockers](evidence/r2/FINANCIAL-INDEPENDENT-REVIEW.md). Same-vendor and exact scope limitations are disclosed. External re-audit of this correction is pending.
- [Financial reproduction source](../scripts/audit/f3-eleven-builds.mts) and [original result](evidence/r2/f3-eleven-builds-results.json). Mocked legacy instructions and RPC establish the local forecast defect, not current provider compatibility or finalized settlement.

Frontend bytes, the observed revision marker and Vercel deployment identity agree. The server function has no cryptographic artifact attestation. The actual host remains prelaunch, paused, broadcast disabled and worker inactive, without a configured project mint or ledger. Unreported amounts are not zero.

## Deliverable and review request

Use [the copy-ready reviewer request](EXTERNAL-AUDIT-REQUEST.md). Return exact revisions and commands, dispositions for all 56 top-level findings, new reproducible findings, desktop/mobile evidence and separate go/no-go decisions for public publication versus funded operation. Distinguish execution from inference and developer claims from independent conclusions. Compound findings need subfinding-level review.

The archive includes all tracked source, tests, migrations, lockfile and audit evidence. It excludes untracked secrets, Vercel credentials, private keys, databases, dependencies and build caches. Verify the ZIP and per-file SHA-256 values. No auditor was contacted or given credentials automatically. Keep financial tests isolated; no live financial or production mutation is authorized by this packet.
