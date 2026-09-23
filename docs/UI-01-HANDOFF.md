# UI-01 handoff

Status: implemented in the existing `ui-01` Git worktree; ready for the sole integrator to cherry-pick. The one-PC workflow supersedes the old transfer/ZIP instructions. Shared contract changes remain integrator-owned.

## Implementation

- Replaced the application shell and visual system with Figtree/Bricolage typography, graphite/coral tokens, original ten-cell mark, desktop sidebar, mobile header/menu and bottom navigation. Fonts are self-hosted with their OFL notices.
- Split presentation into `components.tsx`, `market.tsx` and `records.tsx`, with `view-model.ts` and `ledger.ts` adapters. No historical reference rows or preview controls are bundled.
- Market ranking, policy eligibility and immutable funded basket have separate views. Server-side `q`, `view`, `offset` and `limit` requests search the observed catalogue beyond the first page; pagination never changes canonical selection. Source time, fetch time, coverage, reasons and full mint access are provided in native modal details.
- Preserved 10 equal purchase budgets and 80/10/10. OPS/DEV categories remain separately unreported until ledger evidence exists. There is no wallet connection, signing, buy action, invented project address or payment.
- Public-address lookup validates decoded Solana key length, preserves entered text, and separates API failure/unavailable evidence from empty credits. Rewards expose credited, pending, partially paid and finalized states. Next evaluation comes from `/api/status`.
- Native dialogs support Escape and return focus to their invoking button. Keyboard tab navigation, visible focus, reduced-motion styling, safe links/logos, loading skeletons and unavailable/stale/warming/insufficient states are implemented.

## Checks completed by UI-01

- `npm run build`: TypeScript and Vite production build passed.
- `npm run test -- tests/ui-view-model.test.ts`: 10 tests passed. Coverage includes exact integer-unit formatting beyond Number precision, unknown versus zero, public-key validation, unsafe URLs, synthetic response rejection, canonical rank preservation, coverage labels, unavailable ledger semantics, finalized payout counts and terminal transfer deduplication.
- Tests discovered and fixed Decimal default-precision rounding in exact unit display; formatting now works directly on integer digits.
- Browser opened the archived HTML reference and the actual app on port 5184 with API proxy to canonical port 5180. Desktop and 390px mobile overview/basket rendered against the current Ember catalogue; no historical rows were used.
- Mobile provenance dialog opened and Escape restored focus to the exact invoking token button. DOM check found equal document client/scroll widths (375 CSS px inside the 390px viewport).
- Independent code-review findings addressed: mobile record-table evidence/status columns remain visible within their contained scroller; mobile small buttons retain 44px target height.

## Integration and independent review

The canonical repo supplies `packages/shared/public.ts`, including `marketPage.view`; the local worktree copy was updated only to typecheck against that contract and is intentionally excluded from the UI commit. Root must build the integrated revision, run the complete applicable suite, and allow REV-01 to review all requested viewport sizes and failure-state harness cases. Root owns deployed-revision verification and final screenshots/report. UI-01 does not claim the public deployment is corrected before those steps.

No manifests, lockfiles, migrations, eligibility engine, financial policy or signing code changed in this handoff.
