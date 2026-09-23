import { z } from 'zod';
import { boundedFetch, CATALOGUE_MAX_BYTES } from './http.js';
import { address, ensure } from '../core/model.js';
export const marketSchema=z.object({mint:address,pool:address,config:address,dammPool:z.string().nullable().optional(),symbol:z.string().max(64),name:z.string().max(300),createdAt:z.number(),graduated:z.boolean(),mode:z.string(),creator:z.string(),quoteMint:address,feeBps:z.number(),marketCapUsd:z.number().nullable().optional(),volume24hUsd:z.number().nullable().optional(),holders:z.number().nullable().optional(),holdersCapped:z.boolean().optional(),priceUsd:z.number().nullable().optional(),signature:z.string().optional()}).passthrough();
export const catalogueSchema=z.object({warming:z.boolean(),markets:z.array(marketSchema),economics:z.unknown(),totals:z.unknown()});
export class EmberClient {
 private cache=new Map<string,{at:number;value:unknown}>();
 async read(path:string,ttl=60000){const hit=this.cache.get(path);if(hit&&Date.now()-hit.at<ttl)return hit;
  ensure(/^\/(markets|quotes|configs|payouts|fees\/pool\/[1-9A-HJ-NP-Za-km-z]+|wallet\/[1-9A-HJ-NP-Za-km-z]+)(\?[^#]*)?$/.test(path),'unsupported Ember path');
  const value=await boundedFetch('https://embercurve.fun/api/solana'+path,{},path.split('?')[0]==='/markets'?CATALOGUE_MAX_BYTES:12_000_000);const result={at:Date.now(),value};this.cache.set(path,result);return result;}
 async markets(){const r=await this.read('/markets');const parsed=catalogueSchema.parse(r.value);const unique=new Map<string,z.infer<typeof marketSchema>>();for(const m of [...parsed.markets].sort((a,b)=>a.pool.localeCompare(b.pool)))if(!unique.has(m.mint))unique.set(m.mint,m);
  return {at:r.at,source:'https://embercurve.fun/api/solana/markets',warming:parsed.warming,rawCount:parsed.markets.length,candidates:[...unique.values()].map(m=>({mint:m.mint,symbol:m.symbol,name:m.name,pool:m.pool,graduated:m.graduated,reportedMarketCapUsd:m.marketCapUsd??null,reportedVolume24hUsd:m.volume24hUsd??null,reportedHolders:m.holders??null,eligible:false,reason:'Awaiting on-chain provenance, comparable supply basis, full holder coverage and budget-sized route verification'}))};}
 async configs(){const r=await this.read('/configs');return {...r,value:z.object({program:address,configs:z.array(z.object({config:address}).passthrough()),count:z.number(),updatedAt:z.number()}).passthrough().parse(r.value)};}
 async fees(pool:string){address.parse(pool);return this.read('/fees/pool/'+pool);}
 async payouts(pool?:string){if(pool)address.parse(pool);const r=await this.read('/payouts'+(pool?'?pool='+pool:''),15000);return {...r,value:z.object({payouts:z.array(z.object({signature:z.string(),pool:z.string(),kind:z.string(),mode:z.string(),quoteMint:z.string(),amount:z.number(),at:z.number()}).passthrough())}).parse(r.value),coverage:'Published latest window; no proven complete pagination contract'};}
}
