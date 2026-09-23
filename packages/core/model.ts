import { createHash } from 'node:crypto';
import { z } from 'zod';
export const raw = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const address = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOL = 'SOL';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export type Mode = 'prelaunch'|'demo'|'test'|'live';
export const canonical = (v: unknown): string => {
 if(v instanceof Date) return JSON.stringify(v.toISOString());
 if(typeof v==='bigint') return JSON.stringify(v.toString());
 if(Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
 if(v!==null && typeof v==='object') return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';
 return JSON.stringify(v);
};
export const hash=(v: unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export const json=(v: unknown)=>JSON.parse(canonical(v));
export function ensure(ok: unknown, message: string): asserts ok { if(!ok) throw new Error(message); }
export interface Asset {mint:string;symbol:string;decimals:number;program:string}
export const defaultPolicy = {
 version:2, basketBps:8000, buybackBps:1000, operationsBps:1000,
 holderUnits:'100000', minBasketMicroUsd:'50000000', maxCostBps:1000,
 minLiquidityMicroUsd:'10000000000', minVolumeMicroUsd:'5000000000', minOwners:50, minAgeSeconds:86400,
 existingAtaMicroUsd:'1000000', newAtaMicroUsd:'5000000', maxPriceAgeSeconds:120,
 maxDataAgeSeconds:180, slippageBps:100, impactBps:200, evaluationSeconds:3600,
 rankingBasis:'circulating_market_cap', snapshotMethod:'finalized_full_census', exclusions:[] as {owner:string;reason:string}[]
};
export type Policy=typeof defaultPolicy;
export interface Price {microUsd:string;at:number;source:string}
export function fresh(at:number, now:number, seconds:number){return at<=now && now-at<=seconds*1000;}
export function usdValue(units:bigint, decimals:number, price:Price, now=Date.now(), maxAge=120){
 ensure(fresh(price.at,now,maxAge),'price unavailable or stale'); ensure(price.source && BigInt(price.microUsd)>0n,'invalid price');
 return units*BigInt(price.microUsd)/(10n**BigInt(decimals));
}

/** Version 1 remains readable for immutable five-asset historical epochs. */
export function policyBasketSize(policy: { version: number }) {
 ensure(policy.version === 1 || policy.version === 2, 'unsupported policy version');
 return policy.version === 1 ? 5 : 10;
}
