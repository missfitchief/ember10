import type { Intent } from './engine.js';
import type { Approval } from './approval.js';
import type { Store } from '../db/store.js';
import type { Basket } from './selection.js';
import { ensure, hash, type Policy } from './model.js';
export interface MintAdmission { version:'ember-provenance-v1'; mint:string; policyHash:string; evidenceHash:string; expiresAt:number }
/** A catalogue listing is never admission. Purchases must belong to an immutable funded epoch. */
export async function admitFundedMint(db:Store, i:Intent, approval:Approval):Promise<MintAdmission> {
 ensure(i.epoch_id && ['swap','buyback'].includes(i.kind), 'funded purchase required for asset admission');
 const epoch=(await db.pool.query('SELECT basket_id,policy_id FROM epochs WHERE id=$1',[i.epoch_id])).rows[0];ensure(epoch,'funded epoch missing');
 const basket=await db.document<Basket>(epoch.basket_id), policy=await db.document<Policy>(epoch.policy_id);
 ensure(basket.policyHash===hash(policy),'frozen admission policy mismatch');
 const mint=i.expected.outputAsset!;
 if(i.kind==='buyback')ensure(mint===approval.ourMint,'buyback identity changed');
 else {const member=basket.selected.find(x=>x.mint===mint);ensure(member?.provenanceVerified&&member.poolVerified&&member.reasons.length===0,'mint has no verified funded provenance');}
 return {version:'ember-provenance-v1',mint,policyHash:hash(policy),evidenceHash:hash(basket),expiresAt:Date.now()+15000};
}
