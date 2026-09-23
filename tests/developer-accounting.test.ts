import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeveloperAccounting, assertDeveloperPayoutAuthorized, finalizeDeveloperPayout, type DeveloperPayoutPolicy, type ExpenseApproval, type ExpensePayment } from '../packages/core/developer.js';
import { Engine, type Intent } from '../packages/core/engine.js';
import { Store, type Lease } from '../packages/db/store.js';
import { migrate } from '../packages/db/migrate.js';
import { SOL } from '../packages/core/model.js';
import { DemoChain, testAddress } from '../packages/integrations/demo.js';
import { runIntent } from '../apps/worker/runner.js';

const base = process.env.TEST_DATABASE_URL ?? 'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test';
const admin = new Store(base), schema = 'developer_' + Date.now() + '_' + process.pid;
let db: Store, developer: DeveloperAccounting, engine: Engine, chain: DemoChain, lease: Lease, serial = 0;
const now = Date.UTC(2026, 8, 23, 12), nextDay = now + 86_400_000;
const policy: DeveloperPayoutPolicy = { enabled: true, treasury: testAddress('developer-treasury'), destination: testAddress('developer-destination'), minimumPayoutLamports: 10_000n, retainedReserveLamports: 100_000n, payoutCostLamports: 20_000n, maxFeeLamports: 5_000n, payoutHourUtc: 0 };

async function allocate(value: bigint, name = 'allocation-' + serial++) {
 await db.tx(async t => { await db.lock(t); await db.move(t, name + ':receipt', SOL, 'external:creator-fees', 'revenue', value); await db.move(t, name + ':allocation', SOL, 'revenue', 'operations:' + name, value); });
 return 'operations:' + name;
}
function approval(overrides: Partial<ExpenseApproval> = {}): ExpenseApproval {
 return { id: 'provider-invoice', amountLamports: 200_000n, costAllowanceLamports: 5_000n, payee: testAddress('provider-payee'), description: 'Approved RPC invoice', evidence: { invoice: 'review-test-only' }, actor: 'test-operator', ...overrides };
}
function payment(overrides: Partial<ExpensePayment> = {}): ExpensePayment {
 return { expenseId: 'provider-invoice', signature: 'test-finalized-expense', instruction: '0', amountLamports: 200_000n, feeLamports: 1_000n, source: policy.treasury, destination: testAddress('provider-payee'), slot: 501000, finalized: true, error: null, evidence: { testOnly: true, verifiedBy: 'test-fixture' }, actor: 'test-operator', ...overrides };
}
async function getIntent(id: string): Promise<Intent> { return (await db.pool.query('SELECT *,amount::text FROM intents WHERE id=$1', [id])).rows[0]; }
async function authorize(id: string, p = policy) { await db.tx(async t => { await db.fence(t, lease); await db.lock(t); await assertDeveloperPayoutAuthorized(db, t, await getIntent(id), p); }); }
async function settle(id: string) {
 await runIntent(engine, chain, id, lease); await runIntent(engine, chain, id, lease);
 const i = await getIntent(id);
 if (i.status === 'finalized') {
  // The integrator wires this same hook inside Engine.apply. Explicit invocation
  // here also tests idempotent recovery when the hook has already been wired.
  await db.tx(async t => { await db.fence(t, lease); await db.lock(t); await finalizeDeveloperPayout(db, t, i, i.result!); });
 }
}
beforeAll(async () => {
 await admin.pool.query(`CREATE SCHEMA ${schema}`);
 const url = new URL(base); url.searchParams.set('options', '-c search_path=' + schema);
 db = new Store(url.toString()); await migrate(db); await db.bindMode('demo');
 chain = new DemoChain(db); await chain.init();
});
beforeEach(async () => {
 await db.pool.query('TRUNCATE documents,incoming_transfers,cursors,epochs,intents,attempts,entitlements,payout_batches,batch_items,ledger_events,postings,leases,jobs,incidents,operator_audit,chain_receipts,demo_chain,assets CASCADE');
 await db.pool.query("UPDATE control SET paused=false,reason='developer accounting test'");
 developer = new DeveloperAccounting(db, 'demo'); engine = new Engine(db, 'demo'); chain = new DemoChain(db);
 lease = (await db.lease('developer-test', 300))!; serial = 0;
});
afterAll(async () => { await db?.close(); await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`); await admin.close(); });

describe('ledger-backed developer earnings on PostgreSQL', () => {
 it('disabled, prelaunch, paused and before-UTC-hour scheduling never create a commitment', async () => {
  await allocate(1_000_000n);
  expect(await developer.schedule({ policy: { ...policy, enabled: false }, lease, now })).toBeNull();
  expect(await new DeveloperAccounting(db, 'prelaunch').schedule({ policy, lease, now })).toBeNull();
  expect(await developer.schedule({ policy: { ...policy, payoutHourUtc: 13 }, lease, now })).toBeNull();
  await db.pool.query('UPDATE control SET paused=true');
  expect(await developer.schedule({ policy, lease, now })).toBeNull();
  expect((await db.pool.query('SELECT id FROM intents')).rowCount).toBe(0);
  expect(await db.balance(SOL, 'ops:retained')).toBe(0n);
 });
 it('zero and insufficient remainder never create a transfer or imaginary balance', async () => {
  expect((await developer.summary(policy)).hasRecords).toBe(false);
  expect(await developer.schedule({ policy, lease, now })).toBeNull();
  await allocate(110_000n);
  expect(await developer.schedule({ policy, lease, now })).toBeNull();
  const summary = await developer.summary(policy);
  expect(summary.retainedReserve).toBe('100000'); expect(summary.withdrawableRemainder).toBe('0');
  expect((await db.pool.query('SELECT id FROM intents')).rowCount).toBe(0);
 });
 it('records obligations before funds arrive and deducts principal plus payout/expense costs once', async () => {
  await developer.recordExpense(approval());
  expect((await developer.summary(policy)).outstandingPayables).toBe('205000');
  expect((await db.balances()).length).toBe(0);
  expect(await developer.schedule({ policy, lease, now })).toBeNull();
  await allocate(1_000_000n);
  const id = (await developer.schedule({ policy, lease, now }))!;
  expect((await getIntent(id)).amount).toBe('675000');
  const s = await developer.summary(policy);
  expect(s).toMatchObject({ allocation: '1000000', approvedExpenses: '200000', outstandingPayables: '205000', retainedReserve: '100000', availableOperations: '205000', pendingTransfers: '675000', reservedPayoutCosts: '20000', withdrawableRemainder: '0', finalizedDevPayments: '0' });
  const total = (await db.balances()).filter(r => !r.account.startsWith('external:')).reduce((n, r) => n + BigInt(r.amount), 0n);
  expect(total).toBe(1_000_000n); await authorize(id);
 });
 it('concurrent daily scheduling reserves principal and costs exactly once', async () => {
  await allocate(1_000_000n);
  const ids = await Promise.all(Array.from({ length: 8 }, () => developer.schedule({ policy, lease, now })));
  expect(new Set(ids)).toEqual(new Set(['developer:2026-09-23']));
  expect((await db.pool.query('SELECT * FROM developer_payout_days')).rowCount).toBe(1);
  expect((await db.pool.query('SELECT * FROM intents')).rowCount).toBe(1);
  expect(await db.balance(SOL, 'dev:principal:2026-09-23')).toBe(880_000n);
  expect(await db.balance(SOL, 'dev:cost:2026-09-23')).toBe(20_000n);
 });
 it('funds reserve incrementally without reusing an earlier empty-day adjustment', async () => {
  await allocate(40_000n); expect(await developer.schedule({ policy, lease, now })).toBeNull();
  expect(await db.balance(SOL, 'ops:retained')).toBe(40_000n);
  await allocate(40_000n); expect(await developer.schedule({ policy, lease, now })).toBeNull();
  expect(await db.balance(SOL, 'ops:retained')).toBe(80_000n);
  await allocate(60_000n);
  const id = (await developer.schedule({ policy, lease, now }))!;
  expect(await db.balance(SOL, 'ops:retained')).toBe(100_000n); expect((await getIntent(id)).amount).toBe('20000');
 });
 it('native finalized payout, cost release and replay use actual ledger evidence once', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!;
  await settle(id); await settle(id);
  const summary = await developer.summary(policy);
  expect(summary).toMatchObject({ pendingTransfers: '0', reservedPayoutCosts: '0', finalizedDevPayments: '880000', finalizedPayoutCosts: '5000', availableOperations: '15000', retainedReserve: '100000', operationsWalletFunding: '0' });
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);
  expect((await db.pool.query('SELECT * FROM chain_receipts')).rowCount).toBe(1);
  expect(await developer.schedule({ policy, lease, now })).toBe(id);
  expect(await developer.schedule({ policy, lease, now: nextDay })).toBeNull();
 });
 it('new daily payout may use new allocation but never rewrites the old daily intent', async () => {
  await allocate(1_000_000n); const first = (await developer.schedule({ policy, lease, now }))!; await settle(first);
  const before = await getIntent(first); await allocate(1_000_000n);
  expect(await developer.schedule({ policy, lease, now: now - 86_400_000 })).toBeNull();
  const second = (await developer.schedule({ policy, lease, now: nextDay }))!;
  expect(second).toBe('developer:2026-09-24'); expect((await getIntent(first)).expected).toEqual(before.expected);
  expect((await getIntent(second)).amount).toBe('995000');
 });
 it('finalized failed transfer retains principal and charges only actual failed fee before retry', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!; chain.failNext.add(id);
  await settle(id);
  expect((await getIntent(id)).status).toBe('waiting_for_route');
  expect(await db.balance(SOL, 'dev:principal:2026-09-23')).toBe(880_000n);
  expect(await db.balance(SOL, 'dev:cost:2026-09-23')).toBe(15_000n);
  expect((await developer.summary(policy)).finalizedDevPayments).toBe('0');
  await authorize(id); await settle(id); await settle(id);
  expect((await developer.summary(policy))).toMatchObject({ finalizedDevPayments: '880000', finalizedPayoutCosts: '10000', availableOperations: '10000' });
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(2);
 });
 it('unknown and needs-review retain the same daily reservation across restart and new dates', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!; chain.unknown = true;
  await settle(id); expect((await getIntent(id)).status).toBe('unknown');
  const restarted = new DeveloperAccounting(db, 'demo');
  expect(await restarted.schedule({ policy, lease, now: nextDay })).toBeNull();
  chain.expired = true; await settle(id); expect((await getIntent(id)).status).toBe('needs_review');
  expect(await restarted.schedule({ policy, lease, now: nextDay })).toBeNull();
  expect(await db.balance(SOL, 'dev:principal:2026-09-23')).toBe(880_000n);
  expect(await db.balance(SOL, 'dev:cost:2026-09-23')).toBe(20_000n);
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);
 });
 it('unsigned route failure keeps its reserved intent and cannot become tomorrow’s replacement', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!; chain.unavailable.add(SOL);
  await settle(id); expect((await getIntent(id)).status).toBe('waiting_for_route');
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(0);
  expect(await developer.schedule({ policy, lease, now: nextDay })).toBeNull();
  chain.unavailable.clear(); await settle(id); expect((await developer.summary(policy)).finalizedDevPayments).toBe('880000');
 });
 it('later proof of the original needs-review signature settles once without a replacement', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!;
  chain.unknown = true; await settle(id); chain.expired = true; await settle(id);
  const original = await getIntent(id), proof = (await db.pool.query('SELECT result FROM demo_chain')).rows[0].result;
  expect(original.status).toBe('needs_review');
  await engine.apply(original, proof, lease);
  await db.tx(async t => { await db.fence(t, lease); await db.lock(t); await finalizeDeveloperPayout(db, t, original, proof); });
  await engine.apply(original, proof, lease);
  expect((await developer.summary(policy))).toMatchObject({ finalizedDevPayments: '880000', pendingTransfers: '0', reservedPayoutCosts: '0' });
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);
 });
 it('new expenses, disabled flags and changed policy block new signing without deleting a reservation', async () => {
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!;
  await expect(authorize(id, { ...policy, enabled: false })).rejects.toThrow('disabled');
  await expect(authorize(id, { ...policy, destination: testAddress('other-dev') })).rejects.toThrow('policy changed');
  await developer.recordExpense(approval({ amountLamports: 50_000n }));
  await expect(authorize(id)).rejects.toThrow('operating obligations');
  expect(await db.balance(SOL, 'dev:principal:2026-09-23')).toBe(880_000n);
  await allocate(55_000n); await authorize(id);
 });
 it('operations-wallet funding is reserved separately and never counted as developer earnings', async () => {
  const from = await allocate(1_000_000n);
  await db.tx(t => engine.addIntent(t, { id: 'legacy-operations', epoch_id: null, kind: 'operations', asset: SOL, amount: '1000000', status: 'planned', expected: { inputAsset: SOL, from, costAccount: 'legacy-cost', maxFee: '5000', sourceTokenAccount: policy.treasury, transfers: [{ owner: testAddress('legacy-ops'), destination: testAddress('legacy-ops'), amount: '1000000', entitlements: [] }] } }));
  expect(await developer.schedule({ policy, lease, now })).toBeNull();
  expect((await developer.summary(policy))).toMatchObject({ legacyOperationsReservations: '1000000', pendingTransfers: '0', finalizedDevPayments: '0' });
  await db.tx(t => db.move(t, 'legacy-fee-reserve', SOL, 'external:capital', 'legacy-cost', 10_000n));
  await settle('legacy-operations');
  expect((await developer.summary(policy))).toMatchObject({ operationsWalletFunding: '1000000', finalizedDevPayments: '0' });
 });
 it('approved expenses and actual payments are immutable, bounded and replay-safe', async () => {
  await developer.recordExpense(approval()); await developer.recordExpense(approval());
  await expect(developer.recordExpense(approval({ amountLamports: 1n }))).rejects.toThrow('different approval');
  await allocate(1_000_000n); const id = (await developer.schedule({ policy, lease, now }))!;
  await expect(developer.recordExpensePayment(payment({ finalized: false }), policy.treasury)).rejects.toThrow('not finalized');
  await expect(developer.recordExpensePayment(payment({ destination: testAddress('other') }), policy.treasury)).rejects.toThrow('destination');
  await expect(developer.recordExpensePayment(payment({ feeLamports: 5_001n }), policy.treasury)).rejects.toThrow('cost allowance');
  await developer.recordExpensePayment(payment(), policy.treasury); await developer.recordExpensePayment(payment(), policy.treasury);
  await expect(developer.recordExpensePayment(payment({ signature: 'another-payment' }), policy.treasury)).rejects.toThrow('approved principal');
  expect((await developer.summary(policy))).toMatchObject({ approvedExpenses: '200000', paidExpenses: '200000', operatingExpenseCosts: '1000', outstandingPayables: '0', pendingTransfers: '675000', availableOperations: '4000' });
  await expect(db.pool.query("UPDATE operating_expenses SET amount=1")).rejects.toThrow('append-only');
  await expect(db.pool.query('DELETE FROM operating_expense_payments')).rejects.toThrow('append-only');
  await authorize(id);
 });
 it('insufficient remaining payout cost blocks another signature while preserving principal', async () => {
  const tight = { ...policy, payoutCostLamports: 5_000n };
  await allocate(1_000_000n); const id = (await developer.schedule({ policy: tight, lease, now }))!;
  chain.failNext.add(id); await settle(id);
  await expect(authorize(id, tight)).rejects.toThrow('cost reservation exhausted');
  expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);
  expect(await db.balance(SOL, 'dev:principal:2026-09-23')).toBe(895_000n);
 });
 it('rejects external expense settlement for a known signed intent before local finality accounting', async () => {
  const from = await allocate(1_000_000n); await developer.recordExpense(approval());
  const p = payment();
  await db.tx(async t => {
   await db.lock(t); await db.move(t, 'pending-intent-fee', SOL, 'external:capital', 'reserve', 10_000n);
   await engine.addIntent(t, { id: 'expense-like-operation', epoch_id: null, kind: 'operations', asset: SOL, amount: p.amountLamports.toString(), status: 'planned',
    expected: { inputAsset: SOL, from, costAccount: 'reserve', maxFee: '5000', sourceTokenAccount: policy.treasury,
     transfers: [{ owner: p.destination, destination: p.destination, amount: p.amountLamports.toString(), entitlements: [] }] } });
  });
  await runIntent(engine, chain, 'expense-like-operation', lease);
  const attempt = (await db.pool.query('SELECT signature FROM attempts')).rows[0];
  expect((await db.pool.query('SELECT signature FROM chain_receipts')).rowCount).toBe(0);
  await expect(developer.recordExpensePayment({ ...p, signature: attempt.signature }, policy.treasury)).rejects.toThrow('belongs to an execution intent');
  expect((await db.pool.query('SELECT id FROM operating_expense_payments')).rowCount).toBe(0);
  expect(await db.balance(SOL, from)).toBe(1_000_000n);
 });
 it('charges one network fee per expense transaction while allowing additional verified transfers without another fee', async () => {
  await allocate(1_000_000n); await developer.recordExpense(approval());
  const first = payment({ amountLamports: 100_000n });
  await developer.recordExpensePayment(first, policy.treasury);
  await expect(developer.recordExpensePayment({ ...first, instruction: '1' }, policy.treasury)).rejects.toThrow('network fee already accounted');
  await expect(developer.recordExpensePayment({ ...first, instruction: '1', feeLamports: 0n, slot: first.slot + 1 }, policy.treasury)).rejects.toThrow('transaction slot changed');
  const second = { ...first, instruction: '1', feeLamports: 0n };
  await developer.recordExpensePayment(second, policy.treasury); await developer.recordExpensePayment(second, policy.treasury);
  expect((await developer.summary(policy))).toMatchObject({ paidExpenses: '200000', operatingExpenseCosts: '1000', availableOperations: '799000' });
  expect((await db.pool.query('SELECT id FROM operating_expense_payments')).rowCount).toBe(2);
 });
 it('a stale worker fence cannot reserve developer funds', async () => {
  await allocate(1_000_000n); await db.pool.query("UPDATE leases SET expires_at=now()-interval '1 second'");
  await expect(developer.schedule({ policy, lease, now })).rejects.toThrow('stale worker fence');
  expect((await db.pool.query('SELECT id FROM intents')).rowCount).toBe(0);
 });
});
