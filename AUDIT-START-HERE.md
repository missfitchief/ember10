# EMBER10 external review package

This is the complete source repository, including tests, migrations and recorded evidence. The package manifest identifies the exact source commit and per-file hashes. The deployed application is `ed67a05f7b676108a98dcaf29460d2fdc60fecc6`; later audit-preparation commits change documentation and reviewer tooling, not financial or public application behavior.

- [Review brief](docs/EXTERNAL-AUDIT.md): scope, priorities and requested deliverables.
- [Current findings](docs/AUDIT-FINDINGS.json): all 37 inherited findings plus 19 R2 findings, with prior auditor dispositions distinguished from current implementation claims.
- [Reproduce the checks](docs/AUDIT-REPRODUCE.md): exact source, test, browser and financial-failure commands.
- [Verification](docs/VERIFICATION.md) and [deployment identity](docs/deployment.json).
- [R2 correction and open financial blockers](docs/AUDIT-R2.md).
- [Latest publication recheck](docs/evidence/audit-ready/public-proof.json): eight asset hashes and ten actual catalogue logos.
- [Desktop/mobile and before/after screenshots](docs/evidence/r2/).

The last complete test run passed 258 tests in 20 files against isolated PostgreSQL schemas. Its date, source and limits are recorded; preparing this package does not imply a newer full test run. Real funded settlement was not performed. Signing, broadcast and the financial worker remain disabled on the public host.

Financial findings F-1 through F-14 remain open, including the independently reproduced forecast shortfall. Five high production dependency entries remain disclosed. Passing public-site checks is not approval to fund or launch the financial service. Internal specialist reviews are included with scope and same-vendor caveats; external re-audit of the correction is pending.

Start an external review with [this copy-ready request](docs/EXTERNAL-AUDIT-REQUEST.md). No credentials, signer keys, private runtime state or node_modules are included. No auditor has been contacted automatically. This is an audit delivery, not a two-PC development transfer.
