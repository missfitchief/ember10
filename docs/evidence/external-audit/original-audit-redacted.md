# Historical supplied audit input

Targets db041a0, not the current application. Local paths and prior session identifiers are redacted. Claims below are preserved as supplied historical evidence; they have not been independently revalidated. Current status is in findings.json.

EMBER10 AUDIT - 2026-09-23 - findings for the orchestrating/building session
Repo github.com/missfitchief/ember10 @ db041a0 (HEAD, 29 commits, all authored "Codex <codex@local>")
Site https://ember5-pilot.vercel.app (/api/status reports revision db041a0)

0. PROVENANCE - WHAT WAS ACTUALLY EXECUTED (not just read)
- Deployed bundle == source: assets/index-DwOzS4fQ.js and index-DPoHAwK-.css byte-identical (sha256) to a clean local
  `npm run build`; index.html identical modulo CRLF. Build: tsc + vite 8.3.0 OK.
- `npm test`: 79/79 pass, 6 files, 20 s, against embedded PostgreSQL 18 (incl. the 6 real child-process crash tests).
- `npm run demo` twice: replay produced identical entitlements/intents/56 ledger events, no second purchase.
- Live site driven in a browser: overview, the ten, rewards, my rewards, transparency, how; search, no-match, paging,
  asset dialog, wallet validation, mobile 375px (menu, Escape, no overflow, 3 columns hidden). Zero console errors.
- Live API probed: all 7 public routes, 400/404/405 validation, HEAD, limits, offset, view, q length.
- Local demo stack (`npm run dev -- --demo`) and a prelaunch worker were run and probed. Scratch only; nothing touched
  the deployment.
- Two isolated Codex (gpt-6-astra / xhigh) cold audits, VERIFIED records:
  public path  session [prior session identifier redacted]  16:56:28Z-17:08:08Z  10 findings
  ledger/live  session [prior session identifier redacted]  16:56:36Z-17:11:58Z  15 findings
  Raw returns: [auditor-local paths redacted]
  Caveat: every commit is by Codex, so the Codex channel is same-author; it still agreed with the Claude side on the
  top items below (agreement is marked "both channels").
- Eight Claude finder angles (line scans, contracts, pitfalls, wrappers, docs-vs-code, cleanup), then my own
  verification of each candidate by code reading, arithmetic, or execution. Status tags: EXECUTED (reproduced),
  MEASURED (numbers taken from the live system/fixture), CODE (verified by reading), PLAUSIBLE (mechanism certain,
  trigger not reproduced).

1. VERDICT
- Public site: WORKS. Correct data shapes, correct validation, matches HEAD. Two real defects (S2-01, S2-02) and one
  time bomb (S1-03) that will take market data offline within weeks unless the cap is raised.
- Local dev flow: `npm ci`, build, tests, demo all work. The documented demo BROWSER walkthrough does not (S2-03).
- Financial service (worker/API/ledger): NOT RUNNABLE as configured. S1-01/02/04/05/06 each independently stop it,
  and S1-01 is an auth bypass. Do not configure a treasury or signer against this revision.

2. S1 - FIX BEFORE ANY LIVE CONFIGURATION (plus one public-site time bomb)
S1-01 EXECUTED  apps/api/server.ts:18  Operator auth bypass via encoded path
  The hook checks req.url.startsWith('/operator/') on the RAW url; find-my-way decodes the path AFTER that.
  Repro on the demo API: POST /%6Fperator/pause (no token) -> 200 {"paused":true}, control row paused;
  GET /%6Fperator/funding -> balances. Plain /operator/pause -> 401 as intended. Absolute-form URLs
  (POST http://x/operator/resume) bypass the same way. Reachable wherever the API port is reachable
  (local dev binds 127.0.0.1:4310; compose only publishes nginx, which normalizes and returns 404 on /operator/).
  Fix: check the ROUTED path (register auth as an onRequest hook scoped to a /operator prefix plugin, or compare
  request.routeOptions.url), never req.url; add a test with /%6Fperator/... and absolute-form.

S1-02 EXECUTED  packages/integrations/solana.ts:26  fullSnapshot can never succeed against a real RPC
  getTokenSupply(key,{commitment:'finalized',minContextSlot:...} as never) - web3.js 1.99 takes a commitment
  STRING and wraps it, so the RPC receives commitment:{...}. Against api.mainnet-beta.solana.com (USDC mint):
  string form OK; the repo's form -> "Invalid params: invalid value: map, expected map with a single key".
  Effect: worker main.ts:42 throws on every evaluation, engine.plan never runs; provenance.ts:39 throws inside its
  swallowing catch so every candidate stays censusComplete:false; scripts/test-chain.ts dies at :54 (matches the
  docs' "not completed"). Fix: pass 'finalized' (minContextSlot via a raw RPC call if required) and add a test that
  asserts the JSON-RPC params shape.

S1-03 MEASURED  packages/integrations/market-data.ts:100-102 (+ http.ts:2 same 12 MB default, used by ember.ts:10)
  Hard 12,000,000-byte cap on the decompressed Ember /markets body. Live now: 7,963,864 B, 3,074 rows, ~2.8 KB/row,
  cumulative (nothing is pruned) -> ~1,400 rows of headroom. Launches/day last week 18-66, spikes 450-544 on 09-12/13.
  Expect the cap to be crossed in roughly 3-10 weeks (could be days on a spike). When it is: both attempts throw
  source_size, `catch { this.failed = true }` logs NOTHING, cold Vercel instances serve status 'unavailable' with
  markets:[], warm ones serve an ever-older 'stale' page; the live worker's fundingRoute() also throws every loop.
  Their own docs/evidence/index.json already logged "response too large" for this URL at 11:58Z today (same cap in
  scripts/evidence.mjs:13). Fix: raise the cap (the row schema allows 20,000 rows ~ 56 MB, so the two limits
  disagree 4x), log the failure, and prefer a streaming parser or a paged/lite endpoint if Ember offers one.

S1-04 CODE, both channels  packages/integrations/ingestion.ts:22 (SPL variant :40), engine.ts:20, solana.ts:33
  A successful 0-lamport SystemProgram transfer, or a 0-amount SPL transfer (ordinary address-poisoning dust), to
  the treasury: parsedTransfers accepts lamports>=0, engine.ingest ensures amount>0n and THROWS, and the cursor is
  written only after the loop (:25/:42). Every pass re-reads the same signature and throws again; main.ts:70's
  single catch then skips planning, payouts, operations, reconcile forever. Cost to attacker: one tx fee.
  Fix: filter amount==0 before ingest (record-and-skip), and advance the cursor per signature.

S1-05 EXECUTED  packages/db/store.ts:6  pg.Pool has no 'error' listener -> DB restart crashes API and worker
  Repro: pg_terminate_backend on the two idle backends of ember5_demo killed BOTH processes (port 4311 gone, two
  node.exe exited with an unhandled pg error). compose.yaml: api has no restart policy, worker does.
  Fix: pool.on('error', ...) + reconnect/backoff; restart: unless-stopped on api.

S1-06 MEASURED (arithmetic)  apps/worker/main.ts:46 with money.ts:16
  forecast = (size+2)*fee + eligibleHolders*size*(rent+fee); budget() rejects forecast > 10% of the round, and the
  round is capped at MAX_ROUND (default 1 SOL). Defaults (fee 1e5, rent 2,039,280, size 10): 4 holders pass
  (86.8M), 5 holders BLOCKED (108.2M > 100M), 50 holders need a 10.7 SOL round, 300 need 64.2 SOL (> default
  MAX_DAY 5 SOL). "accumulate funds" can never succeed because funding is capped. Payout rent is in fact charged to
  'reserve' later, not to cost:<epoch>. Fix: forecast only the costs the epoch actually bears (swaps + buyback +
  ATA creation for economical payouts), not rent for every holder x 10 assets.

3. S2 - PUBLIC SITE AND LOCAL FLOWS
S2-01 MEASURED  apps/web/market.tsx:41-59 (+ src.tsx:26, view-model.ts:79)
  "Show more markets" beyond 100 rows is undone by the 60 s background refresh: the effect depends on `data`, the
  default-ranking branch does setPage({snapshot: data}) and `limit` is not reset. Live: 140 rows at 17:03:20Z ->
  100 rows at 17:04:24Z, no notice. Also, page merges require identical fetchedAt+evidenceHash, but evidenceHash
  hashes live fields (totals, ledger24h, spark) so it changes every 45 s, and 12 parallel requests returned 3
  different fetchedAt values (separate warm instances) -> "catalogue changed while paging" resets are routine.
  Fix: keep the merged snapshot when the new first page has the same content hash; hash only ranking-relevant
  fields (mint, cap, pool) for the merge key; reset `limit` only when the key actually changes.

S2-02 CODE  apps/web/src.tsx:20-26  reload() has no request versioning
  Retry twice while one request is pending: an older response can overwrite a newer one or mark a successful
  refresh 'stale'. Fix: generation counter / AbortController like MarketPanel already has.

S2-03 EXECUTED  apps/api/server.ts:23, apps/web/ledger.ts:15/27, apps/api/queries.ts:29/39, records.tsx:11
  The documented demo walkthrough (README, docs/VERIFICATION.md "Demo trace") is broken and inconsistent:
  - /api/overview returns 404 in demo mode -> every page shows "Connection unavailable" + "Source unavailable".
  - "Inspect round" -> "This is a test record and is not presented as a real reward round." No JSON/CSV links.
  - BUT transparency/wallet responses carry no `mode`/`testOnly`, so the UI says "Public reward records are
    connected.", shows 1 SOL received / 5 payouts, and a demo wallet lookup shows "Eligible at snapshot" with five
    synthetic credit rows presented as real. The same gap makes hosted.ts:58's hostedSnapshot/testOnly checks dead
    (Fastify status() never emits them; only `mode` works).
  Fix: emit `mode`/`testOnly` on every ledger route (status, transparency, wallet, epochs) and decide ONE policy
  for demo: either render it with a "synthetic" banner everywhere or refuse it everywhere; serve overview in demo.

S2-04 CODE (Codex F01)  apps/api/hosted.ts:48-53 before :54, overview.ts:10-14,32-36
  With EMBER5_API_ORIGIN configured, `overview` is still answered locally with hard-coded prelaunch / 0 selected /
  funded basket unavailable / settlement not configured, while wallets/epochs/transparency are proxied from the
  real ledger. Visitors would see real credits next to "Prelaunch - rewards are not active yet". docs/VERCEL.md:31
  claims compatibility. packages/shared/public.ts types phase:'prelaunch' and broadcastEnabled:false as literals, so
  the contract cannot express "live" at all. Fix: proxy overview (or merge backend project/basket/settlement into it)
  and widen the types.

S2-05 CODE  apps/web/records.tsx:22-41  useLedger partial failures
  epochs rejected -> stays [] silently -> "No funded round records are available." next to real credits; a
  `status:'unavailable'` epochs body is treated as empty; Transparency ignores error/availability/loading; only the
  newest 20 epochs are ever fetched (nextCursor ignored; ids are hourly, so < 1 day of history).

S2-06 CODE  apps/api/hosted.ts:35-37, :24-26, :31
  Proxy forwards only content-type (CSV export loses content-disposition/filename); two 15 s timeouts (status probe
  + route) can exceed the 30 s maxDuration; the 4 MB body cap will be exceeded by real epoch exports (basket
  document alone ~2.7 MB today, + snapshot + entitlements) and by /api/status once discovery grows - and a size
  failure is reported as "not a production ledger".

S2-07 CODE  apps/web/view-model.ts:7 + src.tsx:28  Skip link writes #main into history: #basket -> skip -> #wallet
  -> Back lands on #main (route stays wallet); reload at #main opens overview.

S2-08 EXECUTED (server side) apps/api/hosted.ts:51 + view-model.ts:93  A search over 100 chars (a pasted URL)
  gets 400 with no message; the UI shows "The service is unavailable. Please try again." with a Retry that can
  never succeed. Fix: maxLength on the input and a specific message.

S2-09 CODE  apps/web/market.tsx:6-9  Avatar keeps failed=true after the image URL changes (no reset on prop change).

S2-10 EXECUTED  apps/web/view-model.ts:28  Compact money rounds past the unit: 999,950-999,999 -> "$1000.0K"
  (same at the M and B boundaries). Cosmetic, rare.

S2-11 CODE  apps/api/hosted.ts:64  /api/basket "universe" is the top-100 page only, no marketPage/hasMore;
  docs/API.md calls it the candidate/exclusion universe. UI does not use it; external consumers would.

4. S2 - LIVE SERVICE (would fail or misbehave once configured)
L-01 CODE, both channels  apps/worker/runner.ts:57  tick() picks ONE planned/waiting_for_route intent per loop
  (payouts first, LIMIT 1) with no backoff or skip: one intent whose prepare keeps failing is re-selected every
  5 s forever and starves all other purchases/payouts/burns/operations. Concrete triggers: a recipient re-assigns
  their ATA authority; reserve below rentBound+maxFee; L-02.
L-02 CODE  packages/integrations/jupiter.ts:45  ensure(!getAccountInfo(treasury WSOL ATA)): anyone can create
  that ATA for ~0.002 SOL (or Ember pays a share in wrapped SOL) -> every swap/buyback build fails forever; no code
  path closes it. Also WSOL fee payments would be invisible to ingestTreasury (native SOL only).
L-03 EXECUTED  apps/worker/main.ts:29 + queries.ts:6  In prelaunch AND live the worker stores the whole discovery
  result as a new immutable document every 60 s: measured 3 docs in 150 s, 1,272,6xx JSON chars each (~1.8 GB/day
  of JSON; documents_immutable blocks DELETE). /api/status returns the newest one WHOLE (1.27 MB) on every call and
  the SPA calls status on every ledger page. Fix: store a digest + diff, or a bounded rolling table; never return
  the document from status.
L-04 CODE  packages/core/engine.ts:155 + server.ts:32  Incidents are inserted on EVERY loop while a condition
  persists (funding route mismatch -> one row per ~5 s) and NOTHING ever writes incidents.resolved_at, so
  /operator/resume is blocked forever after any incident; the public error handler shows a generic 503 and the CLI
  prints only the status code. Fix: dedupe open incidents per kind; add an authenticated resolve route.
L-05 CODE  apps/web/records.tsx:78, components.tsx:20, src.tsx:49 vs engine.ts:143-145, main.ts:58
  PUBLIC STATEMENT MISMATCH: the site says "The whole 10% allocation is not automatically withdrawable. Recorded
  expenses, obligations and reserves must be satisfied first" and "Developer earnings are the available OPS/DEV
  remainder...". scheduleOperations transfers the ENTIRE operations:<epoch> balance to the configured recipient on
  every worker pass; no expense/obligation/reserve model exists (those public fields are always null).
  Owner decision: change the copy or change the engine; docs/ACCOUNTING.md:62 and READINESS.md:42 say "OPS/DEV
  rules unchanged", so both texts cannot be true.
L-06 CODE (Codex F02, A3)  packages/integrations/solana.ts:103-109  Rent is reconstructed from CURRENT account
  state. (a) Pre-fund the treasury's ATA address for a public basket mint (~0.001 SOL): preBalance != 0, rent not
  counted, input = amount + shortfall -> apply throws 'swap debit/output mismatch' -> incident and rethrow every
  tick, swap never booked. (b) Recipient closes the new ATA before the finalized inspect -> rent omitted -> SOL
  reserve overstated -> later "deficit" incident and pause. Fix: derive rent from the transaction's own
  pre/post balances and account keys, never from live account lookups.
L-07 CODE, both channels  packages/integrations/ingestion.ts:19-25, ember.ts:15, http.ts:13-14, engine.ts:23-26
  Fee attribution is decided ONCE at first sight against a payouts list cached up to 15 s (and Ember's own read
  cache); a miss classifies the receipt 'review' -> quarantine, the cursor advances, ON CONFLICT DO NOTHING makes it
  permanent, recognizeCapital refuses 'review', and no route releases quarantine. Independently: a JSON amount
  0.000000001 becomes String(1e-9)='1e-9', which decimalUnits rejects inside the try/catch -> same quarantine.
  Also ember.ts:15's payouts schema requires a string signature on every row; the repo's own capture
  (docs/evidence/ember-payouts.json) has 2/100 rows without one (kinds 'sweep','perp') -> parse throws -> ingestion
  stops each loop. Fix: re-check quarantined receipts on later passes; parse amounts from the raw JSON text or
  accept exponent form; make the payouts schema tolerant (filter, don't throw).
L-08 CODE (Codex F03)  approval.ts:5 + selection.ts:44-46 + money.ts:4  holderUnits:'0' is accepted by the policy
  schema; zero-balance initialized accounts then become eligible; allocate() rejects a zero balance AFTER the swap
  finalized -> apply rolls back, incident, acquired tokens never credited. Fix: holderUnits > 0 in the schema, and
  filter balance>0 in the snapshot.
L-09 CODE (Codex F04/F07/F08/F06/F11)  Recovery and gating gaps: needs_review attempts are never re-inspected even
  when an archive later has the tx (runner.ts:8,42-55; solana.ts:121 returns 'unknown' and spins); a basket cached
  today bypasses CURRENT liquidity/volume/census checks (main.ts:47-53 checks only route/provenance/authorities);
  MAX_ROUND/MAX_DAY govern epoch creation, not execution (yesterday's unexecuted commitments + today's can exceed the
  day cap; a lowered cap does not stop older planned intents); pause is checked before slow preparation, not again
  before signing (runner.ts:12-24); transactions are signed BEFORE simulation/size/fee checks (solana.ts:64,81-86) -
  docs/ARCHITECTURE.md:32-34 claims the reverse.
L-10 CODE  apps/worker/main.ts:42 vs :47 vs engine.ts:43  Holder snapshot is captured BEFORE verifiedUniverse walks
  every graduated candidate (93 today: pool/config/mint reads, a full getProgramAccounts census, a Jupiter build
  each); plan() then requires the snapshot < 180 s old -> 'holder snapshot stale' whenever the walk takes > 3 min.
L-11 CODE, three angles  apps/api/server.ts:14,17 + deploy/nginx.conf:8  Rate limiter keys on req.ip with
  trustProxy:false; nginx forwards without X-Forwarded-For -> ONE 120/min bucket for all visitors (and for the
  hosted adapter's shared Vercel egress; each proxied read costs 2 hits and a 429 on the probe renders as 503
  "not a production ledger"). docs/READINESS.md:7 says rate limiting is tested; no test triggers a 429.
L-12 CODE, three angles  apps/worker/runner.ts:22 + jupiter.ts:54 + solana.ts:90  The "prepared plan changed
  economic identity" / "loosened minimum output" checks compare i.expected with itself (safeJupiterBuild mutates the
  same object and checkedSigned returns it as approvedPlan) -> dead guards; a re-quote with a lower minOutput is
  accepted and persisted.
L-13 CODE (Codex F09/F12/F13/F14/F15, B)  engine.ts:149 reconcile ignores in-flight token payouts/burns' SOL cost ->
  false 'deficit' incident + pause; scripts/test-chain.ts:26-50 repeats 1.5/0.3 SOL setup transfers on restart;
  provenance evidenceHash and verification responses are not retained in the stored basket (ARCHITECTURE.md:44
  claims they are); DB enforces balanced events and receipt-use bounds but NOT nonnegative internal balances or
  epoch-funding == funding-use totals (app-level only), TRUNCATE is not blocked; csv() guards only =,+,@,- and not
  control-char prefixes (unreachable with today's address/integer cells); scripts/operator.ts:9 requires
  version > max but policySchema allows only 1|2, so once plan() has stored a v2 policy no policy can ever be
  published; on Windows dev.ts's child.kill('SIGTERM') hard-kills the worker so main.ts:73 never releases the lease.

5. S3 - DOCS, TESTS, HYGIENE
D-01 docs/VERIFICATION.md:8-9 is stale (claims 43 tests/3 files and 7 hosted tests; actual 79/6 and 5); its demo
  trace is not followable (S2-03); the CSV export's only test was deleted in 7470d77 and nothing covers csv().
D-02 The "exact revision" proof is circular: revision() echoes EMBER10_REVISION, verify-public.mjs:26 asserts the
  string the deployer typed; .vercelignore drops .git so a dirty tree passes. I verified deployment by comparing
  bundle bytes instead - add that as the check (FRONTEND-LIGHT-HANDOFF.md:27 promises it, no script exists).
D-03 Test oracles that cannot fail: engine.test.ts:55 "rejects forged outcome evidence" contains no forged evidence
  (DemoChain copies the plan into the outcome, so apply()'s evidence checks at engine.ts:72-84 are never exercised);
  the remainder tests (core.test.ts:13, market-data.test.ts:55) assert an identity that holds by construction and
  every ledger test funds amounts with remainder 0; market-data.test.ts:28's tie-break rows arrive pre-sorted;
  :56 hashes a detached clone; ui-view-model.test.ts:218-221 checks references it never touched; the only operator
  auth test runs with NO token configured (401 comes from the empty-token short-circuit); tick(), ingestTreasury,
  ingestTokenDeposits, verifiedUniverse, loadApproval, SolanaChain.inspect and the CSV path have no test at all.
D-04 docs/demo/sample-epoch.json carries "created_at":{} because canonical() (model.ts:13) serializes Date objects
  as {}; the committed replay.txt came from a replay run (no crash line) though the script narrates purchases.
D-05 npm audit: 17 advisories (10 high, 7 moderate), all in the Solana dependency tree (bigint-buffer, node-fetch
  via spl-token-registry, toml, anchor, web3.js<=1.99 via jayson); the Vercel function itself imports only bs58,
  decimal.js, zod. Matches READINESS.md's own count.
D-06 deploy/nginx.conf:7 CSP img-src 'self' data: blocks the embercurve.fun logos the app allows -> initials only in
  the compose deployment.
D-07 Cleanup (low priority, from the cleanup angle): 4 base58-pubkey validators (market-data.ts:10, hosted.ts:8,
  view-model.ts:9, model.ts:4 which is a looser regex); two Ember catalogue schemas (ember.ts vs market-data.ts) that
  disagree on field types; two bounded-fetch implementations with different retry policies (http.ts vs
  market-data.ts:95); evidenceHash re-stringifies the 8 MB catalogue every 45 s instead of hashing the received
  bytes; O(n^2) grouping at market-data.ts:47; unbounded N+1 loop over all epochs every 5 s at main.ts:58;
  PublicMarket.currency/weightBps are constant and unread; competitor-mint check hard-coded in config.ts:31.

6. CHECKED AND CLEAN (do not re-spend time here)
- Live API: route parsing (__route vs pathname), limit/offset/q/view/cursor validation, address validation, HEAD,
  405 on writes, 404 on operator paths, security headers. Cold-start latency ~0.25 s warm.
- Catalogue normaliser against the real 3,062-row fixture: 0 rejected rows, 1 duplicate collapsed, 2 suspect mints
  ($80M "AR", $79M "CLANKER") correctly unranked, ranking by reported cap with mint tie-break, decimalValue edge
  cases, imageUrl allow-list, coverage figures (duplicateRows cannot go negative).
- Frontend renders every real shape (rank null, cap null, change null, empty markets); routes, unknown hash,
  mobile menu + Escape + focus return; wallet validation states; share card (1200x630 PNG served with image/png,
  OG/Twitter tags substituted with the canonical origin).
- Money arithmetic: budget() sums exactly (legs+buyback+operations+cost+remainder == total), allocate() conserves
  units and is order-independent, every SQL column used exists in the migrations, epochs cursor pagination correct,
  lease/fence/lock ordering consistent, timingSafeEqual over sha256 fine, MASTER_PAUSE blocks prepare before any
  RPC call, file signers rejected on mainnet, genesis check, decoded Jupiter route structure/accounts checks.
- Not verifiable with my harness: whether Escape closes the asset dialog (a plain control <dialog> also did not
  close on the tool's synthetic Escape, so this is a harness artifact; the code wires onCancel/onClose correctly and
  the close button works).

7. SUGGESTED ORDER
1) S1-01 auth bypass (one-line fix + test).  2) S1-03 raise/observe the 12 MB cap NOW (public site).  3) S1-02
getTokenSupply call.  4) S1-05 pool error handler + api restart policy.  5) S1-04 zero-amount filter + per-signature
cursor.  6) S1-06 forecast.  7) L-05 decide the OPS/DEV statement.  8) S2-03 demo-mode consistency + S2-04 live
overview.  9) S2-01 paging.  10) L-01/L-02/L-04/L-06/L-07 before any funded pilot.  Then D-03 test oracles so the
suite can actually fail.

NOTES
- No third, targeted Codex round was run against this consolidated list; the two cold runs are the Codex
  contribution. A targeted round is available on request before the builder starts.
- Nothing touched the deployment or the repository; all execution was on a scratch clone. The scratch database and
  demo stack have been stopped.
