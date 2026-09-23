EMBER10 AUDIT ROUND 2 - 2026-09-23 - findings for the orchestrating/building session
Repo github.com/missfitchief/ember10 @ 4f9fba2 (HEAD, 54 commits, all "Codex <codex@local>"). Live https://ember5-pilot.vercel.app
serves 1f67d0d; the two later commits touch docs and scripts only (verified by diff and by byte-comparing the deployed bundle).

VERDICT IN ONE PARAGRAPH
The public site works and is exactly this source: every deployed asset is byte-identical to a clean build of HEAD, 242/242 tests pass, and
every route was driven in a browser at desktop, 375 px and 320 px with zero console errors. Ten of the fourteen public-path fixes are
confirmed, six by execution; the residual that matters is that an expanded search list still collapses on the 45 s poll (P-1).
The financial half is not runnable, for three independent reasons: by design the only built-in evidence provider marks every candidate
permanently unverifiable (F-1); the swap validator rejects real Jupiter build responses fetched today with the adapter's own parameters (F-2,
executed); and the round-1 S1-06 fix is one WSOL rent short, so a fresh treasury's first epoch strands its tenth purchase (F-3). No theft or
mis-credit path was found by any channel, but several one-transaction conditions wedge the pipeline with no operator recovery route (F-4, F-6).
Recommendation: keep the site, fix P-1, do not schedule a funded pilot. Flip tests for the money verdict: a keyed Jupiter build that decodes
as a direct route, and a real Keep-it pool payout sample that matches the attribution predicate.

0. PROVENANCE - WHAT WAS EXECUTED
- Clean clone, npm ci, npm test: 242/242 in 18 files (37.5 s, embedded PostgreSQL 18). tsc + vite build OK. npm run demo OK.
- Deployed assets/index-CO5ypo9H.js, index-EjoWDp4l.css, both woff2, favicon, share png/svg, index.html: sha256-identical to the local build.
- Live API: all 7 public routes, HEAD, POST->405, /operator/*->404, limit/offset/q/view/cursor validation, __route override, 20 crafted logo sources.
- Browser (built-in): overview, the ten, 4x "Show more" (140 rows), 45 s poll, "Refresh list", skip link, 101-char search, no-match search,
  asset dialog, mobile 375/320 px (no overflow, 3 columns hidden, menu + Escape + focus return), wallet valid/invalid, rewards, transparency.
- Local demo API over real HTTP: POST /operator/pause, /%6Fperator/pause, GET /%6fperator/funding, absolute-form target -> all 401;
  right token -> 200; every demo ledger route carries mode:"demo", testOnly:true; CSV export keeps content-disposition.
  pg_terminate_backend on the API's backend -> API kept serving 200, logged "Database idle connection lost" with code 57P01, no credentials.
- Prelaunch worker 3 min against the live catalogue: ONE operational_observations row (4.94 MB) replaced in place each cycle; documents table 0 rows.
- Live Ember catalogue: 8,002,582 B, 3,086 rows, 3,085 unique mints; launches/day last 14 d: 18-291 normally, 1,154 on 09-11.
- Live Jupiter v2 /build (unauthenticated, exact adapter params) x2, run through the repo's own validateSwapInstruction (see F-2).
- docs/evidence/ember-payouts.json census against the attribution predicate (see F-5). npm audit --omit=dev: 5 high, all bigint-buffer chain.
- Channels: two isolated Codex cold packets, both VERIFIED gpt-6-astra/xhigh (public session [review session ID omitted], 12 min;
  ledger [review session ID omitted], 16 min); three Claude finder agents (public / ledger / integrations); every claim below
  re-read by the orchestrating auditor at the cited lines. Caveat: all commits are by Codex, so the Codex channel is same-vendor as the builder.
  Tags: EXECUTED (reproduced), MEASURED (numbers from the live system, fixture or the code's own constants), CODE (verified by reading),
  PLAUSIBLE (mechanism certain, trigger not reproduced).

1. VERDICT
- Public site: WORKS and matches source. No S1. One S2 residual (P-1). Safe to keep publishing.
- Financial half: NOT RUNNABLE on three independent levels (F-1 design, F-2 live provider, F-3 forecast) and not safe to fund: no theft or
  mis-credit path found by any channel, but several one-transaction conditions wedge it with no operator recovery route (F-4, F-6).

2. INHERITED FINDINGS - STATUS
S1-01 FIXED (EXECUTED)      server.ts:27 checks req.routeOptions.url; audit-s1.test.ts:18 pins encoded + absolute-form with a real token.
S1-02 FIXED (CODE + test)   solana.ts:27-28 string commitment, supply slot >= census slot; test asserts the JSON-RPC params shape.
S1-03 FIXED for runtime     http.ts:4 64 MB, used by market-data.ts:101,103 and ember.ts:10; failures logged market-data.ts:127.
                            Residual: scripts/evidence.mjs:13 still 12 MB; docs/DATA-SCHEMA-MAPPING.md:47 and INTEGRATIONS.md:8 still say 12 MB.
                            NEW ceiling is the 20,000-row bound at market-data.ts:21 (P-2).
S1-04 FIXED (CODE + test)   ingestion.ts:9 skipZero; :19,:27,:41,:44 advance per signature incl. errored txs.
S1-05 FIXED (EXECUTED)      store.ts:6 pool error listener; compose.yaml restart on api and worker.
S1-06 REGRESSED ELSEWHERE   holder-count scaling removed; the replacement is one rent short - F-3.
S2-01 PARTIAL (EXECUTED)    default ranking: 140 rows survive the poll with a notice, "Refresh list" resets to 20. Searched/filtered
                            expansions still collapse silently (P-1). Cross-instance merge still keyed on fetchedAt+evidenceHash (view-model.ts:95).
S2-02 FIXED                 src.tsx:24-31 single-flight + 15 s abort + unmount abort.
S2-03 FIXED (EXECUTED)      server.ts:21-24 adds mode/testOnly to every /api object; UI refuses demo records (documented policy).
S2-04 FIXED (CODE)          hosted.ts:56-70 proxies overview behind the same production check; not executable here (needs an HTTPS backend).
S2-05 FIXED (CODE)          records.tsx:30-52: epochs error/retry, status:'unavailable' distinguished, nextCursor paging, Transparency retry.
S2-06 PARTIAL (EXECUTED)    shared 25 s deadline, CSV header forwarded; 4 MB cap remains (hosted.ts:33); any failure still reads "not a production ledger".
S2-07 FIXED (EXECUTED)      skip link leaves the hash untouched, focuses #main.   S2-08 FIXED (EXECUTED) specific 400 message + maxLength 100.
S2-09 FIXED                 market.tsx:26 remounts LogoImage per mint+src.        S2-10 FIXED (EXECUTED) 999,950 -> $1.0M.
S2-11 PARTIAL               hosted.ts:76 exposes universePage/universeComplete, but universe is still only the first 100 rows and
                            universeComplete reads true during a catalogue outage (empty projection, hasMore false).
L-01 FIXED  runner.ts:16-19 backoff, :106-111 fair selection.        L-02 OPEN - blast radius larger than recorded, F-6.
L-03 FIXED (EXECUTED) store.ts:11 upsert per type, migration 008; status returns a projection. Note: a 4.9 MB row rewritten every 45 s and
                      read whole by queries.ts:7 on every status call (S3).
L-04 FIXED  store.ts:27 dedupe; server.ts:42-47 resolve route without resume.    L-05 FIXED  developer.ts; scheduleOperations is now dead in the
                      worker but still callable at engine.ts:165 (S3).           L-06 FIXED  solana.ts:47-75 rent from the original message + pre/post balances.
L-07 PARTIAL exponent form fixed (http.ts:18); quarantine still permanent; payouts schema still strict - F-5.
L-08 FIXED  approval.ts:5, selection.ts:60.                          L-09 PARTIAL needs_review re-inspected, basket rechecked, simulate before
                      sign, pause at the signer boundary; caps still creation-only - F-10.
L-10 FIXED  commit.ts:9-15 snapshot and price after revalidate.      L-11 PARTIAL HMAC identity exists; nginx still one bucket for everyone.
L-12 OPEN   runner.ts:55 compares i.expected with itself (jupiter.ts:60 mutates it; solana.ts:138 returns it). Blast radius: nothing compares
            outAmount to an independent price, so a bad build response is bounded only by Jupiter's own priceImpactPct (S2, needs provider compromise).
L-13 PARTIAL in-flight native bound + CSV control chars fixed; operator.ts:9 still cannot publish a policy after v2; TRUNCATE/role/Windows shutdown open.
D-01 FIXED (242/18 matches VERIFICATION.md).   D-02 PARTIAL asset hashes now compared (audit-public.mjs:15-16); revision is still an env echo
     (overview.ts:15, VERCEL.md:24 still tells the deployer to type it); the server function is not comparable.
D-03 PARTIAL new real oracles exist, but engine.test.ts:55 still "rejects forged outcome evidence" with none; core.test.ts:13, market-data.test.ts:28,56,
     ui-view-model.test.ts:220-221 still tautological.   D-04 FIXED (0 occurrences).   D-05 PARTIAL 5 high, all bigint-buffer (MEASURED).
D-06 FIXED (same-origin logos; nginx img-src 'self' now satisfied).   D-07 PARTIAL.

3. NEW FINDINGS - MONEY PATH
F-1 S1 CODE (documented)  provenance.ts:99-110,120  With the only built-in provider (jupiter-tokens-v2) every candidate receives the three
    permanent blockers and returns before chain verification; `complete` requires custom metrics, so status is 'warming' and no basket or epoch
    can ever exist. The custom contract (validateMetrics :56-72) is all-or-nothing: every one of ~3,085 mints, fresh <= 180 s, exact
    rankValue = supply x price, complete 24 h volume windows; one stale mint rejects the whole universe. Not a code bug: the product blocker is an
    external reviewed service that does not exist. Nothing else on this list matters to the owner until that decision is made.
F-2 S1 EXECUTED  jupiter.ts:14,19-25  Live https://api.jup.ag/swap/v2/build with the exact query the adapter sends
    (onlyDirectRoutes=true, instructionVersion=V1, useSharedAccounts=false, platformFeeBps=0; unauthenticated):
      SOL->USDC:                 instruction discriminator d19853937cfed8e9, 47 accounts, routePlan length 2
      WSOL->5dvXTZ...4QEC6 (#1 Ember mint, 0.0784 SOL): discriminator bb64facc31c4af14, 50 accounts, routePlan 2 (Meteora DLMM x2)
    Neither discriminator exists in the installed @jup-ag/instruction-parser 6.0.28 (route, sharedAccountsRoute, exactOutRoute, ...).
    buildSchema parsed (priceImpactPct is present), then validateSwapInstruction threw 'only decoded legacy exact-input direct route supported'.
    Consequence: safeJupiterBuild never succeeds and provenance.ts:173-177 excludes every candidate ('On-chain or route evidence unavailable').
    Fail-closed, no loss. The response also carried computeBudgetInstructions with SetComputeUnitPrice 2,636 microlamports, which jupiter.ts:57
    discards (see F-4). Caveat: unauthenticated; docs/INTEGRATIONS.md:17 says the keyed build was never tested. FLIP TEST: one keyed build that
    returns a decodable direct `route`. Fix: re-derive the adapter against the current API (instruction variant, routing params, priority fee)
    and add a test with a real captured response. No test can fail on this today.
F-3 S1 MEASURED (arithmetic on the repo's constants; Codex R1 and both Claude agents agree)  forecast.ts:5 + jupiter.ts:51-52 +
    execution-cost.ts:19 + runner.ts:34-36 + engine.ts:105
    forecast = 12 x 100,000 + 11 x 2,039,280 = 23,632,080 funds eleven net rents; each swap build also demands the WSOL float:
    requiredRent + maxFee = 2 x 2,039,280 + 100,000 = 4,178,560 of maxTotalCost (= the live cost:<epoch> balance).
    Tick order (runner.ts:106; equal created_at; id 'buyback:' < 'purchase:'): buyback, then ten purchases by mint, burn last.
      balance before the 10th purchase: 3,189,280 at a 5,000 fee (2,239,280 at the cap)  ->  FAIL, shortfall 989,280
    Trigger: all eleven outputs need a new treasury ATA = every fresh treasury's first epoch (later epochs pass because the ourMint ATA exists).
    Effect: intent waiting_for_route, retried every 300 s forever (each retry buys a Jupiter build), epoch 'partial', 8 % of net plus
    ~3.2 M lamports stranded, returnUnusedCosts blocked (engine.ts:160), reconcile throws (F-7). Only an out-of-band ATA creation unblocks it.
    audit-s1.test.ts:79 pins 23,632,080 = the formula's own output. Fix: forecast (size+2) x rent (25,671,360) or exclude the returning float
    from the allowance check; add a test walking eleven all-new-ATA transactions through the real adapter with the real forecast.
F-4 S1 CODE  runner.ts:79-84,101-103 + solana.ts:143,170-172  A transaction that expires (no priority fee, maxRetries:0) becomes needs_review,
    which blocks all signing and new epochs (main.ts:56) until someone edits the database by hand: nothing writes 'expired_verified'
    (only read at runner.ts:24, recovery.ts:16, 002_invariants.sql:10), recoverIntent only re-inspects, and no operator route retires an
    intent/attempt or releases its reservation. The same dead end follows any apply()/inspect() throw (F-6b). Fix: an authenticated retire route
    (verified absent after lastValidHeight on both providers -> expired_verified + reservation release, audited) and forward Jupiter's CU price.
F-5 S1 PLAUSIBLE (mechanism CODE, MEASURED on captured data)  ingestion.ts:22 + engine.ts:26-30  Attribution requires kind='payout' &&
    mode='keep' && quoteMint=WSOL && exact amount. docs/evidence/ember-payouts.json (100 rows): 0 matches; the only two mode 'keep' rows are
    kind 'claim' with amount 0 (claimed 0.525); every 'payout' row is mode 'holders'. If a Keep-it pool's fees publish in that shape, every fee
    is classified 'review' -> quarantine, permanently (L-07b: no re-attribution, ON CONFLICT DO NOTHING). 2/100 rows lack `signature`
    (kinds perp, sweep) -> ember.ts:15 throws -> ingestTreasury throws every loop (L-07c). Unverifiable without a real keep pool.
    Fix: capture a real keep-pool payout window before any funding decision; tolerant schema; re-check quarantined receipts on later passes.
F-6 S1 CODE (L-02 blast radius; Codex R3 + both agents)  jupiter.ts:44 + main.ts:54-66  (a) any non-null account at the treasury's WSOL ATA
    address, e.g. a 0.00089 SOL system transfer by anyone, makes every swap/buyback defer forever; 'waiting_for_route' is neither in-flight
    nor paused, so a new epoch still commits every hour and moves min(revenue, MAX_ROUND) into unexecutable budgets each time; no cancel route.
    (b) residual lamports in that ATA at landing (griefer, or Ember paying WSOL): the close returns them, input < amount, engine.ts:93 throws,
    incident + rethrow every tick, tokens bought on chain but never credited. Fix: accept a zero-balance existing WSOL ATA, derive input from
    the WSOL account's own pre/post balance, gate new epochs on "no unexecutable intents".
F-7 S2 CODE  main.ts:78-79 + engine.ts:70  plan() registers all ten mints in `assets` before purchase; the operator-queued reconcile requires
    every registered ATA to exist and throws otherwise, so it never completes during a partial epoch (permanent with F-3). ourMint is never
    registered, so burn-units are never reconciled (S3). Fix: reconcile mints with a finalized purchase; register ourMint.
F-8 S2 CODE  ingestion.ts:34-43 + engine.ts:183-192  A token account with owner=treasury (anyone can create one for ~0.002 SOL) receiving dust
    is booked as a deposit, but reconcile compares against the canonical ATA only -> 'deficit' incident + pause on every reconcile. A fee
    landing between ingestion (main.ts:52) and the balance read (:79) -> 'unclassified_surplus' incident + pause (PLAUSIBLE).
    Fix: reconcile all treasury-owned accounts per mint; treat a surplus that the next ingestion explains as transient.
F-9 S2 CODE  main.ts:31,49 + ingestion.ts:31 + ember.ts:8-10  In live mode fundingRoute is forced (ttl 0): the 8 MB /markets body is
    downloaded every 5 s loop, plus twice per intent. docs/INTEGRATIONS.md:35 promises a 60 s cache (db041a0 had one); Ember asks <= 1 req/s;
    a 429 throws into the main-loop catch and skips the rest of that loop. Fix: cache the funding-route read; force only at the signer boundary.
F-10 S2 CODE (Codex R2)  engine.ts:51,62 + runner.ts:27-40  MAX_ROUND/MAX_DAY govern epoch creation only; a lowered cap never stops planned
    intents, and epochs deferred from several days execute together. Acknowledged L-09 residual. Fix: re-check amounts and day totals in authorize.
F-11 S2 CODE (Codex R4)  config.ts:17,20 + developer.ts:147,195 + runner.ts:74  Default DEV_PAYOUT_MAX_COST_LAMPORTS (100,000) equals
    MAX_TX_FEE (100,000): one finalized failure charging 5,000 leaves 95,000 < fee cap, the day's intent can never sign again and blocks every
    later daily payout (developer.ts:195); no replenish route. Fix: default allowance >= 3x fee cap; retire route (F-4).
F-12 S2 CODE (timing PLAUSIBLE; Codex R7 + both agents)  main.ts:51 vs :33 + automatic-selection.ts:27  The loop reads the selection with
    budget prospective x 8 % and each intent with b.leg; the strings differ, so the 45 s cache misses and a full provider walk runs every 5 s
    during execution; with a chain-verifying provider the signer-boundary re-read outlives the 15 s quote (solana.ts:103) -> 'quote stale at
    signing' on every attempt. Fix: cache by catalogue hash; take the quote after the authorization reads.
F-13 S2 CODE (Codex R8)  runner.ts:31-40,88-92 vs solana.ts:104,143  Pause/approval are checked, the lock is released, then sign/send;
    a pause committed in that gap is not seen. Bounded to one already-authorized transaction.
F-14 S3 cluster  4.9 MB observation rewritten every 45 s and read whole by status (queries.ts:7); zero-transfer spam appends an immutable
    documents row each (ingestion.ts:9); provider/RPC errors collapse to one generic string (provenance.ts:90-91,117; automatic-selection.ts:37-41);
    http.ts:9 Number(retry-after) on an HTTP date -> NaN -> immediate retries; ingestion runs outside the lease fence; /operator/capital accepts
    source == feeSender; operator.ts:9 vs policySchema 1|2; TRUNCATE/role/Windows shutdown as acknowledged.

4. NEW FINDINGS - PUBLIC PATH
P-1 S2 EXECUTED  market.tsx:67-78  Search "a" (2,791 matches), expand to 140 rows, wait for the 45 s poll: 100 rows, no notice. The retention
    branch (:62-64) covers only the default ranking; every other key refetches offset 0 when `data` changes. Fix: retain for every key, or stop
    refetching on `data` when query/view are unchanged.
P-2 S3  market-data.ts:21  The 20,000-row schema bound trips before the 64 MB byte cap (about 52 MB at 2.6 KB/row) and fails to 'unavailable'
    with only a console.error. Live 3,086 rows: about 229 days at 74/day, 31 days at 540/day, 15 days at the 09-11 rate (1,154/day).
    Fix: raise and alert; keep scripts/evidence.mjs:13 in step.
P-3 S3  shared/token-image.ts:13-21 + token-image.ts:32-34,88  The proxy serves any CID on the allow-listed hosts (embercurve /img/, ipfs.io,
    pinata, arweave) re-encoded as webp and cached a year at the CDN; CORP same-origin and the CSP sandbox limit it to direct navigation;
    16 slow distinct CIDs can 503 legitimate logos on an instance. Fix: accept only CIDs present in the last-good catalogue.
P-4 S3  overview.ts:20 vs view-model.ts:89  Server and client concatenate mint/name/symbol in different orders; a multi-word query can show
    "1 search matches" beside "No matching token".
P-5 S3 cluster  src.tsx:27 (15 s) vs market-data.ts:99-105 (8 s + 1 s + 8 s): a cold first load can fail in the browser 1-2 s before the
    server's retry answers; records.tsx:25 allSettled has no timeout, one stalled request hides the other two; hosted.ts:76 universeComplete:true
    during an outage; homepage.tsx:32,46 aria-label on div; src.tsx:49 aria-controls to an absent element; stale 12 MB doc lines;
    VERCEL.md:24 still tells the deployer to type the revision.

5. TESTS
The suite is green and three times larger, but the round-1 regression tests pin outputs rather than sufficiency: audit-s1.test.ts:79 asserts
the forecast's own number; execution-regressions.test.ts:232 funds a single intent with 10,000,000; DemoChain returns maxRent '0'; the real
chainVerifier and the real Jupiter response shape have zero coverage; engine.test.ts:55 still has no forged evidence. No existing test can
fail on F-2 through F-6, F-9 or P-1.

6. ORDER
Public showcase: P-1, then P-2's alert. Stop there unless the money path is pursued.
Money path, only if pursued: 1) F-2 keyed Jupiter build acceptance test (decides whether the adapter is rewritten). 2) F-3 forecast + an
eleven-transaction test. 3) F-4 retire route + CU price. 4) F-5 real keep-pool payouts capture, tolerant schema, quarantine release.
5) F-6 WSOL handling + epoch gate. 6) F-9 cache. 7) F-7/F-8 reconcile scope. 8) F-10/F-11/F-12/F-13. 9) D-03 oracles.
F-1 is a service to build, not a bug; it gates everything above.

7. EXTERNAL EVIDENCE LOCATION
The supplied report lists scratch-clone logs, review packets and raw Jupiter build captures on the auditor's separate machine. Those files were not attached and have not been independently accessed by the builder. Local paths and session identifiers are omitted from this public copy; findings and reproduction details above are preserved.

NOTES
- Nothing touched the deployment or the repository; all execution was on a scratch clone. Scratch database, demo API and worker are stopped.
- Same-vendor caveat: the builder is Codex; Codex still found F-3 independently and F-10/F-11/F-13 alone; F-2 and P-1 are executed, not read.
