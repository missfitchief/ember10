# EMBER10 external review package - R3

This is the complete source repository, including tests, migrations and recorded evidence. The package manifest identifies the source commit and per-file hashes. [deployment.json](docs/deployment.json) identifies the exact deployed application revision separately from later documentation/evidence commits.

- [Review brief](docs/EXTERNAL-AUDIT.md) and [copy-ready external review request](docs/EXTERNAL-AUDIT-REQUEST.md).
- [Current findings](docs/AUDIT-FINDINGS.json): all 70 findings - 37 inherited, 19 R2 and 14 R3. Prior external conclusions and new implementation claims are distinct.
- [R3 correction and residual limits](docs/AUDIT-R3.md), [verification](docs/VERIFICATION.md) and [reproduction commands](docs/AUDIT-REPRODUCE.md).
- [Supplied R3 audit](docs/evidence/r3/supplied-audit.md), [R2 history](docs/AUDIT-R2.md), and [corrected financial evidence](docs/evidence/r3/financial-evidence.md).
- Current tests, deployed byte comparisons, measured logo cache behavior, before/after desktop/mobile screenshots and exact-revision review are under [R3 evidence](docs/evidence/r3/).

Financial code and OPS/DEV rules are unchanged. F-1 through F-14 and unresolved financial findings remain blockers; N-M4 is a documentation correction only. Signing, broadcast and the financial worker remain disabled on the public host. No funded settlement or production database migration was performed. Five high production dependency entries remain disclosed.

Internal specialist reviews are same-vendor reviews, not external audit approval. External re-audit of this correction is pending. No auditor has been contacted automatically. The package excludes credentials, private runtime state and dependencies; this is a one-PC audit delivery, not a two-PC transfer.
