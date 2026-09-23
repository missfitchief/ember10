import { Asset, ensure, fresh, hash, Policy, SPL, policyBasketSize } from './model.js';
export interface Candidate extends Asset {
 pool:string; config:string; provenanceVerified:boolean; poolVerified:boolean; graduated:boolean; createdAt:number;
 liquidityMicroUsd:string; volumeMicroUsd:string; holders:number; censusComplete:boolean;
 mintAuthority:string|null; freezeAuthority:string|null; extensions:string[]; category:string;
 rankValue:string; rankBasis:string; supplyBasis:string; source:string; at:number; routeBudget:string; routeViable:boolean;
}
export function selectBasket(candidates:Candidate[],policy:Policy,self:string|undefined,catalogueComplete:boolean,now=Date.now()){
 ensure(catalogueComplete,'catalogue coverage unverified');
 const ordered=[...candidates].sort((a,b)=>a.mint===b.mint?(a.pool<b.pool?-1:1):(a.mint<b.mint?-1:1)); const seen=new Set<string>();
 const universe=ordered.map(c=>{
 const reasons:string[]=[];
 if(seen.has(c.mint))reasons.push('duplicate mint');seen.add(c.mint);
 if(!c.provenanceVerified||!c.poolVerified)reasons.push('unverified Ember launch/pool');
 if(c.mint===self)reasons.push('our token'); if(!c.graduated)reasons.push('not graduated');
 if(c.createdAt>now-policy.minAgeSeconds*1000)reasons.push('under minimum age');
 if(!fresh(c.at,now,policy.maxDataAgeSeconds))reasons.push('stale observation');
 if(BigInt(c.liquidityMicroUsd)<BigInt(policy.minLiquidityMicroUsd))reasons.push('insufficient liquidity');
 if(BigInt(c.volumeMicroUsd)<BigInt(policy.minVolumeMicroUsd))reasons.push('insufficient volume');
 if(!c.censusComplete||c.holders<policy.minOwners)reasons.push('holder coverage/count');
 if(c.mintAuthority||c.freezeAuthority)reasons.push('active mint/freeze authority');
 if(c.program!==SPL||c.extensions.length)reasons.push('unsupported token semantics');
 if(c.category!=='token')reasons.push('excluded asset category');
 if(!c.routeViable||BigInt(c.routeBudget)<=0n)reasons.push('no route for intended budget');
 if(c.rankBasis!==policy.rankingBasis||!c.supplyBasis||!c.source)reasons.push('incomparable ranking basis');
 return {...c,reasons};});
 const eligible=universe.filter(c=>!c.reasons.length).sort((a,b)=>BigInt(a.rankValue)===BigInt(b.rankValue)?(a.mint<b.mint?-1:1):(BigInt(a.rankValue)>BigInt(b.rankValue)?-1:1));
 const size=policyBasketSize(policy);
 const selected=eligible.slice(0,size).map(c=>({...c,weightBps:10000/size}));
 return {createdAt:now,day:new Date(now).toISOString().slice(0,10),policyHash:hash(policy),rankingBasis:policy.rankingBasis,universe,selected,eligibleCount:eligible.length,ready:selected.length===size};
}
export type Basket=ReturnType<typeof selectBasket>;
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
 const threshold=BigInt(input.policy.holderUnits)*10n**BigInt(input.decimals);
 const owners=[...totals].sort(([a],[b])=>a<b?-1:1).map(([owner,balance])=>{
 const exclusion=input.policy.exclusions.find(e=>e.owner===owner);return {owner,balance:balance.toString(),eligible:!exclusion&&balance>=threshold,reason:exclusion?.reason??(balance<threshold?'below threshold':null)};});
 const value={mint:input.mint,decimals:input.decimals,program:input.program,slot:input.slot,supply:input.supply,supplySlot:input.supplySlot,complete:input.complete,policy:input.policy,capturedAt:input.capturedAt??Date.now(),accounts:[...input.accounts].sort((a,b)=>a.address<b.address?-1:1),policyHash:hash(input.policy),threshold:threshold.toString(),accountSum:accountSum.toString(),owners};
 return {...value,hash:hash(value)};
}
export type Snapshot=ReturnType<typeof snapshot>;
