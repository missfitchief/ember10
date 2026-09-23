# EMBER5 controlled-pilot implementation

A React dashboard, Node API, independent Node worker and PostgreSQL ledger. The default is **prelaunch, paused, no signing and no broadcast**. EMBER5 is a working name with a known name collision. No project mint was created and no mainnet funds were used.

Hosted recorded demo: **https://ember5-pilot.vercel.app**. This deployment displays public synthetic records and supports wallet lookup and exports; it does not run settlement. See [Vercel deployment](docs/VERCEL.md) for connecting a separately hosted public API.

## Run locally

Requires Node 22.12+ (validated on Node 24.17.0). In PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

The launcher starts an isolated, persistent local PostgreSQL server on `127.0.0.1:55432`, applies migrations, and starts API, worker and web. Open **http://127.0.0.1:5173**. Local database credentials are development-only and bind to loopback. Runtime data and test keys are ignored under `.runtime/`.

For a separate synthetic ledger with five assets and partially delivered rewards:

```sh
npm run dev -- --demo
```

Open **http://127.0.0.1:5174**. Demo uses its own database, API port 4311, deterministic synthetic receipts, and **cannot broadcast**. Demo wallet: `AEqeDfVNmZW5fowqFF6KAiuoMDBCUTeYDGVioFmhP1jF`. With the demo worker stopped and its lease expired, `npm run demo` replays the same epoch without creating a second purchase or payment. Graceful shutdown releases the lease; forced termination may require up to two minutes for expiry.

If using external PostgreSQL instead, copy `.env.example` to `.env`, set `DATABASE_URL`, then run `npm run db:migrate`, `npm run api`, `npm run worker`, and `npm run dev:web` in separate terminals. Use a distinct database per mode.

## Validate

```sh
npm run db:start       # if no local database is already running
npm test
npm run build
npm run demo
```

Tests use PostgreSQL, not an in-memory ledger. They create and remove their own isolated schema in `ember5_test`; they do not clear the demo or project databases. Set `TEST_DATABASE_URL` to a disposable test database on another PostgreSQL server if needed.

`docs/demo/sample-epoch.json` traces the demo receipt, budgets, snapshot, five acquisitions, exact entitlements, finalized synthetic deliveries, outstanding units and burn. `docs/demo/replay.txt` is the console walkthrough. The test suite also exits real child processes at all three critical crash points and resumes against the same persisted records.

## Readiness

The application and synthetic accounting flow are implemented and tested. **This is not a production-ready or audited financial service.** Actual Solana settlement, authenticated Jupiter builds, real creator-fee attribution and mainnet payouts have not been validated with funds. The local validator failed to initialize in this Windows environment; the devnet faucet rejected a funding request. An executable test-chain exercise is included.

The observed Ember catalogue lacks a sufficient liquidity and comparable circulating-supply contract for automatic investment decisions. The live verification pipeline therefore additionally requires a complete, fresh, reviewed metrics feed; see its exact schema in `packages/integrations/provenance.ts`. This is a remaining integration/configuration requirement, not a claim that all public market rows are investable. The baseline Jupiter transaction validator deliberately supports only decoded V1 direct exact-input routes; unsupported routes remain pending.

Read [readiness](docs/READINESS.md), [integration evidence](docs/INTEGRATIONS.md), [accounting](docs/ACCOUNTING.md), [architecture](docs/ARCHITECTURE.md), [operator runbook](docs/RUNBOOK.md), [test-chain exercise](docs/TEST-CHAIN.md), and [verification](docs/VERIFICATION.md) before configuring a pilot.

## Layout

| Location | Responsibility |
|---|---|
| `apps/web` | Public overview, rewards, address lookup, transparency and exports |
| `apps/api` | Validated read-only endpoints and authenticated operator endpoints |
| `apps/worker` | Persistent discovery, intent execution, recovery and live orchestration |
| `packages/core` | Exact arithmetic, eligibility, approval gates and accounting engine |
| `packages/db` | PostgreSQL migrations, immutable records and fenced transactions |
| `packages/integrations` | Ember, Jupiter v2, Solana, signers and synthetic adapter |
| `scripts` | Local startup, demo, operator CLI, evidence capture, test-chain procedure |
| `tests` | Financial, recovery, concurrency, API and transaction-validation tests |

The frontend can be hosted independently as static files from `dist/web`. The financial service requires a persistent Node worker and PostgreSQL; a static website host cannot run settlement. `compose.yaml` and `deploy/nginx.conf` provide a local container layout. The Vercel deployment is a recorded read-only demo. No custom domain, project token or mainnet transaction has been created.
