# EMBER10 external audit brief - R3

Review the complete frozen source package. Record its manifest commit, tree and per-file hashes. Compare its runtime/test/config files with the application revision in deployment.json; later package commits should change only documentation, evidence or reviewer tooling. Verify the actual public revision and assets rather than relying solely on the revision marker. No cryptographic server artifact attestation is claimed.

Repository: https://github.com/missfitchief/ember10

Read-only pilot: https://ember5-pilot.vercel.app/

Start with AUDIT-R3.md, AUDIT-FINDINGS.json, VERIFICATION.md, AUDIT-REPRODUCE.md and the supplied R3 audit. Retain prior audits as historical evidence. Review all 70 top-level findings and compound subfindings; do not infer closure from developer labels.

## Public review

Reproduce deferred page responses arriving after a poll or explicit refresh, including ignored abort signals. Check retention of expanded lists, honest parent-source versus query health, eligible-empty wording, failed logo recovery and healthy-image persistence. Review the catalogue-bound relay's CDN 300-second fresh/60-second stale policy and measured HIT evidence, plus error no-store and unauthorized-source rejection. Inspect desktop, 375px and 320px layouts, token details, actual catalogue logos and unavailable ledger states.

N-P4 remains open: later/cross-instance pages may not share an observation; mismatch is rejected rather than merged. N-P6 remains open/mitigated: distinct concurrent misses may exceed the per-instance 16-image cap. CDN caching is not global rate limiting. Stale last-good catalogue membership can extend logo availability beyond the CDN window. The configured backend's 4 MB export cap and generic error classification remain open.

## Financial review boundary

This delivery corrects public behavior and evidence only. Financial code, approval rules, migrations, signing and policy are unchanged. F-5 is corrected: valid pool-filtered rows can match, but signature-less sweep rows reject the strict window. F-3's extra-rent comparison has no maximum-fee retry margin. N-M1..N-M6 source-only assessments are not executed race tests. No live financial settlement, chain attribution, keyed Jupiter acceptance or funded-pilot readiness is established.

Preserve ten equal purchase budgets, 80/10/10, existing OPS/DEV remainder rules, immutable historical funded records and mint-based identity. Missing evidence is unknown, not passing eligibility. Market ranking is not a funded basket.

## Evidence and requested result

Use evidence/r3 for current tests, validation metadata, deployment verification, cache timings, browser screenshots and exact-revision internal review. R2 reports remain historical; their intermediate review hashes do not attest final R3 bytes. Browser checks use Chrome emulation, not a physical iPhone. Internal reviewers are same-vendor; external re-audit remains pending.

Return exact revisions, commands and results, dispositions for all 70 findings, newly reproduced issues, screenshots and separate decisions for public publication versus funded operation. Report the five high dependency entries. Keep tests in a disposable database; do not supply funds, enable execution, migrate a production database or change a deployment. No auditor has been contacted automatically.
