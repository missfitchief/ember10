# Reproducible settlement exercise

**Execution status here: not completed.** `solana-test-validator 4.0.3` failed to create its ledger while unpacking genesis (`Access is denied`, Windows error 5). A read-only devnet RPC check succeeded; a fresh test-only faucet request failed with `Internal error`. No successful chain transfer/burn receipts are invented or attached to the synthetic demo.

## Local validator

On a host where the official validator runs:

```sh
solana-test-validator --ledger .runtime/validator --rpc-port 8899 --bind-address 127.0.0.1 --faucet-port 9900 --limit-ledger-size 50000
npm run db:start
npm run test:chain
```

The script checks the actual genesis hash and refuses mainnet. It creates fresh random test-only funding/keeper/holder keys, six legacy SPL test mints (five rewards and one project token), multiple holders and two accounts for one holder. Mint authorities are revoked after fixture setup. The known test-market inventory and keeper are excluded from the holder snapshot; a below-threshold owner receives no entitlement.

It records opening test capital separately, transfers actual test SOL as **simulated creator funding**, takes a full finalized snapshot, runs five **simulated swaps** using real native transfers and fixture token transfers, allocates actual finalized token gains, creates missing holder ATAs, delivers to eligible owners, carries one owner's amount forward, and performs a real checked buyback-associated burn. The simulation validates settlement, not Jupiter market liquidity or Ember fee forwarding.

One execution intentionally exits the intent runner after sending, then resumes from persisted signed bytes/signature. Replay all jobs and compare unique finalized transaction counts. The independent process-termination tests cover all three crash points against PostgreSQL and the durable simulated chain.

Public evidence is written only after successful completion to `docs/test-chain/epoch.json` and `docs/test-chain/status.json`. Keys remain in ignored `.runtime/<cluster>-exercise.json`; never publish it. Keep this state and database for retries. Do not recreate keys or reset the database merely because RPC finality is slow.

## Devnet alternative

PowerShell:

```powershell
$env:TEST_CLUSTER = 'devnet'
$env:TEST_RPC_URL = 'https://your-devnet-provider'
npm.cmd run test:chain
```

Use only test SOL from a working devnet faucet. If the faucet is unavailable, stop and retain the explicit not-tested status; no personal or mainnet wallet is needed. The script's `.runtime` session is the same recovery boundary on devnet. `TEST_DATABASE_URL` may point to a separate PostgreSQL test database, whose immutable mode must be `test`.

## Verify the result

Check that all five acquisition receipts have `meta.err=null` and finalized status, their attributed output amounts equal the sum of entitlement rows, missing ATAs were created for their canonical owners, the below-threshold owner has no credits, and pending units remain on the treasury side of reconciliation. Verify that one buyback intent produced one burn intent, only the acquired project-token units were burned, and replay created no second economic action. A failure in setup is not a successful settlement result.
