import { Store, type Lease, type Tx } from '../db/store.js';
import { randomUUID } from 'node:crypto';
import type { Intent, Outcome } from './engine.js';
import { SOL, address, canonical, ensure, hash, type Mode } from './model.js';

export interface DeveloperPayoutPolicy {
 enabled: boolean;
 treasury: string;
 destination?: string;
 minimumPayoutLamports: bigint;
 retainedReserveLamports: bigint;
 payoutCostLamports: bigint;
 maxFeeLamports: bigint;
 payoutHourUtc: number;
}
export interface DeveloperAccountingSummary {
 status: 'available';
 hasRecords: boolean;
 asset: 'SOL';
 units: 'lamports';
 allocation: string;
 approvedExpenses: string;
 paidExpenses: string;
 operatingExpenseCosts: string;
 outstandingPayables: string;
 retainedReserve: string;
 requiredReserve: string;
 reserveShortfall: string;
 availableOperations: string;
 legacyOperationsReservations: string;
 operationsWalletFunding: string;
 withdrawableRemainder: string;
 pendingTransfers: string;
 reservedPayoutCosts: string;
 payoutCostAllowance: string;
 finalizedDevPayments: string;
 finalizedPayoutCosts: string;
 enabled: boolean;
 destination: string | null;
 payoutHourUtc: number;
 minimumPayout: string;
 lastScheduledDay: string | null;
 message: string;
}
export interface ExpenseApproval {
 id: string;
 amountLamports: bigint;
 costAllowanceLamports?: bigint;
 payee: string;
 description: string;
 evidence: unknown;
 actor: string;
}
export interface ExpensePayment {
 expenseId: string;
 signature: string;
 instruction: string;
 amountLamports: bigint;
 feeLamports: bigint;
 source: string;
 destination: string;
 slot: number;
 finalized: boolean;
 error: unknown;
 evidence: unknown;
 actor: string;
}

const AVAILABLE = 'ops:available', RETAINED = 'ops:retained';
const active = "status NOT IN ('finalized','cancelled')";
const positive = (n: bigint) => n > 0n ? n : 0n;
const min = (a: bigint, b: bigint) => a < b ? a : b;
const amount = (v: unknown) => BigInt(String(v ?? '0'));

function validatePolicy(p: DeveloperPayoutPolicy) {
 ensure(p.minimumPayoutLamports > 0n && p.retainedReserveLamports >= 0n, 'invalid developer minimum/reserve');
 ensure(p.maxFeeLamports > 0n && p.payoutCostLamports >= p.maxFeeLamports, 'developer payout cost allowance below fee cap');
 ensure(Number.isInteger(p.payoutHourUtc) && p.payoutHourUtc >= 0 && p.payoutHourUtc <= 23, 'invalid developer UTC payout hour');
 if (p.enabled) { address.parse(p.treasury); address.parse(p.destination); ensure(p.treasury !== p.destination, 'developer destination must differ from treasury'); }
}
function frozenPolicy(p: DeveloperPayoutPolicy) {
 return { treasury: p.treasury, destination: p.destination ?? null, minimumPayoutLamports: p.minimumPayoutLamports.toString(), retainedReserveLamports: p.retainedReserveLamports.toString(), payoutCostLamports: p.payoutCostLamports.toString(), maxFeeLamports: p.maxFeeLamports.toString(), payoutHourUtc: p.payoutHourUtc };
}
type Account = { account: string; balance: bigint; reserved: bigint; free: bigint };

/** Only existing OPS allocation accounts and returned developer costs are spendable. */
async function operationAccounts(db: Store, t: Tx, includeRetained = false): Promise<Account[]> {
 const balances = (await t.query("SELECT account,sum(amount)::text AS amount FROM postings WHERE asset=$1 AND (account LIKE 'operations:%' OR account=$2 OR ($3 AND account=$4)) GROUP BY account HAVING sum(amount)>0 ORDER BY account", [SOL, AVAILABLE, includeRetained, RETAINED])).rows;
 const commitments = (await t.query(`SELECT amount::text,expected FROM intents WHERE ${active}`)).rows;
 return balances.map(row => {
  // A legacy operations intent may still own its original allocation account.
  // Dedicated developer principal/cost accounts are absent from balances here, so
  // they are never deducted again from this already-unreserved pool.
  const reserved = commitments.reduce((total, i) => total
   + (i.expected.from === row.account ? amount(i.amount) : 0n)
   + (i.expected.costAccount === row.account ? amount(i.expected.maxTotalCost ?? i.expected.maxFee) : 0n), 0n);
  const balance = amount(row.amount);
  return { account: row.account, balance, reserved, free: positive(balance - reserved) };
 });
}
async function obligations(t: Tx) {
 const rows = (await t.query(`SELECT e.amount::text,e.cost_allowance::text,
  coalesce(sum(p.amount),0)::text AS paid,coalesce(sum(p.fee),0)::text AS costs
  FROM operating_expenses e LEFT JOIN operating_expense_payments p ON p.expense_id=e.id GROUP BY e.id`)).rows;
 return rows.reduce((a, r) => {
  const principal = amount(r.amount), paid = amount(r.paid), costs = amount(r.costs), remaining = principal - paid;
  return { approved: a.approved + principal, paid: a.paid + paid, costs: a.costs + costs,
   outstanding: a.outstanding + remaining + (remaining > 0n ? positive(amount(r.cost_allowance) - costs) : 0n) };
 }, { approved: 0n, paid: 0n, costs: 0n, outstanding: 0n });
}
async function moveAvailable(db: Store, t: Tx, id: string, to: string, value: bigint, evidence: unknown, includeRetained = false) {
 let remaining = value;
 const entries = await operationAccounts(db, t, includeRetained);
 for (const entry of entries) {
  const take = min(remaining, entry.free);
  if (take > 0n) await db.move(t, `${id}:${hash(entry.account)}`, SOL, entry.account, to, take, evidence);
  remaining -= take;
  if (!remaining) break;
 }
 ensure(remaining === 0n, 'insufficient unreserved OPS/DEV funds');
}

/** Called only after Engine.apply has posted principal and native network costs. */
export async function finalizeDeveloperPayout(db: Store, t: Tx, intent: Intent, outcome: Outcome) {
 if (intent.kind !== 'operations' || intent.expected.purpose !== 'developer_payout') return;
 ensure(outcome.status === 'finalized' && outcome.error == null, 'developer payment requires finalized success');
 ensure((await t.query('SELECT intent_id FROM developer_payout_days WHERE intent_id=$1', [intent.id])).rowCount, 'developer daily reservation missing');
 ensure(await db.balance(SOL, intent.expected.from, t) === 0n, 'developer principal not settled');
 const unused = await db.balance(SOL, intent.expected.costAccount, t);
 if (unused > 0n) await db.move(t, 'developer-cost-return:' + intent.id, SOL, intent.expected.costAccount, AVAILABLE, unused, { intent: intent.id, signature: outcome.signature, rule: 'unused payout costs return only after finalized settlement' });
}

/** New-sign check only: recovery must reconcile a previously signed transaction. */
export async function assertDeveloperPayoutAuthorized(db: Store, t: Tx, intent: Intent, policy: DeveloperPayoutPolicy) {
 if (intent.kind !== 'operations' || intent.expected.purpose !== 'developer_payout') return;
 validatePolicy(policy);
 ensure(policy.enabled, 'developer payouts disabled');
 ensure(hash(frozenPolicy(policy)) === intent.expected.developerPolicyHash, 'developer payout policy changed; operator review required');
 const daily = (await t.query('SELECT utc_day::text FROM developer_payout_days WHERE intent_id=$1', [intent.id])).rows[0];
 ensure(daily && intent.expected.from === 'dev:principal:' + daily.utc_day && intent.expected.costAccount === 'dev:cost:' + daily.utc_day, 'developer reservation identity changed');
 ensure(intent.expected.sourceTokenAccount === policy.treasury && intent.expected.transfers?.length === 1
  && intent.expected.transfers[0].destination === policy.destination && intent.expected.transfers[0].amount === intent.amount, 'developer payout destination/amount changed');
 const available = (await operationAccounts(db, t, true)).reduce((s, a) => s + a.free, 0n);
 const payable = await obligations(t);
 ensure(available >= payable.outstanding + policy.retainedReserveLamports, 'new operating obligations or required reserve block developer signing');
 ensure(await db.balance(SOL, intent.expected.from, t) >= BigInt(intent.amount), 'developer principal reservation missing');
 ensure(await db.balance(SOL, intent.expected.costAccount, t) >= policy.maxFeeLamports, 'developer payout cost reservation exhausted');
}

export class DeveloperAccounting {
 constructor(public db: Store, public mode: Mode) {}

 async summary(policy: DeveloperPayoutPolicy, tx?: Tx): Promise<DeveloperAccountingSummary> {
  validatePolicy(policy);
  if (!tx) return this.db.tx(async t => { await this.db.lock(t); return this.summary(policy, t); });
  // One locked transaction/connection gives a coherent ledger view; pg queries
  // on that single client must remain sequential.
  const accounts = await operationAccounts(this.db, tx), payable = await obligations(tx), retained = await this.db.balance(SOL, RETAINED, tx);
  const alloc = await tx.query("SELECT coalesce(sum(p.amount),0)::text AS n FROM postings p WHERE p.asset='SOL' AND p.account LIKE 'operations:%' AND p.amount>0 AND EXISTS(SELECT 1 FROM postings r WHERE r.event_id=p.event_id AND r.asset='SOL' AND r.account='revenue' AND r.amount<0)");
  const pending = await tx.query(`SELECT i.id,i.amount::text,i.expected FROM intents i JOIN developer_payout_days d ON d.intent_id=i.id WHERE i.${active}`);
  const finalized = await tx.query("SELECT coalesce(sum(i.amount),0)::text AS n FROM intents i JOIN chain_receipts r ON r.intent_id=i.id WHERE i.kind='operations' AND i.expected->>'purpose'='developer_payout' AND i.status='finalized'");
  const operations = await tx.query("SELECT coalesce(sum(i.amount),0)::text AS n FROM intents i JOIN chain_receipts r ON r.intent_id=i.id WHERE i.kind='operations' AND coalesce(i.expected->>'purpose','')<>'developer_payout' AND i.status='finalized'");
  const last = await tx.query('SELECT utc_day::text FROM developer_payout_days ORDER BY utc_day DESC LIMIT 1');
  const free = accounts.reduce((s, a) => s + a.free, 0n), legacy = accounts.reduce((s, a) => s + min(a.balance, a.reserved), 0n);
  let pendingPrincipal = 0n, pendingCosts = 0n;
  for (const i of pending.rows) { pendingPrincipal += await this.db.balance(SOL, i.expected.from, tx); pendingCosts += await this.db.balance(SOL, i.expected.costAccount, tx); }
  const costs = await tx.query("SELECT coalesce(-sum(p.amount),0)::text AS n FROM postings p WHERE p.asset='SOL' AND p.amount<0 AND p.account IN (SELECT expected->>'costAccount' FROM intents WHERE kind='operations' AND expected->>'purpose'='developer_payout') AND EXISTS(SELECT 1 FROM postings x WHERE x.event_id=p.event_id AND x.account='external:network')");
  const shortfall = positive(policy.retainedReserveLamports - retained);
  // Dedicated pending principal/cost has already left free operations balances.
  // Outstanding payables and reserve shortfall are each deducted exactly once.
  const remainder = positive(free - payable.outstanding - shortfall - policy.payoutCostLamports);
  return { status: 'available', hasRecords: amount(alloc.rows[0].n) > 0n || payable.approved > 0n || !!last.rowCount, asset: 'SOL', units: 'lamports', allocation: alloc.rows[0].n,
   approvedExpenses: payable.approved.toString(), paidExpenses: payable.paid.toString(), operatingExpenseCosts: payable.costs.toString(), outstandingPayables: payable.outstanding.toString(),
   retainedReserve: retained.toString(), requiredReserve: policy.retainedReserveLamports.toString(), reserveShortfall: shortfall.toString(), availableOperations: free.toString(), legacyOperationsReservations: legacy.toString(), operationsWalletFunding: operations.rows[0].n,
   withdrawableRemainder: remainder.toString(), pendingTransfers: pendingPrincipal.toString(), reservedPayoutCosts: pendingCosts.toString(), payoutCostAllowance: policy.payoutCostLamports.toString(), finalizedDevPayments: finalized.rows[0].n, finalizedPayoutCosts: costs.rows[0].n,
   enabled: policy.enabled, destination: policy.destination ?? null, payoutHourUtc: policy.payoutHourUtc, minimumPayout: policy.minimumPayoutLamports.toString(), lastScheduledDay: last.rows[0]?.utc_day ?? null,
   message: 'Ledger lamports only. OPS/DEV allocation is not developer profit; approved payables, required reserve, existing reservations and payout cost take precedence. Daily scheduling does not promise payment.' };
 }

 async schedule({ policy, lease, now = Date.now() }: { policy: DeveloperPayoutPolicy; lease: Lease; now?: number }): Promise<string | null> {
  validatePolicy(policy);
  if (!policy.enabled || this.mode === 'prelaunch') return null;
  const date = new Date(now); ensure(Number.isFinite(date.getTime()), 'invalid developer schedule time');
  if (date.getUTCHours() < policy.payoutHourUtc) return null;
  const day = date.toISOString().slice(0, 10), id = 'developer:' + day;
  return this.db.tx(async t => {
   await this.db.fence(t, lease); await this.db.lock(t);
   const previous = await t.query('SELECT intent_id FROM developer_payout_days WHERE utc_day=$1', [day]);
   if (previous.rowCount) return previous.rows[0].intent_id;
   // A backwards system clock must not create a payment for an older missed day.
   if ((await t.query('SELECT utc_day FROM developer_payout_days WHERE utc_day>$1 LIMIT 1', [day])).rowCount) return null;
   if ((await t.query('SELECT paused FROM control WHERE id=true')).rows[0].paused) return null;
   // One unresolved developer transfer at a time, including unsigned failures and
   // needs_review. A new UTC date is never a replacement for an unresolved intent.
   if ((await t.query(`SELECT id FROM intents WHERE kind='operations' AND expected->>'purpose'='developer_payout' AND ${active}`)).rowCount) return null;
   const payable = await obligations(t), accounts = await operationAccounts(this.db, t);
   const free = accounts.reduce((s, a) => s + a.free, 0n), retained = await this.db.balance(SOL, RETAINED, t);
   // A lowered reserve policy releases surplus only through a linked ledger event.
   if (retained > policy.retainedReserveLamports) await this.db.move(t, 'developer-reserve-release:' + day + ':' + randomUUID(), SOL, RETAINED, AVAILABLE, retained - policy.retainedReserveLamports, { day, policy: frozenPolicy(policy) });
   const shortfall = positive(policy.retainedReserveLamports - retained);
   const reserveNow = min(shortfall, positive(free - payable.outstanding));
   if (reserveNow > 0n) await moveAvailable(this.db, t, 'developer-reserve:' + day + ':' + randomUUID(), RETAINED, reserveNow, { day, policy: frozenPolicy(policy) });
   const summary = await this.summary(policy, t), principal = BigInt(summary.withdrawableRemainder);
   if (principal < policy.minimumPayoutLamports) return null;
   const principalAccount = 'dev:principal:' + day, costAccount = 'dev:cost:' + day;
   const evidence = { day, policy: frozenPolicy(policy), allocation: summary.allocation, outstandingPayables: summary.outstandingPayables, requiredReserve: summary.requiredReserve };
   await moveAvailable(this.db, t, 'developer-principal:' + day, principalAccount, principal, evidence);
   await moveAvailable(this.db, t, 'developer-cost:' + day, costAccount, policy.payoutCostLamports, evidence);
   const expected = { purpose: 'developer_payout', inputAsset: SOL, from: principalAccount, to: policy.destination, owner: policy.destination,
    sourceTokenAccount: policy.treasury, costAccount, maxFee: policy.maxFeeLamports.toString(), maxTotalCost: policy.payoutCostLamports.toString(),
    developerPolicyHash: hash(frozenPolicy(policy)), developerPolicy: frozenPolicy(policy), scheduledUtcDay: day,
    transfers: [{ owner: policy.destination, destination: policy.destination, amount: principal.toString(), entitlements: [] }] };
   await t.query("INSERT INTO intents(id,epoch_id,kind,asset,amount,status,expected) VALUES($1,null,'operations',$2,$3,'planned',$4)", [id, SOL, principal.toString(), canonical(expected)]);
   await t.query("INSERT INTO jobs(id,kind,body) VALUES($1,'intent',$2)", [id, canonical({ intentId: id })]);
   await t.query('INSERT INTO developer_payout_days(utc_day,intent_id,policy_hash) VALUES($1,$2,$3)', [day, id, hash(frozenPolicy(policy))]);
   return id;
  });
 }

 async recordExpense(input: ExpenseApproval): Promise<string> {
  ensure(/^[A-Za-z0-9._:-]{1,120}$/.test(input.id), 'invalid operating expense id');
  ensure(input.amountLamports > 0n && (input.costAllowanceLamports ?? 0n) >= 0n, 'invalid operating expense amount');
  address.parse(input.payee); ensure(input.actor.trim() && input.description.trim(), 'expense approval attribution required');
  const evidence = { amount: input.amountLamports.toString(), costAllowance: (input.costAllowanceLamports ?? 0n).toString(), payee: input.payee, description: input.description, evidenceHash: hash(input.evidence), actor: input.actor };
  const event = 'operating-expense:' + input.id;
  return this.db.tx(async t => {
   await this.db.lock(t);
   const existing = (await t.query('SELECT evidence FROM ledger_events WHERE id=$1', [event])).rows[0];
   if (existing) { ensure(hash(existing.evidence) === hash(evidence), 'expense id already has different approval'); return input.id; }
   // Obligation-only entry: no fictitious SOL cash posting is introduced.
   await this.db.event(t, event, 'operating_expense_approved', [], evidence);
   await t.query('INSERT INTO operating_expenses(id,event_id,amount,cost_allowance,payee,description,evidence_hash,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [input.id, event, evidence.amount, evidence.costAllowance, input.payee, input.description, evidence.evidenceHash, input.actor]);
   await t.query("INSERT INTO operator_audit(actor,action,body) VALUES($1,'approve_operating_expense',$2)", [input.actor, canonical({ id: input.id, ...evidence })]);
   return input.id;
  });
 }

 /** Caller must independently verify this outgoing transfer against finalized chain evidence. */
 async recordExpensePayment(input: ExpensePayment, treasury: string): Promise<string> {
  ensure(input.finalized && input.error == null && Number.isSafeInteger(input.slot) && input.slot > 0, 'expense payment is not finalized successful evidence');
  ensure(input.amountLamports > 0n && input.feeLamports >= 0n && input.signature && input.instruction && input.actor, 'invalid expense payment evidence');
  ensure(input.source === treasury, 'expense payment source is not treasury'); address.parse(input.destination);
  const id = hash([input.signature, input.instruction]), event = 'operating-expense-paid:' + id;
  const evidence = { expenseId: input.expenseId, signature: input.signature, instruction: input.instruction, amount: input.amountLamports.toString(), fee: input.feeLamports.toString(), slot: input.slot, source: input.source, destination: input.destination, evidenceHash: hash(input.evidence), actor: input.actor };
  return this.db.tx(async t => {
   await this.db.lock(t);
   const existing = (await t.query('SELECT evidence FROM ledger_events WHERE id=$1', [event])).rows[0];
   if (existing) { ensure(hash(existing.evidence) === hash(evidence), 'expense payment evidence replay mismatch'); return id; }
   ensure(!(await t.query('SELECT signature FROM attempts WHERE signature=$1 UNION ALL SELECT signature FROM chain_receipts WHERE signature=$1', [input.signature])).rowCount, 'transaction belongs to an execution intent; reconcile its original attempt');
   const sameTransaction = (await t.query('SELECT fee::text,slot::text FROM operating_expense_payments WHERE signature=$1', [input.signature])).rows;
   ensure(sameTransaction.every(p => p.slot === String(input.slot)), 'expense payment transaction slot changed');
   ensure(input.feeLamports === 0n || sameTransaction.every(p => amount(p.fee) === 0n), 'expense transaction network fee already accounted');
   const expense = (await t.query('SELECT amount::text,cost_allowance::text,payee FROM operating_expenses WHERE id=$1', [input.expenseId])).rows[0];
   ensure(expense && expense.payee === input.destination, 'expense payment destination/approval mismatch');
   const paid = (await t.query('SELECT coalesce(sum(amount),0)::text AS amount,coalesce(sum(fee),0)::text AS fee FROM operating_expense_payments WHERE expense_id=$1', [input.expenseId])).rows[0];
   ensure(amount(paid.amount) + input.amountLamports <= amount(expense.amount), 'expense payment exceeds approved principal');
   ensure(amount(paid.fee) + input.feeLamports <= amount(expense.cost_allowance), 'expense payment exceeds approved cost allowance');
   await moveAvailable(this.db, t, event + ':principal', 'external:operating-expense', input.amountLamports, evidence, true);
   if (input.feeLamports) await moveAvailable(this.db, t, event + ':cost', 'external:network', input.feeLamports, evidence, true);
   await this.db.event(t, event, 'operating_expense_paid', [], evidence);
   await t.query('INSERT INTO operating_expense_payments(id,event_id,expense_id,amount,fee,signature,instruction,slot,source,destination,evidence_hash,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id, event, input.expenseId, evidence.amount, evidence.fee, input.signature, input.instruction, input.slot, input.source, input.destination, evidence.evidenceHash, input.actor]);
   return id;
  });
 }
}
