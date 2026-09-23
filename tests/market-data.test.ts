import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {decimalValue,MarketDataService,normalizeCatalogue} from '../packages/integrations/market-data.js';
import {overview} from '../apps/api/overview.js';
import {selectBasket} from '../packages/core/selection.js';
import {defaultPolicy,hash,policyBasketSize} from '../packages/core/model.js';
import {budget} from '../packages/core/money.js';
import {fixtures} from './fixtures/synthetic.js';
import {testAddress} from '../packages/integrations/demo.js';
const raw=JSON.parse(readFileSync(new URL('./fixtures/ember-catalogue-2026-09-23.json',import.meta.url),'utf8'));
const configs=JSON.parse(readFileSync(new URL('./fixtures/ember-configs-2026-09-23.json',import.meta.url),'utf8'));
const at='2026-09-23T15:03:19.224Z';
const sample=(rows:unknown[],warming=false)=>({...raw,markets:rows,warming});
const row=(n:number,cap:unknown,extra:Record<string,unknown>={})=>({...raw.markets[0],mint:testAddress('market-'+n),pool:testAddress('market-pool-'+n),dammPool:'',marketCapUsd:cap,suspect:false,...extra});
const registry={count:1,updatedAt:1790175809,configs:[{config:raw.markets[0].config}]};
it('validates the complete current response without fixture names deciding rank or eligibility',()=>{
 const result=normalizeCatalogue(raw,configs,null,at);
 expect(result.coverage).toMatchObject({rawRows:3062,uniqueMints:3061,rankedMints:3059,duplicateRows:1,invalidRows:0,complete:false});
 expect(result.markets.every(x=>x.eligibility!=='eligible'&&x.selected===false)).toBe(true);
 expect(result.markets.filter(x=>x.reasons.some(r=>r.code==='source_suspect'))).toHaveLength(2);
 expect(result.markets.filter(x=>x.reasons.some(r=>r.code==='source_suspect')).every(x=>x.rank===null)).toBe(true);
 expect(result.markets[0].sourceTimestamp).toBeNull();expect(result.markets[0].supplyBasis).toBe('undocumented');
});
it('sorts numerically with mint ties; missing and invalid values are never coerced to zero',()=>{
 const values=[900,10000,'900.00',null,'',undefined,'$500K','NaN',Infinity,-1];
 const result=normalizeCatalogue(sample(values.map((v,i)=>row(i,v))),registry,null,at).markets;
 expect(result.filter(x=>x.rank!==null).map(x=>x.marketCapUsd)).toEqual(['10000','900','900']);
 const ties=result.filter(x=>x.marketCapUsd==='900').map(x=>x.mint);expect(ties).toEqual([...ties].sort());
 for(const v of [null,'',undefined,NaN,Infinity,-1,'$3M',' 3','1,000','1e999999999','0.'+'1'.repeat(1000)])expect(decimalValue(v)).toBeNull();
 expect(decimalValue('0')).toBe('0');expect(decimalValue('-1.23',true)).toBe('-1.23');
});
it('keeps duplicate symbols distinct, deduplicates mint pools, and never double-converts quote USD',()=>{
 const a=row(0,'900',{quoteMint:testAddress('stock-quote'),quoteUsd:29}),b=row(1,'1000',{quoteMint:testAddress('sol-quote'),quoteUsd:220});
 const result=normalizeCatalogue(sample([a,{...a,createdAt:a.createdAt+1},b]),registry,null,at);
 expect(result.markets).toHaveLength(2);expect(result.markets.map(x=>x.marketCapUsd)).toEqual(['1000','900']);expect(result.coverage.duplicateRows).toBe(1);
 const conflicting=normalizeCatalogue(sample([a,{...a,pool:testAddress('other-pool')}]),registry,null,at).markets[0];
 expect(conflicting.canonicalPool).toBeNull();expect(conflicting.rank).toBeNull();expect(conflicting.reasons.some(r=>r.code==='duplicate_conflict')).toBe(true);
 const safety=normalizeCatalogue(sample([a,{...a,suspect:true,paused:true}]),registry,null,at).markets[0];
 expect(safety.rank).toBeNull();expect(safety.reasons.map(r=>r.code)).toEqual(expect.arrayContaining(['source_suspect','source_paused']));
});
it('retains explicit own-token, unsupported, missing registry and invalid row exclusions',()=>{
 const a=row(0,123,{engine:'unknown'}),result=normalizeCatalogue(sample([a,{mint:'broken'}]),null,a.mint,at);
 expect(result.markets[0].reasons.map(r=>r.code)).toEqual(expect.arrayContaining(['own_token','unsupported_asset']));
 expect(result.markets[0].reasons.find(r=>r.code==='provenance')?.state).toBe('unknown');expect(result.coverage).toMatchObject({invalidRows:1,status:'partial',complete:false});
 expect(normalizeCatalogue(sample([row(1,20,{createdAt:1e30})]),registry,null,at).coverage.invalidRows).toBe(1);
 expect(normalizeCatalogue(sample([row(1,20,{image:'https://tracking.invalid/avatar'})]),registry,null,at).markets[0].imageUrl).toBeNull();
});
it('considers the whole eligible universe before selecting ten and preserves legacy five policy',()=>{
 const f=fixtures(),now=Date.now(),candidates=Array.from({length:14},(_,i)=>({...f.candidates[0],mint:testAddress('candidate-'+i),pool:testAddress('candidate-pool-'+i),rankValue:String(1000-i),at:now,provenanceVerified:i>=2}));
 const selected=selectBasket(candidates,defaultPolicy,undefined,true,now);
 expect(selected.selected).toHaveLength(10);expect(selected.selected.map(x=>x.mint)).toEqual(candidates.slice(2,12).map(x=>x.mint));expect(selected.selected.every(x=>x.weightBps===1000)).toBe(true);
 expect(selectBasket(candidates.slice(0,11),defaultPolicy,undefined,true,now).ready).toBe(false);
 expect(selectBasket(candidates,defaultPolicy,candidates[2].mint,true,now).selected.some(x=>x.mint===candidates[2].mint)).toBe(false);
 expect(policyBasketSize(f.policy)).toBe(5);expect(f.basket.selected).toHaveLength(5);expect(f.basket.selected.every(x=>x.weightBps===2000)).toBe(true);
 const money=budget(1000000003n,10000001n,defaultPolicy,f.price);expect(money.leg*10n+money.buyback+money.operations+money.cost+money.remainder).toBe(money.total);
 const immutable=JSON.parse(JSON.stringify(selected)),before=hash(immutable);selectBasket([...candidates].map((x,i)=>({...x,rankValue:String(i*1000)})),defaultPolicy,undefined,true,now);expect(hash(immutable)).toBe(before);
});
it('bounds public pages and searches the full normalized universe without losing global rank',async()=>{
 const source=new MarketDataService(async(url)=>Response.json(String(url).endsWith('/configs')?configs:raw),()=>Date.parse(at));
 const first=await overview(source,{limit:10}),search=await overview(source,{query:raw.markets.at(-1).mint});
 expect(first.markets).toHaveLength(10);expect(first.marketPage).toMatchObject({limit:10,totalMatches:3061,hasMore:true});
 expect(search.markets.some(x=>x.mint===raw.markets.at(-1).mint)).toBe(true);
 expect(first.selection).toMatchObject({selectedCount:0,requiredCount:10,commitmentsAllowed:false});expect(first.fundedBasket.status).toBe('unavailable');
 expect(first.project).toMatchObject({name:'EMBER10',dataMode:'real',mint:null});expect(first.accounting.creatorRevenue).toBeNull();
});
it('coalesces requests; cache and stale responses retain original fetch timestamp',async()=>{
 let calls=0,now=Date.parse(at),offline=false;
 const source=new MarketDataService(async(url)=>{calls++;if(offline)throw Error('offline');return Response.json(String(url).endsWith('/configs')?registry:sample([row(0,100)]));},()=>now,45);
 const [one,two]=await Promise.all([source.read(),source.read()]);expect(calls).toBe(2);expect(one.observed?.fetchedAt).toBe(two.observed?.fetchedAt);
 now+=10_000;expect((await source.read()).observed?.fetchedAt).toBe(at);expect(calls).toBe(2);
 offline=true;now+=45_000;const stale=await source.read();expect(stale.status).toBe('stale');expect(stale.observed?.fetchedAt).toBe(at);
 const state=await overview(source);expect(state.selection.commitmentsAllowed).toBe(false);expect(state.discovery.sourceTimestamp).toBeNull();
});
it('initial failures are unavailable and warming data cannot authorize commitments',async()=>{
 const failed=await overview(new MarketDataService(async()=>{throw Error('offline');},()=>Date.parse(at)));
 expect(failed.markets).toEqual([]);expect(failed.discovery.status).toBe('unavailable');expect(failed.project.dataMode).toBe('real');
 const warming=await overview(new MarketDataService(async(url)=>Response.json(String(url).endsWith('/configs')?registry:sample([row(0,10)],true)),()=>Date.parse(at)));
 expect(warming.discovery.status).toBe('warming');expect(warming.selection).toMatchObject({state:'blocked',selectedCount:0,commitmentsAllowed:false});
 const partial=await overview(new MarketDataService(async(url)=>Response.json(String(url).endsWith('/configs')?{}:sample([row(0,10)])),()=>Date.parse(at)));
 expect(partial.discovery.coverage.status).toBe('partial');expect(partial.selection.state).toBe('blocked');
});
