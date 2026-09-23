import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {Store,type Lease,type Tx} from '../packages/db/store.js';
import {migrate} from '../packages/db/migrate.js';
import {Engine,type Intent,type Signed} from '../packages/core/engine.js';
import {DemoChain,testAddress,testKey} from '../packages/integrations/demo.js';
import {FileTestSigner,SolanaChain} from '../packages/integrations/solana.js';
import {loadConfig} from '../packages/core/config.js';
import {SOL,WSOL} from '../packages/core/model.js';
import {runIntent,tick} from '../apps/worker/runner.js';
import {recoverIntent} from '../apps/worker/recovery.js';
import {PublicKey,SystemProgram,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {AccountLayout,ASSOCIATED_TOKEN_PROGRAM_ID,MintLayout,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {program} from '@jup-ag/instruction-parser';
import {JupiterClient,safeJupiterBuild} from '../packages/integrations/jupiter.js';
const base=process.env.TEST_DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test';
const admin=new Store(base),schema='execution_'+Date.now();
let db:Store,engine:Engine,chain:ControlledChain,lease:Lease;
class ControlledChain extends DemoChain {
 prepared:string[]=[]; signed:string[]=[]; beforeSigning?:()=>Promise<void>;
 override async prepare(i:Intent,guard?:()=>Promise<void>):Promise<Signed>{
  this.prepared.push(i.id);const unsigned=await super.prepare(i);await this.beforeSigning?.();await guard?.();this.signed.push(i.id);
  return {...unsigned,approvedPlan:{...i.expected,maxNativeCost:i.expected.maxFee,maxRent:'0',requiredRent:'0'}};
 }
}
async function intent(id:string,asset=SOL,kind:Intent['kind']='operations'){
 const i:Intent={id,epoch_id:null,kind,asset,amount:'100',status:'planned',expected:{inputAsset:asset,from:'reserve:'+id,maxFee:'5000',costAccount:'reserve',sourceTokenAccount:'source',transfers:[{owner:'recipient',destination:'recipient',amount:'100',entitlements:[]}]}};
 await db.tx(async t=>{await db.lock(t);await db.move(t,'seed:'+id,asset,'external:test','reserve:'+id,100n);await engine.addIntent(t,i);});return i;
}
async function status(id:string){return (await db.pool.query('SELECT status,retry_count,next_attempt_at,last_attempt_at FROM intents WHERE id=$1',[id])).rows[0];}
async function signature(id:string){return (await db.pool.query('SELECT signature FROM attempts WHERE intent_id=$1',[id])).rows[0].signature as string;}
async function legacyAttempt(i:Intent,signed?:Signed){
 await db.pool.query('UPDATE intents SET expected=$2 WHERE id=$1',[i.id,JSON.stringify({...i.expected,maxTotalCost:i.expected.maxTotalCost??'100000'})]);
 await db.pool.query('INSERT INTO attempts(intent_id,attempt_no,signature,signed_payload,blockhash,last_valid_height,approved_message_hash) VALUES($1,1,$2,$3,$4,1000,$5)',[i.id,signed?.signature??'legacy:'+i.id,signed?.bytes??Buffer.from('original legacy signed bytes'),signed?.blockhash??'legacy-block',signed?.messageHash??'legacy-message']);
 await db.pool.query("UPDATE intents SET status='unknown' WHERE id=$1",[i.id]);
}
async function expenseFixtureTables(){
 // These runner tests also run on the pre-developer schema. Integrated migrations supply full constraints.
 await db.pool.query('CREATE TABLE IF NOT EXISTS operating_expenses (id text PRIMARY KEY,event_id text,amount numeric,cost_allowance numeric,payee text,description text,evidence_hash text,actor text)');
 await db.pool.query('CREATE TABLE IF NOT EXISTS operating_expense_payments (id text PRIMARY KEY,event_id text,expense_id text,amount numeric,fee numeric,signature text,instruction text,slot bigint,source text,destination text,evidence_hash text,actor text)');
}
async function approveFixtureExpense(id:string){
 await db.tx(async t=>{await db.lock(t);await db.event(t,'expense:'+id,'operating_expense_approved',[],{testOnly:true});
  await t.query('INSERT INTO operating_expenses(id,event_id,amount,cost_allowance,payee,description,evidence_hash,actor) VALUES($1,$2,100,5000,$3,$4,$5,$6)',[id,'expense:'+id,testAddress('expense-payee'),'Expense approved during external authorization','fixture','test']);
 });
}
async function lockedExpenseCheck(_i:Intent,t:Tx){
 // A separate transaction must be unable to acquire the control lock while this callback runs.
 await expect(db.tx(other=>other.query('SELECT id FROM control WHERE id=true FOR UPDATE NOWAIT'))).rejects.toMatchObject({code:'55P03'});
 const amount=BigInt((await t.query('SELECT coalesce(sum(amount),0)::text AS amount FROM operating_expenses')).rows[0].amount);
 if(amount>0n)throw Error('new operating obligations block developer signing');
}
function actualAdapter(){
 const signer=new FileTestSigner(testKey('cost-signer'),'devnet'),recipient=testAddress('cost-recipient');
 const adapter=new SolanaChain(loadConfig({MODE:'test',CLUSTER:'devnet',BROADCAST_ENABLED:'true',MASTER_PAUSE:'false',TREASURY:signer.publicKey.toBase58(),OPERATIONS:recipient}),signer);
 const mintData=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
 vi.spyOn(adapter.connection,'getGenesisHash').mockResolvedValue('devnet-genesis');
 vi.spyOn(adapter.connection,'getAccountInfo').mockResolvedValue({owner:TOKEN_PROGRAM_ID,data:mintData,lamports:1461600,executable:false,rentEpoch:0});
 vi.spyOn(adapter.connection,'getLatestBlockhash').mockResolvedValue({blockhash:testAddress('cost-block'),lastValidBlockHeight:1000});
 vi.spyOn(adapter.connection,'getMinimumBalanceForRentExemption').mockResolvedValue(2039280);
 vi.spyOn(adapter.connection,'getFeeForMessage').mockResolvedValue({context:{slot:600},value:5000});
 vi.spyOn(adapter.connection,'simulateTransaction').mockResolvedValue({context:{slot:600},value:{err:null,logs:[],unitsConsumed:10000}});
 vi.spyOn(adapter.connection,'isBlockhashValid').mockResolvedValue({context:{slot:600},value:true});
 vi.spyOn(adapter,'inspect').mockImplementation(async(_i,s)=>({status:'unknown',signature:s.signature}));
 vi.spyOn(adapter,'broadcast').mockResolvedValue();
 return {adapter,signer,recipient};
}
beforeAll(async()=>{await admin.pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options','-c search_path='+schema);db=new Store(url.toString());await migrate(db);await db.bindMode('demo');chain=new ControlledChain(db);await chain.init();await expenseFixtureTables();});
beforeEach(async()=>{await db.pool.query('TRUNCATE intents,attempts,execution_recoveries,ledger_events,postings,leases,jobs,incidents,operator_audit,chain_receipts,demo_chain,documents,operating_expense_payments,operating_expenses CASCADE');await db.pool.query("UPDATE control SET paused=false,reason='test'");engine=new Engine(db,'demo');chain=new ControlledChain(db);lease=(await db.lease('execution',300))!;await db.tx(t=>db.move(t,'capital',SOL,'external:test','reserve',100000n));});
afterAll(async()=>{await db?.close();await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);await admin.close();});
describe('Execution orchestration regressions',()=>{
 it('backoffs a bad unsigned route without starving unrelated work and preserves retries across restart',async()=>{
  await intent('a-bad','BAD');await intent('b-good','GOOD');chain.unavailable.add('BAD');
  await tick(engine,chain,'execution');const waiting=await status('a-bad');expect(waiting.status).toBe('waiting_for_route');expect(waiting.retry_count).toBe(1);expect(waiting.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
  await tick(engine,chain,'execution');expect((await status('b-good')).status).toBe('unknown');
  engine=new Engine(db,'demo');await tick(engine,chain,'execution');expect((await status('b-good')).status).toBe('finalized');expect(chain.prepared.filter(id=>id==='a-bad')).toHaveLength(1);
  await db.pool.query("UPDATE intents SET next_attempt_at=clock_timestamp()-interval '1 second',retry_count=99 WHERE id='a-bad'");
  await tick(engine,chain,'execution');const capped=(await db.pool.query("SELECT extract(epoch from(next_attempt_at-last_attempt_at))::float AS delay FROM intents WHERE id='a-bad'")).rows[0];expect(capped.delay).toBeGreaterThanOrEqual(299);expect(capped.delay).toBeLessThanOrEqual(301);
 });
 it('reconciles the original needs_review signature exactly once while paused',async()=>{
  await intent('late','TOKEN');await runIntent(engine,chain,'late',lease);const original=await signature('late');chain.expired=true;await runIntent(engine,chain,'late',lease);expect((await status('late')).status).toBe('needs_review');
  await db.pool.query('UPDATE control SET paused=true');chain.expired=false;
  await tick(engine,chain,'execution',{recoveryOnly:true});await tick(engine,chain,'execution',{recoveryOnly:true});
  expect((await status('late')).status).toBe('finalized');expect(await signature('late')).toBe(original);expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);expect(await db.balance('TOKEN','reserve:late')).toBe(0n);expect(await db.balance(SOL,'reserve')).toBe(95000n);expect((await db.pool.query('SELECT * FROM chain_receipts')).rowCount).toBe(1);
 });
 it('unknown review outcomes retain reservations and prevent replacement or recovery broadcasts',async()=>{
  await intent('review','TOKEN');await intent('unrelated','OTHER');await runIntent(engine,chain,'review',lease);chain.expired=true;await runIntent(engine,chain,'review',lease);chain.expired=false;chain.unknown=true;
  await tick(engine,chain,'execution',{recoveryOnly:true});await tick(engine,chain,'execution');
  expect((await status('review')).status).toBe('needs_review');expect((await status('unrelated')).status).toBe('planned');expect(await db.balance('TOKEN','reserve:review')).toBe(100n);expect((await db.pool.query('SELECT count(*)::int AS n,sum(broadcasts)::int AS sends FROM demo_chain')).rows[0]).toEqual({n:1,sends:1});expect(chain.prepared).toEqual(['review']);
 });
 it('recovery-only never prepares new work and signing rechecks authorization after asynchronous preparation',async()=>{
  await intent('blocked','TOKEN');await tick(engine,chain,'execution',{recoveryOnly:true});expect(chain.prepared).toHaveLength(0);
  lease=(await db.lease('execution',300))!;let authorized=true;chain.beforeSigning=async()=>{authorized=false;};
  await runIntent(engine,chain,'blocked',lease,undefined,{authorizeNewSigning:async()=>{if(!authorized)throw Error('approval revoked during build');}});
  expect(chain.prepared).toEqual(['blocked']);expect(chain.signed).toHaveLength(0);expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(0);expect((await status('blocked')).status).toBe('waiting_for_route');
 });
 it('rechecks the database pause immediately at the signer boundary',async()=>{
  await intent('paused','TOKEN');chain.beforeSigning=async()=>{await db.pool.query('UPDATE control SET paused=true');};
  await runIntent(engine,chain,'paused',lease);expect(chain.signed).toHaveLength(0);expect(await db.balance('TOKEN','reserve:paused')).toBe(100n);expect((await status('paused')).status).toBe('waiting_for_route');
 });
 it.each([1,2])('checks newly approved expenses under lock at authorization boundary %s before actual signing',async boundary=>{
  const {adapter,signer,recipient}=actualAdapter(),i=await intent('expense-race');
  i.expected={...i.expected,purpose:'developer_payout',sourceTokenAccount:signer.publicKey.toBase58(),transfers:[{owner:recipient,destination:recipient,amount:'100',entitlements:[]}]};await db.pool.query('UPDATE intents SET expected=$2 WHERE id=$1',[i.id,JSON.stringify(i.expected)]);engine=new Engine(db,'test');
  let externalReads=0;const sign=vi.spyOn(signer,'sign'),prepare=vi.spyOn(adapter,'prepare'),locked=vi.fn(lockedExpenseCheck);
  const options={authorizeNewSigning:async()=>{externalReads++;expect((await db.pool.query('SELECT count(*)::int AS n FROM operating_expenses')).rows[0].n).toBe(0);if(externalReads===boundary)await approveFixtureExpense('during-route');},authorizeNewSigningLocked:locked};
  const run=runIntent(engine,adapter,i.id,lease,undefined,options);if(boundary===1)await expect(run).rejects.toThrow('new operating obligations');else await run;
  expect(externalReads).toBe(boundary);expect(locked).toHaveBeenCalledTimes(boundary);expect(prepare).toHaveBeenCalledTimes(boundary===1?0:1);expect(sign).not.toHaveBeenCalled();expect(adapter.broadcast).not.toHaveBeenCalled();expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(0);expect(await db.balance(SOL,i.expected.from)).toBe(100n);
 });
 it('rechecks locked obligations before rebroadcast but allows paused original-signature finality accounting',async()=>{
  const {adapter,signer,recipient}=actualAdapter(),i=await intent('resend-expense-race');i.expected={...i.expected,purpose:'developer_payout',sourceTokenAccount:signer.publicKey.toBase58(),transfers:[{owner:recipient,destination:recipient,amount:'100',entitlements:[]}]};await db.pool.query('UPDATE intents SET expected=$2 WHERE id=$1',[i.id,JSON.stringify(i.expected)]);engine=new Engine(db,'test');
  const sign=vi.spyOn(signer,'sign');await expect(runIntent(engine,adapter,i.id,lease,'after_sign',{authorizeNewSigning:async()=>{},authorizeNewSigningLocked:lockedExpenseCheck})).rejects.toThrow('INJECTED_CRASH');const original=await signature(i.id);
  const locked=vi.fn(lockedExpenseCheck);await runIntent(engine,adapter,i.id,lease,undefined,{authorizeNewSigning:async()=>{await approveFixtureExpense('before-resend');},authorizeNewSigningLocked:locked});
  expect(locked).toHaveBeenCalledOnce();expect(sign).toHaveBeenCalledOnce();expect(adapter.broadcast).not.toHaveBeenCalled();expect(await signature(i.id)).toBe(original);expect((await status(i.id)).status).toBe('unknown');expect(await db.balance(SOL,i.expected.from)).toBe(100n);
  await db.pool.query('UPDATE control SET paused=true');vi.mocked(adapter.inspect).mockResolvedValue({status:'finalized',signature:original,slot:600,fee:'5000',rent:'0',transfers:[{instruction:'0',asset:SOL,source:signer.publicKey.toBase58(),destination:recipient,amount:'100'}]});
  const deny=vi.fn(async()=>{throw Error('new signing denied');});await runIntent(engine,adapter,i.id,lease,undefined,{recoveryOnly:true,authorizeNewSigning:deny,authorizeNewSigningLocked:deny});await runIntent(engine,adapter,i.id,lease,undefined,{recoveryOnly:true,authorizeNewSigning:deny,authorizeNewSigningLocked:deny});
  expect(deny).not.toHaveBeenCalled();expect((await status(i.id)).status).toBe('finalized');expect(await db.balance(SOL,i.expected.from)).toBe(0n);expect(await db.balance(SOL,'reserve')).toBe(95000n);expect((await db.pool.query('SELECT * FROM chain_receipts')).rowCount).toBe(1);expect(adapter.broadcast).not.toHaveBeenCalled();
 });
 it('rejects a prepared signature already attributed to an expense without broadcasting or releasing its reservation',async()=>{
  const i=await intent('expense-signature-race'),prepare=chain.prepare.bind(chain),broadcast=vi.spyOn(chain,'broadcast'),inspect=vi.spyOn(chain,'inspect');
  vi.spyOn(chain,'prepare').mockImplementation(async(current,guard)=>{const signed=await prepare(current,guard);await approveFixtureExpense('same-transaction');await db.tx(async t=>{await db.lock(t);await db.move(t,'expense-paid:principal',SOL,'reserve','external:operating-expense',100n);await db.move(t,'expense-paid:fee',SOL,'reserve','external:network',5000n);await db.event(t,'expense-paid','operating_expense_paid',[],{signature:signed.signature,testOnly:true});await t.query('INSERT INTO operating_expense_payments(id,event_id,expense_id,amount,fee,signature,instruction,slot,source,destination,evidence_hash,actor) VALUES($1,$2,$3,100,5000,$4,$5,600,$6,$7,$8,$9)',['paid','expense-paid','same-transaction',signed.signature,'0',testAddress('expense-treasury'),testAddress('expense-payee'),'fixture','test']);});return signed;});
  await runIntent(engine,chain,i.id,lease);
  expect(broadcast).not.toHaveBeenCalled();expect(inspect).not.toHaveBeenCalled();expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(0);expect((await db.pool.query('SELECT * FROM chain_receipts')).rowCount).toBe(0);expect((await status(i.id)).status).toBe('waiting_for_route');expect(await db.balance(SOL,i.expected.from)).toBe(100n);expect(await db.balance(SOL,'reserve')).toBe(94900n);expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);expect((await db.pool.query("SELECT * FROM incidents WHERE kind='execution_signature_already_attributed'")).rowCount).toBe(1);
 });
 it('the actual Solana adapter invokes authorization after building and before the signer',async()=>{
  const signer=new FileTestSigner(testKey('execution-signer'),'devnet'),recipient=testAddress('execution-recipient');
  const adapter=new SolanaChain(loadConfig({MODE:'test',CLUSTER:'devnet',BROADCAST_ENABLED:'true',MASTER_PAUSE:'false',TREASURY:signer.publicKey.toBase58(),OPERATIONS:recipient}),signer);
  vi.spyOn(adapter.connection,'getGenesisHash').mockResolvedValue('devnet-genesis');
  vi.spyOn(adapter.connection,'getLatestBlockhash').mockResolvedValue({blockhash:testAddress('block'),lastValidBlockHeight:100});
  vi.spyOn(adapter.connection,'getMinimumBalanceForRentExemption').mockResolvedValue(2039280);
  const fee=vi.spyOn(adapter.connection,'getFeeForMessage').mockResolvedValue({context:{slot:1},value:5000});
  const sign=vi.spyOn(signer,'sign');
  const i:Intent={id:'native',epoch_id:null,kind:'operations',asset:SOL,amount:'100',status:'planned',expected:{inputAsset:SOL,from:'operations',maxFee:'5000',maxTotalCost:'5000',costAccount:'reserve',transfers:[{owner:recipient,destination:recipient,amount:'100',entitlements:[]}]}};
  await expect(adapter.prepare(i,async()=>{expect(fee).toHaveBeenCalled();throw Error('approval revoked');})).rejects.toThrow('approval revoked');
  expect(sign).not.toHaveBeenCalled();
 });
 it('requires authentication and records idempotent original-signature recovery without signed payloads',async()=>{
  await intent('recover','TOKEN');await runIntent(engine,chain,'recover',lease);const original=await signature('recover');chain.expired=true;await runIntent(engine,chain,'recover',lease);chain.expired=false;
  const request={requestId:'request-1',intentId:'recover',signature:original,actor:'approved-operator',reason:'Archive now reports finality',evidenceReference:'archive:case-1'};
  await expect(recoverIntent(engine,chain,request,async()=>{throw Error('unauthorized');},lease)).rejects.toThrow('unauthorized');expect((await db.pool.query('SELECT * FROM execution_recoveries')).rowCount).toBe(0);
  const first=await recoverIntent(engine,chain,request,async()=>{},lease);const replay=await recoverIntent(engine,chain,request,async()=>{},lease);
  expect(first.status).toBe('finalized');expect(replay).toEqual(first);expect(first.reservationRetained).toBe(false);expect((await db.pool.query('SELECT * FROM execution_recoveries')).rowCount).toBe(1);expect(await db.balance(SOL,'reserve')).toBe(95000n);expect(JSON.stringify(first)).not.toMatch(/signed_payload|signedPayload|bytes|secret/);
  await expect(recoverIntent(engine,chain,{...request,signature:'different'},async()=>{},lease)).rejects.toThrow('different evidence');
 });
 it('accounts native fees for token intents without a false deficit, then detects real unexplained deficits',async()=>{
  await intent('token-fees','TOKEN');await runIntent(engine,chain,'token-fees',lease);
  const pending=await engine.reconcile([{asset:SOL,amount:'95000',slot:500001},{asset:'TOKEN',amount:'0',slot:500001}]);expect(pending.map(r=>r.state)).toEqual(['in_flight','in_flight']);expect((await db.pool.query('SELECT * FROM incidents')).rowCount).toBe(0);
  const real=await engine.reconcile([{asset:SOL,amount:'80000',slot:500001}]);expect(real[0].state).toBe('deficit');expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);
  await runIntent(engine,chain,'token-fees',lease,undefined,{recoveryOnly:true});const final=await engine.reconcile([{asset:SOL,amount:'95000',slot:500001},{asset:'TOKEN',amount:'0',slot:500001}]);expect(final.map(r=>r.state)).toEqual(['balanced','balanced']);
 });
 it('does not compare a pre-finality RPC observation against later ledger postings',async()=>{
  await intent('slot-race','TOKEN');await runIntent(engine,chain,'slot-race',lease);await runIntent(engine,chain,'slot-race',lease);
  const stale=await engine.reconcile([{asset:SOL,amount:'100000',slot:500000}]);expect(stale[0].state).toBe('stale_observation');expect((await db.pool.query('SELECT * FROM incidents')).rowCount).toBe(0);
  const fresh=await engine.reconcile([{asset:SOL,amount:'95000',slot:500001}]);expect(fresh[0].state).toBe('balanced');
 });
 it.each(['burn','operations'] as const)('actual %s preparation cannot treat the shared cost reserve as its transaction debit',async kind=>{
  const {adapter,signer,recipient}=actualAdapter(),mint=testAddress('cost-mint'),asset=kind==='burn'?mint:SOL;
  const i=await intent('actual-cost',asset,kind);i.expected.sourceTokenAccount=signer.publicKey.toBase58();i.expected.transfers=[{owner:recipient,destination:recipient,amount:'100',entitlements:[]}];
  await db.pool.query('UPDATE intents SET expected=$2 WHERE id=$1',[i.id,JSON.stringify(i.expected)]);engine=new Engine(db,'test');
  await runIntent(engine,adapter,i.id,lease);
  const stored=(await db.pool.query('SELECT *,amount::text FROM intents WHERE id=$1',[i.id])).rows[0] as Intent;
  expect(stored.expected.maxTotalCost).toBe('100000');expect(stored.expected.maxNativeCost).toBe('5000');expect(stored.expected.maxRent).toBe('0');expect(adapter.connection.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  const pending=await engine.reconcile([{asset:SOL,amount:'95000',slot:600}]);expect(pending[0].state).toBe('in_flight');expect(pending[0].maximumPendingDebit).toBe(kind==='burn'?'5000':'5100');
  const shortfall=await engine.reconcile([{asset:SOL,amount:'80000',slot:600}]);expect(shortfall[0].state).toBe('deficit');
  if(kind==='burn')await expect(engine.apply(stored,{status:'finalized',signature:await signature(i.id),slot:601,fee:'5000',rent:'1',burned:'100'},lease)).rejects.toThrow('transaction native cap');
 });
 it.each(['burn','operations'] as const)('legacy %s attempts retain a safe fee-only fallback',async kind=>{
  await legacyAttempt(await intent('legacy-safe',kind==='burn'?'TOKEN':SOL,kind));
  const result=(await engine.reconcile([{asset:SOL,amount:'80000',slot:600}]))[0];expect(result.state).toBe('deficit');expect(result.maximumPendingDebit).toBe(kind==='burn'?'5000':'5100');
 });
 it('actual SPL preparation includes only missing recipient ATA rent and rechecks cash after authorization',async()=>{
  const {adapter,signer}=actualAdapter(),mint=testAddress('cost-token'),existing=testAddress('existing-recipient'),missing=testAddress('missing-recipient');
  await db.tx(t=>db.move(t,'extra-capital',SOL,'external:test','reserve',10000000n));
  const i=await intent('actual-token-cost',mint);i.expected.decimals=6;i.expected.sourceTokenAccount=getAssociatedTokenAddressSync(new PublicKey(mint),signer.publicKey).toBase58();
  i.expected.transfers=[existing,missing].map(owner=>({owner,destination:adapter.destination(owner,mint),amount:'50',entitlements:[]}));
  await db.pool.query('UPDATE intents SET expected=$2 WHERE id=$1',[i.id,JSON.stringify(i.expected)]);
  vi.spyOn(adapter,'destinationStatus').mockImplementation(async owner=>({exists:owner===existing,valid:true,rent:owner===existing?0n:2039280n}));engine=new Engine(db,'test');
  await runIntent(engine,adapter,i.id,lease);const stored=(await db.pool.query('SELECT expected FROM intents WHERE id=$1',[i.id])).rows[0].expected;
  expect(stored).toMatchObject({maxTotalCost:'10100000',maxNativeCost:'2044280',maxRent:'2039280',requiredRent:'2039280'});
  expect((await engine.reconcile([{asset:SOL,amount:'8055720',slot:600}]))[0].state).toBe('in_flight');
  expect((await engine.reconcile([{asset:SOL,amount:'8055719',slot:600}]))[0].state).toBe('deficit');
  // Use the same prepared object at the guard boundary to model an available-balance reduction.
  const retry={...i,expected:{...i.expected,maxTotalCost:'10100000'}},sign=vi.spyOn(signer,'sign');
  await expect(adapter.prepare(retry,async()=>{retry.expected.maxTotalCost='5000';})).rejects.toThrow('rent/fee allowance insufficient');expect(sign).not.toHaveBeenCalled();
 });
 it('legacy token attempts without a transaction cost bound remain uncertain and paused',async()=>{
  await legacyAttempt(await intent('legacy-cost','TOKEN'));
  const report=(await engine.reconcile([{asset:SOL,amount:'95000',slot:600}]))[0];expect(report.state).toBe('cost_bound_unavailable');expect(report.maximumPendingDebit).toBeNull();expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);expect(await db.balance('TOKEN','reserve:legacy-cost')).toBe(100n);
 });
 it('a swap quote that ages during authorization is rejected before signing',async()=>{
  const {adapter,signer,recipient}=actualAdapter(),clock=vi.spyOn(Date,'now');let now=100000;clock.mockImplementation(()=>now);
  try{
   adapter.swapBuilder=async i=>{i.expected={...i.expected,quotedAt:now,maxRent:'0',requiredRent:'2039280',lastValidHeight:1000};return new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:testAddress('quote-block'),instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(recipient),lamports:1n})]}).compileToV0Message());};
   const sign=vi.spyOn(signer,'sign'),i:Intent={id:'aged-quote',epoch_id:null,kind:'swap',asset:SOL,amount:'100',status:'planned',expected:{inputAsset:SOL,outputAsset:testAddress('quote-output'),from:'budget',costAccount:'reserve',maxFee:'5000',maxTotalCost:'10000000'}};
   await expect(adapter.prepare(i,async()=>{now+=15000;})).rejects.toThrow('quote stale at signing');expect(sign).not.toHaveBeenCalled();
  }finally{clock.mockRestore();}
 });
 it.each([true,false])('Jupiter build separates temporary WSOL funding from output ATA rent (existing=%s)',async existing=>{
  const {adapter,signer}=actualAdapter(),payer=signer.publicKey,mint=new PublicKey(testAddress('jupiter-cost-mint'));
  const source=getAssociatedTokenAddressSync(new PublicKey(WSOL),payer),destination=getAssociatedTokenAddressSync(mint,payer);
  const u64=(n:bigint)=>({toArrayLike:(_Type:unknown,_endian:unknown,length:number)=>{const b=Buffer.alloc(length);b.writeBigUInt64LE(n);return b;}});
  const swap=new TransactionInstruction({programId:program.programId,keys:[TOKEN_PROGRAM_ID,payer,source,destination,program.programId,mint,program.programId].map((pubkey,k)=>({pubkey,isSigner:k===1,isWritable:[2,3].includes(k)})),data:program.coder.instruction.encode('route',{routePlan:[{swap:{raydium:{}},percent:100,inputIndex:0,outputIndex:1}],inAmount:u64(100n),quotedOutAmount:u64(200n),slippageBps:100,platformFeeBps:0})});
  const jupiter=new JupiterClient('local-mock-only');vi.spyOn(jupiter,'build').mockResolvedValue({inputMint:WSOL,outputMint:mint.toBase58(),inAmount:'100',outAmount:'200',otherAmountThreshold:'198',swapMode:'ExactIn',slippageBps:100,priceImpactPct:'0.001',routePlan:[{}],swapInstruction:{programId:program.programId.toBase58(),accounts:swap.keys.map(k=>({...k,pubkey:k.pubkey.toBase58()})),data:swap.data.toString('base64')},blockhashWithMetadata:{blockhash:Array(32).fill(0),lastValidBlockHeight:1000}});
  const mintData=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
  const accountData=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner:payer,amount:0n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},accountData);
  const info=(data:Buffer)=>({owner:TOKEN_PROGRAM_ID,data,lamports:2039280,executable:false,rentEpoch:0});
  vi.mocked(adapter.connection.getAccountInfo).mockImplementation(async key=>key.equals(mint)?info(mintData):null);
  vi.spyOn(adapter.connection,'getMultipleAccountsInfo').mockResolvedValue(swap.keys.map((_,k)=>existing&&k===3?info(accountData):null));
  adapter.swapBuilder=i=>safeJupiterBuild(adapter.connection,jupiter,payer,i,[],[mint.toBase58()]);
  await db.tx(t=>db.move(t,'jupiter-capital',SOL,'external:test','reserve',10000000n));
  const i=await intent('jupiter-rent',SOL,'buyback');i.expected={...i.expected,outputAsset:mint.toBase58(),to:payer.toBase58(),maxTotalCost:'10000000'};
  const signed=await adapter.prepare(i,async()=>{}),tx=VersionedTransaction.deserialize(signed.bytes);
  expect(signed.approvedPlan).toMatchObject({maxRent:existing?'0':'2039280',requiredRent:existing?'2039280':'4078560',maxNativeCost:existing?'5000':'2044280'});
  expect(tx.message.compiledInstructions.filter(ix=>tx.message.staticAccountKeys[ix.programIdIndex].equals(ASSOCIATED_TOKEN_PROGRAM_ID))).toHaveLength(existing?1:2);
  // Cover final authorization reducing cash to the net cost: upfront WSOL rent still must fit.
  const sign=vi.spyOn(signer,'sign'),retry:Intent={...i,expected:{...i.expected,maxTotalCost:'10000000'}};
  await expect(adapter.prepare(retry,async()=>{retry.expected.maxTotalCost=String(retry.expected.maxNativeCost);})).rejects.toThrow('rent/fee allowance insufficient');expect(sign).not.toHaveBeenCalled();
  // A pre-upgrade signed buyback can still recover from finalized message evidence.
  const {maxNativeCost:_,maxRent:__,requiredRent:___,...legacyPlan}=i.expected;i.expected=legacyPlan;await legacyAttempt(i,signed);
  const keys=tx.message.staticAccountKeys,destinationIndex=keys.findIndex(k=>k.equals(destination)),sourceIndex=keys.findIndex(k=>k.equals(source)),preBalances=keys.map(()=>1),postBalances=keys.map(()=>1),rent=existing?0:2039280;
  preBalances[0]=10000000;postBalances[0]=10000000-100-5000-rent;preBalances[sourceIndex]=0;postBalances[sourceIndex]=0;preBalances[destinationIndex]=existing?2039280:0;postBalances[destinationIndex]=2039280;
  const token=(amount:string)=>({accountIndex:destinationIndex,mint:mint.toBase58(),owner:payer.toBase58(),uiTokenAmount:{amount,decimals:6,uiAmount:Number(amount)/1000000,uiAmountString:String(Number(amount)/1000000)}});
  vi.mocked(adapter.inspect).mockRestore();vi.mocked(adapter.connection.getAccountInfo).mockReset().mockResolvedValue(null);
  vi.spyOn(adapter.connection,'getSignatureStatuses').mockResolvedValue({context:{slot:700},value:[{slot:600,confirmations:null,err:null,confirmationStatus:'finalized'}]});
  vi.spyOn(adapter.connection,'getParsedTransaction').mockResolvedValue({slot:600,blockTime:1,version:0,transaction:{signatures:[signed.signature],message:{recentBlockhash:signed.blockhash,accountKeys:keys.map((pubkey,k)=>({pubkey,signer:k===0,writable:true,source:'transaction'})),instructions:[]}},meta:{err:null,fee:5000,preBalances,postBalances,innerInstructions:[],preTokenBalances:existing?[token('0')]:[],postTokenBalances:[token('200')],logMessages:[]}} as never);
  engine=new Engine(db,'test');await db.pool.query('UPDATE control SET paused=true');await runIntent(engine,adapter,i.id,lease,undefined,{recoveryOnly:true});await runIntent(engine,adapter,i.id,lease,undefined,{recoveryOnly:true});
  expect((await status(i.id)).status).toBe('finalized');expect(await db.balance(SOL,'reserve')).toBe(10100000n-5000n-BigInt(rent));expect(await db.balance(mint.toBase58(),'burn-units:'+i.id)).toBe(200n);expect((await status('burn:'+i.id)).status).toBe('planned');expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);expect(adapter.connection.getAccountInfo).not.toHaveBeenCalled();expect(adapter.broadcast).not.toHaveBeenCalled();
 });
 it('recovers the original legacy payout and its ATA rent after the recipient has closed the account',async()=>{
  const {adapter,signer,recipient}=actualAdapter(),mint=testAddress('legacy-payout-mint');
  await db.tx(t=>db.move(t,'legacy-extra-capital',SOL,'external:test','reserve',10000000n));
  const i=await intent('legacy-payout',mint,'payout'),source=getAssociatedTokenAddressSync(new PublicKey(mint),signer.publicKey).toBase58(),destination=adapter.destination(recipient,mint);
  i.expected={...i.expected,maxTotalCost:'10100000',decimals:6,sourceTokenAccount:source,transfers:[{owner:recipient,destination,amount:'100',entitlements:[]}]};
  vi.spyOn(adapter,'destinationStatus').mockResolvedValue({exists:false,valid:true,rent:2039280n});const signed=await adapter.prepare(i,async()=>{});
  const {maxNativeCost:_,maxRent:__,requiredRent:___,...legacyPlan}=i.expected;i.expected=legacyPlan;await legacyAttempt(i,signed);
  const original=VersionedTransaction.deserialize(signed.bytes),keys=original.message.staticAccountKeys,payerIndex=0,destinationIndex=keys.findIndex(k=>k.toBase58()===destination),sourceIndex=keys.findIndex(k=>k.toBase58()===source);
  const preBalances=keys.map(()=>1),postBalances=keys.map(()=>1);preBalances[payerIndex]=10100000;postBalances[payerIndex]=8055720;preBalances[destinationIndex]=0;postBalances[destinationIndex]=2039280;
  const token=(accountIndex:number,owner:string,amount:string)=>({accountIndex,mint,owner,programId:TOKEN_PROGRAM_ID.toBase58(),uiTokenAmount:{amount,decimals:6,uiAmount:Number(amount)/1000000,uiAmountString:String(Number(amount)/1000000)}});
  vi.mocked(adapter.inspect).mockRestore();vi.mocked(adapter.connection.getAccountInfo).mockReset().mockResolvedValue(null);
  vi.spyOn(adapter.connection,'getSignatureStatuses').mockResolvedValue({context:{slot:700},value:[{slot:600,confirmations:null,err:null,confirmationStatus:'finalized'}]});
  vi.spyOn(adapter.connection,'getParsedTransaction').mockResolvedValue({slot:600,blockTime:1,version:'legacy',transaction:{signatures:[signed.signature],message:{recentBlockhash:signed.blockhash,accountKeys:keys.map((pubkey,k)=>({pubkey,signer:k===0,writable:true,source:'transaction'})),instructions:[{program:'spl-token',programId:TOKEN_PROGRAM_ID,parsed:{type:'transferChecked',info:{source,destination,mint,tokenAmount:{amount:'100',decimals:6}}}}]}},meta:{err:null,fee:5000,preBalances,postBalances,innerInstructions:[],preTokenBalances:[token(sourceIndex,signer.publicKey.toBase58(),'100')],postTokenBalances:[token(sourceIndex,signer.publicKey.toBase58(),'0'),token(destinationIndex,recipient,'100')],logMessages:[]}} as never);
  engine=new Engine(db,'test');const observed=await adapter.inspect(i,signed);expect(observed.rent).toBe('2039280');expect(observed.nativeCostEvidence?.rentAccounts).toEqual([{address:destination,mint,owner:recipient,lamports:'2039280'}]);
  await expect(engine.apply(i,{...observed,nativeCostEvidence:{...observed.nativeCostEvidence!,messageHash:'different-message'}},lease)).rejects.toThrow('original signed message');expect(await db.balance(mint,i.expected.from)).toBe(100n);
  await db.pool.query("UPDATE control SET paused=true; UPDATE intents SET status='needs_review' WHERE id='legacy-payout'; UPDATE attempts SET status='needs_review' WHERE intent_id='legacy-payout'");
  const request={requestId:'legacy-rent-recovery',intentId:i.id,signature:signed.signature,actor:'approved-operator',reason:'Original finalized payout located after recipient account closure',evidenceReference:'archive:original-signature'};
  expect((await recoverIntent(engine,adapter,request,async()=>{},lease)).status).toBe('finalized');expect((await recoverIntent(engine,adapter,request,async()=>{},lease)).status).toBe('finalized');
  expect(await db.balance(SOL,'reserve')).toBe(8055720n);expect(await db.balance(mint,i.expected.from)).toBe(0n);expect((await db.pool.query('SELECT * FROM chain_receipts')).rowCount).toBe(1);expect((await db.pool.query('SELECT * FROM attempts')).rowCount).toBe(1);expect(adapter.connection.getAccountInfo).not.toHaveBeenCalled();expect(adapter.broadcast).not.toHaveBeenCalled();
 });
});
