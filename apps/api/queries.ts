import { Store } from '../../packages/db/store.js';
import { Config } from '../../packages/core/config.js';
import { defaultPolicy, ensure, SOL } from '../../packages/core/model.js';
import { publicEvidence } from './public-evidence.js';
export async function status(db:Store,c:Config){
 const control=(await db.pool.query('SELECT paused,reason FROM control')).rows[0];
 const discovery=(await db.pool.query("SELECT body,created_at FROM documents WHERE kind='observation' AND body->>'type'='observed_market' ORDER BY created_at DESC LIMIT 1")).rows[0];
 const worker=(await db.pool.query("SELECT expires_at FROM leases WHERE name='worker'")).rows[0];
 return {mode:c.MODE,cluster:c.CLUSTER,phase:c.OUR_MINT?'configured':'prelaunch',broadcastEnabled:c.BROADCAST_ENABLED,paused:control.paused,waitingReason:control.reason,
  configured:!!c.OUR_MINT,discovery:discovery?{type:'observed_market',status:discovery.body.status,fetchedAt:discovery.body.fetchedAt??null,coverage:discovery.body.normalized?.coverage??null,evidenceHash:discovery.body.normalized?.evidenceHash??null}:null,discoveryStale:!discovery||['stale','unavailable'].includes(discovery.body.status)||!discovery.body.fetchedAt||Date.now()-Date.parse(discovery.body.fetchedAt)>180000,
  workerActive:!!worker&&new Date(worker.expires_at).getTime()>Date.now(),asOf:new Date().toISOString(),nextEvaluation:null};
}
export async function project(db:Store,c:Config){const r=(await db.pool.query("SELECT id,body FROM documents WHERE kind='policy' ORDER BY created_at DESC LIMIT 1")).rows[0];return {name:'EMBER10',workingName:true,nameCollision:true,mint:c.OUR_MINT??null,pool:c.OUR_POOL??null,treasury:c.TREASURY??null,operations:c.OPERATIONS??null,policy:r?.body??defaultPolicy,policyVersion:r?.id??'prelaunch-draft',buyUrl:c.MODE==='live'&&c.OUR_MINT&&c.OUR_POOL?`https://embercurve.fun/t/${c.OUR_MINT}`:null,disclosure:'Rewards depend on received creator fees. The service controls the reward treasury. Independent project; no official Ember affiliation.'};}
export async function basket(db:Store){const r=(await db.pool.query("SELECT id,body,created_at FROM documents WHERE kind='observation' AND body->>'type'='eligible_selection' ORDER BY created_at DESC LIMIT 1")).rows[0];const stale=!!r&&Date.now()-r.body.observedAt>r.body.policy.maxDataAgeSeconds*1000;return r?{id:r.id,...r.body,basket:stale?null:r.body.basket,stale,ready:!stale&&r.body.status==='ready'&&!!r.body.basket?.ready}:{id:null,selected:[],universe:[],eligibleCount:0,ready:false,stale:false,reason:'No current verified selection has been produced'};}
export async function epochs(db:Store,limit=20,before?:string){const rows=(await db.pool.query(`SELECT id,status,reason,funding,created_at FROM epochs WHERE ($2::text IS NULL OR id<$2) ORDER BY id DESC LIMIT $1`,[limit+1,before??null])).rows;return {items:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].id:null};}
export async function exportEpoch(db:Store,id:string){
 const e=(await db.pool.query('SELECT * FROM epochs WHERE id=$1',[id])).rows[0];ensure(e,'epoch not found');const mode=(await db.pool.query('SELECT mode FROM installation')).rows[0].mode;
 const entitlements=(await db.pool.query('SELECT id,asset,owner,amount::text,paid::text,(amount-paid)::text AS unpaid FROM entitlements WHERE epoch_id=$1 ORDER BY asset,owner',[id])).rows;
 const intents=(await db.pool.query('SELECT id,kind,asset,amount::text,status,result,reason FROM intents WHERE epoch_id=$1 ORDER BY id',[id])).rows;
 const transfers=(await db.pool.query(`SELECT DISTINCT i.id,i.asset,i.status,i.result FROM intents i JOIN batch_items b ON b.batch_id=i.id JOIN entitlements e ON e.id=b.entitlement_id WHERE e.epoch_id=$1 ORDER BY i.id`,[id])).rows;
 const receipts=(await db.pool.query('SELECT id,signature,instruction,asset,amount::text,destination,classification FROM incoming_transfers WHERE id=ANY($1::text[])',[e.funding.receiptIds??[]])).rows;
 const fundingUses=(await db.pool.query('SELECT receipt_id,amount::text,kind FROM funding_receipt_uses WHERE epoch_id=$1 ORDER BY id',[id])).rows;
 const ledger=(await db.pool.query('SELECT e.id,e.kind,e.evidence,p.asset,p.account,p.amount::text FROM ledger_events e LEFT JOIN postings p ON p.event_id=e.id WHERE e.epoch_id=$1 ORDER BY e.created_at,p.line',[id])).rows;
 return {schema:'ember5.epoch.v1',mode,testOnly:mode!=='live',epoch:e,policy:await db.document(e.policy_id),basket:await db.document(e.basket_id),snapshot:await db.document(e.snapshot_id),fundingReceipts:receipts,fundingUses,intents:intents.map(i=>({...i,result:publicEvidence(i.result),reason:i.reason?'Execution deferred; authenticated operator details available':null})),entitlements,transfers:transfers.map(i=>({...i,result:publicEvidence(i.result)})),ledger:ledger.map(e=>({...e,evidence:publicEvidence(e.evidence)})),definitions:{settled:'Purchase accounting complete; unpaid credits can remain.',paid:'Verified finalized delivery only.',amounts:'All money is decimal-string base units.'}};
}
export async function wallet(db:Store,address:string){const entitlements=(await db.pool.query('SELECT asset,sum(amount)::text AS credited,sum(paid)::text AS paid,sum(amount-paid)::text AS pending FROM entitlements WHERE owner=$1 GROUP BY asset ORDER BY asset',[address])).rows;
 const snapshot=(await db.pool.query("SELECT body FROM documents WHERE kind='snapshot' ORDER BY created_at DESC LIMIT 1")).rows[0]?.body;
 const owner=snapshot?.owners.find((x:{owner:string})=>x.owner===address);
 const deliveries=(await db.pool.query(`SELECT DISTINCT i.id,i.asset,i.status,i.result FROM intents i JOIN batch_items b ON b.batch_id=i.id JOIN entitlements e ON e.id=b.entitlement_id WHERE e.owner=$1 ORDER BY i.id DESC LIMIT 100`,[address])).rows;
 return {address,status:!snapshot&&!entitlements.length&&!deliveries.length?'unavailable':'available',eligibility:owner??null,snapshotSlot:snapshot?.slot??null,entitlements,deliveries:deliveries.map(i=>({...i,result:publicEvidence(i.result)})),reason:!snapshot?'No project holder snapshot yet; eligibility is unknown':!owner?'Address did not hold project tokens at the latest snapshot':owner.reason};
}
export async function transparency(db:Store){
 const received=(await db.pool.query("SELECT coalesce(sum(amount),0)::text AS amount FROM incoming_transfers WHERE classification='creator_fee' AND asset=$1",[SOL])).rows[0].amount;
 const assets=(await db.pool.query('SELECT * FROM assets ORDER BY symbol')).rows;
 const accrued=(await db.pool.query('SELECT asset,sum(amount)::text AS credited,sum(paid)::text AS paid,sum(amount-paid)::text AS pending FROM entitlements GROUP BY asset ORDER BY asset')).rows;
 const txCount=(await db.pool.query("SELECT count(DISTINCT signature)::text AS n FROM chain_receipts WHERE intent_id IN(SELECT id FROM intents WHERE kind='payout')")).rows[0].n;
 const burns=(await db.pool.query("SELECT asset,sum(amount)::text AS amount FROM intents WHERE kind='burn' AND status='finalized' GROUP BY asset")).rows;
 const reconciliation=(await db.pool.query("SELECT body FROM documents WHERE kind='reconciliation' ORDER BY created_at DESC LIMIT 1")).rows[0]?.body??null;
 const incidents=(await db.pool.query('SELECT kind,created_at FROM incidents WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 10')).rows;
 const balances=await db.balances(),recorded=received!=='0'||balances.length>0||accrued.length>0||!!reconciliation;
 const changed=(await db.pool.query('SELECT max(created_at) AS at FROM ledger_events')).rows[0].at;
 const reports=reconciliation?.reports??[],asOf=Date.parse(reconciliation?.at??''),current=Number.isFinite(asOf)&&Date.now()-asOf<=180000&&(!changed||new Date(changed).getTime()<=asOf);
 const health=incidents.length?'needs_review':reports.some((r:{state:string})=>r.state==='stale_observation')||reconciliation&&!current?'stale':reports.length&&reports.every((r:{state:string})=>r.state==='balanced')?'reconciled':reports.some((r:{state:string})=>r.state==='in_flight')?'pending':'not_yet_verified';
 return {status:recorded?'available':'unavailable',receivedLamports:recorded?received:null,assets,accrued,finalizedPayoutTransactions:recorded?txCount:null,burns,balances,reconciliation,incidents,accountingHealth:recorded?health:'unavailable'};
}
export function csv(rows:Record<string,unknown>[]){const keys=['asset','owner','amount','paid','unpaid'];const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return keys.join(',')+'\n'+rows.map(row=>keys.map(k=>cell(row[k])).join(',')).join('\n');}
