# EMBER10 R2 independent public patch review

Reviewed 2026-09-23 by the frontend specialist session, read-only against the integration worktree. The reviewer authored the earlier frontend commit; this is an independent review of the integrator's capacity/outage changes and subsequent corrections, not an external or independent-vendor audit.

## Reviewed revisions and exact scope

Base integration HEAD: 3d7fc7063d62a1e5a5fcbd5af023e0cf9b3bb1c9. Capacity/outage parent: 8baa4be7fe47050ca7dd0551a1efbcec9d669de4.

Reviewed parent changes in packages/shared/catalogue-limits.json, packages/shared/catalogue-capacity.ts, packages/integrations/http.ts, packages/integrations/market-data.ts, scripts/evidence.mjs, apps/api/hosted.ts, tests/market-data.test.ts and tests/hosted.test.ts. The integration working-tree follow-up contains:

- apps/web/market.tsx: retains immutable page rows/fetch provenance while separately reflecting parent stale, unavailable or warming discovery health; global request errors apply to filtered views too.
- apps/web/records.tsx: clears cluster and nextEvaluation to undefined at hook initialization and each refresh, preventing prior network/schedule metadata from being attached to newly arriving independent records. Undefined correctly renders checking/unreported; null is reserved for a confirmed unscheduled response.
- tests/ui-r2.browser.mjs: adds stale/unavailable parent-poll checks asserting 140 searched rows and their original observation timestamp remain intact.

Working-file SHA256 at review:
- apps/web/market.tsx: e0b49648e5377e1bdb7c97b52a86a34f1445805ed0c33d007efd060f31817466
- apps/web/records.tsx: 242b8c872a4ea2e79dac3719549a083379dd46e7ffd2336959794f16e9ed3897
- tests/ui-r2.browser.mjs: fb59750d1eabf074221f944e737151a73669a783cd1a4936a96f935d91b8b19c

## Findings and outcome

No remaining material issue found within the reviewed patches. Shared catalogue limit is 64,000,000 bytes; 50,000 rows are bounded independently; either 80% threshold emits a structured capacity warning and adds a public coverage note. A breached row bound preserves stale last-good observations. The evidence capture script uses the same market byte limit and records actual received bytes. Hosted basket universeComplete requires ready status, a fetch timestamp and complete page coverage, so unavailable/warming/stale catalogues do not claim completeness.

The review identified two frontend residuals, both corrected by the integrator: retained pages previously hid source-health deterioration; independent records could temporarily inherit cached network/schedule metadata. The first correction's null schedule reset was also corrected to undefined before this final review.

## Executed checks and limits

- Independently executed market-data, hosted and ui-r2 unit suites: 19 tests passed across 3 files.
- Independently executed tests/ui-r2.browser.mjs against the integration dev server at http://127.0.0.1:5195 after final corrections: all 11 stated assertions passed, including expanded searched/default lists, stale/unavailable provenance retention, explicit refresh, cross-field search, independent ledger updates, bounded stalled status, navigation focus, 320px overflow and page-error checks.
- An initial browser attempt timed out waiting for the eligibility result while the working tree was still being corrected; the repeat after the final correction passed. This review did not change application code or tests.
- Browser APIs were intercepted with clearly isolated test fixtures. This check is not evidence of live market membership, real financial records or deployed revision correctness. Browser coverage was desktop Chromium and 320px Chromium, not an actual iOS device.
- Strict cross-observation pagination still refuses mixed fetch timestamps/hashes and requires explicit refresh. That conservative behavior is unchanged.
- The P3 logo proxy changes, deployment artifacts, all financial paths and F-1 through F-14 are outside this review; no financial readiness claim is made.

## Additional built-app visual inspection

Independently opened and inspected local-1440.png, local-375.png, local-320.png and local-375-detail.png using the image viewer. These are the integrator's actual built-app captures using catalogue/logo responses, separate from the intercepted browser regression fixtures above. All ten asset logos are visibly rendered in the desktop and mobile orbit and market list; no initials-only substitutes or broken-image indicators are visible. Header/navigation, hero, calls to action, market rows, allocation and footer remain within the captured widths. The 320px headline wraps to three lines without clipping or overlap. The 375px asset detail shows the asset logo, close control, readable metrics, wrapped mint and both actions within the dialog. No material visual defect found in these four images.

This is visual inspection of static captures, not a new interaction/accessibility or production-deployment test. It does not establish token provenance, funded holdings or financial readiness. The integrator separately corrected a native Node JSON-import deployment failure in ed67a05; that runtime correction and final candidate deployment are outside this screenshot review.

Image SHA256:
- local-1440.png: d4002a6e3a723e0629a06344c2c65071a0693854eb204dc3df57d7f7cb10047a
- local-375.png: 1c49dfe233bf0b0be8df9ddb4d3638347b7f59f6946723baac9e822cd10ebccc
- local-320.png: d8a62558bd0700ec3825efc9793223c32e077ca88ab3e889eb5139e9b229e1ed
- local-375-detail.png: 08ccbe7d0b1ec617676820b78d541b759f69a1b6be6378913158c0613fe891fe
