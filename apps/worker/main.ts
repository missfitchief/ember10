import {randomUUID} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {loadConfig} from '../../packages/core/config.js';
import {loadApproval,Approval,assertProspectiveApproval} from '../../packages/core/approval.js';
import {Store} from '../../packages/db/store.js';
import {Engine} from '../../packages/core/engine.js';
import {EmberClient} from '../../packages/integrations/ember.js';
import {DemoChain} from '../../packages/integrations/demo.js';
import {SolanaChain,RemoteSigner,fullSnapshot} from '../../packages/integrations/solana.js';
import {JupiterClient,safeJupiterBuild} from '../../packages/integrations/jupiter.js';
import {ingestTreasury,ingestTokenDeposits,fundingRoute} from '../../packages/integrations/ingestion.js';
import {createUniverseProvider} from '../../packages/integrations/provenance.js';
import {AutomaticSelectionService} from '../../packages/integrations/automatic-selection.js';
import {MarketDataService} from '../../packages/integrations/market-data.js';
import {selectBasket} from '../../packages/core/selection.js';
import {admitFundedMint} from '../../packages/core/admission.js';
import {DeveloperAccounting,assertDeveloperPayoutAuthorized} from '../../packages/core/developer.js';
import {developerPolicy} from '../../packages/core/developer-config.js';
import {controlledExecutionTick,executionAuthorizer,ExecutionControl} from './control.js';
import {commitFreshEpoch} from './commit.js';
import {canonical,ensure,hash,SOL,WSOL,Asset,defaultPolicy,policyBasketSize} from '../../packages/core/model.js';
import {tick} from './runner.js';
const c=loadConfig(),db=new Store(c.DATABASE_URL);await db.bindMode(c.MODE);const engine=new Engine(db,c.MODE,BigInt(c.MIN_RESERVE_LAMPORTS),BigInt(c.MAX_TX_FEE_LAMPORTS)),ember=new EmberClient(),owner=randomUUID();
let chain:DemoChain|SolanaChain|undefined,jupiter:JupiterClient|undefined,approval:Approval|undefined,selection:AutomaticSelectionService|undefined,selectionKey='';
const observed=new MarketDataService();
if(c.MODE==='demo'){chain=new DemoChain(db);await chain.init();}
if(c.MODE==='live'){if(c.JUPITER_API_KEY)jupiter=new JupiterClient(c.JUPITER_API_KEY);const signer=c.BROADCAST_ENABLED?new RemoteSigner(new PublicKey(c.TREASURY!),c.SIGNER_URL!,c.SIGNER_TOKEN??''):{publicKey:new PublicKey(c.TREASURY!),sign:async()=>{throw Error('inspection worker has no signer');}};const connection=new Connection(c.RPC_URL,'finalized');chain=new SolanaChain(c,signer,undefined,async i=>{ensure(jupiter,'live route adapter missing');const a=await loadApproval(c);return safeJupiterBuild(connection,jupiter,signer.publicKey,i,a.approvedPrograms,await admitFundedMint(db,i,a),a.policy);});await chain.verifyCluster();}
function currentSelection(a:Approval){const key=hash(a);if(!selection||key!==selectionKey){ensure(chain instanceof SolanaChain&&jupiter,'live evidence adapters required');selection=new AutomaticSelectionService(a.policy,a.ourMint,createUniverseProvider(chain.connection,ember,jupiter,a,c.CENSUS_COMPLETE_CONTRACT,{jupiterApiKey:c.JUPITER_API_KEY}));selectionKey=key;}return selection;}
const controls:ExecutionControl={approval:()=>loadApproval(c),fundingRoute:a=>fundingRoute(ember,a.ourPool,true),conditions:async(i,a)=>{
 if(i.kind==='swap'||i.kind==='buyback')await admitFundedMint(db,i,a);
 if(i.kind==='swap'){const observation=await currentSelection(a).read(BigInt(i.amount));await db.doc('observation',observation);ensure(observation.status==='ready'&&observation.complete,'fresh execution universe unavailable');const member=observation.candidates.find(x=>x.mint===i.expected.outputAsset);ensure(member,'funded member no longer verifiable');const check=selectBasket([member],a.policy,a.ourMint,true).universe[0];ensure(!check.reasons.length&&check.routeBudget===i.amount,'funded member execution safety checks failed');}
 if(i.kind==='buyback'||i.kind==='burn')ensure((i.expected.outputAsset??i.asset)===a.ourMint,'project asset identity changed');
 if(i.expected.purpose==='developer_payout')await db.tx(async t=>{await db.lock(t);await assertDeveloperPayoutAuthorized(db,t,i,developerPolicy(c));});
},conditionsLocked:async(i,t)=>{await assertDeveloperPayoutAuthorized(db,t,i,developerPolicy(c));}};
const authorize=executionAuthorizer(engine,c,controls);
let stop=false,lastDiscovery=0,lastEvaluation=0,lastTokenIngestion=0;
for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>{stop=true;});
console.log(`EMBER10 ${c.MODE} worker running. New commitments ${c.MASTER_PAUSE?'disabled by master pause':'subject to persisted controls'}.`);
while(!stop){try{
 // Recovery is independent of approval availability and cannot create or resend a transaction.
 if(chain instanceof SolanaChain)await controlledExecutionTick(engine,chain,owner,c,controls);else if(chain)await tick(engine,chain,owner);else await db.lease(owner,30);
 if(Date.now()-lastDiscovery>=45000&&c.MODE!=='demo'&&c.MODE!=='test'){
  lastDiscovery=Date.now();const record=await observed.read(c.OUR_MINT??null);await db.doc('observation',{type:'observed_market',status:record.status,...record.observed});
 }
 if(c.MODE==='live'&&chain instanceof SolanaChain&&jupiter){
  approval=await loadApproval(c);const a=approval;
  const route=await controls.fundingRoute(a);const unchanged=await engine.fundingRoute(a.expectedFundingRoute,route);
  const available=await db.balance(SOL,'revenue'),prospective=available<BigInt(c.MAX_ROUND_LAMPORTS)?available:BigInt(c.MAX_ROUND_LAMPORTS);
  await db.doc('observation',await currentSelection(a).read(prospective*BigInt(a.policy.basketBps)/10000n/BigInt(policyBasketSize(a.policy))));
  await ingestTreasury(engine,chain.connection,ember,{treasury:a.treasury,pool:a.ourPool,feeSender:a.feeSender,historyStartSignature:a.historyStartSignature});
  if(Date.now()-lastTokenIngestion>60000){await ingestTokenDeposits(engine,chain.connection,a.treasury);lastTokenIngestion=Date.now();}
  if(Date.now()-lastEvaluation>=45000&&unchanged&&!c.MASTER_PAUSE&&c.BROADCAST_ENABLED){
   lastEvaluation=Date.now();const paused=(await db.pool.query('SELECT paused FROM control')).rows[0].paused;
   const unknown=(await db.pool.query("SELECT id FROM intents WHERE status IN ('signed','submitted','unknown','confirmed','needs_review')")).rowCount;
   const id=`ember10:${a.policy.evaluationSeconds}:${Math.floor(Date.now()/(a.policy.evaluationSeconds*1000))}`;
   if(!paused&&!unknown&&!(await db.pool.query('SELECT id FROM epochs WHERE id=$1',[id])).rowCount){
    assertProspectiveApproval(a);
    const revenue=await db.balance(SOL,'revenue'),funding=revenue<BigInt(c.MAX_ROUND_LAMPORTS)?revenue:BigInt(c.MAX_ROUND_LAMPORTS);
    if(funding>0n){
     const snap=await fullSnapshot(chain.connection,a.ourMint,a.policy,c.CENSUS_COMPLETE_CONTRACT);
     const rent=BigInt(await chain.connection.getMinimumBalanceForRentExemption(165,'finalized'));
     // Conservative upper bound; if it exceeds 10%, accumulate rather than subsidizing silently.
     const size=BigInt(policyBasketSize(a.policy));
     const forecast=(size+2n)*BigInt(c.MAX_TX_FEE_LAMPORTS)+BigInt(snap.owners.filter(o=>o.eligible).length)*size*(rent+BigInt(c.MAX_TX_FEE_LAMPORTS));
     const price=(await jupiter.prices([WSOL],chain.connection)).get(WSOL);ensure(price,'SOL valuation unavailable');const lease=await db.lease(owner,300);ensure(lease,'worker lease lost');
     await commitFreshEpoch(engine,currentSelection(a),{id,policy:a.policy,snapshot:snap,funding,cost:forecast,price,minReserve:BigInt(c.MIN_RESERVE_LAMPORTS),maxRound:BigInt(c.MAX_ROUND_LAMPORTS),maxDay:BigInt(c.MAX_DAY_LAMPORTS),treasury:a.treasury,ourMint:a.ourMint,routeUnchanged:true,lease},async()=>{const effective=await loadApproval(c);assertProspectiveApproval(effective);ensure(hash(effective)===hash(a),'approval changed before commitment');await authorize();});
    }
   }
  }
  const executionAllowed=unchanged&&!c.MASTER_PAUSE&&c.BROADCAST_ENABLED&&!(await db.pool.query('SELECT paused FROM control')).rows[0].paused;
  const assets=executionAllowed?(await db.pool.query('SELECT * FROM assets WHERE mint IN(SELECT asset FROM entitlements WHERE paid<amount)')).rows as Asset[]:[];
  const operationsLease=await db.lease(owner,120);if(operationsLease&&executionAllowed){for(const e of (await db.pool.query('SELECT id FROM epochs')).rows)if(!(await db.pool.query("SELECT id FROM intents WHERE expected->>'costAccount'=$1 AND status<>'finalized'",['cost:'+e.id])).rowCount)await engine.returnUnusedCosts(e.id,operationsLease);await authorize();await new DeveloperAccounting(db,c.MODE).schedule({policy:developerPolicy(c),lease:operationsLease});}
  const prices=assets.length?await jupiter.prices([...assets.map(x=>x.mint),WSOL],chain.connection):new Map();
  for(const asset of assets){const owners=(await db.pool.query('SELECT DISTINCT owner FROM entitlements WHERE asset=$1 AND paid<amount',[asset.mint])).rows;const ata=new Map();
   for(const o of owners){try{const status=await chain.destinationStatus(o.owner,asset.mint);const sol=prices.get(WSOL);ata.set(o.owner,{...status,costMicroUsd:sol?(status.rent+BigInt(c.MAX_TX_FEE_LAMPORTS))*BigInt(sol.microUsd)/1000000000n:undefined});}catch{ata.set(o.owner,{exists:false,valid:false});}}
   await authorize();const effective=await loadApproval(c);ensure(hash(effective)===hash(a),'approval changed before holder scheduling');const lease=await db.lease(owner,120);if(lease)await engine.schedulePayout({asset,chain,price:prices.get(asset.mint),ata,policy:a.policy,costAccount:'reserve',lease,sourceTokenAccount:chain.destination(a.treasury,asset.mint)});
  }
  const recon=(await db.pool.query("SELECT id FROM jobs WHERE kind='reconcile' AND state='ready'")).rows;
  if(recon.length){const registered=(await db.pool.query('SELECT * FROM assets')).rows;const accountKeys=[new PublicKey(a.treasury),...registered.map(x=>new PublicKey(chain!.destination(a.treasury,x.mint)))];const actual:{asset:string;amount:string;slot:number}[]=[];
   for(let page=0;page<accountKeys.length;page+=100){const accounts=await chain.connection.getMultipleAccountsInfoAndContext(accountKeys.slice(page,page+100),'finalized');for(let k=0;k<accounts.value.length;k++){const account=accounts.value[k],index=page+k;if(index===0){ensure(account,'treasury missing');actual.push({asset:SOL,amount:String(account.lamports),slot:accounts.context.slot});}else{ensure(account&&account.owner.equals(TOKEN_PROGRAM_ID),'registered treasury ATA missing/unsupported');const token=AccountLayout.decode(account.data);ensure(token.mint.toBase58()===registered[index-1].mint&&token.owner.toBase58()===a.treasury,'reconciliation account identity');actual.push({asset:registered[index-1].mint,amount:token.amount.toString(),slot:accounts.context.slot});}}}
   const reports=await engine.reconcile(actual);if(!reports.some(r=>r.state==='stale_observation'))await db.pool.query("UPDATE jobs SET state='done' WHERE id=ANY($1::text[])",[recon.map(j=>j.id)]);
  }
 }
 }catch(e){console.log('Worker deferred:',(e as Error).message.replace(/https?:\/\/\S+/g,'[upstream]').slice(0,180));}
 await new Promise(r=>setTimeout(r,5000));
}
await db.pool.query('UPDATE leases SET expires_at=now() WHERE owner=$1',[owner]);await db.close();
