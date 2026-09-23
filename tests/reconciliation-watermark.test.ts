import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeveloperAccounting } from '../packages/core/developer.js';
import { Engine, type Receipt } from '../packages/core/engine.js';
import { SOL } from '../packages/core/model.js';
import { migrate } from '../packages/db/migrate.js';
import { Store } from '../packages/db/store.js';
import { testAddress } from '../packages/integrations/demo.js';

const base = process.env.TEST_DATABASE_URL ?? 'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test';
const admin = new Store(base), schema = 'watermark_' + Date.now() + '_' + process.pid;
const treasury = testAddress('watermark-treasury'), payee = testAddress('watermark-payee');
let db: Store, engine: Engine;

function receipt(slot = 600): Receipt {
 return { signature: 'watermark-test-inbound', instruction: '0', asset: SOL, amount: '100000', destination: treasury,
  source: testAddress('watermark-source'), slot, finalized: true, error: null, kind: 'seed', attributionVerified: true,
  rawEvidence: { testOnly: true, observation: 'synthetic finalized receipt for isolated PostgreSQL test' } };
}
async function expectUnpaused() {
 expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(false);
 expect((await db.pool.query('SELECT id FROM incidents')).rowCount).toBe(0);
}
beforeAll(async () => {
 await admin.pool.query(`CREATE SCHEMA ${schema}`);
 const url = new URL(base); url.searchParams.set('options', '-c search_path=' + schema);
 db = new Store(url.toString()); await migrate(db); await db.bindMode('demo');
});
beforeEach(async () => {
 await db.pool.query('TRUNCATE incoming_transfers,ledger_events,postings,operating_expenses,operating_expense_payments,documents,incidents CASCADE');
 await db.pool.query("UPDATE control SET paused=false,reason='watermark test'");
 engine = new Engine(db, 'demo');
});
afterAll(async () => { await db?.close(); await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`); await admin.close(); });

describe('reconciliation finalized movement watermark', () => {
 it('does not report an older sampled balance as a deficit after finalized inbound ingestion', async () => {
  await engine.ingest(receipt(), { treasury });
  const [older] = await engine.reconcile([{ asset: SOL, amount: '0', slot: 599 }]);
  expect(older).toMatchObject({ state: 'stale_observation', expected: '100000', delta: '-100000', ledgerFinalizedSlot: 600 });
  await expectUnpaused();
  const [current] = await engine.reconcile([{ asset: SOL, amount: '100000', slot: 600 }]);
  expect(current.state).toBe('balanced'); await expectUnpaused();
 });

 it('includes finalized expense payments in the same watermark before comparing cash', async () => {
  await engine.ingest(receipt(), { treasury });
  await db.tx(async t => { await db.lock(t); await db.move(t, 'test-ops-allocation', SOL, 'reserve', 'operations:test', 100000n); });
  const developer = new DeveloperAccounting(db, 'demo');
  await developer.recordExpense({ id: 'rpc-invoice', amountLamports: 1000n, costAllowanceLamports: 100n, payee,
   description: 'Isolated test invoice', evidence: { testOnly: true }, actor: 'test-operator' });
  await developer.recordExpensePayment({ expenseId: 'rpc-invoice', signature: 'watermark-test-expense', instruction: '0',
   amountLamports: 1000n, feeLamports: 100n, source: treasury, destination: payee, slot: 601, finalized: true, error: null,
   evidence: { testOnly: true, verifiedBy: 'test-fixture' }, actor: 'test-operator' }, treasury);
  const [older] = await engine.reconcile([{ asset: SOL, amount: '100000', slot: 600 }]);
  expect(older).toMatchObject({ state: 'stale_observation', expected: '98900', delta: '1100', ledgerFinalizedSlot: 601 });
  await expectUnpaused();
  const [current] = await engine.reconcile([{ asset: SOL, amount: '98900', slot: 601 }]);
  expect(current.state).toBe('balanced'); await expectUnpaused();
 });

 it('still pauses on an unexplained deficit observed at or after the newest receipt', async () => {
  await engine.ingest(receipt(), { treasury });
  const [report] = await engine.reconcile([{ asset: SOL, amount: '90000', slot: 600 }]);
  expect(report).toMatchObject({ state: 'deficit', delta: '-10000', ledgerFinalizedSlot: 600 });
  expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);
  expect((await db.pool.query('SELECT kind FROM incidents')).rows).toEqual([{ kind: 'reconciliation_deficit' }]);
 });
});
