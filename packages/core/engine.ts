import { Store, Lease, Tx } from '../db/store.js';
import { allocate, budget, economical } from './money.js';
import { Asset, canonical, ensure, fresh, hash, Policy, Price, SOL, policyBasketSize } from './model.js';
import { Basket, Snapshot } from './selection.js';
import { revalidateBasket, selectBasket } from './selection.js';
import { finalizeDeveloperPayout } from './developer.js';
import { maximumNativeCost } from './execution-cost.js';
export interface TransferEvidence {instruction:string;asset:string;source:string;destination:string;amount:string}
export interface Receipt {signature:string;instruction:string;asset:string;amount:string;destination:string;source:string;slot:number;finalized:boolean;error:unknown;pool?:string;publishedPool?:string;kind:'creator_fee'|'deposit'|'seed';attributionVerified:boolean;rawEvidence:unknown}
export interface Plan {inputAsset:string;outputAsset?:string;from:string;to?:string;owner?:string;minOutput?:string;maxFee:string;costAccount:string;transfers?:{owner:string;destination:string;amount:string;entitlements:string[]}[];decimals?:number;[key:string]:unknown}
export interface Intent {id:string;epoch_id:string|null;kind:'swap'|'buyback'|'payout'|'burn'|'operations';asset:string;amount:string;status:string;expected:Plan;result?:Outcome}
export interface Signed {signature:string;bytes:Buffer;blockhash:string;lastValidHeight:number;messageHash:string;approvedPlan?:Plan}
export interface NativeCostEvidence {source:'original_signed_message';messageHash:string;rentAccounts:{address:string;mint:string;owner:string;lamports:string}[]}
export interface Outcome {status:'finalized'|'failed'|'pending'|'unknown'|'expired';slot?:number;signature:string;fee?:string;rent?:string;input?:string;output?:string;transfers?:TransferEvidence[];burned?:string;error?:unknown;raw?:unknown;testOnly?:boolean;settlementPrice?:Price;nativeCostEvidence?:NativeCostEvidence}
export interface Chain {
 mode:'demo'|'test'|'live'; prepare(intent:Intent,authorizeSigning?:()=>Promise<void>):Promise<Signed>;
 inspect(intent:Intent,signed:Signed):Promise<Outcome>;
 broadcast(signed:Signed,authorizeBroadcast?:()=>Promise<void>):Promise<void>;
 destination(owner:string,asset:string):string;
}
export class Engine {
 constructor(public db:Store,public mode:'demo'|'test'|'live'|'prelaunch',public minimumReserve=0n,public transactionFeeCap=100000n){}
 async ingest(r:Receipt,expected:{pool?:string;treasury:string;feeSender?:string}){
  ensure(r.finalized&&r.error===null&&r.slot>0&&BigInt(r.amount)>0n,'receipt is not finalized successful transfer');
  ensure(r.destination===expected.treasury,'wrong receipt destination');
  const validFee=r.kind==='creator_fee'&&r.asset===SOL&&r.attributionVerified&&r.pool===expected.pool&&r.publishedPool===expected.pool&&!!expected.pool&&r.source===expected.feeSender;
  const classification=validFee?'creator_fee':r.kind==='seed'&&r.attributionVerified?'capital':r.kind==='creator_fee'?'review':'deposit';
  const id=hash([r.signature,r.instruction,r.asset,r.destination]);
  return this.db.tx(async t=>{await this.db.lock(t);const saved=await t.query('INSERT INTO incoming_transfers VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id',[id,r.signature,r.instruction,r.asset,r.amount,r.destination,classification,canonical(r)]);if(!saved.rowCount)return false;
  await this.db.move(t,'receipt:'+id,r.asset,'external:'+classification,classification==='creator_fee'?'revenue':classification==='capital'?'reserve':classification==='review'?'quarantine':'deposits',BigInt(r.amount),r);return true;});
 }
 async recognizeCapital(r:Receipt,treasury:string){ensure(r.kind==='seed'&&r.asset===SOL,'only explicitly approved native SOL capital');
  const created=await this.ingest(r,{treasury});if(created)return;
  const receiptId=hash([r.signature,r.instruction,r.asset,r.destination]);await this.db.tx(async t=>{await this.db.lock(t);const original=(await t.query('SELECT classification,amount::text FROM incoming_transfers WHERE id=$1',[receiptId])).rows[0];
   ensure(original&&original.amount===r.amount,'capital receipt mismatch');if(original.classification==='capital')return;ensure(original.classification==='deposit','recognized revenue or ambiguous fees cannot be converted to capital');
   await this.db.move(t,'capital-reclassification:'+receiptId,SOL,'deposits','reserve',BigInt(r.amount),{receiptId,operatorApprovedCapital:true,rule:'linked adjustment; original inbound record remains unchanged'});
  });
 }
 async plan(args:{id:string;policy:Policy;basket:Basket;snapshot:Snapshot;funding:bigint;cost:bigint;price:Price;minReserve:bigint;maxRound:bigint;maxDay:bigint;treasury:string;ourMint:string;routeUnchanged:boolean;lease:Lease;now?:number}){
  ensure(this.mode!=='prelaunch','prelaunch cannot create financial commitments');
  const {policy,snapshot}=args;let basket=args.basket;const size=policyBasketSize(policy);
  ensure(this.mode!=='live'||policy.version===2,'new live commitments require EMBER10 policy version 2');
  ensure(this.mode!=='live'||BigInt(policy.minBasketMicroUsd)>=50000000n,'new EMBER10 basket minimum is USD 50');
  ensure(this.mode!=='live'||policy.basketBps===8000&&policy.buybackBps===1000&&policy.operationsBps===1000,'EMBER10 allocation must remain 80/10/10');
  ensure(basket.ready&&basket.selected.length===size&&basket.selected.every(x=>x.weightBps===10000/size),'policy-sized equal-weight eligible basket required');
  ensure(basket.policyHash===hash(policy)&&snapshot.policyHash===hash(policy),'policy/snapshot mismatch');
  ensure(snapshot.owners.some(x=>x.eligible),'no eligible holders');ensure(args.routeUnchanged,'funding module or recipient changed');
  const now=args.now??Date.now();
  ensure(fresh(snapshot.capturedAt,now,policy.maxDataAgeSeconds),'holder snapshot stale');
  ensure(fresh(basket.createdAt,now,policy.maxDataAgeSeconds),'basket stale');
  ensure(args.funding<=args.maxRound,'maximum round spend exceeded');const b=budget(args.funding,args.cost,policy,args.price,now);
  ensure(basket.selected.every(x=>x.routeViable&&BigInt(x.routeBudget)>=b.leg),'route not verified for intended budget');
  const refreshed=selectBasket(basket.universe,policy,args.ourMint,true,now);
  ensure(refreshed.ready&&hash(refreshed.selected.map(x=>[x.mint,x.weightBps]))===hash(basket.selected.map(x=>[x.mint,x.weightBps])),'basket eligibility or ranking changed');
  basket=this.mode==='live'?revalidateBasket(basket,basket.universe,policy,args.ourMint,true,b.leg,now):refreshed;
  return this.db.tx(async t=>{await this.db.fence(t,args.lease);await this.db.lock(t);
   if((await t.query('SELECT id FROM epochs WHERE id=$1',[args.id])).rowCount)return args.id;
   ensure(!(await t.query('SELECT paused FROM control')).rows[0].paused,'new commitments paused');
   ensure(await this.db.balance(SOL,'revenue',t)>=args.funding,'insufficient unallocated revenue');
   ensure(await this.db.balance(SOL,'reserve',t)>=args.minReserve,'execution reserve below minimum');
   const day=await t.query("SELECT coalesce(sum((funding->>'total')::numeric),0)::text AS amount FROM epochs WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
   ensure(BigInt(day.rows[0].amount)+args.funding<=args.maxDay,'daily spend cap');
   const policyId=await this.db.doc('policy',policy,t),basketId=await this.db.doc('basket',basket,t),snapshotId=await this.db.doc('snapshot',snapshot,t);
   const availableReceipts=(await t.query("SELECT r.id,r.amount::text,(r.amount-coalesce((SELECT sum(u.amount) FROM funding_receipt_uses u WHERE u.receipt_id=r.id),0))::text AS available FROM incoming_transfers r WHERE r.classification='creator_fee' AND r.asset='SOL' ORDER BY (r.evidence->>'slot')::bigint,r.id")).rows;
   let unassigned=args.funding;const fundingReceipts:{id:string;amount:string}[]=[];for(const r of availableReceipts){const take=BigInt(r.available)<unassigned?BigInt(r.available):unassigned;if(take>0n){fundingReceipts.push({id:r.id,amount:take.toString()});unassigned-=take;}if(unassigned===0n)break;}ensure(unassigned===0n,'funding provenance does not cover free revenue');
   await t.query("INSERT INTO epochs(id,policy_id,basket_id,snapshot_id,status,funding) VALUES($1,$2,$3,$4,'funded',$5)",[args.id,policyId,basketId,snapshotId,canonical({...b,source:'recognized creator receipts',receiptIds:fundingReceipts.map(r=>r.id),price:args.price})]);
   for(const r of fundingReceipts)await t.query("INSERT INTO funding_receipt_uses(id,epoch_id,receipt_id,amount,kind) VALUES($1,$2,$3,$4,'commitment')",['commit:'+args.id+':'+r.id,args.id,r.id,r.amount]);
   const costAccount=`cost:${args.id}`;
   for(const [account,amount]of [[costAccount,b.cost],[`buyback:${args.id}`,b.buyback],[`operations:${args.id}`,b.operations],[`rounding:${args.id}`,b.remainder]] as const)await this.db.move(t,`fund:${args.id}:${account}`,SOL,'revenue',account,amount,{},args.id);
   for(const asset of basket.selected){await t.query('INSERT INTO assets VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[asset.mint,asset.symbol,asset.decimals,asset.program]);
    const id=`purchase:${args.id}:${asset.mint}`,from=`budget:${id}`;
    await this.db.move(t,'fund:'+id,SOL,'revenue',from,b.leg,{},args.id);
    await this.addIntent(t,{id,epoch_id:args.id,kind:'swap',asset:SOL,amount:b.leg.toString(),status:'planned',expected:{inputAsset:SOL,outputAsset:asset.mint,from,to:args.treasury,minOutput:'1',maxFee:this.transactionFeeCap.toString(),costAccount,decimals:asset.decimals}});
   }
   await this.addIntent(t,{id:'buyback:'+args.id,epoch_id:args.id,kind:'buyback',asset:SOL,amount:b.buyback.toString(),status:'planned',expected:{inputAsset:SOL,outputAsset:args.ourMint,from:`buyback:${args.id}`,to:args.treasury,minOutput:'1',maxFee:this.transactionFeeCap.toString(),costAccount}});
   return args.id;
  });
 }
 async addIntent(t:Tx,i:Intent){await t.query('INSERT INTO intents(id,epoch_id,kind,asset,amount,status,expected) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[i.id,i.epoch_id,i.kind,i.asset,i.amount,i.status,canonical(i.expected)]);await t.query("INSERT INTO jobs(id,kind,body) VALUES($1,'intent',$2) ON CONFLICT DO NOTHING",[i.id,canonical({intentId:i.id})]);}
 async apply(i:Intent,out:Outcome,lease:Lease){
  ensure(out.status==='finalized'&&out.error==null&&out.slot&&out.signature,'not finalized success');
  ensure((this.mode==='demo')===!!out.testOnly||this.mode==='test','synthetic/live evidence mismatch');
  const fee=BigInt(out.fee??'0'),rent=BigInt(out.rent??'0');ensure(fee<=BigInt(i.expected.maxFee),'fee exceeds approved cap');ensure(fee>=0n&&rent>=0n,'negative execution costs');if(i.expected.maxTotalCost)ensure(fee+rent<=BigInt(String(i.expected.maxTotalCost)),'execution cost exceeds reserved allowance');
  let nativeCap=maximumNativeCost(i);const legacyNativeCost=nativeCap===null;
  if(legacyNativeCost){
   const evidence=out.nativeCostEvidence;ensure(evidence?.source==='original_signed_message','transaction native cost bound unavailable; review original signed transaction');
   ensure(evidence.rentAccounts.every(a=>/^\d+$/.test(a.lamports))&&new Set(evidence.rentAccounts.map(a=>a.address)).size===evidence.rentAccounts.length,'invalid original transaction rent evidence');
   ensure(evidence.rentAccounts.reduce((n,a)=>n+BigInt(a.lamports),0n)===rent,'original transaction rent evidence mismatch');
   ensure(evidence.rentAccounts.every(a=>i.kind==='swap'||i.kind==='buyback'?a.mint===i.expected.outputAsset&&a.owner===i.expected.to:a.mint===i.asset&&i.expected.transfers?.some(p=>p.destination===a.address&&p.owner===a.owner)),'original transaction rent recipient mismatch');
   nativeCap=BigInt(i.expected.maxFee)+rent;
  }
  ensure(nativeCap!==null&&fee+rent<=nativeCap,'execution cost exceeds transaction native cap');ensure(rent<=nativeCap-BigInt(i.expected.maxFee),'rent exceeds transaction rent cap');
  if(i.kind==='swap'||i.kind==='buyback')ensure(BigInt(out.input??'0')===BigInt(i.amount)&&BigInt(out.output??'0')>=BigInt(i.expected.minOutput??'1'),'swap debit/output mismatch');
  if(i.kind==='burn')ensure(out.burned===i.amount,'burn amount mismatch');
  if(i.kind==='payout'||i.kind==='operations'){
   const expected=i.expected.transfers??[];ensure(out.transfers?.length===expected.length,'transfer count mismatch');
   const seen=new Set<string>();for(const tr of out.transfers??[]){ensure(!seen.has(tr.instruction),'duplicate transfer evidence');seen.add(tr.instruction);}
   for(const p of expected)ensure(out.transfers?.some(tr=>tr.asset===i.asset&&tr.destination===p.destination&&tr.amount===p.amount&&tr.source===i.expected.sourceTokenAccount),'recipient/asset/amount/source mismatch');
  }
  await this.db.tx(async t=>{await this.db.fence(t,lease);await this.db.lock(t);
   const current=(await t.query('SELECT status FROM intents WHERE id=$1 FOR UPDATE',[i.id])).rows[0];if(current.status==='finalized')return;
   ensure(!(await t.query('SELECT id FROM operating_expense_payments WHERE signature=$1',[out.signature])).rowCount,'signature already accounted as an operating expense; preserve intent for review');
   const original=(await t.query('SELECT approved_message_hash FROM attempts WHERE intent_id=$1 AND signature=$2',[i.id,out.signature])).rows[0];ensure(original,'unrecognized transaction signature');
   if(legacyNativeCost)ensure(out.nativeCostEvidence?.messageHash===original.approved_message_hash,'rent evidence does not match original signed message');
   await this.db.move(t,'network:'+out.signature,SOL,i.expected.costAccount,'external:network',fee+rent,{fee:fee.toString(),rent:rent.toString(),signature:out.signature},i.epoch_id);
   if(i.kind==='swap'||i.kind==='buyback'){
    await this.db.move(t,'debit:'+i.id,i.asset,i.expected.from,'external:swap',BigInt(out.input!),out,i.epoch_id);
    const asset=i.expected.outputAsset!;const acquired=BigInt(out.output!);
    if(i.kind==='buyback'){
     const from='burn-units:'+i.id;await this.db.move(t,'acquire:'+i.id,asset,'external:swap',from,acquired,out,i.epoch_id);
     await this.addIntent(t,{id:'burn:'+i.id,epoch_id:i.epoch_id,kind:'burn',asset,amount:acquired.toString(),status:'planned',expected:{inputAsset:asset,from,maxFee:i.expected.maxFee,costAccount:i.expected.costAccount,owner:i.expected.to}});
    }else{
     const epoch=(await t.query('SELECT snapshot_id FROM epochs WHERE id=$1',[i.epoch_id])).rows[0];const snap=await this.db.document<Snapshot>(epoch.snapshot_id,t);
     const rows=allocate(acquired,snap.owners.filter(x=>x.eligible));
     await this.db.move(t,'acquire:'+i.id,asset,'external:swap','liabilities',acquired,out,i.epoch_id);
     for(const r of rows)if(BigInt(r.amount)>0n)await t.query('INSERT INTO entitlements(id,epoch_id,asset,owner,amount) VALUES($1,$2,$3,$4,$5)',[hash([i.epoch_id,asset,r.owner]),i.epoch_id,asset,r.owner,r.amount]);
    }
   }else if(i.kind==='burn')await this.db.move(t,'burned:'+i.id,i.asset,i.expected.from,'external:burn',BigInt(i.amount),out,i.epoch_id);
   else {
    await this.db.move(t,'delivered:'+i.id,i.asset,i.expected.from,'external:delivered',BigInt(i.amount),out,i.epoch_id);
    if(i.kind==='payout'){await t.query('UPDATE entitlements e SET paid=e.paid+b.amount FROM batch_items b WHERE b.batch_id=$1 AND b.entitlement_id=e.id AND b.active',[i.id]);await t.query('UPDATE batch_items SET active=false WHERE batch_id=$1',[i.id]);}
   }
   await finalizeDeveloperPayout(this.db,t,i,out);
   await t.query('INSERT INTO chain_receipts(signature,slot,intent_id,evidence) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[out.signature,out.slot,i.id,canonical(out)]);
   await t.query("UPDATE attempts SET status='finalized',evidence=$2 WHERE signature=$1",[out.signature,canonical(out)]);
   await t.query("UPDATE intents SET status='finalized',result=$2,reason=null,updated_at=now() WHERE id=$1",[i.id,canonical(out)]);
   await t.query("UPDATE jobs SET state='done' WHERE id=$1",[i.id]);
   if(i.epoch_id)await this.refreshEpoch(t,i.epoch_id);
  });
 }
 async refreshEpoch(t:Tx,id:string){
  const legs=(await t.query("SELECT status FROM intents WHERE epoch_id=$1 AND kind='swap'",[id])).rows;
  const epoch=(await t.query('SELECT policy_id FROM epochs WHERE id=$1',[id])).rows[0];
  const policy=await this.db.document<Policy>(epoch.policy_id,t);
  const all=legs.length===policyBasketSize(policy)&&legs.every(x=>x.status==='finalized'),any=legs.some(x=>x.status==='finalized');
  await t.query('UPDATE epochs SET status=$2,reason=$3 WHERE id=$1',[id,all?'settled':any?'partial':'purchasing',all?'Accounting complete; unpaid entitlements remain payable':any?'Some purchases await execution; existing credits preserved':null]);
 }
 async schedulePayout(args:{asset:Asset;chain:Chain;price?:Price;ata:Map<string,{exists:boolean;valid:boolean;costMicroUsd?:bigint}>;policy:Policy;costAccount:string;lease:Lease;maxRecipients?:number;sourceTokenAccount:string}){
  return this.db.tx(async t=>{await this.db.fence(t,args.lease);await this.db.lock(t);
   ensure(!(await t.query('SELECT paused FROM control')).rows[0].paused,'new payout reservations paused');
   const rows=(await t.query('SELECT e.*,e.amount::text,e.paid::text FROM entitlements e WHERE e.asset=$1 AND e.paid<e.amount AND NOT EXISTS(SELECT 1 FROM batch_items b WHERE b.entitlement_id=e.id AND b.active) ORDER BY e.owner,e.id FOR UPDATE',[args.asset.mint])).rows;
   const groups=new Map<string,typeof rows>();for(const r of rows)groups.set(r.owner,[...(groups.get(r.owner)??[]),r]);
   const transfers:NonNullable<Plan['transfers']>=[];const selected:typeof rows=[];
   for(const [owner,items]of groups){const ata=args.ata.get(owner);if(!ata?.valid)continue;
    const amount=items.reduce((s,r)=>s+BigInt(r.amount)-BigInt(r.paid),0n);if(!economical(amount,args.asset.decimals,args.price,ata.exists,ata.costMicroUsd,args.policy))continue;
    transfers.push({owner,destination:args.chain.destination(owner,args.asset.mint),amount:amount.toString(),entitlements:items.map(r=>r.id)});selected.push(...items);
    if(transfers.length>=Math.min(args.maxRecipients??4,4))break;
   }
   if(!transfers.length)return null;
   const id='payout:'+hash(selected.map(r=>[r.id,r.paid]));const amount=transfers.reduce((s,x)=>s+BigInt(x.amount),0n);
   if((await t.query('SELECT id FROM intents WHERE id=$1',[id])).rowCount)return id;
   await this.db.move(t,'reserve:'+id,args.asset.mint,'liabilities','reserved:'+id,amount,{entitlements:selected.map(r=>r.id)});
   await this.addIntent(t,{id,epoch_id:null,kind:'payout',asset:args.asset.mint,amount:amount.toString(),status:'planned',expected:{inputAsset:args.asset.mint,from:'reserved:'+id,transfers,costAccount:args.costAccount,maxFee:this.transactionFeeCap.toString(),decimals:args.asset.decimals,sourceTokenAccount:args.sourceTokenAccount}});
   await t.query('INSERT INTO payout_batches(id,asset) VALUES($1,$2)',[id,args.asset.mint]);
   for(const r of selected)await t.query('INSERT INTO batch_items(batch_id,entitlement_id,amount,instruction_index) VALUES($1,$2,$3,$4)',[id,r.id,(BigInt(r.amount)-BigInt(r.paid)).toString(),transfers.findIndex(p=>p.owner===r.owner)]);
   return id;
  });
 }
 async returnUnusedCosts(epoch:string,lease:Lease){await this.db.tx(async t=>{await this.db.fence(t,lease);await this.db.lock(t);
  ensure(!(await t.query("SELECT id FROM intents WHERE expected->>'costAccount'=$1 AND status<>'finalized'",['cost:'+epoch])).rowCount,'in-flight cost obligations');
  const amount=await this.db.balance(SOL,'cost:'+epoch,t);if(amount===0n)return;const sources=(await t.query("SELECT receipt_id AS owner,amount::text AS balance FROM funding_receipt_uses WHERE epoch_id=$1 AND kind='commitment'",[epoch])).rows;
  const refunds=allocate(amount,sources);await this.db.move(t,'cost-return:'+epoch,SOL,'cost:'+epoch,'revenue',amount,{rule:'unused direct-cost allowance returns to original revenue sources proportionally',refunds},epoch);
  for(const r of refunds)if(BigInt(r.amount)>0n)await t.query("INSERT INTO funding_receipt_uses(id,epoch_id,receipt_id,amount,kind) VALUES($1,$2,$3,$4,'cost_refund')",['refund:'+epoch+':'+r.owner,epoch,r.owner,(-BigInt(r.amount)).toString()]);
 });}
 async scheduleOperations(epoch:string,recipient:string,treasury:string,lease:Lease){return this.db.tx(async t=>{await this.db.fence(t,lease);await this.db.lock(t);const id='operations:'+epoch;
  if((await t.query('SELECT id FROM intents WHERE id=$1',[id])).rowCount)return id;const amount=await this.db.balance(SOL,id,t);if(amount===0n)return null;
  await this.addIntent(t,{id,epoch_id:epoch,kind:'operations',asset:SOL,amount:amount.toString(),status:'planned',expected:{inputAsset:SOL,from:id,maxFee:this.transactionFeeCap.toString(),costAccount:'cost:'+epoch,sourceTokenAccount:treasury,transfers:[{owner:recipient,destination:recipient,amount:amount.toString(),entitlements:[]}]}});return id;
 });}
 async reconcile(actual:{asset:string;amount:string;slot:number}[]){
  return this.db.tx(async t=>{
   // Every accounting mutation uses the control lock. Read ledger and pending work coherently.
   await this.db.lock(t);const balances=await this.db.balances(t);const reports=[];
   const intents=(await t.query("SELECT id,kind,asset,amount::text,expected FROM intents WHERE status IN ('signed','submitted','unknown','confirmed','needs_review')")).rows as Intent[];
   // RPC balances may have been sampled before this lock was acquired. Include
   // every finalized cash movement, not only worker-owned transaction attempts.
   const latest=(await t.query(`SELECT coalesce(max(slot),0)::text AS slot FROM (
    SELECT (evidence->>'slot')::bigint AS slot FROM attempts WHERE status IN ('finalized','failed')
    UNION ALL SELECT (evidence->>'slot')::bigint FROM incoming_transfers
    UNION ALL SELECT slot FROM operating_expense_payments
   ) AS finalized_movements`)).rows[0];
   for(const a of actual){
    ensure(Number.isSafeInteger(a.slot)&&a.slot>0&&/^\d+$/.test(a.amount),'invalid reconciliation observation');
    const expected=balances.filter(b=>b.asset===a.asset&&!b.account.startsWith('external:')).reduce((n,b)=>n+BigInt(b.amount),0n);
    const inflight=intents.filter(i=>i.asset===a.asset||i.expected.outputAsset===a.asset||a.asset===SOL);
    const unknownNativeCost=a.asset===SOL&&inflight.some(i=>maximumNativeCost(i)===null);
    const debitBound=inflight.reduce((n,i)=>n+(i.asset===a.asset?BigInt(i.amount):0n)+(a.asset===SOL?(maximumNativeCost(i)??0n):0n),0n);
    const mayCredit=inflight.some(i=>i.expected.outputAsset===a.asset);
    const delta=BigInt(a.amount)-expected;
    const stale=a.slot<Number(latest.slot);
    // An in-flight token transfer also spends SOL fees/rent, but cannot hide an arbitrary deficit.
    const explained=inflight.length>0&&(delta===0n||delta<0n&&!unknownNativeCost&&-delta<=debitBound||delta>0n&&mayCredit);
    const state=stale?'stale_observation':delta<0n&&unknownNativeCost?'cost_bound_unavailable':explained?'in_flight':delta===0n?'balanced':delta<0n?'deficit':'unclassified_surplus';
    const report={...a,expected:expected.toString(),delta:delta.toString(),state,inflight:inflight.map(i=>i.id),maximumPendingDebit:unknownNativeCost?null:debitBound.toString(),ledgerFinalizedSlot:Number(latest.slot)};reports.push(report);
    if(!stale&&!explained&&delta!==0n)await this.db.recordIncident(t,'reconciliation_'+state,report);
   }
   await this.db.doc('reconciliation',{at:new Date().toISOString(),reports},t);return reports;
  });
 }
 async fundingRoute(expected:unknown,observed:unknown){if(hash(expected)!==hash(observed)){await this.db.incident('funding route changed',{expected,observed});return false;}return true;}
}
