# EMBER10 external audit brief

Review the complete repository snapshot, not just the latest patch. The application revision under review and deployed at capture time is **`1f67d0dff19c9509f586e3a4c9d98852be1b1ecc`**. The preparation commit adds documentation and evidence; its different hash does not represent a new runtime deployment. The downloadable package manifest identifies both revisions.

Repository: https://github.com/missfitchief/ember10

Read-only pilot: https://ember5-pilot.vercel.app/

## Start here

1. [Current verification](VERIFICATION.md), [deployment identity](deployment.json), and [readiness](READINESS.md).
2. [Findings register](evidence/external-audit/findings.json): all 37 top-level findings (original reproduction details are preserved in [the redacted supplied report](evidence/external-audit/original-audit-redacted.md)) from the supplied audit of `db041a0`, mapped to current claims, partial work and open items. “Implemented” is the developer's claim, not an independent closure decision.
3. [Remediation description](AUDIT-REMEDIATION.md), [architecture](ARCHITECTURE.md), [accounting](ACCOUNTING.md), [developer accounting](DEVELOPER-PAYOUT-ACCOUNTING.md), [API](API.md), [selection](AUTOMATIC-SELECTION.md) and [runbook](RUNBOOK.md).
4. [Changed-file list](evidence/external-audit/changed-files-since-original-audit.txt) and [full patch since the original audited revision](evidence/external-audit/changes-since-original-audit.patch). Review source files outside this diff where relevant.

## Product invariants

- EMBER10: ten equal basket purchase budgets. Allocate net creator fees 80% to holder rewards, 10% to buyback/burn and 10% to OPS/DEV. Historical five-asset epochs stay immutable.
- OPS/DEV payouts use only the withdrawable remainder after recorded expenses, obligations and retained reserves. No additional fee, invented wallet, or automatic withdrawal of the full allocation.
- Current ranking, eligibility evidence and immutable funded membership are separate. Rank numeric comparable observations by mint; names and dated screenshots never seed production rankings.
- No synthetic production fallback. Missing/stale evidence is unavailable, not zero and not eligibility approval.
- Browser wallet lookup is read-only. No wallet signing or permission to spend.

## Priority review areas

**Open or partial:** pre-existing WSOL ATA denial of service (L-02); receipt quarantine re-attribution and malformed upstream payout rows (L-07); mutable builder/intent comparison (L-12); large export limit and stable catalogue paging (S2-06/S2-01); nginx client identity (L-11); policy revisions, database-role/TRUNCATE safeguards, Windows shutdown and test-chain replay subfindings (L-13). Recheck test oracle quality (D-03), legacy sample timestamps (D-04), residual dependencies (D-05) and cleanup (D-07).

**Revalidate claimed fixes:** decoded-route operator authentication, exact RPC serialization, catalogue bounds, zero-transfer cursor progress, idle pool failure behavior, forecast costs, evidence freshness, pre-sign simulation and authorization order, durable signed-attempt recovery, original-message rent accounting, incident handling and immutable funded records. Check migration compatibility and rollback/restore procedures separately.

**Public UI:** desktop and mobile layouts, all ten actual logos, loading/error/empty/stale states, duplicate symbols and mint identity, changing observations while paging, slow/overlapping responses, partial ledger failures, epoch cursor pagination, CSV formula handling and download headers, keyboard navigation/dialogs, and 320px through desktop widths. Supplied screenshots prove only their capture conditions; inspect the application independently.

## Trust boundaries and unavailable validation

The Vercel deployment has no financial worker, configured project token or connected project ledger. It reports prelaunch, paused, broadcast disabled and worker inactive. No production database migration or funded chain transaction was performed. Synthetic/PostgreSQL and mocked RPC tests do not prove real chain settlement, signer enforcement, creator-fee coverage, liquidity or provider completeness.

The implementation controls a reward treasury and depends on trusted operators, RPCs, provider contracts and a remote signer. Do not infer trustlessness or production readiness. The five high production dependency entries are disclosed in the raw npm audit; all derive from the bigint-buffer chain. A local JavaScript fallback does not establish the native dependency's safety on another host.

No independent audit of this correction has completed. Earlier independent reviews covered different revisions. The attempted specialist review of the latest patch was unavailable; the included latest checks were performed by the implementer.

## Evidence and reproduction

All paths below are inside the repository; no access to the developer's PC is required:

- [Test report](evidence/external-audit/tests.json), [validation metadata](evidence/external-audit/validation.json), [production dependency audit](evidence/external-audit/dependency-audit.json).
- [Candidate proof](evidence/external-audit/candidate-verification.json), [public proof](evidence/external-audit/public-verification.json): deployed revision plus seven byte-identical build assets and ten decoded logo responses. An echoed revision alone is insufficient.
- [Local browser results](evidence/external-audit/local-browser.json), [public browser results](evidence/external-audit/public-browser.json), [interaction results](evidence/external-audit/interaction-results.json).
- Before: [desktop](evidence/external-audit/before-1440.png), [mobile](evidence/external-audit/before-375.png). After: [desktop](evidence/external-audit/public-1440.png), [mobile](evidence/external-audit/public-375.png). The before images are the preceding logo-fixed deployment, not the original missing-logo screenshot.

Run the commands in VERIFICATION.md against a fresh disposable database. Use the frozen archive/commit, lockfile and recorded runtime. Fresh catalogue values will differ. Audit all migration files through 008. Keep test/demo installations separate; the normal frontend intentionally refuses their reward records.

The package excludes `.env`, account credentials, Vercel metadata, private keys, local databases, node_modules and build caches. `.env.example` and deterministic test fixtures are included. Packaging uses tracked Git files and supplies per-file SHA-256 values and an archive checksum. No auditor was contacted or granted access automatically.

## Requested auditor deliverables

Return a report identifying the exact commit, commands/environment, reproducible steps, impact, affected paths/lines and severity for each issue. Separate executed evidence from source-based inference. Mark each inherited finding confirmed, resolved, partially resolved or not reproduced, explaining why. Include new findings, desktop/mobile evidence, test weaknesses and a specific go/no-go decision for read-only publication versus funded operation. Do not treat developer status labels as an expected verdict.

Keep all review activity read-only or confined to isolated local fixtures. Any funded transactions, production mutations or external message sending need separate user authorization.

## Portable verification and package creation

After building, run `node scripts/audit-public.mjs https://ember5-pilot.vercel.app ../public-proof.json` to check the deployment against the frozen application revision and local built assets. It performs read-only HTTP requests and requires no Vercel credentials.

From a clean committed checkout, `node scripts/package-audit.mjs ../audit-delivery` creates the complete tracked-source ZIP, per-file manifest and SHA-256 checksum file. Existing packages are not overwritten. Generated files are outside the repository, and the tool refuses tracked runtime/private files or runtime drift from the tested application revision.
