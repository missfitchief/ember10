# Operator runbook

## Startup and access

Use a dedicated PostgreSQL database per mode, apply migrations with a migration owner, then run API and worker as separate processes. Production runtime credentials should have only the table privileges required by the application, not ownership/superuser privileges. Keep backups and signed-payload tables private. The included loopback development cluster uses development credentials only.

Start with `MASTER_PAUSE=true` and `BROADCAST_ENABLED=false`. Configure a random `OPERATOR_TOKEN` of at least 32 characters server-side. The public reverse proxy deliberately does not expose `/operator`. The local CLI authenticates using that token:

```sh
npm run operator -- selection
npm run operator -- funding
npm run operator -- plan
npm run operator -- snapshots
npm run operator -- pause "Provider investigation"
npm run operator -- reconcile
npm run operator -- export EPOCH_ID
```

Selection, funding, plan, snapshots and exports are read-only. Reconciliation queues evidence collection and may pause on an unexplained balance difference. Pause/resume are authenticated and audited. Resume cannot override `MASTER_PAUSE` or unresolved incidents. Public address lookup cannot choose a recipient, request a transfer, change policy or resume the worker.

Versioned policy publication uses `npm run operator -- policy path/to/policy.json`. The complete policy is validated, version must increase, and an immutable document and audit event are written. Update the separately approved live configuration to adopt it. Existing epochs retain their original policy and snapshot.

## Capital and funding

Keeper SOL is capital, not creator revenue. After an operator has independently funded the configured treasury, `npm run operator -- capital FINALIZED_SIGNATURE` verifies the actual successful native transfer and records it as capital reserve. If ingestion already classified it as a deposit, a linked adjustment moves deposit units to reserve without rewriting the original record. It cannot reclassify recognized fees or quarantined receipts as capital.

Do not manufacture a source receipt, use a treasury balance as revenue, or edit entitlements to make balances match. Unknown inbound SPL tokens are classified separately; unsupported Token-2022 holdings are observed and excluded, not read using a legacy layout. Wrapped-SOL fee receipts not supported by the native recognizer require review and an explicitly tested adapter.

## Crash or RPC timeout

1. Leave the existing intent, attempt, signature, signed payload and reservation intact.
2. Restart the worker against the same database and mode. In-flight reconciliation runs before new preparation.
3. A finalized successful transaction must match its expected mint, owner, amount and signer before accounting is applied. A process crash after chain success is repaired by completing the existing database operation.
4. While the blockhash is valid, retrying sends identical stored bytes. Do not rebuild a second live transaction for that intent.
5. A finalized failed atomic transaction consumes its verified network fee, pays no entitlements and retains the principal reservation. A new attempt under the same logical intent is permitted only after that definite failure.

The tests terminate real child processes after signing, after sending, and after observing chain success. The synthetic chain is itself database-persistent, so restarting a client does not reset evidence.

## Expired or ambiguous attempts

An expired blockhash with null transaction responses becomes `needs_review`. There is intentionally **no public or automatic “retry with a new transaction” button**. Check the original signature on the configured primary and independent archival provider, their finalized heights, available history and the treasury/account transaction history covering the original submission window. One null response, a recent-status-cache miss or a client timeout does not establish non-execution.

If the archival source finds execution, configure the working archival provider and resume reconciliation of the original signature. If non-execution cannot be established, preserve the reservation and remain paused for that intent. Replacement requires a separately reviewed recovery change with retained evidence and audit trail. Never delete signed attempts, set paid by hand, erase liabilities or release the original reservation merely because time passed.

## Provider outage, unsafe member or fee-route change

Stale/unknown prices postpone payouts and funding; raw credits survive. Missing/full-census-contract failures stop snapshots. Unknown route/program instructions, failed simulation, frozen ATAs or missing rent estimates postpone the affected intent. A member becoming unsafe does not redistribute its budget to the other members. Module, creator recipient, migration target or fee-state changes pause new commitments and retain all existing credits.

Discovery preserves last successful observations with timestamps and stale status. If the current public catalogue cannot supply a verified ranking basis, connect the complete reviewed metrics feed; do not rename FDV as market cap. A supported explicit FDV policy must be published as a new version and displayed as such.

## Reconciliation

Request `reconcile`, inspect the immutable reconciliation record and match each asset individually. First reconcile all in-flight signatures. Query actual native/token balances with their returned RPC context slots; never combine raw units from different mints. Compare those with the sum of internal ledger partitions. Investigate deficits, unclassified surpluses and missing token accounts. Resolve incidents only after linked correcting records and evidence exist; do not flip health flags just to resume.

Payout rent and network charges must fit the reserved allowance. If they do not, add explicitly recognized operational capital or defer. Do not use holder token liabilities to pay SOL costs. The live worker returns unused epoch direct-cost allowance after its cost-bearing intents, including operations and burn, finalize; `Engine.returnUnusedCosts` refunds the original receipt sources. Holder payouts use the separately protected execution reserve.

## Key rotation

Pause new commitments. Reconcile all signed attempts with the old public key; keep the old signer available for their identical-byte resends until finalized or resolved. Rotate the secret behind the configured signer only if the public key remains the same. Changing the treasury public key is a migration requiring a new approval, recipient/public-policy updates, separately verified transfers and ledger reconciliation. It is not an ordinary secret rotation. Never paste seed phrases into chat, source, browser configuration or logs.

## Backup and restore

Use PostgreSQL `pg_dump --format=custom` for a consistent logical backup, plus managed-database continuous WAL/PITR in a real pilot. Store backups encrypted with access restricted because attempts contain operationally sensitive signed bytes. Keep the associated configuration/policy approvals and schema version. Do not put backups into public exports or the source ZIP.

`scripts/backup.ts` wraps `pg_dump`/`pg_restore` with passwords in the child environment, never command arguments. Set `PG_BIN_DIR` to a PostgreSQL binary directory if tools are not on PATH. Restore into a **new, empty, isolated database** using `RESTORE_DATABASE_URL`, with no worker connected. The helper refuses the source database and pauses the restored control row. Verify receipt counts, per-asset balances, immutable document hashes, pending attempts and maximum finalized evidence slots. Start with broadcast disabled; reconcile existing signatures before allowing any new work. Test restoration regularly.

## Deployment and public launch

Run the API and worker on a persistent Node host with PostgreSQL, independent of a static frontend host. The local Compose example is not a tested public deployment. Configure TLS, private operator routing, least-privilege database credentials, backup retention, signer policy and alerts before live use. The read-only prelaunch frontend is published on Vercel. No financial-service deployment, domain registration, project token creation, mainnet funding or funded launch was performed. Open R2 financial findings block a funded pilot.

## Current audit handoff

Policy publication is currently limited by the schema to versions 1 and 2; instructions describing later increasing versions are a design requirement, not an implemented path. See [R2 findings](AUDIT-R2.md).

See [external audit](EXTERNAL-AUDIT.md) before operational use. New migration 008 has only been exercised in isolated tests; deploy the API and worker together after a backup and normal migration while paused. Vercel publication does not migrate a financial database.

Incident resolution is an authenticated POST to /operator/incidents/:id/resolve with reason and evidenceReference; it leaves execution paused. A persisting fault can create another incident. Current policy publication is constrained to versions 1 and 2 and needs revision semantics before later policy updates. Windows forced termination can leave a lease until expiry; do not assume graceful release on every shutdown.
