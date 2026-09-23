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
import {DeveloperAccounting,assertDeveloperPayoutAuthorized} from '../packages/core/developer.js';
import {developerPolicy} from '../packages/core/developer-config.js';
import {createServer} from '../apps/api/server.js';
import {hostedRead} from '../apps/api/hosted.js';
import {clientKey,proxyHeaders,takeRateLimit} from '../apps/api/proxy.js';
import {admitFundedMint} from '../packages/core/admission.js';
import {Connection,PublicKey} from '@solana/web3.js';
import {MAINNET_GENESIS} from '../packages/core/model.js';
import {status as apiStatus,transparency} from '../apps/api/queries.js';

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
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
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
it('a funding route change during asynchronous evidence validation blocks signing',async()=>{
 const a=approval();let route=a.expectedFundingRoute;
 const authorize=executionAuthorizer(engine,realConfig(),{approval:async()=>a,conditions:async()=>{route={pool:'changed-after-evidence'};},fundingRoute:async()=>route});
 await expect(authorize({kind:'swap'} as never)).rejects.toThrow('funding route changed');expect((await db.pool.query('SELECT paused FROM control')).rows[0].paused).toBe(true);
});
it('public discovery status follows current observed-market records and does not return the full catalogue',async()=>{
 await db.doc('observation',{type:'observed_market',status:'ready',fetchedAt:new Date().toISOString(),normalized:{coverage:{uniqueMints:3000},evidenceHash:'abc',markets:[{private:'not-needed-in-status'}]}});
 const value=await apiStatus(db,loadConfig({}));expect(value.discoveryStale).toBe(false);expect(value.discovery).toMatchObject({status:'ready',coverage:{uniqueMints:3000}});expect(JSON.stringify(value)).not.toContain('not-needed-in-status');
});
it('partial automatic evidence remains an explicit unknown asset check instead of disappearing',async()=>{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/ember-catalogue-2026-09-23.json',import.meta.url),'utf8')),configs=JSON.parse(readFileSync(new URL('./fixtures/ember-configs-2026-09-23.json',import.meta.url),'utf8'));
 const mint=raw.markets[0].mint,source=new MarketDataService(async url=>Response.json(String(url).endsWith('/configs')?configs:raw));
 const service=new AutomaticSelectionService(policy(),f.mint,async()=>({candidates:[{...candidates()[0],mint,evidenceFailures:['Automatic metrics provider is not configured.']}],complete:false,rawCatalogueHash:'catalogue',observedAt:Date.now()}));
 await db.doc('observation',await service.read(1n));const value=await backendOverview(db,loadConfig({}),{query:mint},source);
 expect(value.markets[0].reasons).toContainEqual({code:'verification_unavailable',state:'unknown',label:'Automatic metrics provider is not configured.'});expect(value.selection.commitmentsAllowed).toBe(false);expect(value.accounting.status).toBe('unavailable');
});
it('public epoch export preserves attribution while withholding raw credentials and signed payloads',async()=>{
 await seed();await commit();await db.tx(t=>db.event(t,'private-provider-response','audit',[],{signature:'public-proof',slot:500001,raw:{authorization:'private-credential'},signed_payload:'signed-secret-payload'},'first'));
 const value=await exportEpoch(db,'first'),text=JSON.stringify(value);expect(text).not.toContain('private-credential');expect(text).not.toContain('signed-secret-payload');expect(text).toContain('public-proof');
});
it('operator ledger writes require actual mainnet genesis, successful metadata and the requested signature',async()=>{
 const c={...realConfig(),OPERATOR_TOKEN:'test-operator-token'.repeat(3)},app=createServer(db,c),signature='A'.repeat(88),headers={authorization:'Bearer '+c.OPERATOR_TOKEN};
 const genesis=vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue('devnet'),parsed=vi.spyOn(Connection.prototype,'getParsedTransaction');
 expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(503);expect(parsed).not.toHaveBeenCalled();
 genesis.mockResolvedValue(MAINNET_GENESIS);parsed.mockResolvedValue({slot:500000,meta:null,transaction:{signatures:[signature],message:{instructions:[],accountKeys:[]}}} as never);
 expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(503);
 parsed.mockResolvedValue({slot:500000,meta:{err:null,innerInstructions:[]},transaction:{signatures:['wrong-signature'],message:{instructions:[],accountKeys:[]}}} as never);
 expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(503);expect((await db.pool.query('SELECT id FROM incoming_transfers')).rowCount).toBe(0);await app.close();
});
it('expense settlement endpoint fetches chain proof and rejects double accounting rather than accepting supplied outcomes',async()=>{
 const c={...realConfig(),OPERATOR_TOKEN:'test-operator-token'.repeat(3)},app=createServer(db,c),headers={authorization:'Bearer '+c.OPERATOR_TOKEN},signature='B'.repeat(88),payee=testAddress('verified-vendor');
 await db.tx(async t=>{await db.lock(t);await db.move(t,'fee',SOL,'external:fee','revenue',100000000n);await db.move(t,'allocation',SOL,'revenue','operations:api',100000000n);});
 const expense=await app.inject({method:'POST',url:'/operator/expenses',headers,payload:{id:'api-invoice',amountLamports:'10000000',costAllowanceLamports:'1000',payee,description:'Reviewed provider invoice',evidenceReference:'invoice-reference'}});expect(expense.statusCode).toBe(200);
 vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue(MAINNET_GENESIS);
 vi.spyOn(Connection.prototype,'getParsedTransaction').mockResolvedValue({slot:500001,meta:{err:null,fee:1000,preBalances:[100000000,0],postBalances:[89999000,10000000],innerInstructions:[]},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:new PublicKey(f.treasury)},{pubkey:new PublicKey(payee)}],instructions:[{program:'system',parsed:{type:'transfer',info:{source:f.treasury,destination:payee,lamports:10000000}}}]}}} as never);
 const request={method:'POST' as const,url:'/operator/expenses/settlement',headers,payload:{expenseId:'api-invoice',signature,instruction:'0'}};
 expect((await app.inject({...request,payload:{...request.payload,finalized:true}})).statusCode).toBe(400);
 expect((await app.inject(request)).statusCode).toBe(200);expect((await app.inject(request)).statusCode).toBe(200);
 expect((await db.pool.query('SELECT amount::text,fee::text FROM operating_expense_payments')).rows).toEqual([{amount:'10000000',fee:'1000'}]);await app.close();
});
it('a persisted pause blocks new holder reservations inside the ledger transaction while preserving existing credits',async()=>{
 await seed();await commit();const row=(await db.pool.query("SELECT id,expected FROM intents WHERE kind='swap' LIMIT 1")).rows[0];await runIntent(engine,chain,row.id,lease);await runIntent(engine,chain,row.id,lease);
 const asset=candidates().find(x=>x.mint===row.expected.outputAsset)!,before=await db.balance(asset.mint,'liabilities');await db.pool.query('UPDATE control SET paused=true');
 await expect(engine.schedulePayout({asset,chain,price:{microUsd:'1000000',at:Date.now(),source:'test'},ata:new Map(f.owners.map(o=>[o,{exists:true,valid:true,costMicroUsd:0n}])),policy:policy(),costAccount:'reserve',lease,sourceTokenAccount:chain.destination(f.treasury,asset.mint)})).rejects.toThrow('reservations paused');
 expect(await db.balance(asset.mint,'liabilities')).toBe(before);expect((await db.pool.query('SELECT id FROM payout_batches')).rowCount).toBe(0);
});
it('recovery configuration needs no signer or effective approval while enabling new signing still requires both',()=>{
 const env={MODE:'live',CLUSTER:'mainnet-beta',TREASURY:f.treasury,SECONDARY_RPC_URL:'https://history.example',BROADCAST_ENABLED:'false'};
 const c=loadConfig(env);expect(c.BROADCAST_ENABLED).toBe(false);expect(c.SIGNER_URL).toBeUndefined();expect(c.APPROVAL_FILE).toBeUndefined();
 expect(()=>loadConfig({...env,BROADCAST_ENABLED:'true'})).toThrow();
});
it('public accounting never labels an in-flight or stale reconciliation as reconciled',async()=>{
 await db.doc('reconciliation',{at:new Date().toISOString(),reports:[{state:'in_flight'}]});expect((await transparency(db)).accountingHealth).toBe('pending');
 await db.doc('reconciliation',{at:new Date().toISOString(),reports:[{state:'stale_observation'}]});expect((await transparency(db)).accountingHealth).toBe('stale');
 await db.doc('reconciliation',{at:new Date().toISOString(),reports:[{state:'balanced'}]});expect((await transparency(db)).accountingHealth).toBe('reconciled');
});
it('self and circular capital transfers cannot create reserve without an actual treasury gain',async()=>{
 const c={...realConfig(),OPERATOR_TOKEN:'test-operator-token'.repeat(3)},app=createServer(db,c),headers={authorization:'Bearer '+c.OPERATOR_TOKEN},signature='C'.repeat(88);
 vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue(MAINNET_GENESIS);
 const transaction=(source:string,pre:number,post:number)=>({slot:500001,meta:{err:null,fee:1000,preBalances:[1000,pre],postBalances:[0,post],innerInstructions:[]},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:new PublicKey(f.sender)},{pubkey:new PublicKey(f.treasury)}],instructions:[{program:'system',parsed:{type:'transfer',info:{source,destination:f.treasury,lamports:10000000}}}]}}});
 const parsed=vi.spyOn(Connection.prototype,'getParsedTransaction').mockResolvedValue(transaction(f.treasury,10000000,10000000) as never);
 expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(503);
 parsed.mockResolvedValue(transaction(f.sender,10000000,10000000) as never);expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(503);expect(await db.balance(SOL,'reserve')).toBe(0n);
 parsed.mockResolvedValue(transaction(f.sender,10000000,20000000) as never);expect((await app.inject({method:'POST',url:'/operator/capital',headers,payload:{signature}})).statusCode).toBe(200);expect(await db.balance(SOL,'reserve')).toBe(10000000n);await app.close();
});
it('developer expenses approved during external authorization block the final locked signing decision',async()=>{
 await db.tx(async t=>{await db.lock(t);await db.move(t,'fee',SOL,'external:fee','revenue',500000000n);await db.move(t,'ops',SOL,'revenue','operations:race',500000000n);});
 const accounting=new DeveloperAccounting(db,'demo'),p={...developerPolicy(loadConfig({})),enabled:true,treasury:f.treasury,destination:testAddress('developer')},id=(await accounting.schedule({policy:p,lease}))!,a=approval();let lookups=0;
 const prepared=vi.spyOn(chain,'prepare');await controlledExecutionTick(engine,chain,'integration-test',realConfig(),{
  approval:async()=>a,conditions:async i=>db.tx(async t=>{await db.lock(t);await assertDeveloperPayoutAuthorized(db,t,i,p);}),
  fundingRoute:async()=>{if(++lookups===2)await accounting.recordExpense({id:'concurrent-bill',amountLamports:200000000n,payee:f.sender,description:'Expense recorded during provider lookup',evidence:{testOnly:true},actor:'test'});return a.expectedFundingRoute;},
  conditionsLocked:(i,t)=>assertDeveloperPayoutAuthorized(db,t,i,p)
 });
 expect(prepared).not.toHaveBeenCalled();expect((await db.pool.query('SELECT id FROM attempts')).rowCount).toBe(0);expect((await db.pool.query('SELECT status FROM intents WHERE id=$1',[id])).rows[0].status).toBe('waiting_for_route');
 expect((await accounting.summary(p)).pendingTransfers).toBe('399900000');
});
