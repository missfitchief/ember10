import {z} from 'zod';
import Decimal from 'decimal.js';
import {address,ensure,fresh,hash} from '../core/model.js';

export const JUPITER_TOKENS_ENDPOINT='https://api.jup.ag/tokens/v2/search';
export const JUPITER_TOKENS_BLOCKERS=[
 'Jupiter circulating-supply methodology is not documented by the reviewed Tokens V2 schema.',
 'Jupiter stats24h does not specify a complete USD volume window or its exact start and end timestamps.',
 'Jupiter tags do not establish complete ordinary-token, stablecoin and LP category classification.'
] as const;
const amount=z.number().finite().nonnegative().max(1e40).nullish();
const tokenSchema=z.object({id:address,decimals:z.number().int().min(0).max(18).nullish(),tokenProgram:address.nullish(),circSupply:amount,totalSupply:amount,usdPrice:amount,mcap:amount,fdv:amount,liquidity:amount,
 stats24h:z.object({buyVolume:amount,sellVolume:amount}).nullish(),tags:z.array(z.string().max(100)).max(100).nullish(),updatedAt:z.string().max(100).nullish(),
 audit:z.object({isSus:z.boolean().nullish()}).nullish()});
export interface JupiterTokenObservation {
 mint:string;fetchedAt:number;sourceUpdatedAt:number|null;state:'fresh'|'stale'|'unavailable';
 decimals:number|null;tokenProgram:string|null;circulatingSupply:string|null;totalSupply:string|null;
 usdPrice:string|null;marketCapUsd:string|null;fdvUsd:string|null;liquidityUsd:string|null;
 buyVolume24h:string|null;sellVolume24h:string|null;volumeUnit:'undocumented';volumeWindowStart:null;volumeWindowEnd:null;volumeComplete:null;
 category:'stock'|'unverified';tags:string[];suspicious:boolean;precision:'provider_json_numbers';evidenceHash:string;reasons:string[];
}
export interface JupiterTokensObservation {
 schemaVersion:1;provider:'jupiter-tokens-v2';source:typeof JUPITER_TOKENS_ENDPOINT;fetchedAt:number;catalogueHash:string;
 coverage:'complete'|'partial'|'unavailable';requestedCount:number;returnedCount:number;rows:JupiterTokenObservation[];
 missingMints:string[];failures:{mint:string;reason:string}[];eligibilityComplete:false;blockers:string[];evidenceHash:string;
}
export interface JupiterTokensOptions {
 apiKey?:string;allowedOrigins:string[];endpoint?:string;fetcher?:typeof fetch;clock?:()=>number;
 /** Tests can advance a clock without sleeping. Production spacing is never configurable by approval. */
 wait?:(milliseconds:number)=>Promise<void>;
}
const decimal=(value:number|null|undefined)=>value==null?null:new Decimal(String(value)).toFixed();
export function normalizeJupiterToken(value:unknown,fetchedAt:number,maxAgeSeconds:number):JupiterTokenObservation {
 const row=tokenSchema.parse(value),parsed=row.updatedAt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.updatedAt)?Date.parse(row.updatedAt):NaN;
 const sourceUpdatedAt=Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
 const state:JupiterTokenObservation['state']=sourceUpdatedAt===null?'unavailable':fresh(sourceUpdatedAt,fetchedAt,maxAgeSeconds)?'fresh':'stale';
 const suspicious=!!row.audit&&Object.hasOwn(row.audit,'isSus');
 const reasons:string[]=[];
 if(state!=='fresh')reasons.push(sourceUpdatedAt===null?'Jupiter source update timestamp is unavailable.':'Jupiter source update timestamp is stale or in the future.');
 if(suspicious)reasons.push('Jupiter audit.isSus is present; the provider flags this token as suspicious.');
 if(row.usdPrice==null||row.circSupply==null||row.mcap==null)reasons.push('Jupiter price, circulating supply or reported market cap is unavailable.');
 if(row.liquidity==null)reasons.push('Jupiter USD liquidity is unavailable.');
 if(row.stats24h?.buyVolume==null||row.stats24h.sellVolume==null)reasons.push('Jupiter reported 24h buy or sell volume is unavailable.');
 const tags=row.tags??[],base={mint:row.id,fetchedAt,sourceUpdatedAt,state,decimals:row.decimals??null,tokenProgram:row.tokenProgram??null,
  circulatingSupply:decimal(row.circSupply),totalSupply:decimal(row.totalSupply),usdPrice:decimal(row.usdPrice),marketCapUsd:decimal(row.mcap),fdvUsd:decimal(row.fdv),liquidityUsd:decimal(row.liquidity),
  buyVolume24h:decimal(row.stats24h?.buyVolume),sellVolume24h:decimal(row.stats24h?.sellVolume),volumeUnit:'undocumented' as const,volumeWindowStart:null,volumeWindowEnd:null,volumeComplete:null,
  category:tags.includes('stocks')?'stock' as const:'unverified' as const,tags,suspicious,precision:'provider_json_numbers' as const,reasons};
 return {...base,evidenceHash:hash(base)};
}

/** Full mint-address lookup, never symbol search. Reported values cannot independently authorize a basket. */
export class JupiterTokensCollector {
 private last:JupiterTokensObservation|null=null;
 private pending:Promise<JupiterTokensObservation>|null=null;
 private attemptedAt=-Infinity;private failureCount=0;private retryAt=0;private nextRequestAt=0;
 private clock:()=>number;private fetcher:typeof fetch;private wait:(ms:number)=>Promise<void>;
 constructor(private options:JupiterTokensOptions){
  ensure(options.allowedOrigins.includes('https://api.jup.ag'),'Jupiter Tokens origin is not approved');
  ensure(!options.endpoint||options.endpoint===JUPITER_TOKENS_ENDPOINT,'unsupported Jupiter Tokens endpoint');
  this.clock=options.clock??Date.now;this.fetcher=options.fetcher??fetch;this.wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 }
 async read(mints:string[],maxAgeSeconds:number,force=false):Promise<JupiterTokensObservation>{
  ensure(mints.length<=20000&&Number.isFinite(maxAgeSeconds)&&maxAgeSeconds>0,'Jupiter catalogue bound invalid');
  const unique=[...new Set(mints.map(m=>address.parse(m)))].sort(),catalogueHash=hash(unique);
  while(this.pending){await this.pending;if(this.last?.catalogueHash===catalogueHash&&!force)return this.current(maxAgeSeconds);}
  if(this.clock()<this.retryAt){ensure(this.last?.catalogueHash===catalogueHash,'Jupiter rate-limit backoff is active for the new catalogue');return this.current(maxAgeSeconds);}
  const backoff=Math.min(300000,45000*2**Math.min(this.failureCount,3));
  if(!force&&this.last?.catalogueHash===catalogueHash&&this.clock()-this.attemptedAt<backoff)return this.current(maxAgeSeconds);
  this.attemptedAt=this.clock();
  this.pending=this.collect(unique,catalogueHash,maxAgeSeconds).finally(()=>{this.pending=null;});
  return this.pending;
 }
 private current(maxAgeSeconds:number){
  ensure(this.last,'Jupiter Tokens has not been observed');
  const value=structuredClone(this.last);
  for(const row of value.rows)if(row.sourceUpdatedAt!==null&&!fresh(row.sourceUpdatedAt,this.clock(),maxAgeSeconds)&&row.state!=='stale'){
   row.state='stale';row.reasons.push('Jupiter source update timestamp is stale or in the future.');row.evidenceHash=hash({...row,evidenceHash:undefined});
  }
  value.evidenceHash=hash({...value,evidenceHash:undefined});
  return value;
 }
 private async collect(mints:string[],catalogueHash:string,maxAgeSeconds:number):Promise<JupiterTokensObservation>{
  const batches:string[][]=[];for(let i=0;i<mints.length;i+=100)batches.push(mints.slice(i,i+100));
  const rows=new Map<string,JupiterTokenObservation>(),failures=new Map<string,string>();let cursor=0,totalBytes=0,stop=false;
  const run=async()=>{while(cursor<batches.length){const batch=batches[cursor++];
   if(stop){for(const mint of batch)failures.set(mint,'Jupiter batch deferred after upstream rate limit, authentication failure or response bound.');continue;}
   try{
    // Reserve each request start synchronously across both workers; keyless traffic stays below 0.5 RPS.
    const start=Math.max(this.clock(),this.nextRequestAt);this.nextRequestAt=start+(this.options.apiKey?1050:2100);
    if(start>this.clock())await this.wait(start-this.clock());
    if(stop){for(const mint of batch)failures.set(mint,'Jupiter batch deferred after upstream failure.');continue;}
    const url=new URL(JUPITER_TOKENS_ENDPOINT);url.searchParams.set('query',batch.join(','));
    const response=await this.fetcher(url,{headers:{accept:'application/json',...(this.options.apiKey?{'x-api-key':this.options.apiKey}:{})},redirect:'error',signal:AbortSignal.timeout(8000)});
    if([401,403,429].includes(response.status)){
     stop=true;const seconds=Number(response.headers.get('retry-after'));this.retryAt=this.clock()+Math.min(300000,Math.max(45000,Number.isFinite(seconds)?seconds*1000:45000));
    }
    if(!response.ok||!response.body){await response.body?.cancel();throw Error('Jupiter batch unavailable.');}
    const chunks:Uint8Array[]=[];let length=0;const reader=response.body.getReader();
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;totalBytes+=next.value.length;
     if(length>1000000||totalBytes>12000000){stop=true;await reader.cancel();throw Error('Jupiter response bound exceeded.');}chunks.push(next.value);}
    const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(Array.isArray(value)&&value.length<=100,'Jupiter batch shape invalid');
    const parsed=value.map(v=>normalizeJupiterToken(v,this.clock(),maxAgeSeconds)),allowed=new Set(batch),seen=new Set<string>(),duplicates=new Set<string>();
    for(const row of parsed){ensure(allowed.has(row.mint),'Jupiter returned an unrequested mint');if(seen.has(row.mint))duplicates.add(row.mint);seen.add(row.mint);}
    for(const row of parsed)if(!duplicates.has(row.mint))rows.set(row.mint,row);
    for(const mint of batch)if(!rows.has(mint))failures.set(mint,duplicates.has(mint)?'Jupiter returned duplicate observations for this mint.':'Jupiter omitted this catalogue mint from the response.');
   }catch{for(const mint of batch)if(!rows.has(mint))failures.set(mint,'Jupiter token batch unavailable or invalid; no replacement values were created.');}
  }};
  await Promise.all(Array.from({length:Math.min(2,batches.length)},run));
  const missingMints=mints.filter(m=>!rows.has(m)),returned=[...rows.values()].sort((a,b)=>a.mint.localeCompare(b.mint));
  const coverage=missingMints.length?rows.size?'partial' as const:'unavailable' as const:'complete' as const;
  this.failureCount=missingMints.length?this.failureCount+1:0;
  const value:Omit<JupiterTokensObservation,'evidenceHash'>={schemaVersion:1,provider:'jupiter-tokens-v2',source:JUPITER_TOKENS_ENDPOINT,fetchedAt:this.clock(),catalogueHash,coverage,requestedCount:mints.length,returnedCount:rows.size,rows:returned,missingMints,failures:[...failures].map(([mint,reason])=>({mint,reason})),eligibilityComplete:false,blockers:[...JUPITER_TOKENS_BLOCKERS]};
  this.last={...value,evidenceHash:hash(value)};return this.current(maxAgeSeconds);
 }
}
