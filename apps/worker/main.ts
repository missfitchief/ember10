import {randomUUID} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {loadConfig} from '../../packages/core/config.js';
import {loadApproval,Approval} from '../../packages/core/approval.js';
import {Store} from '../../packages/db/store.js';
import {Engine} from '../../packages/core/engine.js';
import {EmberClient} from '../../packages/integrations/ember.js';
import {DemoChain} from '../../packages/integrations/demo.js';
import {SolanaChain,RemoteSigner,fullSnapshot} from '../../packages/integrations/solana.js';
import {JupiterClient,safeJupiterBuild} from '../../packages/integrations/jupiter.js';
import {ingestTreasury,ingestTokenDeposits,fundingRoute} from '../../packages/integrations/ingestion.js';
import {verifiedUniverse} from '../../packages/integrations/provenance.js';
import {selectBasket,Basket} from '../../packages/core/selection.js';
import {canonical,ensure,hash,SOL,WSOL,Asset,defaultPolicy,policyBasketSize} from '../../packages/core/model.js';
import {tick} from './runner.js';
const c=loadConfig(),db=new Store(c.DATABASE_URL);await db.bindMode(c.MODE);const engine=new Engine(db,c.MODE,BigInt(c.MIN_RESERVE_LAMPORTS),BigInt(c.MAX_TX_FEE_LAMPORTS)),ember=new EmberClient(),owner=randomUUID();
let chain:DemoChain|SolanaChain|undefined,jupiter:JupiterClient|undefined,approval:Approval|undefined;
if(c.MODE==='demo'){chain=new DemoChain(db);await chain.init();}
if(c.MODE==='live'&&c.BROADCAST_ENABLED){approval=await loadApproval(c);jupiter=new JupiterClient(c.JUPITER_API_KEY!);const signer=new RemoteSigner(new PublicKey(c.TREASURY!),c.SIGNER_URL!,c.SIGNER_TOKEN??'');const connection=new Connection(c.RPC_URL,'finalized');chain=new SolanaChain(c,signer,undefined,i=>safeJupiterBuild(connection,jupiter!,signer.publicKey,i,approval!.approvedPrograms,approval!.approvedMints,approval!.policy));await chain.verifyCluster();}
let stop=false,lastDiscovery=0,lastEvaluation=0,lastTokenIngestion=0;
for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>{stop=true;});
console.log(`EMBER10 ${c.MODE} worker running. New commitments ${c.MASTER_PAUSE?'disabled by master pause':'subject to persisted controls'}.`);
while(!stop){try{
 if(c.MODE==='live'&&chain){try{approval=await loadApproval(c);}catch(e){if(!(await db.pool.query('SELECT paused FROM control')).rows[0].paused)await db.incident('pilot approval invalid',{reason:(e as Error).message});}}
 // Always recover already signed work first, even during a pause.
 if(chain)await tick(engine,chain,owner);else await db.lease(owner,30);
 if(Date.now()-lastDiscovery>=60000&&c.MODE!=='demo'&&c.MODE!=='test'){
  lastDiscovery=Date.now();try{const markets=await ember.markets();await db.doc('observation',{type:'discovery',...markets});}catch{console.log('Discovery unavailable; previous observations remain visibly stale.');}
 }
 if(c.MODE==='live'&&chain instanceof SolanaChain&&approval&&jupiter){
  approval=await loadApproval(c);const a=approval;
  const route=await fundingRoute(ember,a.ourPool);const unchanged=await engine.fundingRoute(a.expectedFundingRoute,route);
  await ingestTreasury(engine,chain.connection,ember,{treasury:a.treasury,pool:a.ourPool,feeSender:a.feeSender,historyStartSignature:a.historyStartSignature});
  if(Date.now()-lastTokenIngestion>60000){await ingestTokenDeposits(engine,chain.connection,a.treasury);lastTokenIngestion=Date.now();}
  if(Date.now()-lastEvaluation>=a.policy.evaluationSeconds*1000&&unchanged&&!c.MASTER_PAUSE){
   lastEvaluation=Date.now();const paused=(await db.pool.query('SELECT paused FROM control')).rows[0].paused;
   const unknown=(await db.pool.query("SELECT id FROM intents WHERE status IN ('signed','submitted','unknown','confirmed','needs_review')")).rowCount;
   if(!paused&&!unknown){
    const revenue=await db.balance(SOL,'revenue'),funding=revenue<BigInt(c.MAX_ROUND_LAMPORTS)?revenue:BigInt(c.MAX_ROUND_LAMPORTS);
    if(funding>0n){
     const snap=await fullSnapshot(chain.connection,a.ourMint,a.policy,c.CENSUS_COMPLETE_CONTRACT);
     const rent=BigInt(await chain.connection.getMinimumBalanceForRentExemption(165,'finalized'));
     // Conservative upper bound; if it exceeds 10%, accumulate rather than subsidizing silently.
     const size=BigInt(policyBasketSize(a.policy));
     const forecast=(size+2n)*BigInt(c.MAX_TX_FEE_LAMPORTS)+BigInt(snap.owners.filter(o=>o.eligible).length)*size*(rent+BigInt(c.MAX_TX_FEE_LAMPORTS));
     const universe=await verifiedUniverse(chain.connection,ember,jupiter,a,funding*BigInt(a.policy.basketBps)/10000n/size,c.CENSUS_COMPLETE_CONTRACT);
     const today=new Date().toISOString().slice(0,10);let basket=(await db.pool.query("SELECT body FROM documents WHERE kind='basket' AND body->>'day'=$1 ORDER BY created_at LIMIT 1",[today])).rows[0]?.body as Basket|undefined;
     if(!basket){basket=selectBasket(universe.candidates,a.policy,a.ourMint,universe.complete);if(basket.ready)await db.doc('basket',basket);}
     ensure(basket.selected.every(x=>a.approvedMints.includes(x.mint)),'selected basket outside approved assets');
     ensure(basket.selected.every(x=>universe.candidates.some(v=>v.mint===x.mint&&v.routeViable&&v.provenanceVerified&&!v.mintAuthority&&!v.freezeAuthority)),'basket member became unsafe; preserve weights and defer');
     const price=(await jupiter.prices([WSOL],chain.connection)).get(WSOL);ensure(price,'SOL valuation unavailable');const lease=await db.lease(owner,120);ensure(lease,'worker lease lost');
     await engine.plan({id:new Date().toISOString().slice(0,13),policy:a.policy,basket,snapshot:snap,funding,cost:forecast,price,minReserve:BigInt(c.MIN_RESERVE_LAMPORTS),maxRound:BigInt(c.MAX_ROUND_LAMPORTS),maxDay:BigInt(c.MAX_DAY_LAMPORTS),treasury:a.treasury,ourMint:a.ourMint,routeUnchanged:true,lease});
    }
   }
  }
  const assets=(await db.pool.query('SELECT * FROM assets WHERE mint IN(SELECT asset FROM entitlements WHERE paid<amount)')).rows as Asset[];
  const operationsLease=await db.lease(owner,120);if(operationsLease)for(const e of (await db.pool.query('SELECT id FROM epochs')).rows){await engine.scheduleOperations(e.id,a.operations,a.treasury,operationsLease);if(!(await db.pool.query("SELECT id FROM intents WHERE expected->>'costAccount'=$1 AND status<>'finalized'",['cost:'+e.id])).rowCount)await engine.returnUnusedCosts(e.id,operationsLease);}
  const prices=assets.length?await jupiter.prices([...assets.map(x=>x.mint),WSOL],chain.connection):new Map();
  for(const asset of assets){const owners=(await db.pool.query('SELECT DISTINCT owner FROM entitlements WHERE asset=$1 AND paid<amount',[asset.mint])).rows;const ata=new Map();
   for(const o of owners){try{const status=await chain.destinationStatus(o.owner,asset.mint);const sol=prices.get(WSOL);ata.set(o.owner,{...status,costMicroUsd:sol?(status.rent+BigInt(c.MAX_TX_FEE_LAMPORTS))*BigInt(sol.microUsd)/1000000000n:undefined});}catch{ata.set(o.owner,{exists:false,valid:false});}}
   const lease=await db.lease(owner,120);if(lease)await engine.schedulePayout({asset,chain,price:prices.get(asset.mint),ata,policy:a.policy,costAccount:'reserve',lease,sourceTokenAccount:chain.destination(a.treasury,asset.mint)});
  }
  const recon=(await db.pool.query("SELECT id FROM jobs WHERE kind='reconcile' AND state='ready'")).rows;
  if(recon.length){const registered=(await db.pool.query('SELECT * FROM assets')).rows;const accountKeys=[new PublicKey(a.treasury),...registered.map(x=>new PublicKey(chain!.destination(a.treasury,x.mint)))];const actual:{asset:string;amount:string;slot:number}[]=[];
   for(let page=0;page<accountKeys.length;page+=100){const accounts=await chain.connection.getMultipleAccountsInfoAndContext(accountKeys.slice(page,page+100),'finalized');for(let k=0;k<accounts.value.length;k++){const account=accounts.value[k],index=page+k;if(index===0){ensure(account,'treasury missing');actual.push({asset:SOL,amount:String(account.lamports),slot:accounts.context.slot});}else{ensure(account&&account.owner.equals(TOKEN_PROGRAM_ID),'registered treasury ATA missing/unsupported');const token=AccountLayout.decode(account.data);ensure(token.mint.toBase58()===registered[index-1].mint&&token.owner.toBase58()===a.treasury,'reconciliation account identity');actual.push({asset:registered[index-1].mint,amount:token.amount.toString(),slot:accounts.context.slot});}}}
   await engine.reconcile(actual);await db.pool.query("UPDATE jobs SET state='done' WHERE kind='reconcile'");
  }
 }
 }catch(e){console.log('Worker deferred:',(e as Error).message.replace(/https?:\/\/\S+/g,'[upstream]').slice(0,180));}
 await new Promise(r=>setTimeout(r,5000));
}
await db.pool.query('UPDATE leases SET expires_at=now() WHERE owner=$1',[owner]);await db.close();
