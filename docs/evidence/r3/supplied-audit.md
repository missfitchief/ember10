EMBER10 AUDIT ROUND 3 - 2026-09-23 - findings for the orchestrating/building session
Repo github.com/missfitchief/ember10 @ ad972e7 (HEAD of main, 64 commits, all "Codex <codex@local>"). Live https://ember5-pilot.vercel.app
serves ed67a05 (/api/status revision). The three commits after ed67a05 touch documentation and evidence only: `git diff ed67a05 ad972e7 --
apps api packages tests package.json package-lock.json vercel.json .vercelignore compose.yaml deploy tsconfig.json` is EMPTY (measured).
The ten commits since round 2 (4f9fba2) change ONLY the public path (apps/api catalogue/token-image/hosted/overview, apps/web, market-data,
http, shared limits, tests, scripts, docs). No file in apps/worker, packages/core, packages/db or the Jupiter/Solana/ingestion/provenance
adapters changed. The `backend/corrections` branch is fully merged into main (merge-base == its tip).

VERDICT IN ONE PARAGRAPH
The public site works and is exactly this source: all eight deployed files (index.html, JS, CSS, two fonts, favicon, two share images) are
sha256-identical to a clean local build of HEAD; 258/258 tests pass in 20 files; every public route, validation case and method was probed
live; the site was driven in a browser at desktop and 320 px with zero console errors. Four of the five round-2 public fixes are confirmed by
execution (P-1 search retention, P-3 catalogue-bound logo relay, P-4 search parity, P-5 mobile navigation and independent ledger loads);
P-2 is confirmed by code and tests. The fixes introduced two regressions worth fixing: a paging response that lands after a poll or after
"Refresh list" can overwrite the newer list (N-P1, found independently by three channels), and turning off CDN caching for logos makes a
visitor's first logos arrive 0.2-4.0 s after the page on cold instances (N-P2, measured twice). The money path did not change and remains
NOT RUNNABLE and NOT SAFE TO FUND. Two flip tests were run on live data: F-2 stands (today's Jupiter build is still an undecodable
instruction with a multi-hop route); F-5 changed shape - a real Keep-it pool DOES publish rows that match the attribution predicate (the
round-2 "attribution can never match" reading is refuted), but a pool's own payout window can carry a signature-less `sweep` row that makes the
strict schema throw and stalls ingestion every loop, so F-5 keeps its severity on a different mechanism. Four new money-path items (N-M1
approval-generation binding, N-M2 fabricated token custody, N-M5 resend gated on a full re-authorization, N-M3 reconciliation-health
timestamp) are S2/S3; none is a theft path, and no channel found a way to sign or broadcast while paused, in prelaunch or over the caps.
Recommendation: keep publishing; fix N-P1 and set a bounded CDN TTL for logos; do not schedule a funded pilot; if the money path is pursued,
the order is F-5 tolerant schema (now proven necessary on live data), F-2 keyed build, F-3 forecast with a retry margin, N-M1, then the rest.

0. PROVENANCE - WHAT WAS EXECUTED
- Clean clone at ad972e7, `npm ci --ignore-scripts`, `tsc --noEmit` OK, `vite build` OK, `vitest run`: 258/258 in 20 files (43 s, embedded
  PostgreSQL 18). Local dist/web hashes == live: index.html 387ee7cc..., index-BHmCP8pK.js 5ee23737..., index-EjoWDp4l.css a901f09c...,
  both woff2, favicon.svg, ember10-share.png/svg (all SAME).
- Live API: overview (limit/offset/q/view validation incl. 101-char q -> 400 with message), basket (universeComplete:false, hasMore:true,
  100-row universe), status, project, transparency, epochs, wallets/<valid>/rewards, wallets/notanaddress -> 400, epochs/x/export -> 404,
  HEAD -> 200, POST -> 405, /api/operator/pause and /api/%6Fperator/funding -> 404. Every JSON response `cache-control: no-store`.
- Live logo relay: listed CID via embercurve, ipfs.io alias and pinata alias -> 200 webp (same ETag); If-None-Match -> 304; HEAD -> 200;
  old URL without v=2 -> 200; UNLISTED valid CIDs (embercurve /img/, ipfs.io) -> 404 no-store; arweave id -> 404; evil host / two source
  params / retry=9 / no source -> 400; POST -> 405. Cache-control observed: `public, max-age=0, must-revalidate`; `x-vercel-cache: MISS` on
  every logo request (Vercel strips s-maxage=0 and does not cache).
- Logo latency, first visit in the built-in browser (/#basket, 15 logo requests): 1164, 2851, 3110, 232, 2635, 3445, 1088, 3082, 3529,
  830, 901, 1545, 2803, 3962, 2645 ms. curl, ten logos in parallel: eight of ten between 3.06 and 3.79 s, two at 0.38/1.17 s; sequential
  warm requests 0.24-0.26 s.
- Browser (built-in), live site: search "a" (2,803 matches), Show more x4 -> 140 rows at 21:45:40Z (page 2 fetched at offset 100 and
  merged); two parent polls later (@315 s, @360 s) the list still shows 140 rows, no offset-0 search refetch, notice "A newer observation may
  be available. Your current list is retained until you refresh it." with "Refresh list"; clicking it -> 20 rows, fresh q=a fetch, notice
  cleared. 320 px: no horizontal overflow (scrollWidth 320), mobile nav present in DOM with hidden=true and display:none, real pointer click
  opens it (aria-expanded=true), Escape closes it and returns focus to the button; rewards page shows Unreported x3 and "Verified round
  history is not connected."; zero console messages throughout.
- Live Ember catalogue: 8,049,071 B, 3,097 rows, 3,096 unique mints, 2,599 B/row, 98 rows without image; launches/day last 7 d mean 48
  (09-11 spike 1,154). Live payouts: global latest-100 and ?limit=500 windows, pool-filtered windows for two Keep-it pools (see F-5).
- Live Jupiter v2 /build x2 (unauthenticated, the adapter's exact params) decoded with the installed @jup-ag/instruction-parser 6.0.28 (F-2).
- Channels: two isolated Codex cold packets (full tree at ad972e7 + the code diff since 4f9fba2), both VERIFIED gpt-6-astra/xhigh, 0 injected
  persona blocks: public session [review-session-redacted] (12 min), ledger [review-session-redacted] (20 min);
  two Claude finder agents (public path, money path; the money agent EXECUTED the builder's F-3 harness - numbers reproduced exactly - a
  40,000-case budget() conservation check and a 70,120-row returnUnusedCosts refund-bound check, all clean). Every claim below was re-read
  by the orchestrating auditor at the cited lines.
  Caveat unchanged: all commits are by Codex, so the Codex channel is same-vendor as the builder. Codex has no internet, so its money-path
  reading used the repo's stale payouts fixture; the live pool-filtered data in F-5 below supersedes that.
  Tags: EXECUTED (reproduced), MEASURED (numbers from the live system or the code's constants), CODE (verified by reading), PLAUSIBLE.

1. VERDICT
- Public site: WORKS and matches source. No S1. Two S2 regressions introduced this round (N-P1, N-P2); the rest S3. Safe to keep publishing.
- Financial half: unchanged code, still NOT RUNNABLE (F-1 design, F-2 live provider re-executed today, F-3 forecast) and NOT SAFE TO FUND.
  No theft or mis-credit path found by any channel this round either; N-M1 and N-M2 are fail-open-against-documentation and griefing wedges.

2. ROUND-2 FINDINGS - STATUS
P-1 FIXED (EXECUTED)        market.tsx:59-90 request effect keyed on [requestKey, view]; the [data] effect retains an expanded or searched
                            snapshot and sets a notice. 140 searched rows survived two polls; explicit refresh resets. Side effects: a searched
                            or filtered list never auto-refreshes any more (by design, the original time is shown) and the new effect opened
                            N-P1. Pinned by tests/ui-r2.browser.mjs (Playwright, reviewer tooling; not run here) - none for N-P1.
P-2 FIXED for the row bound (CODE + tests market-data.test.ts:18,25)  catalogue-limits.json 64 MB / 50,000 rows / 80 % warning; evidence.mjs
                            shares the byte cap. Honest headroom: at 2,599 B/row the BYTE cap binds first at ~24,600 rows and the 80 % byte
                            warning fires at ~19,700 rows; "50,000 rows" is a schema ceiling (~130 MB at today's row size), not capacity.
                            At 48 rows/day (7-day mean) the warning is ~11 months away; at the 09-11 spike rate ~14 days. The warning is a
                            console.warn plus a coverage note on Transparency, not an alert. docs/DATA-SCHEMA-MAPPING.md:47 says timeout,
                            retries and the row bound are shared with the collector; only the byte cap is (evidence.mjs:14-16: one 20 s fetch,
                            no retry, no row bound) - S3 doc.
P-3 FIXED (EXECUTED)        catalogue.ts:10-46 membership from the last-good catalogue before cache/slot/304; unlisted CIDs 404 live; aliases
                            map to the canonical URL; re-check after I/O. Cost of the design: N-P2 and N-P3. Pinned by token-image.test.ts
                            (22 tests).
P-4 FIXED (EXECUTED + test) overview.ts:20 == view-model.ts:87-90 (mint name symbol); ui-r2.test.ts:10 compares against the server function.
P-5 PARTIAL (EXECUTED)      api() 28 s deadline (view-model.ts:108-125) > server 25 s; src.tsx 15 s timer removed; records.tsx loads
                            transparency/epochs/status independently; basket universeComplete false unless ready+fetched+!hasMore (live:
                            false); role="group" on hero/stages; mobile nav always in the DOM with hidden (style.css:4 has
                            [hidden]{display:none!important}, so it cannot be defeated). Residuals as the builder states: 4 MB proxy cap and
                            generic 503 text (S2-06), server function not attestable (D-02).
S2-01 residual              Cross-instance paging still keyed on fetchedAt+evidenceHash (view-model.ts:94-105); N-P4 states the consequence.
S2-06 PARTIAL, S2-11 PARTIAL, D-02 PARTIAL - the builder's descriptions in docs/AUDIT-R2.md are accurate (Codex and my reading agree).
F-1  OPEN, unchanged code.  F-2 OPEN, RE-EXECUTED 2026-09-23 21:4xZ: SOL->USDC 0.1 and WSOL->5dvXTZ...4QEC6 0.0784 both returned instruction
     discriminator d19853937cfed8e9 (decodes to null in parser 6.0.28), routePlan length 2 and 4 (GoonFi V2 / SolFi V2; GoonFi V2 / Quantum /
     Whirlpool x2) despite onlyDirectRoutes=true, 41 and 70 accounts, 2 and 4 lookup tables. validateSwapInstruction rejects both. The
     flip test remains a keyed build that decodes as a one-hop `route`.
F-3  OPEN, arithmetic re-confirmed by three channels; the builder's harness (scripts/audit/f3-eleven-builds.mts) reproduces it correctly
     (Codex: the harness's `remaining -= rent + actualFee` matches Engine.apply's net debit; the WSOL rent returns). SHARPENED: the proposed
     forecast (size+2)*rent + (size+2)*maxFee = 25,671,360 covers eleven successes plus the burn in any order, but has NO margin at the fee
     cap: after ten successes at 100,000 the balance is 4,278,560; an eleventh attempt that fails on chain charges 100,000 (runner.ts:71-77)
     -> 4,178,560; the untouched burn sorts first (last_attempt_at NULLS FIRST, so any deferred purchase - exactly the F-3/F-6 state -
     runs after it) and spends 100,000 -> 4,078,560; the retry needs 4,178,560: short by 100,000 with no route to replenish cost:<epoch>.
     Even with zero failures the proposal has zero slack in that ordering (C' - 10*(rent+fee) - fee = 2*rent + fee exactly). At the real
     5,000 fee the same forecast has margin for ~200 failures. Size the forecast to (size+2)*rent + (size+2+k)*maxFee with k = the retry
     budget, and add the eleven-transaction + one-failure test the builder's own review asks for (FINANCIAL-INDEPENDENT-REVIEW.md:26). Under
     the 10 % cost cap the minimum round rises from 236,320,800 to 256,713,600 lamports. Holder payouts draw on `reserve`, not cost:<epoch>;
     four new recipient ATAs need 4*rent + fee = 8,257,120 above the reserve floor - the epoch forecast never covers that (by design; state
     it in RUNBOOK). Evidence note: docs/evidence/r2/f3-eleven-builds-results.json was written by an earlier harness version (keys
     `revision,...`; the shipped harness writes `auditedBaseRevision, executedRevision, workingTreeDirty, harnessSha256`); the newer run is
     docs/evidence/audit-ready/harness-recheck.json (executedRevision b224b1c). The numbers are identical; the provenance labels are not.
F-4, F-6, F-7 .. F-14 OPEN, unchanged code, as the register says.
F-5  CHANGED SHAPE (EXECUTED on live data, 2026-09-23 21:35-21:50Z):
     (a) REFUTED: "the predicate kind=payout & mode=keep & quoteMint=WSOL matches nothing". The worker reads /payouts?pool=<own pool>
         (ingestion.ts:17). The live pool-filtered window of a real Keep-it pool (4isa4qXav8juubpkUduS93hbr72Pm76dLcYTWRCqnAJQ) has 100 rows,
         ALL with a string signature, 37 of them kind=payout mode=keep quoteMint=WSOL with 9-decimal amounts that decimalUnits(String(amount),9)
         accepts (e.g. 0.288964623, 0.204409781), one every ~15 min, window span 9.0 h. The global latest-100 window (the shape of the repo's
         fixture) still has 3 signature-less rows and only 1 match - it was the wrong sample.
     (b) CONFIRMED on live data: a pool's OWN window can contain a signature-less row. Pool 6sg6ubMzZKKD5WcpbYDoXTJzzHxSLJ8Huy1agt8cMV9S returns
         2 rows, one `kind:sweep, mode:keep, amount:0.0072, note:"10 rounds under $1, dust booked to the platform treasury"` with NO
         signature. ember.ts:15's schema requires `signature: z.string()` on every row, so EmberClient.payouts() throws ZodError for that pool
         and ingestTreasury (ingestion.ts:17) throws before scanning any signature; main.ts's loop catch then skips planning, payouts,
         operations and reconcile on every pass for as long as the row stays in the 100-row window (for a low-activity pool: indefinitely).
         "10 rounds under $1" is a realistic state for a small pilot. Severity stays S1 (unrunnable as configured) on this mechanism.
     (c) Unchanged: first-sight attribution against a bounded window (9 h for this pool at ~11 rows/h) with permanent quarantine (L-07b).
     Fix: tolerant schema (drop rows without a signature instead of throwing), re-check quarantined receipts on later passes, and capture a
     multi-day window of the configured pool before funding.

3. NEW FINDINGS - PUBLIC PATH
N-P1 S2 CODE (INTRODUCED; Claude agent A-4, Codex R3-01 and my reading agree)  market.tsx:81-90, 92-110, 120-121
     The [data] effect replaces a <=100-row default page with the polled `data` and clears `busy` (line 86) WITHOUT bumping requestVersion, and
     retryRequest's default branch (line 121: setPage(undefined); setLimit(20); retry()) does not bump it either. A "Show more" page request
     in flight at that moment (page boundaries: the 4th click, then every 3rd) passes its version check on return: if its fetchedAt still
     matches the captured pre-poll snapshot it overwrites the newer observation with the older merged list (200 rows of the old observation,
     no notice); if it does not match, line 105 writes `snapshot: current` (the pre-poll observation) and the "catalogue changed" notice,
     undoing the poll or the explicit refresh; the re-enabled button also allows a second concurrent page request. The round-2 code
     invalidated pending page requests on every `data` change (the effect depended on data); this round removed that without a replacement
     generation check. Trigger window: page-request latency (0.2-1.7 s measured) around each 45 s poll, or "Refresh list" within ~1 s of a
     boundary click. Self-heals at the next poll. No test (ui-r2.browser.mjs completes expansion before polling). Fix: `++requestVersion.current`
     whenever the [data] effect replaces the snapshot and in retryRequest's default branch; or compare next.discovery.fetchedAt with the latest
     data before merging.
N-P2 S2 MEASURED  token-image.ts:120 (`public, max-age=0, s-maxage=0, must-revalidate`) + catalogue.ts:42 cold bootstrap
     Every logo view is now a function invocation (x-vercel-cache MISS on all requests), and a cold instance must download and normalize the
     8 MB catalogue plus configs before it can authorize one logo. Measured first-visit logo latency 0.2-4.0 s (median ~2.6 s, 15 requests);
     ten parallel logos across cold instances = up to ten catalogue downloads (~80 MB from Ember, which asks <= 1 request/s per endpoint,
     INTEGRATIONS.md:35). Round 2 served logos from the CDN. The membership check makes the year-long immutable cache unnecessary as a
     defence, but s-maxage=0 throws away the CDN entirely. Fix: a bounded `s-maxage` (minutes) with stale-while-revalidate - a removed logo
     then lingers at most that long, which the 45 s membership refresh already tolerates - and keep max-age=0 for browsers if desired.
N-P3 S3 CODE (INTRODUCED; Codex R3-02)  catalogue.ts:42, market-data.ts:123 (backoff 90 s after one failure), market.tsx:6-26
     A logo request that lands on a cold instance whose catalogue read fails gets 503 after up to ~17 s; the avatar retries at 0.8 s and
     3.0 s, both inside the instance's 90 s backoff (snapshot() null -> 503 immediately), then shows initials for the rest of the session
     (LogoImage is keyed by mint+src, so polls do not remount it; only `online` or a reload resets it). Not reachable before this round.
     Fix: reset the avatar on a successful parent poll, or lengthen the last retry beyond the backoff.
N-P4 S3 CODE (Claude agent A-1; sharper than the S2-01 residual)  view-model.ts:94-105 + market-data.ts:123-133
     Page merges require identical fetchedAt+evidenceHash; a single instance rotates both on the first read >= 45 s after the previous one,
     and every warm instance has its own. So paging past 100 rows works only within one 45 s window on one instance; after that every "Show
     more" returns "The catalogue changed while paging" and the only exit is "Refresh list" -> 20 rows. Ranks beyond ~300 are effectively
     reachable only by search. The builder documents the cross-instance half; the same-instance rotation and the reset-only exit are new.
N-P5 S3 CODE (INTRODUCED; Claude agent A-5)  market.tsx:47 (`requestError = matchingPage?.error || error`) + view-model.ts:79-82
     After a failed parent poll, a searched or filtered page that succeeded seconds earlier is labelled "Stale observation" with a "Refresh
     failed" notice for up to 45 s. Defensible (the source is failing) but the label is about the wrong request.
N-P6 S3 EXECUTED by the Claude agent (locally)  token-image.ts:106  20 distinct logos in flight on one instance -> 16 x 200 + 4 x 503; the
     browser's two retries usually recover; with s-maxage=0 the cap is now hit by visitors, not only by attackers.
N-P7 S3 CODE  market.tsx:143  Eligibility tab + any query shows "No matching token." instead of "No eligible selection yet." (query is
     tested before view).
N-P8 S3 evidence (Codex R3-04)  docs/evidence/r2/independent-public-review.md:15-18 records SHA-256 of market.tsx, records.tsx and
     ui-r2.browser.mjs that do not match the served files even after CRLF normalization (the review predates the integrator's last edits);
     the "independent review" cannot be tied to the shipped bytes.
Checked and clean this round (three channels): within() (no timer/listener leak, double-settle harmless, abort -> 503), pending/cache keying,
membership re-check after I/O, HEAD/304 gating, fail-closed 503 on cold outage, fetchJson {value,bytes} and configs?.value, zod row schema on
the live catalogue (0 invalid rows), duplicate grouping and tie-breaks, hosted validation and 404/405/400 paths, api() abort plumbing and
timer cleanup, useLedger independent loads and abort guards, render-time shapes (rank null, image null, empty markets, unavailable), JSON
import attributes present in all three production importers (the live function loads, so the ESM fix holds), no uncaught 500 path found.

4. NEW FINDINGS - MONEY PATH (code unchanged since round 2; these are additions to the register, not regressions)
N-M1 S2 CODE (Codex ledger R3-01; verified at control.ts:15-29, main.ts:29-36, solana.ts:99-104, runner.ts:27-45,85-96)
     The transaction is BUILT under the approval loaded inside swapBuilder (main.ts:29: `const a=await loadApproval(c)` -> approvedPrograms,
     policy.slippageBps, impactBps), then preflighted, then `authorizeSigning()` runs executionAuthorizer, which reads the approval file
     afresh and only checks that it did not change DURING that call (control.ts:18,25-26). If the operator replaces the approval file after
     the build starts and before the signer-boundary authorize begins (a window of one Jupiter build + preflight, seconds), the new file is
     accepted (hash(B)===hash(B)), conditions re-check admission/identity/budget under B, but nothing rebinds the built transaction's slippage,
     minimum output or program set to B, and the A-built bytes are signed (and later rebroadcast under the same gap). Loss bounded by the
     limits A allowed; the documented guarantee ("even if the file changed mid-cycle", control.ts:24) is not met. backend-orchestration.test.ts:
     97-100 covers a change inside one callback only. Fix: record hash(a) and the economic limits used at build in i.expected and require
     equality (or a re-validation of the built message against the effective approval) at signing and at broadcast.
N-M2 S2 CODE (Codex ledger R3-02; verified at ingestion.ts:33-45)  ingestTokenDeposits enumerates token accounts by CURRENT owner and, for
     an account without a cursor, scans its ENTIRE signature history, booking every inbound transfer as a deposit and ignoring outbound
     transfers, with no custody baseline. Anyone can move 100 units through their own token account, empty it, then SetAuthority(AccountOwner)
     to the treasury (~0.002 SOL): the ledger gains a 100-unit deposit the treasury never held; reconcile then reports a deficit -> incident +
     pause. Sharper than F-8 (no dust needed) and it defeats F-8's proposed "sum all treasury-owned accounts" fix (the account balance is 0).
     Not creator revenue, not distributed, no loss - a cheap pause wedge and a false balance. Fix: baseline each account at first sight (current
     balance) and account net movements after that; never credit pre-ownership history.
N-M3 S3 CODE (Codex ledger R3-03; verified at queries.ts:41-43, migration 001:17, store.ts:7,15)  accountingHealth 'reconciled' requires
     max(ledger_events.created_at) <= reconciliation.at, but created_at DEFAULT now() is the transaction START time in PostgreSQL. A transaction
     that begins (BEGIN) and then waits on the control lock while reconcile runs commits its postings with a timestamp EARLIER than the
     reconciliation observation, so Transparency reports 'reconciled' for up to 180 s despite a later committed movement. Reachable with one
     worker plus the operator API (capital recognition). No loss. Fix: compare against a lock-ordered watermark (sequence / clock_timestamp()
     taken under the lock), not created_at.
N-M4 S3 docs  INTEGRATIONS.md:35 now says "The financial EmberClient discovery cache is 60 seconds"; live mode calls fundingRoute(ember,pool,
     true) (main.ts:31,49) which reads /markets with ttl 0 (ingestion.ts:31), and even the unforced path uses 45 s. F-9 restated; the doc
     edit made the sentence false rather than fixing the cache.
N-M5 S2 CODE (Claude money agent M-2; verified at runner.ts:85-96, solana.ts:157-159, control.ts:15-29)  Resending ALREADY-SIGNED bytes is
     gated on the full new-signing authorization - two approval loads, a forced 8 MB /markets read, the selection provider read for swaps
     (which per F-12 misses the 45 s cache and walks the provider), admission - run twice (authorizeBroadcast at :87, then again inside
     chain.broadcast at solana.ts:159), and any failure is swallowed: `try{await authorizeBroadcast();}catch{return;}` (:94). A transient
     Ember/RPC/provider failure or a provider walk longer than the ~60-90 s blockhash window forfeits the resend; the signature then inspects
     as `expired` -> needs_review (:79-83) and F-4's dead end follows. RUNBOOK.md:34 "While the blockhash is valid, retrying sends identical
     stored bytes" is unconditional; the code is not. No loss; a realistic wedge. Fix: gate a resend of stored bytes on pause/blockhash/cluster
     only (the economic checks were done at signing), and log the reason instead of returning silently.
N-M6 S3 PLAUSIBLE (Claude money agent M-1, narrowed by my reading of runner.ts:99-113)  tick() holds one 120 s lease for every in-flight
     intent and never renews it; Engine.apply re-fences (engine.ts:100). The agent's scenario (a slow resend authorization delaying a later
     settlement in the same tick) is blocked in practice by the busy check (at most one non-review intent in flight) and by settlement
     running in a later tick than the resend; what remains is RPC stalls inside inspect/apply themselves exceeding 120 s, after which a
     SUCCESSFUL settlement is recorded as incident 'settlement evidence or ledger mismatch' + pause (runner.ts:69, store.ts:27) until an
     operator resolves it; the next tick applies correctly, so the ledger self-heals but the pause does not. Fix: renew the lease before
     apply or fence on a longer lease; label the incident by cause.
Also noted (KNOWN or inert): /operator/capital accepts source==feeSender (F-14), so while F-5 stalls ingestion an operator can book a
creator fee as capital -> reserve (agent M-6); OPERATIONS==TREASURY is not rejected and ingestTreasury does not exclude the worker's own
signatures - inert while scheduleOperations is uncalled (agent M-7).

5. DOCS VS CODE (this round's edits)
- AUDIT-START-HERE.md / VERIFICATION.md / deployment.json claims (258 tests / 20 files, 8 assets, 10 logos, prelaunch/paused/no worker):
  REPRODUCED here. docs/AUDIT-FINDINGS.json (56 entries: 37 inherited + 19 R2) matches the builder's own status labels; F-1..F-14 all 'open'.
- docs/AUDIT-R2.md P-1..P-5 and residual descriptions: accurate, except that "retain their observation and expanded rows" is unconditional
  while N-P1 is a counterexample, and P-2's "50,000-row bounds" is a schema ceiling (see P-2 above).
- FINANCIAL-INDEPENDENT-REVIEW.md:24 "(size+2)*maxFee + (size+2)*rent suffices": holds for eleven successes + burn with zero failed attempts;
  see F-3 for the one-failure counterexample at the cap. Its own line 26 already asks for the integrated regression that would catch it.
- DATA-SCHEMA-MAPPING.md:47 overstates what the collector shares (P-2). INTEGRATIONS.md:35 cache sentence false for live (N-M4).
- BACKEND-CORRECTIONS.md:59 "Reconciliation health only says reconciled for a fresh balanced observation with no later journal movement":
  contradicted by N-M3.
- RUNBOOK.md:34 "While the blockhash is valid, retrying sends identical stored bytes": conditional in code on a full re-authorization (N-M5).
- independent-public-review.md hashes do not identify the shipped files (N-P8).

6. TESTS
258/258 green (43 s). This round's tests pin what they claim: P-2 bounds and warning, P-3 membership/304/HEAD/deadline/abort isolation, P-4
parity, P-5 timeouts and the native ESM import. Nothing can fail on N-P1 (no test pages while a poll lands), N-P3 (the 91 s test re-requests
by hand), N-M1 (the only approval-change test mutates inside one callback), N-M2 (ingestTokenDeposits has no history test), N-M3, or F-5(b)
(the fixture is the global window, not a pool window with a sweep row). audit-s1.test.ts:79 still asserts the forecast formula's own output;
the eleven-transaction + one-failure regression the builder's review requests does not exist. The Playwright browser suite is reviewer
tooling and was not run here; the live browser session above covers its main assertions (140-row retention, explicit refresh, 320 px nav).
Nothing can fail on N-M5 either (execution-regressions asserts the resend gating as desired behaviour; no transient-failure case).

7. ORDER
Public showcase: 1) N-P1 (two `++requestVersion.current` lines + a test that polls during a pending page request). 2) N-P2 (bounded s-maxage;
measure logo latency again). 3) N-P3 avatar reset on a good poll. 4) Docs: DATA-SCHEMA-MAPPING.md:47, INTEGRATIONS.md:35, refresh the
review hashes or drop them. Stop there unless the money path is pursued.
Money path, only if pursued: 1) F-5 tolerant payouts schema + quarantine re-check (now proven necessary on live data). 2) F-2 keyed build
acceptance test (still the gate on whether the adapter is rewritten). 3) F-3 forecast with a retry margin + the eleven-transaction/one-failure
test. 4) N-M1 approval binding at build. 5) F-4 retire route together with N-M5 (resend on stored bytes gated on pause/blockhash only).
6) F-6 WSOL handling + epoch gate. 7) N-M2 custody baseline (with F-8). 8) F-9 cache (make INTEGRATIONS.md true). 9) F-7, F-10-F-14,
N-M3, N-M6. F-1 remains a service to build, not a bug; it gates everything above.

8. EVIDENCE ON THIS MACHINE (all outside the repository)
- Scratch clone with node_modules, dist/web, test/build logs and probes:
  [reviewer-local-path]
  (ember10\, tests-r3.json, typecheck.out, build.out, test.out, ov.json, basket.json, markets-live.json, payouts-live.json, payouts-pool.json,
  pp-6sg6ub...json, jup-f2-recheck.mts, codex-payload\ with DIFF-code-4f9fba2..ad972e7.patch)
- Codex packets (TASK.md, MANIFEST.md, OUT.md = report, RESULT.md = verification, ROLLOUT.jsonl):
  [reviewer-local-path]   [reviewer-local-path]
- Round-1 and round-2 reports: EMBER10-AUDIT-2026-09-23.md, EMBER10-AUDIT-R2-2026-09-23.md in this folder (the round-2 report is also in the
  repository at docs/evidence/r2/supplied-audit.md).

NOTES
- Nothing touched the deployment or the repository; all execution was on a scratch clone; the scratch database is stopped.
- Same-vendor caveat: the builder is Codex. Codex found N-M2 and N-M3 alone; N-M1 and the F-3 zero-slack ordering were found by Codex and
  the Claude money agent independently; N-M5 and N-M6 by the Claude money agent; N-P1 by all three channels; N-P2 and F-2/F-5 are
  executed, not read.
