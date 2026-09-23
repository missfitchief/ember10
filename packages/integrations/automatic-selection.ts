import { ensure, fresh, hash, type Policy } from '../core/model.js';
import { selectBasket, revalidateBasket, type Basket, type Candidate } from '../core/selection.js';

export interface VerifiedUniverse {candidates:Candidate[];complete:boolean;rawCatalogueHash:string;observedAt:number;reason?:string;retryableFailure?:boolean}
export interface SelectionObservation {
 schemaVersion:1;type:'eligible_selection';observedAt:number;policyHash:string;policy:Policy;
 status:'ready'|'warming'|'stale'|'unavailable';complete:boolean;sourceHash:string;
 candidates:Candidate[];basket:Basket|null;reason:string;evidenceHash:string;
}
export type UniverseProvider=(budget:bigint,force:boolean)=>Promise<VerifiedUniverse>;

/** Read-only coordinator. No saved observation is trusted after restart or as a funded epoch. */
export class AutomaticSelectionService {
 private last:SelectionObservation|null=null;
 private attemptAt=-Infinity;
 private failureCount=0;
 private pending:Promise<SelectionObservation>|null=null;
 private budget='';
 readonly refreshSeconds=45;
 constructor(private policy:Policy,private self:string|undefined,private provider:UniverseProvider,private clock=Date.now){this.policy=structuredClone(policy);}
 async read(routeBudget:bigint,options:{force?:boolean}={}):Promise<SelectionObservation>{
  ensure(routeBudget>=0n,'invalid selection route budget');
  while(this.pending){await this.pending;if(this.budget===routeBudget.toString()&&!options.force)return this.current();}
  const backoff=Math.min(300_000,45_000*2**Math.min(this.failureCount,3));
  if(!options.force&&this.last&&this.budget===routeBudget.toString()&&this.clock()-this.attemptAt<backoff)return this.current();
  this.attemptAt=this.clock();this.budget=routeBudget.toString();
  this.pending=(async()=>{
   try{
    const universe=await this.provider(routeBudget,!!options.force);
    ensure(Number.isSafeInteger(universe.observedAt)&&fresh(universe.observedAt,this.clock(),this.policy.maxDataAgeSeconds),'catalogue observation stale');
    const basket=universe.complete?selectBasket(universe.candidates,this.policy,this.self,true,this.clock()):null;
    const reason=universe.reason??(!universe.complete?'Catalogue/evidence coverage is incomplete; new commitments blocked.':basket?.ready?'Ten eligible assets verified for the current intended budget.':`${basket?.selected.length??0} of 10 verified assets; new commitments blocked.`);
    const value={schemaVersion:1 as const,type:'eligible_selection' as const,observedAt:universe.observedAt,policyHash:hash(this.policy),policy:this.policy,status:universe.complete?'ready' as const:'warming' as const,complete:universe.complete,sourceHash:universe.rawCatalogueHash,candidates:universe.candidates,basket,reason};
    this.last=structuredClone({...value,evidenceHash:hash(value)});this.failureCount=universe.retryableFailure?this.failureCount+1:0;
   }catch{
    this.failureCount++;
    const previous=this.last;
    const value={schemaVersion:1 as const,type:'eligible_selection' as const,observedAt:previous?.observedAt??this.clock(),policyHash:hash(this.policy),policy:this.policy,status:previous?.sourceHash?'stale' as const:'unavailable' as const,complete:false,sourceHash:previous?.sourceHash??'',candidates:previous?.candidates??[],basket:null,reason:'Automatic evidence refresh failed. Previous observations cannot authorize new purchases.'};
    this.last={...value,evidenceHash:hash(value)};
   }finally{this.pending=null;}
   return this.current();
  })();
  return this.pending;
 }
 current():SelectionObservation{
  ensure(this.last,'selection has not been observed');
  if(this.last.status==='ready'&&!fresh(this.last.observedAt,this.clock(),this.policy.maxDataAgeSeconds)){
   const value={...this.last,status:'stale' as const,complete:false,basket:null,reason:'Selection evidence expired; new commitments blocked.'};
   this.last={...value,evidenceHash:hash({...value,evidenceHash:undefined})};
  }
  return structuredClone(this.last);
 }
 async revalidate(routeBudget:bigint){
  const current=await this.read(routeBudget,{force:true});
  ensure(current.status==='ready'&&current.complete&&current.basket?.ready,'fresh verified top ten unavailable');
  revalidateBasket(current.basket,current.candidates,this.policy,this.self,true,routeBudget,this.clock());
  return current;
 }
 start(budget:()=>bigint,onObservation:(observation:SelectionObservation)=>Promise<void>|void){
  let running=false,stopped=false;
  const tick=async()=>{if(running||stopped)return;running=true;try{const result=await this.read(budget());if(!stopped)await onObservation(result);}finally{running=false;}};
  const timer=setInterval(()=>{void tick().catch(()=>{});},this.refreshSeconds*1000);timer.unref();void tick().catch(()=>{});
  return()=>{stopped=true;clearInterval(timer);};
 }
}

/** Bound work across the whole current universe without hiding partial failures. */
export async function mapBounded<T,R>(items:T[],limit:number,work:(item:T,index:number)=>Promise<R>):Promise<R[]>{
 ensure(Number.isInteger(limit)&&limit>=1&&limit<=8,'evidence concurrency must be 1..8');
 const result=new Array<R>(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;result[i]=await work(items[i],i);}}));
 return result;
}
