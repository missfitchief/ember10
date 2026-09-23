import { Engine, Chain, Intent, Signed } from '../../packages/core/engine.js';
import { Lease } from '../../packages/db/store.js';
import { canonical, ensure, SOL } from '../../packages/core/model.js';
export type CrashPoint='after_sign'|'after_send'|'after_success';
export async function runIntent(engine:Engine,chain:Chain,id:string,lease:Lease,crash?:CrashPoint){
 const db=engine.db;ensure(engine.mode===chain.mode,'chain/mode mismatch');
 const row=await db.pool.query('SELECT *,amount::text FROM intents WHERE id=$1',[id]);ensure(row.rowCount,'intent missing');const i=row.rows[0] as Intent;
 if(['finalized','needs_review'].includes(i.status))return;
 let attempt=(await db.pool.query("SELECT * FROM attempts WHERE intent_id=$1 AND status NOT IN ('failed','expired_verified') ORDER BY id DESC LIMIT 1",[id])).rows[0];
 if(!attempt){
  // Authorize and reserve before external preparation. No network call holds a DB transaction.
  await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   ensure(!(await t.query('SELECT paused FROM control')).rows[0].paused,'new transaction signing paused');
   ensure(await db.balance(i.asset,i.expected.from,t)>=BigInt(i.amount),'intent reserve missing');
   const availableCost=(await db.balance(SOL,i.expected.costAccount,t))-(i.expected.costAccount==='reserve'?engine.minimumReserve:0n);
   ensure(availableCost>=BigInt(i.expected.maxFee),'cost reserve too small');i.expected={...i.expected,maxTotalCost:availableCost.toString()};
   const busy=await t.query("SELECT id FROM intents WHERE id<>$1 AND status IN ('signed','submitted','unknown','confirmed','needs_review')",[id]);ensure(!busy.rowCount,'reconcile in-flight treasury operations first');
  });
  let signed:Signed;
  try {signed=await chain.prepare(i);}catch(e){await db.tx(async t=>{await db.fence(t,lease);await t.query("UPDATE intents SET status='waiting_for_route',reason=$2 WHERE id=$1",[id,(e as Error).message.slice(0,200)]);});return;}
  await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   if(signed.approvedPlan){ensure(signed.approvedPlan.inputAsset===i.expected.inputAsset&&signed.approvedPlan.outputAsset===i.expected.outputAsset&&signed.approvedPlan.from===i.expected.from&&signed.approvedPlan.to===i.expected.to,'prepared plan changed economic identity');ensure(BigInt(signed.approvedPlan.minOutput??'0')>=BigInt(i.expected.minOutput??'0'),'prepared quote loosened minimum output');i.expected=signed.approvedPlan;await t.query('UPDATE intents SET expected=$2 WHERE id=$1',[id,canonical(i.expected)]);}
   await t.query(`INSERT INTO attempts(intent_id,attempt_no,signature,signed_payload,blockhash,last_valid_height,approved_message_hash) SELECT $1,coalesce(max(attempt_no),0)+1,$2,$3,$4,$5,$6 FROM attempts WHERE intent_id=$1`,[id,signed.signature,signed.bytes,signed.blockhash,signed.lastValidHeight,signed.messageHash]);
   await t.query("UPDATE intents SET status='signed',reason=null WHERE id=$1",[id]);
  });
  if(crash==='after_sign')throw Error('INJECTED_CRASH after_sign');
  attempt=(await db.pool.query('SELECT * FROM attempts WHERE signature=$1',[signed.signature])).rows[0];
 }
 const signed:Signed={signature:attempt.signature,bytes:attempt.signed_payload,blockhash:attempt.blockhash,lastValidHeight:Number(attempt.last_valid_height),messageHash:attempt.approved_message_hash};
 const outcome=await chain.inspect(i,signed);
 if(outcome.status==='finalized'){
  if(crash==='after_success')throw Error('INJECTED_CRASH after_success');
  try{await engine.apply(i,outcome,lease);}catch(e){await db.incident('settlement evidence or ledger mismatch',{intent:id,reason:(e as Error).message});throw e;}return;
 }
 if(outcome.status==='failed'){
  await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   await db.move(t,'failed-fee:'+signed.signature,SOL,i.expected.costAccount,'external:network',BigInt(outcome.fee??'0'),outcome,i.epoch_id);
   await t.query("UPDATE attempts SET status='failed',evidence=$2 WHERE signature=$1",[signed.signature,canonical(outcome)]);
   await t.query("UPDATE intents SET status='waiting_for_route',reason='Finalized transaction failure; reservation preserved' WHERE id=$1",[id]);
  });return;
 }
 if(outcome.status==='expired'){
  // A null RPC result is never enough to authorize another live transaction.
  await db.tx(async t=>{await db.fence(t,lease);await t.query("UPDATE attempts SET status='needs_review',evidence=$2 WHERE signature=$1",[signed.signature,canonical(outcome)]);await t.query("UPDATE intents SET status='needs_review',reason='Expiry requires archive history review; no automatic replacement' WHERE id=$1",[id]);});return;
 }
 await db.tx(async t=>{await db.fence(t,lease);await t.query("UPDATE intents SET status='unknown' WHERE id=$1",[id]);await t.query("UPDATE attempts SET status='unknown' WHERE signature=$1",[signed.signature]);});
 // Even an RPC timeout can only cause an identical-byte resend while validity is established by the adapter.
 try{await chain.broadcast(signed);}catch{/* unknown outcome remains durable; reconcile on next tick */}
 if(crash==='after_send')throw Error('INJECTED_CRASH after_send');
}
export async function tick(engine:Engine,chain:Chain,owner:string){
 const lease=await engine.db.lease(owner,120);if(!lease)return {busy:true};
 const inflight=(await engine.db.pool.query("SELECT id FROM intents WHERE status IN ('signed','submitted','unknown','confirmed') ORDER BY created_at,id")).rows;
 for(const i of inflight)await runIntent(engine,chain,i.id,lease);
 if((await engine.db.pool.query("SELECT id FROM intents WHERE status IN ('signed','submitted','unknown','confirmed','needs_review')")).rowCount)return {reconciling:true};
 if((await engine.db.pool.query('SELECT paused FROM control')).rows[0].paused)return {paused:true};
 const jobs=(await engine.db.pool.query("SELECT id FROM intents WHERE status IN ('planned','waiting_for_route') ORDER BY CASE WHEN kind='payout' THEN 0 WHEN kind='swap' THEN 1 ELSE 2 END,created_at,id LIMIT 1")).rows;
 for(const j of jobs)await runIntent(engine,chain,j.id,lease);
 return {processed:inflight.length+jobs.length};
}
