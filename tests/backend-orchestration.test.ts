import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Store,type Lease} from '../packages/db/store.js';
import {migrate} from '../packages/db/migrate.js';
import {Engine} from '../packages/core/engine.js';
import {fixtures} from './fixtures/synthetic.js';
import {DemoChain,testAddress} from '../packages/integrations/demo.js';
import {defaultPolicy,hash,SOL} from '../packages/core/model.js';
import {selectBasket,snapshot,type Candidate} from '../packages/core/selection.js';
import {AutomaticSelectionService} from '../packages/integrations/automatic-selection.js';
import {commitFreshEpoch} from '../apps/worker/commit.js';
import {controlledExecutionTick,executionAuthorizer} from '../apps/worker/control.js';
import {runIntent} from '../apps/worker/runner.js';
import {exportEpoch} from '../apps/api/queries.js';
import {loadConfig} from '../packages/core/config.js';
import {assertProspectiveApproval,type Approval} from '../packages/core/approval.js';
import {backendOverview} from '../apps/api/backend-overview.js';
import {MarketDataService} from '../packages/integrations/market-data.js';
import {DeveloperAccounting} from '../packages/core/developer.js';
import {developerPolicy} from '../packages/core/developer-config.js';
import {createServer} from '../apps/api/server.js';
import {hostedRead} from '../apps/api/hosted.js';
import {clientKey,proxyHeaders,takeRateLimit} from '../apps/api/proxy.js';
import {admitFundedMint} from '../packages/core/admission.js';

const base=process.env.TEST_DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test';
const admin=new Store(base),schema='orchestration_'+Date.now()+'_'+process.pid;
let db:Store,engine:Engine,chain:DemoChain,lease:Lease,f=fixtures(),serial=0;
const policy=()=>({...defaultPolicy,version:2 as const,rankingBasis:'circulating_market_cap' as const,snapshotMethod:'finalized_full_census' as const,exclusions:f.policy.exclusions});
const candidates=():Candidate[]=>Array.from({length:12},(_,i)=>({...f.candidates[0],mint:testAddress('automatic-'+i),pool:testAddress('automatic-pool-'+i),symbol:'DUP',rankValue:String(100000-i),at:Date.now()}));
const approval=():Approval=>({approvalId:'local-test-approval',approvedBy:'test',approvedAt:new Date(Date.now()-10000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),ourMint:f.mint,ourPool:f.pool,treasury:f.treasury,operations:testAddress('operations'),feeSender:f.sender,emberFeeClaimer:testAddress('claimer'),historyStartSignature:'x'.repeat(80),maxRoundLamports:'1000000000',maxDayLamports:'5000000000',approvedMints:[],approvedPrograms:[f.candidates[0].program],expectedFundingRoute:{pool:f.pool},policy:policy(),assetAdmission:{version:'ember-provenance-v1'}});
const args=(id:string)=>({id,policy:policy(),snapshot:snapshot({...f.snapshot,policy:policy(),capturedAt:Date.now()}),funding:1000000000n,cost:20000000n,price:{...f.price,at:Date.now()},minReserve:100000000n,maxRound:1000000000n,maxDay:5000000000n,treasury:f.treasury,ourMint:f.mint,routeUnchanged:true,lease});
async function seed(){for(const kind of ['seed','creator_fee'] as const)await engine.ingest({signature:'funding-'+serial++,instruction:'0',asset:SOL,amount:kind==='seed'?'300000000':'3000000000',destination:f.treasury,source:f.sender,slot:500000,finalized:true,error:null,pool:f.pool,publishedPool:f.pool,kind,attributionVerified:true,rawEvidence:{testOnly:true}},{pool:f.pool,treasury:f.treasury,feeSender:f.sender});}
async function commit(id='first',rows=candidates()) {const service=new AutomaticSelectionService(policy(),f.mint,async budget=>({candidates:rows.map(x=>({...x,routeBudget:budget.toString()})),complete:true,rawCatalogueHash:hash(rows),observedAt:Date.now()}));await commitFreshEpoch(engine,service,args(id),async()=>{});return service;}
const realConfig=()=>({...loadConfig({MODE:'prelaunch',MASTER_PAUSE:'false'}),MODE:'live' as const,BROADCAST_ENABLED:true,TREASURY:f.treasury});
beforeAll(async()=>{await admin.pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options','-c search_path='+schema);db=new Store(url.toString());await migrate(db);await db.bindMode('prelaunch');chain=new DemoChain(db);await chain.init();});
beforeEach(async()=>{await db.pool.query('TRUNCATE documents,incoming_transfers,cursors,epochs,intents,attempts,entitlements,payout_batches,batch_items,ledger_events,postings,leases,jobs,incidents,operator_audit,chain_receipts,demo_chain,assets,api_rate_limits CASCADE');await db.pool.query("UPDATE control SET paused=false,reason='isolated test'");f=fixtures();engine=new Engine(db,'demo');chain=new DemoChain(db);lease=(await db.lease('integration-test',300))!;});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
afterAll(async()=>{await db?.close();await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);await admin.close();});

it('commits a new current top ten each round, admits a newly discovered mint, and preserves the first epoch across restart',async()=>{
 await seed();let rows=candidates();const provider=vi.fn(async(budget:bigint)=>({candidates:rows.map(x=>({...x,routeBudget:budget.toString(),at:Date.now()})),complete:true,rawCatalogueHash:hash(rows),observedAt:Date.now()}));
 let service=new AutomaticSelectionService(policy(),f.mint,provider);await commitFreshEpoch(engine,service,args('first'),async()=>{});
 const first=await exportEpoch(db,'first'),frozen=hash(first.basket),old=(first.basket as any).selected.map((x:Candidate)=>x.mint);
 rows=[...rows.map((x,i)=>({...x,rankValue:i===0?'1':x.rankValue})),{...rows[0],mint:testAddress('newly-discovered'),pool:testAddress('new-pool'),rankValue:'999999'}];
 service=new AutomaticSelectionService(policy(),f.mint,provider);await commitFreshEpoch(engine,service,args('second'),async()=>{});
 const second=await exportEpoch(db,'second'),next=(second.basket as any).selected.map((x:Candidate)=>x.mint);
 expect(next).toContain(testAddress('newly-discovered'));expect(next).not.toContain(old[0]);expect(hash((await exportEpoch(db,'first')).basket)).toBe(frozen);
 expect(provider.mock.calls.map(x=>x[0])).toEqual([78400000n,78400000n]);expect((await db.pool.query("SELECT count(*)::int AS n FROM intents WHERE kind='swap'")).rows[0].n).toBe(20);
 const intent=(await db.pool.query("SELECT *,amount::text FROM intents WHERE epoch_id='second' AND expected->>'outputAsset'=$1",[testAddress('newly-discovered')])).rows[0];
 expect((await admitFundedMint(db,intent,approval())).mint).toBe(testAddress('newly-discovered'));expect(approval().approvedMints).toEqual([]);
});
it.each(['liquidityMicroUsd','volumeMicroUsd','holders','censusComplete','program','poolVerified','provenanceVerified','graduated','createdAt','mintAuthority','freezeAuthority','extensions','category','rankBasis','at','routeViable'] as const)('Engine.plan rechecks %s even when the caller reuses a ready historical basket',async field=>{
 const rows=candidates().slice(0,10).map(x=>({...x,routeBudget:'78400000'}));const basket=selectBasket(rows,policy(),f.mint,true);
 const bad:Record<string,unknown>={liquidityMicroUsd:'0',volumeMicroUsd:'0',holders:0,censusComplete:false,program:'unsupported',poolVerified:false,provenanceVerified:false,graduated:false,createdAt:Date.now(),mintAuthority:testAddress('authority'),freezeAuthority:testAddress('freeze'),extensions:['transferHook'],category:'stablecoin',rankBasis:'undocumented',at:0,routeViable:false};
 (basket.universe[0] as unknown as Record<string,unknown>)[field]=bad[field];
 await expect(engine.plan({...args('blocked'),basket})).rejects.toThrow();expect((await db.pool.query('SELECT id FROM epochs')).rowCount).toBe(0);
});
it('blocks prospective below-USD50 policies while preserving immutable legacy policy documents',async()=>{
 const a=approval();a.policy.minBasketMicroUsd='25000000';expect(()=>assertProspectiveApproval(a)).toThrow('USD 50');
 const legacy={...f.policy,minBasketMicroUsd:'25000000'},id=await db.doc('policy',legacy);expect(await db.document(id)).toEqual(legacy);expect(defaultPolicy.minBasketMicroUsd).toBe('50000000');
});
it('worker orchestration recovers original finality under invalid approval and never starts unrelated unsigned work',async()=>{
 await seed();await commit();const id=(await db.pool.query("SELECT id FROM intents WHERE kind='swap' ORDER BY id LIMIT 1")).rows[0].id;
 await runIntent(engine,chain,id,lease);const prepared=vi.spyOn(chain,'prepare'),badApproval=vi.fn(async()=>{throw Error('expired');});
 await controlledExecutionTick(engine,chain,'integration-test',realConfig(),{approval:badApproval,fundingRoute:async()=>({pool:f.pool}),conditions:async()=>{}});
 expect((await db.pool.query('SELECT status FROM intents WHERE id=$1',[id])).rows[0].status).toBe('finalized');expect(prepared).not.toHaveBeenCalled();expect((await db.pool.query('SELECT id FROM attempts')).rowCount).toBe(1);
});
it('worker checks funding-route changes before signing, and disabled broadcast remains recovery-only',async()=>{
 await seed();await commit();const prepared=vi.spyOn(chain,'prepare'),a=approval(),control={approval:async()=>a,fundingRoute:async()=>({pool:'changed'}),conditions:async()=>{}};
 await controlledExecutionTick(engine,chain,'integration-test',realConfig(),control);expect(prepared).not.toHaveBeenCalled();expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);
 await db.pool.query('UPDATE control SET paused=false');await controlledExecutionTick(engine,chain,'integration-test',{...realConfig(),BROADCAST_ENABLED:false},{...control,fundingRoute:async()=>a.expectedFundingRoute});expect(prepared).not.toHaveBeenCalled();
});
it('rechecks effective approval after asynchronous execution conditions',async()=>{
 const a=approval();let changed=false;const approve=executionAuthorizer(engine,realConfig(),{approval:async()=>changed?{...a,approvalId:'revoked-replaced'}:a,fundingRoute:async()=>a.expectedFundingRoute,conditions:async()=>{changed=true;}});
 await expect(approve({kind:'burn'} as never)).rejects.toThrow('approval changed');
});
it('runIntent alone atomically releases unused developer payout cost after finalized transfer',async()=>{
 await db.tx(async t=>{await db.lock(t);await db.move(t,'receipt',SOL,'external:fee','revenue',500000000n);await db.move(t,'ops',SOL,'revenue','operations:test',500000000n);});
 const p={...developerPolicy(loadConfig({})),enabled:true,treasury:f.treasury,destination:testAddress('developer')},id=await new DeveloperAccounting(db,'demo').schedule({policy:p,lease});expect(id).not.toBeNull();
 await runIntent(engine,chain,id!,lease);await runIntent(engine,chain,id!,lease);const row=(await db.pool.query('SELECT expected,status FROM intents WHERE id=$1',[id])).rows[0];expect(row.status).toBe('finalized');expect(await db.balance(SOL,row.expected.costAccount)).toBe(0n);
 expect((await new DeveloperAccounting(db,'demo').summary(p)).finalizedDevPayments).toBe('399900000');
});
it('local overview exposes selection, funded history and actual allocation; stale selection cannot authorize purchases',async()=>{
 await seed();const service=await commit();await db.doc('observation',service.current());
 const raw=JSON.parse(readFileSync(new URL('./fixtures/ember-catalogue-2026-09-23.json',import.meta.url),'utf8')),configs=JSON.parse(readFileSync(new URL('./fixtures/ember-configs-2026-09-23.json',import.meta.url),'utf8'));
 const source=new MarketDataService(async url=>Response.json(String(url).endsWith('/configs')?configs:raw));
 const result=await backendOverview(db,loadConfig({MODE:'prelaunch'}),{},source);
 expect(result.selection).toMatchObject({state:'ready',selectedCount:10,commitmentsAllowed:false});expect(result.fundedBasket).toMatchObject({status:'funded',epochId:'first'});expect(result.accounting).toMatchObject({status:'available',unit:'lamports',opsAllocation:'98000000',creatorRevenue:'3000000000'});
 await db.doc('observation',{...service.current(),observedAt:Date.now()-181000});const stale=await backendOverview(db,loadConfig({MODE:'prelaunch'}),{},source);expect(stale.selection.state).toBe('blocked');expect(stale.fundedBasket.members).toHaveLength(10);
 await expect(backendOverview(db,loadConfig({MODE:'demo'}),{},source)).rejects.toThrow('non-production');
});
it('hosted overview uses authoritative backend with search parameters and rejects demo substitution',async()=>{
 const value={schemaVersion:1,project:{name:'EMBER10',dataMode:'real'},markets:[],selection:{selectedCount:10},fundedBasket:{epochId:'real-epoch'}};
 const fetcher=vi.fn(async(url:URL)=>Response.json(url.pathname==='/api/status'?{mode:'live'}:value));vi.stubGlobal('fetch',fetcher);
 const response=await hostedRead(new Request('https://edge.example/api/overview?q=DUP&offset=3&limit=10&view=selection&secret=hidden'),'https://ledger.example');expect(response.status).toBe(200);expect((await response.json()).fundedBasket.epochId).toBe('real-epoch');expect(String(fetcher.mock.calls[1][0])).toBe('https://ledger.example/api/overview?limit=10&q=DUP&offset=3&view=selection');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({mode:'demo'})));expect((await hostedRead(new Request('https://edge.example/api/overview'),'https://ledger.example')).status).toBe(503);
});
it('trusted proxy identity is signed, request-bound, time-bound and independent of caller forwarding headers',async()=>{
 const secret='x'.repeat(40),url=new URL('https://ledger.example/api/status'),request=new Request('https://edge.example/api/status',{headers:{'x-vercel-forwarded-for':'203.0.113.7','x-forwarded-for':'1.2.3.4'}}),signed=proxyHeaders(request,url,secret,'1');
 expect(proxyHeaders(request,url,secret,'')).toEqual({});const peer=clientKey('127.0.0.1',{},'GET','/api/status',secret);
 expect(clientKey('127.0.0.1',{'x-forwarded-for':'8.8.8.8','x-real-ip':'9.9.9.9'},'GET','/api/status',secret)).toBe(peer);
 const verified=clientKey('127.0.0.1',signed,'GET','/api/status',secret);expect(verified).not.toBe(peer);
 expect(clientKey('127.0.0.1',{...signed,'x-ember-client':'203.0.113.8'},'GET','/api/status',secret)).toBe(peer);expect(clientKey('127.0.0.1',signed,'GET','/api/epochs',secret)).toBe(peer);expect(clientKey('127.0.0.1',signed,'GET','/api/status',secret,Date.now()+60000)).toBe(peer);
 const other=new Store((db.pool.options as any).connectionString);try{expect(await takeRateLimit(db,verified,Date.now(),1)).toBe(true);expect(await takeRateLimit(other,verified,Date.now(),1)).toBe(false);}finally{await other.close();}
});
it('operator recovery and expense endpoints require authentication and reject user-supplied terminal outcomes',async()=>{
 const c=loadConfig({MODE:'prelaunch',OPERATOR_TOKEN:'operator-secret-test'.repeat(3)}),app=createServer(db,c);
 for(const url of ['/operator/recovery','/operator/expenses','/operator/expenses/settlement'])expect((await app.inject({method:'POST',url,payload:{finalized:true}})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:'/operator/recovery',headers:{authorization:'Bearer '+c.OPERATOR_TOKEN},payload:{finalized:true}})).statusCode).toBeGreaterThanOrEqual(400);await app.close();
});
