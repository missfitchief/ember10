# Reproduce the external audit packet

Run from the root of the extracted repository. Record the package manifest's source commit and application revision. A ZIP has no `.git` directory; use the manifest for its identity. A clone should be checked out at the exact package commit, not an unfrozen main branch.

Validated runtime: Node 24.17.0, npm 11.13.0. Package engines require Node 22.12 or later. Use `npm.cmd` in PowerShell when execution policy blocks `npm.ps1`. Do not reuse production credentials or databases.

## Source, build and database tests

```powershell
npm.cmd ci
npm.cmd run build
```

Start the disposable PostgreSQL instance in a separate terminal:

```powershell
npm.cmd run db:start
```

Then run:

```powershell
npm.cmd test -- --reporter=json --outputFile=../tests-audit.json
```

The historical R2 result was 258 passing tests in20files at ed67a05; see VERIFICATION.md and evidence/r3/tests.json for the current run. Tests use isolated schemas in `ember5_test`; set `TEST_DATABASE_URL` only to a disposable database if using a different server. No production migration is part of this procedure. The native ESM regression runs without a TypeScript loader and covers the first candidate's JSON-import failure.

## Read-only preview and deployment identity

In a separate terminal, with no `EMBER5_API_ORIGIN` override:

```powershell
npm.cmd run preview:hosted
```

Open `http://127.0.0.1:5180`. This uses actual market observations and does not start the financial worker or require a ledger. After building, verify the public host:

```powershell
node scripts/audit-public.mjs https://ember5-pilot.vercel.app ../public-proof.json
```

The verifier compares index HTML and all seven referenced/static build assets, checks ten decoded catalogue logos, and checks prelaunch/paused/broadcast-disabled/worker-inactive state. The revision field is an environment marker; asset comparison and recorded deployment identity are stronger evidence than that marker alone. No cryptographic server artifact attestation is supplied.

## Browser tests without changing the project lockfile

Playwright is reviewer tooling, not a project dependency. R3 runs use Playwright1.61.1 with installed Chrome (BROWSER_CHANNEL=chrome); R2 used bundled Chromium. Install it in a separate tooling directory if unavailable:

```powershell
npm.cmd install --prefix ../ember10-audit-tools --no-save --package-lock=false playwright@1.61.1
node ../ember10-audit-tools/node_modules/playwright/cli.js install chromium
$env:PLAYWRIGHT_MODULE = ([System.Uri](Resolve-Path ../ember10-audit-tools/node_modules/playwright/index.mjs).Path).AbsoluteUri
$env:BROWSER_CHANNEL = 'chrome' # omit to use an installed Playwright Chromium
$env:BASE_URL = 'http://127.0.0.1:5180'
$env:EVIDENCE_DIR = [System.IO.Path]::GetFullPath('../ember10-audit-results')
node --import tsx tests/ui-r2.browser.mjs
node --import tsx tests/ui-r3.browser.mjs
node scripts/audit/public-browser.mjs http://127.0.0.1:5180 ../ember10-audit-results local
node scripts/audit/public-browser.mjs https://ember5-pilot.vercel.app ../ember10-audit-results public
```

On other shells, export the same variables; `PLAYWRIGHT_MODULE` must be an absolute `file:///` URL to the installed `index.mjs`. The fixture browser suite intercepts its APIs and checks eleven assertions, including 140 searched rows across polling/outages, independent record loading and mobile navigation. Its figures are test-only. The public browser suite uses real catalogue/logo requests and records 1440/375/320px screenshots, asset details, unavailable ledger states and page errors. Neither is a physical iPhone test.

## Reproduce the known financial failure

```powershell
node --import tsx scripts/audit/f3-eleven-builds.mts ../f3-eleven-builds-results.json
```

A successful harness run means the current defect was reproduced: the existing 23,632,080-lamport forecast admits ten of eleven swap/buyback builds, then lacks the temporary WSOL rent. The comparison case adds one rent and passes under its mocked assumptions. The harness exercises real adapter/cost-binding code with mocked legacy instructions and RPC; it does not sign, broadcast, contact providers, settle a funded epoch or prove compatibility with today's Jupiter response. F-1, F-2 and all other financial blockers remain independent gates.

The original financial report reviewed baseline `4f9fba2`. Current harness output separately records that historical baseline, the executed Git revision when available, the dirty-tree state and the harness hash. For an extracted ZIP, attach the package manifest because Git identity is unavailable.

## Dependency and package checks

```powershell
npm.cmd audit --omit=dev --json > ../dependency-audit.json
```

A nonzero exit is expected while vulnerabilities remain; the recorded scan has five high entries. Preserve the raw output and time rather than treating the scan as passed.

Verify the delivered ZIP checksum and each manifest entry. To create a new package from a clean Git checkout:

```powershell
node scripts/package-audit.mjs ../audit-delivery
```

Packaging exports all tracked source bytes with LF Git content, excludes untracked secrets/runtime state, and refuses application drift from the recorded deployment revision. It does not deploy or contact an auditor. Original audit reports, test captures and screenshots remain dated historical evidence; do not overwrite them to imply a new execution.

## R3 cache and corrected financial evidence

Run `node scripts/audit/logo-latency.mjs https://ember5-pilot.vercel.app 3 ../logo-latency.json` for two successive ten-logo request batches. Record CDN HIT/MISS, status, bytes, hashes and measured times; results are observations, not latency guarantees.

See `evidence/r3/FINANCIAL-EVIDENCE-UPDATE.md` for pool-filtered schema reproduction and retry-margin arithmetic. The extra-rent F3 comparison above covers successful builds only; it is not a retry-ready budget. No financial remediation or funded execution was performed.
