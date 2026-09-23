import { Engine, Chain, Intent, Signed } from '../../packages/core/engine.js';
import { Lease, Tx } from '../../packages/db/store.js';
import { canonical, ensure, SOL } from '../../packages/core/model.js';
import { maximumNativeCost } from '../../packages/core/execution-cost.js';
export type CrashPoint='after_sign'|'after_send'|'after_success';
export interface ExecutionOptions {
 /** Inspection and accounting only. No preparation, signing or rebroadcast. */
 recoveryOnly?:boolean;
 /** Re-read effective approval, funding route and execution conditions; throw to deny. */
 authorizeNewSigning?:(intent:Intent)=>Promise<void>;
 /** Recheck ledger obligations under the final control lock after external reads; no network I/O. */
 authorizeNewSigningLocked?:(intent:Intent,tx:Tx)=>Promise<void>;
}
export const retryDelaySeconds=(failures:number)=>Math.min(300,2**Math.min(9,Math.max(1,failures)));
const inflightStatuses="('signed','submitted','unknown','confirmed','needs_review')";
async function defer(engine:Engine,id:string,reason:string,lease:Lease,t?:Tx){
 const write=async(tx:Tx)=>{await engine.db.fence(tx,lease);await tx.query(`UPDATE intents SET status='waiting_for_route',reason=$2,retry_count=retry_count+1,last_attempt_at=clock_timestamp(),next_attempt_at=clock_timestamp()+least(300,power(2,least(9,retry_count+1)))*interval '1 second',updated_at=clock_timestamp() WHERE id=$1`,[id,reason.slice(0,200)]);};
 if(t)await write(t);else await engine.db.tx(write);
}
export async function runIntent(engine:Engine,chain:Chain,id:string,lease:Lease,crash?:CrashPoint,options:ExecutionOptions={}){
 const db=engine.db;ensure(engine.mode===chain.mode,'chain/mode mismatch');
 const row=await db.pool.query('SELECT *,amount::text FROM intents WHERE id=$1',[id]);ensure(row.rowCount,'intent missing');const i=row.rows[0] as Intent;
 if(i.status==='finalized')return;
 let attempt=(await db.pool.query("SELECT * FROM attempts WHERE intent_id=$1 AND status NOT IN ('failed','expired_verified') ORDER BY id DESC LIMIT 1",[id])).rows[0];
 if(!attempt){
  if(options.recoveryOnly||i.status==='needs_review')return;
  const authorize=async()=>{
   ensure(engine.mode!=='live'||options.authorizeNewSigning,'live signing requires a fresh execution authorization');
   await options.authorizeNewSigning?.(i);
   // Run after asynchronous external authorization and once more at the adapter's signer boundary.
   await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
    ensure(!(await t.query('SELECT paused FROM control')).rows[0].paused,'new transaction signing paused');
    ensure(await db.balance(i.asset,i.expected.from,t)>=BigInt(i.amount),'intent reserve missing');
    const availableCost=(await db.balance(SOL,i.expected.costAccount,t))-(i.expected.costAccount==='reserve'?engine.minimumReserve:0n);
    // This is a cash authorization only; the adapter must bind a separate transaction cost cap.
    ensure(availableCost>=BigInt(i.expected.maxFee),'cost reserve too small');i.expected={...i.expected,maxTotalCost:availableCost.toString()};
    const busy=await t.query(`SELECT id FROM intents WHERE id<>$1 AND status IN ${inflightStatuses}`,[id]);ensure(!busy.rowCount,'reconcile in-flight treasury operations first');
    await options.authorizeNewSigningLocked?.(i,t);
    await db.fence(t,lease);
   });
  };
  // Preserve direct-call guard failures for operators. tick() fairly defers denied unsigned work.
  await authorize();
  let signed:Signed;
  try {signed=await chain.prepare(i,authorize);}catch(e){await defer(engine,id,(e as Error).message,lease);return;}
  const persisted=await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   // Expense recording takes the same control lock and rejects existing attempts in the other order.
   const expenses=(await t.query("SELECT to_regclass('operating_expense_payments') AS relation")).rows[0].relation;
   if(expenses&&(await t.query('SELECT id FROM operating_expense_payments WHERE signature=$1 LIMIT 1',[signed.signature])).rowCount){
    const reason='Prepared signature already attributed to an operating expense; reservation retained for review';
    await defer(engine,id,reason,lease,t);
    await t.query('INSERT INTO incidents(kind,details) VALUES($1,$2)',['execution_signature_already_attributed',canonical({intentId:id,signature:signed.signature})]);
    await t.query('UPDATE control SET paused=true,reason=$1',[reason]);return false;
   }
   if(signed.approvedPlan){ensure(signed.approvedPlan.inputAsset===i.expected.inputAsset&&signed.approvedPlan.outputAsset===i.expected.outputAsset&&signed.approvedPlan.from===i.expected.from&&signed.approvedPlan.to===i.expected.to,'prepared plan changed economic identity');ensure(BigInt(signed.approvedPlan.minOutput??'0')>=BigInt(i.expected.minOutput??'0'),'prepared quote loosened minimum output');i.expected=signed.approvedPlan;}
   const nativeCap=maximumNativeCost(i);ensure(nativeCap!==null&&nativeCap<=BigInt(String(i.expected.maxTotalCost)),'prepared transaction omitted or exceeded its native cost bound');
   await t.query('UPDATE intents SET expected=$2,last_attempt_at=clock_timestamp() WHERE id=$1',[id,canonical(i.expected)]);
   await t.query(`INSERT INTO attempts(intent_id,attempt_no,signature,signed_payload,blockhash,last_valid_height,approved_message_hash) SELECT $1,coalesce(max(attempt_no),0)+1,$2,$3,$4,$5,$6 FROM attempts WHERE intent_id=$1`,[id,signed.signature,signed.bytes,signed.blockhash,signed.lastValidHeight,signed.messageHash]);
   await t.query("UPDATE intents SET status='signed',reason=null WHERE id=$1",[id]);
  });
  if(persisted===false)return;
  if(crash==='after_sign')throw Error('INJECTED_CRASH after_sign');
  attempt=(await db.pool.query('SELECT * FROM attempts WHERE signature=$1',[signed.signature])).rows[0];
 }
 const signed:Signed={signature:attempt.signature,bytes:attempt.signed_payload,blockhash:attempt.blockhash,lastValidHeight:Number(attempt.last_valid_height),messageHash:attempt.approved_message_hash};
 const outcome=await chain.inspect(i,signed);ensure(outcome.signature===signed.signature,'inspection changed original signature');
 if(outcome.status==='finalized'){
  if(crash==='after_success')throw Error('INJECTED_CRASH after_success');
  try{await engine.apply(i,outcome,lease);}catch(e){await db.incident('settlement evidence or ledger mismatch',{intent:id,reason:(e as Error).message});throw e;}return;
 }
 if(outcome.status==='failed'){
  const fee=BigInt(outcome.fee??'0');ensure(outcome.slot&&fee>=0n&&fee<=BigInt(i.expected.maxFee),'invalid finalized failure evidence');
  await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   await db.move(t,'failed-fee:'+signed.signature,SOL,i.expected.costAccount,'external:network',fee,outcome,i.epoch_id);
   await t.query("UPDATE attempts SET status='failed',evidence=$2 WHERE signature=$1",[signed.signature,canonical(outcome)]);
   await defer(engine,id,'Finalized transaction failure; reservation preserved',lease,t);
  });return;
 }
 const review=i.status==='needs_review'||attempt.status==='needs_review'||outcome.status==='expired';
 await db.tx(async t=>{await db.fence(t,lease);
  await t.query('UPDATE attempts SET status=$2,evidence=$3 WHERE signature=$1',[signed.signature,review?'needs_review':'unknown',canonical(outcome)]);
  await t.query('UPDATE intents SET status=$2,reason=$3 WHERE id=$1',[id,review?'needs_review':'unknown',review?'Original signature requires finalized history evidence; no replacement authorized':null]);
 });
 if(options.recoveryOnly||review)return;
 const authorizeBroadcast=async()=>{
  ensure(engine.mode!=='live'||options.authorizeNewSigning,'live broadcast requires a fresh execution authorization');
  await options.authorizeNewSigning?.(i);
  await db.tx(async t=>{await db.fence(t,lease);await db.lock(t);
   ensure(!(await t.query('SELECT paused FROM control')).rows[0].paused,'transaction rebroadcast paused');
   await options.authorizeNewSigningLocked?.(i,t);
   await db.fence(t,lease);
  });
 };
 try{await authorizeBroadcast();}catch{return;}
 // While unpaused, only the original bytes may be resent and only after adapter validity checks.
 try{await chain.broadcast(signed,authorizeBroadcast);}catch{/* unknown outcome remains durable; reconcile on next tick */}
 if(crash==='after_send')throw Error('INJECTED_CRASH after_send');
}
export async function tick(engine:Engine,chain:Chain,owner:string,options:ExecutionOptions={}){
 const lease=await engine.db.lease(owner,120);if(!lease)return {busy:true};
 const inflight=(await engine.db.pool.query(`SELECT id FROM intents WHERE status IN ${inflightStatuses} ORDER BY created_at,id`)).rows;
 for(const i of inflight)await runIntent(engine,chain,i.id,lease,undefined,options);
 if((await engine.db.pool.query(`SELECT id FROM intents WHERE status IN ${inflightStatuses}`)).rowCount)return {reconciling:true};
 if(options.recoveryOnly)return {recoveryOnly:true,processed:inflight.length};
 if((await engine.db.pool.query('SELECT paused FROM control')).rows[0].paused)return {paused:true};
 const jobs=(await engine.db.pool.query("SELECT id FROM intents WHERE status IN ('planned','waiting_for_route') AND next_attempt_at<=clock_timestamp() ORDER BY last_attempt_at NULLS FIRST,created_at,id LIMIT 1")).rows;
 for(const j of jobs){try{await runIntent(engine,chain,j.id,lease,undefined,options);}catch(e){
  // A denied unsigned job must not starve other due jobs. Signed failures remain serialized.
  const unresolved=(await engine.db.pool.query(`SELECT id FROM attempts WHERE intent_id=$1 AND status IN ${inflightStatuses}`,[j.id])).rowCount;
  if(unresolved)throw e;await defer(engine,j.id,(e as Error).message,lease);
 }}
 return {processed:inflight.length+jobs.length};
}
