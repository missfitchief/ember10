import type { Chain, Engine } from '../../packages/core/engine.js';
import type { Lease } from '../../packages/db/store.js';
import { canonical, ensure } from '../../packages/core/model.js';
import { runIntent } from './runner.js';
export interface RecoveryRequest { requestId:string; intentId:string; signature:string; actor:string; reason:string; evidenceReference:string }
export interface RecoveryResult { requestId:string; intentId:string; signature:string; status:string; reservationRetained:boolean; observation:Record<string,unknown> }
/** The authenticated caller requests reinspection, never supplies a terminal outcome or a replacement. */
export async function recoverIntent(engine:Engine,chain:Chain,request:RecoveryRequest,authorize:()=>Promise<void>,providedLease?:Lease):Promise<RecoveryResult>{
 ensure(typeof authorize==='function','recovery authorization required');await authorize();
 for(const [key,value]of Object.entries(request))ensure(typeof value==='string'&&value.trim().length>0&&value.length<=500,`invalid recovery ${key}`);
 ensure(/^[a-zA-Z0-9_.:-]{1,100}$/.test(request.requestId),'invalid recovery request ID');
 const previous=(await engine.db.pool.query('SELECT * FROM execution_recoveries WHERE request_id=$1',[request.requestId])).rows[0];
 if(previous){ensure(previous.intent_id===request.intentId&&previous.signature===request.signature&&previous.actor===request.actor&&previous.reason===request.reason&&previous.evidence_reference===request.evidenceReference,'recovery request ID already used for different evidence');return {requestId:request.requestId,intentId:request.intentId,signature:request.signature,status:previous.after_status,reservationRetained:previous.after_status!=='finalized',observation:previous.observation};}
 const before=(await engine.db.pool.query('SELECT i.status,a.id FROM intents i JOIN attempts a ON a.intent_id=i.id WHERE i.id=$1 AND a.signature=$2',[request.intentId,request.signature])).rows[0];
 ensure(before,'original signed attempt not found');
 const active=(await engine.db.pool.query("SELECT signature FROM attempts WHERE intent_id=$1 AND status NOT IN ('failed','expired_verified') ORDER BY id DESC LIMIT 1",[request.intentId])).rows[0];
 ensure(active?.signature===request.signature,'recovery must reference the current original attempt');
 const lease=providedLease??await engine.db.lease('manual-recovery',120);ensure(lease,'worker busy; stop new work and retry recovery');
 await engine.db.tx(async t=>{await engine.db.fence(t,lease);await t.query('INSERT INTO operator_audit(actor,action,body) VALUES($1,$2,$3)',[request.actor,'execution_recovery_requested',canonical(request)]);});
 await runIntent(engine,chain,request.intentId,lease,undefined,{recoveryOnly:true});
 const after=(await engine.db.pool.query('SELECT i.status,a.evidence FROM intents i JOIN attempts a ON a.intent_id=i.id WHERE i.id=$1 AND a.signature=$2',[request.intentId,request.signature])).rows[0];
 const evidence=after.evidence??{};
 const observation={status:evidence.status??after.status,signature:request.signature,slot:evidence.slot??null,fee:evidence.fee??null,rent:evidence.rent??null,recoveryOnly:true,replacementAuthorized:false};
 await engine.db.tx(async t=>{await engine.db.fence(t,lease);await t.query('INSERT INTO execution_recoveries(request_id,intent_id,signature,actor,reason,evidence_reference,before_status,after_status,observation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(request_id) DO NOTHING',[request.requestId,request.intentId,request.signature,request.actor,request.reason,request.evidenceReference,before.status,after.status,canonical(observation)]);});
 return {requestId:request.requestId,intentId:request.intentId,signature:request.signature,status:after.status,reservationRetained:after.status!=='finalized',observation};
}
