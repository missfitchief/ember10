import { Asset, ensure, fresh, hash, Policy, SPL, policyBasketSize } from './model.js';
export interface Candidate extends Asset {
 pool:string; config:string; provenanceVerified:boolean; poolVerified:boolean; graduated:boolean; createdAt:number;
 liquidityMicroUsd:string; volumeMicroUsd:string; holders:number; censusComplete:boolean;
 mintAuthority:string|null; freezeAuthority:string|null; extensions:string[]; category:string;
 rankValue:string; rankBasis:string; supplyBasis:string; source:string; at:number; routeBudget:string; routeViable:boolean;
 evidenceFailures?:string[]; evidenceHash?:string; evidenceAt?:number;
}
export function selectBasket(candidates:Candidate[],policy:Policy,self:string|undefined,catalogueComplete:boolean,now=Date.now()){
 ensure(catalogueComplete,'catalogue coverage unverified');
 const ordered=[...candidates].sort((a,b)=>a.mint===b.mint?(a.pool<b.pool?-1:1):(a.mint<b.mint?-1:1)); const seen=new Set<string>();
 const conflicts=new Set<string>();if(policy.version>=2){const fingerprints=new Map<string,string>();for(const c of candidates){const fingerprint=hash(c),prior=fingerprints.get(c.mint);if(prior&&prior!==fingerprint)conflicts.add(c.mint);fingerprints.set(c.mint,fingerprint);}}
 const universe=ordered.map(c=>{
 const reasons:string[]=[];
 if(c.evidenceFailures?.length)reasons.push(...c.evidenceFailures);
 if(conflicts.has(c.mint))reasons.push('conflicting duplicate mint evidence');
 if(seen.has(c.mint))reasons.push('duplicate mint');seen.add(c.mint);
 if(!c.provenanceVerified||!c.poolVerified)reasons.push('unverified Ember launch/pool');
 if(c.mint===self)reasons.push('our token'); if(!c.graduated)reasons.push('not graduated');
 if(!Number.isSafeInteger(c.createdAt)||c.createdAt<=0)reasons.push('age evidence missing');else if(c.createdAt>now-policy.minAgeSeconds*1000)reasons.push('under minimum age');
 if(!fresh(c.at,now,policy.maxDataAgeSeconds))reasons.push('stale observation');
 if(c.evidenceAt!==undefined&&!fresh(c.evidenceAt,now,policy.maxDataAgeSeconds))reasons.push('stale on-chain/route evidence');
 const validRaw=(value:string)=>/^(0|[1-9][0-9]*)$/.test(value)&&value.length<=100;
 if(!validRaw(c.liquidityMicroUsd)||BigInt(c.liquidityMicroUsd)<BigInt(policy.minLiquidityMicroUsd))reasons.push('insufficient liquidity');
 if(!validRaw(c.volumeMicroUsd)||BigInt(c.volumeMicroUsd)<BigInt(policy.minVolumeMicroUsd))reasons.push('insufficient volume');
 if(!c.censusComplete||!Number.isSafeInteger(c.holders)||c.holders<policy.minOwners)reasons.push('holder coverage/count');
 if(c.mintAuthority||c.freezeAuthority)reasons.push('active mint/freeze authority');
 if(c.program!==SPL||c.extensions.length||!Number.isInteger(c.decimals)||c.decimals<0||c.decimals>18)reasons.push('unsupported token semantics');
 if(c.category!=='token')reasons.push('excluded asset category');
 if(!c.routeViable||!validRaw(c.routeBudget)||BigInt(c.routeBudget)<=0n)reasons.push('no route for intended budget');
 if(c.rankBasis!==policy.rankingBasis||!c.supplyBasis||/undocumented|unknown|unverified/i.test(c.supplyBasis)||!c.source||!validRaw(c.rankValue)||BigInt(c.rankValue)<=0n)reasons.push('incomparable ranking basis');
 return {...c,reasons};});
 const eligible=universe.filter(c=>!c.reasons.length).sort((a,b)=>BigInt(a.rankValue)===BigInt(b.rankValue)?(a.mint<b.mint?-1:1):(BigInt(a.rankValue)>BigInt(b.rankValue)?-1:1));
 const size=policyBasketSize(policy);
 const selected=eligible.slice(0,size).map(c=>({...c,weightBps:10000/size}));
 return {createdAt:now,day:new Date(now).toISOString().slice(0,10),policyHash:hash(policy),rankingBasis:policy.rankingBasis,universe,selected,eligibleCount:eligible.length,ready:selected.length===size};
}
export type Basket=ReturnType<typeof selectBasket>;
/** A saved basket is evidence of its old epoch, never fresh admission for a new one. */
export function revalidateBasket(basket:Basket,candidates:Candidate[],policy:Policy,self:string|undefined,catalogueComplete:boolean,routeBudget:bigint,now=Date.now()){
 ensure(routeBudget>0n,'positive purchase budget required');
 ensure(basket.policyHash===hash(policy),'basket policy changed');
 const current=selectBasket(candidates,policy,self,catalogueComplete,now);
 ensure(current.ready,'current verified basket is incomplete');
 ensure(current.selected.every(c=>c.routeBudget===routeBudget.toString()),'route evidence does not match purchase budget');
 ensure(basket.ready&&basket.selected.length===current.selected.length&&basket.selected.every((c,i)=>c.mint===current.selected[i].mint&&c.weightBps===current.selected[i].weightBps),'selection changed; create a new basket from current evidence');
 return current;
}
export interface TokenAccount {address:string;mint:string;program:string;owner:string;amount:string;state:'initialized'|'frozen'|'uninitialized'}
export function snapshot(input:{mint:string;decimals:number;program:string;slot:number;accounts:TokenAccount[];complete:boolean;supply:string;supplySlot:number;policy:Policy;capturedAt?:number}){
 ensure(input.complete,'incomplete holder census'); ensure(input.program===SPL,'unsupported mint program');
 ensure(Number.isSafeInteger(input.slot)&&input.slot>0,'invalid snapshot context');
 ensure(input.decimals>=0&&input.decimals<=18,'unsupported decimals');
 // A supply observation can be at a different slot, but is never represented as the census slot.
 const seen=new Set<string>(), totals=new Map<string,bigint>(); let accountSum=0n;
 for(const a of input.accounts){ensure(!seen.has(a.address),'duplicate token account');seen.add(a.address);
 ensure(a.mint===input.mint&&a.program===input.program&&a.state!=='uninitialized','invalid token account');
 ensure(/^(0|[1-9][0-9]*)$/.test(a.amount),'invalid raw balance');const b=BigInt(a.amount);accountSum+=b; totals.set(a.owner,(totals.get(a.owner)??0n)+b);}
 ensure(accountSum===BigInt(input.supply),'supply/census check mismatch; retry a stable complete observation');
 ensure(BigInt(input.policy.holderUnits)>0n,'holder threshold must be positive');
 const threshold=BigInt(input.policy.holderUnits)*10n**BigInt(input.decimals);
 const owners=[...totals].sort(([a],[b])=>a<b?-1:1).map(([owner,balance])=>{
 const exclusion=input.policy.exclusions.find(e=>e.owner===owner);return {owner,balance:balance.toString(),eligible:!exclusion&&balance>=threshold,reason:exclusion?.reason??(balance<threshold?'below threshold':null)};});
 const value={mint:input.mint,decimals:input.decimals,program:input.program,slot:input.slot,supply:input.supply,supplySlot:input.supplySlot,complete:input.complete,policy:input.policy,capturedAt:input.capturedAt??Date.now(),accounts:[...input.accounts].sort((a,b)=>a.address<b.address?-1:1),policyHash:hash(input.policy),threshold:threshold.toString(),accountSum:accountSum.toString(),owners};
 return {...value,hash:hash(value)};
}
export type Snapshot=ReturnType<typeof snapshot>;
