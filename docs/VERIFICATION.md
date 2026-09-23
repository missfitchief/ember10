# Current verification — 23 September 2026

Application revision: `ed67a05f7b676108a98dcaf29460d2fdc60fecc6`. The external-audit preparation commit is a separate source snapshot containing documentation, evidence and reviewer tooling; it does not imply a new runtime deployment.

| Check | Result | Evidence |
|---|---|---|
| TypeScript and Vite production build | Passed | [validation](evidence/r2/validation.json) |
| Complete Vitest run | 258 passed, 20 files; isolated PostgreSQL schemas | [test results](evidence/r2/tests.json) |
| npm production dependency audit | 5 high entries, zero moderate/critical; audit is not clean | [raw audit](evidence/r2/dependency-audit.json) |
| Deployed revision, assets and images | Exact revision, eight asset hashes matched; ten real WebP logos decoded | [public proof](evidence/r2/public-verification.json) |
| Desktop/mobile UI | 1440/375/320px, ten logos loaded, no overflow or page errors | [browser checks](evidence/r2/public-browser.json) |
| Paging and failures | Expanded default/search lists retain 140 rows through polling and source outages; explicit refresh resets them; independent records load despite a stalled status | [interaction checks](evidence/r2/frontend-browser.json), [local checks](evidence/r2/local-browser.json) |
| External re-audit of this correction | Pending; internal specialist reviews included | [review brief](EXTERNAL-AUDIT.md) |
| Real funded settlement / production DB migration | Not performed | Signing, broadcast and worker remain disabled on the public host |

For the complete reviewer command sequence, browser tooling and fixture/live-test distinction, use [AUDIT-REPRODUCE.md](AUDIT-REPRODUCE.md). The [latest public recheck](evidence/audit-ready/public-proof.json) refreshes publication evidence only; it is not a new full test run.

## Reproduce

Use Node 24.17.0 and npm 11.13.0 for parity. Use `npm.cmd` on PowerShell if necessary.

`npm ci` installs the lockfile. In a separate terminal run `npm run db:start` (or supply a disposable `TEST_DATABASE_URL`). Then run `npm test`, `npm run build` and `npm run preview:hosted`. Do not point tests at a production database. No funded chain credentials are needed.

The public preview uses actual network observations, so names, ranks and prices can change. Fixed browser interception cases are test-only and are described separately in the evidence. Screenshots are dated observations, not production inputs.

Legacy five-asset synthetic examples remain under `docs/demo`. They are accounting fixtures, not the normal browser experience and not evidence of real transfers. Current UI rejects demo/test reward data. The original verification document is retained in [history](history/verification-before-external-audit.md); its old counts and walkthrough are not current claims.
