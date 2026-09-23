# API contract

The Node API owns `/api/*`; these are EMBER10 routes, separate from Ember's upstream API. Default loopback port: 4310, or 4311 for demo. There are no public write/claim endpoints. Money is returned as decimal-string base units.

| Route (GET) | Response |
|---|---|
| `/api/overview?q=&offset=0&limit=100` | Typed real-source project, market ranking, eligibility, funded-basket and accounting availability; full-catalogue search with bounded page projection |
| `/api/status` | Mode, cluster, pause reason, worker health, discovery and staleness |
| `/api/project` | Canonical configured identity, disclosure and versioned policy |
| `/api/basket` | Frozen basket, candidate/exclusion universe and timestamps, or empty state |
| `/api/epochs?limit=20&cursor=...` | `items` and nullable `nextCursor`; limits 1–100 |
| `/api/epochs/:id` | Complete public epoch export |
| `/api/epochs/:id/export` | JSON: receipt uses, snapshot, intents, allocations and settlement evidence |
| `/api/epochs/:id/export?format=csv` | Allocation CSV: asset, owner, amount, paid, unpaid |
| `/api/wallets/:address/rewards` | Recorded eligibility, credits, pending units and delivery evidence |
| `/api/transparency` | Per-asset balances, fees, accrued/delivered totals, transaction counts, burns and reconciliation |

Malformed addresses/limits return 400; missing epochs return 404; unavailable data returns 503. Public responses omit signed payloads and secrets. Lookup never changes destination accounts or starts payments.

Operator routes require the server-only bearer token: GET `funding`, `selection`, `snapshots`, `plan`; POST `pause`, `resume`, `capital`, `reconcile`. Read-only planning does not sign or reserve funds. Mutations are audited; master pause and unresolved incidents prevent resume. Policy publication uses the authenticated CLI and immutable increasing versions. The supplied nginx configuration blocks public operator access.

Implementation contracts: `apps/api/queries.ts`; request schemas: `apps/api/server.ts`; domain types: `packages/core`.

## Public market contract

`packages/shared/public.ts` is the agreed DATA-01/UI-01 interface. `/api/overview` uses real Ember source data, with full mint identity and exact decimal-string USD values. `rank` can be null; source-flagged suspect rows and conflicting duplicates remain excluded/unranked. `q` searches the complete normalized catalogue, not just the visible first page; `marketPage` reports the returned slice and total matches. Neither search nor pagination changes canonical selection.

The source response does not publish a source observation timestamp, so `sourceTimestamp` is null. `fetchedAt` and `lastSuccessfulAt` record successful fetch time and do not become newer on a failed refresh. `coverage.complete` remains false until completeness is independently established. Source availability does not authorize new commitments.

The hosted prelaunch wallet and ledger responses can return HTTP 200 with explicit `status: unavailable` and null totals; that is distinct from a known empty ledger or zero rewards. Failed configured upstreams return 503. The client must inspect both transport status and typed availability. No project address or synthetic liability is invented.

Historical ledger routes and exports retain their original data shapes and meanings. Version-one epochs keep five frozen legs; new version-two policy requires ten.
