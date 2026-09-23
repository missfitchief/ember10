# Current verification — 23 September 2026

Application revision: `1f67d0dff19c9509f586e3a4c9d98852be1b1ecc`. The external-audit documentation commit is a separate source snapshot; it does not imply a new runtime deployment.

| Check | Result | Evidence |
|---|---|---|
| TypeScript and Vite production build | Passed | [validation](evidence/external-audit/validation.json) |
| Complete Vitest run | 242 passed, 18 files; isolated PostgreSQL schemas | [test results](evidence/external-audit/tests.json) |
| npm production dependency audit | 5 high entries, zero moderate/critical; audit is not clean | [raw audit](evidence/external-audit/dependency-audit.json) |
| Deployed revision, assets and images | Exact revision, seven asset hashes matched; ten real WebP logos decoded | [public proof](evidence/external-audit/public-verification.json) |
| Desktop/mobile UI | 1440/375px, ten logos loaded, no overflow or page errors | [browser checks](evidence/external-audit/public-browser.json) |
| Paging and failures | Expanded 140-row list survives polling; explicit refresh resets it; older rounds append; failed history is not empty | [interaction checks](evidence/external-audit/interaction-results.json), [local checks](evidence/external-audit/local-browser.json) |
| Independent audit of this revision | Pending | [review brief](EXTERNAL-AUDIT.md) |
| Real funded settlement / production DB migration | Not performed | Signing, broadcast and worker remain disabled on the public host |

## Reproduce

Use Node 24.17.0 and npm 11.13.0 for parity. Use `npm.cmd` on PowerShell if necessary.

`npm ci` installs the lockfile. In a separate terminal run `npm run db:start` (or supply a disposable `TEST_DATABASE_URL`). Then run `npm test`, `npm run build` and `npm run preview:hosted`. Do not point tests at a production database. No funded chain credentials are needed.

The public preview uses actual network observations, so names, ranks and prices can change. Fixed browser interception cases are test-only and are described separately in the evidence. Screenshots are dated observations, not production inputs.

Legacy five-asset synthetic examples remain under `docs/demo`. They are accounting fixtures, not the normal browser experience and not evidence of real transfers. Current UI rejects demo/test reward data. The original verification document is retained in [history](history/verification-before-external-audit.md); its old counts and walkthrough are not current claims.
