import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {Store,type Lease} from '../packages/db/store.js';
import {migrate} from '../packages/db/migrate.js';
import {Engine,type Intent,type Signed} from '../packages/core/engine.js';
import {DemoChain,testAddress,testKey} from '../packages/integrations/demo.js';
import {FileTestSigner,SolanaChain} from '../packages/integrations/solana.js';
import {loadConfig} from '../packages/core/config.js';
import {SOL} from '../packages/core/model.js';
import {runIntent,tick} from '../apps/worker/runner.js';
import {recoverIntent} from '../apps/worker/recovery.js';
const base=process.env.TEST_DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test';
const admin=new Store(base),schema='execution_'+Date.now();
let db:Store,engine:Engine,chain:ControlledChain,lease:Lease;
class ControlledChain extends DemoChain {
 prepared:string[]=[]; signed:string[]=[]; beforeSigning?:()=>Promise<void>;
 override async prepare(i:Intent,guard?:()=>Promise<void>):Promise<Signed>{
  this.prepared.push(i.id);const unsigned=await super.prepare(i);await this.beforeSigning?.();await guard?.();this.signed.push(i.id);
  return {...unsigned,approvedPlan:{...i.expected,maxTotalCost:'10000'}};
 }
}
async function intent(id:string,asset=SOL){
 const i:Intent={id,epoch_id:null,kind:'operations',asset,amount:'100',status:'planned',expected:{inputAsset:asset,from:'reserve:'+id,maxFee:'5000',costAccount:'reserve',sourceTokenAccount:'source',transfers:[{owner:'recipient',destination:'recipient',amount:'100',entitlements:[]}]}};
 await db.tx(async t=>{await db.lock(t);await db.move(t,'seed:'+id,asset,'external:test','reserve:'+id,100n);await engine.addIntent(t,i);});return i;
}
async function status(id:string){return (await db.pool.query('SELECT status,retry_count,next_attempt_at,last_attempt_at FROM intents WHERE id=$1',[id])).rows[0];}
async function signature(id:string){return (await db.pool.query('SELECT signature FROM attempts WHERE intent_id=$1',[id])).rows[0].signature as string;}
beforeAll(async()=>{await admin.pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options','-c search_path='+schema);db=new Store(url.toString());await migrate(db);await db.bindMode('demo');chain=new ControlledChain(db);await chain.init();});
beforeEach(async()=>{await db.pool.query('TRUNCATE intents,attempts,execution_recoveries,ledger_events,postings,leases,jobs,incidents,operator_audit,chain_receipts,demo_chain,documents CASCADE');await db.pool.query("UPDATE control SET paused=false,reason='test'");engine=new Engine(db,'demo');chain=new ControlledChain(db);lease=(await db.lease('execution',300))!;await db.tx(t=>db.move(t,'capital',SOL,'external:test','reserve',100000n));});
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
});
