import {describe,it,expect} from 'vitest';
import {Connection,PublicKey} from '@solana/web3.js';
import {DynamicBondingCurveIdl,DYNAMIC_BONDING_CURVE_PROGRAM_ID} from '@meteora-ag/dynamic-bonding-curve-sdk';
import bs58 from 'bs58';
import {defaultPolicy,hash,SPL} from '../packages/core/model.js';
import {selectBasket,revalidateBasket,type Candidate} from '../packages/core/selection.js';
import {AutomaticSelectionService,mapBounded,type UniverseProvider} from '../packages/integrations/automatic-selection.js';
import {approvedMetricsUrl,createUniverseProvider,validateMetrics,verifiedPoolCreationTime,type SelectionEvidenceConfig,type EvidenceApproval} from '../packages/integrations/provenance.js';
import {EmberClient} from '../packages/integrations/ember.js';
import {JupiterClient} from '../packages/integrations/jupiter.js';
import {testAddress} from '../packages/integrations/demo.js';
import {MarketDataService} from '../packages/integrations/market-data.js';

const initial=Date.UTC(2026,8,23,14),policy={...defaultPolicy,version:2 as const,rankingBasis:'circulating_market_cap' as const,snapshotMethod:'finalized_full_census' as const},ownMint=testAddress('automatic-project');
function candidates(now=initial,count=11):Candidate[]{return Array.from({length:count},(_,i)=>({mint:testAddress('automatic-'+i),symbol:'SAME',decimals:6,program:SPL,pool:testAddress('automatic-pool-'+i),config:testAddress('automatic-config'),provenanceVerified:true,poolVerified:true,graduated:true,createdAt:now-172800000,liquidityMicroUsd:'15000000000',volumeMicroUsd:'8000000000',holders:65,censusComplete:true,mintAuthority:null,freezeAuthority:null,extensions:[],category:'token',rankValue:String(1000000000000-i*10000000000),rankBasis:policy.rankingBasis,supplyBasis:'Reviewed circulating supply from complete provider contract',source:'https://metrics.example/v1',at:now,routeBudget:'100000000',routeViable:true}));}
const budget=100000000n;
function providerFor(read:()=>Candidate[],now:()=>number,complete=()=>true):UniverseProvider{return async()=>({candidates:read(),complete:complete(),rawCatalogueHash:hash(read().map(c=>c.mint).sort()),observedAt:now()});}

describe('automatic current selection and immutable epoch input',()=>{
 it('A leaves and B enters on the next observation in the same day, leaving the saved epoch unchanged',async()=>{
  let now=initial,rows=candidates(now);const service=new AutomaticSelectionService(policy,ownMint,providerFor(()=>rows,()=>now),()=>now);
  const first=await service.revalidate(budget),frozen=structuredClone(first.basket!),oldHash=hash(frozen),a=rows[0].mint,b=rows[10].mint;
  expect(first.basket!.selected.map(c=>c.mint)).toContain(a);expect(first.basket!.selected.map(c=>c.mint)).not.toContain(b);
  now+=45_000;rows=rows.map((c,i)=>({...c,at:now,rankValue:i===0?'1':c.rankValue}));
  const next=await service.revalidate(budget);expect(next.basket!.selected.map(c=>c.mint)).not.toContain(a);expect(next.basket!.selected.map(c=>c.mint)).toContain(b);
  expect(next.basket!.day).toBe(frozen.day);expect(hash(frozen)).toBe(oldHash);expect(next.basket!.selected.every(c=>c.weightBps===1000)).toBe(true);
 });
 it('discovers new mints automatically and keeps duplicate symbols separate',async()=>{
  let now=initial,rows=candidates(now);const service=new AutomaticSelectionService(policy,ownMint,providerFor(()=>rows,()=>now),()=>now);await service.read(budget);
  now+=45_000;const entrant={...rows[0],mint:testAddress('brand-new-token'),pool:testAddress('brand-new-pool'),rankValue:'9999999999999',at:now};rows=[...rows.map(c=>({...c,at:now})),entrant];
  const result=await service.read(budget);expect(result.basket!.selected[0].mint).toBe(entrant.mint);expect(new Set(result.basket!.selected.map(c=>c.mint)).size).toBe(10);expect(new Set(result.basket!.selected.map(c=>c.symbol)).size).toBe(1);
 });
 it('never treats partial/warming coverage or fewer than ten as a commit-ready selection',async()=>{
  let complete=false,rows=candidates(initial,9);const service=new AutomaticSelectionService(policy,ownMint,providerFor(()=>rows,()=>initial,()=>complete),()=>initial);
  expect((await service.read(budget)).status).toBe('warming');await expect(service.revalidate(budget)).rejects.toThrow('top ten');complete=true;
  const result=await service.read(budget,{force:true});expect(result.basket!.selected).toHaveLength(9);expect(result.basket!.ready).toBe(false);
 });
 it('blocks stale metrics, failed routes and an exact-budget mismatch',async()=>{
  const stale=new AutomaticSelectionService(policy,ownMint,providerFor(()=>candidates().map(c=>({...c,at:initial-181000})),()=>initial),()=>initial);
  await expect(stale.revalidate(budget)).rejects.toThrow('top ten');
  const route=new AutomaticSelectionService(policy,ownMint,providerFor(()=>candidates(initial,10).map((c,i)=>({...c,routeViable:i!==0})),()=>initial),()=>initial);
  await expect(route.revalidate(budget)).rejects.toThrow('top ten');
  const wrongBudget=new AutomaticSelectionService(policy,ownMint,providerFor(()=>candidates(),()=>initial),()=>initial);
  await expect(wrongBudget.revalidate(budget+1n)).rejects.toThrow('budget');
 });
 it('keeps last-success timestamps on outage, backs off and does not trust saved state after restart',async()=>{
  let now=initial,calls=0,offline=false;const producer:UniverseProvider=async()=>{calls++;if(offline)throw Error('secret upstream details');return {candidates:candidates(now),complete:true,rawCatalogueHash:'source',observedAt:now};};
  const service=new AutomaticSelectionService(policy,ownMint,producer,()=>now);await service.read(budget);offline=true;now+=45000;
  const failed=await service.read(budget);expect(failed.status).toBe('stale');expect(failed.observedAt).toBe(initial);expect(failed.basket).toBeNull();expect(failed.reason).not.toContain('secret');
  await service.read(budget);expect(calls).toBe(2);now+=91000;await service.read(budget);expect(calls).toBe(3);
  const restarted=new AutomaticSelectionService(policy,ownMint,producer,()=>now);const cold=await restarted.read(budget);expect(cold.status).toBe('unavailable');expect(cold.basket).toBeNull();
 });
 it('coalesces simultaneous refreshes and expires a cached ready result',async()=>{
  let now=initial,calls=0;const service=new AutomaticSelectionService(policy,ownMint,async()=>{calls++;await Promise.resolve();return {candidates:candidates(now),complete:true,rawCatalogueHash:'source',observedAt:now};},()=>now);
  const all=await Promise.all([service.read(budget),service.read(budget),service.read(budget)]);expect(calls).toBe(1);expect(all.every(x=>x.basket!.ready)).toBe(true);
  all[0].basket!.selected[0].mint='external mutation';expect(service.current().basket!.selected[0].mint).not.toBe('external mutation');now+=181000;expect(service.current().status).toBe('stale');expect(service.current().basket).toBeNull();
 });
 it.each([
  ['liquidity',{liquidityMicroUsd:'1'}],['volume',{volumeMicroUsd:'1'}],['census',{censusComplete:false}],['holders',{holders:1}],['mint authority',{mintAuthority:testAddress('authority')}],['freeze authority',{freezeAuthority:testAddress('freeze')}],['program',{program:'other'}],['extensions',{extensions:['transferHook']}],['category',{category:'stock'}],['age',{createdAt:initial-1000}],['pool',{poolVerified:false}],['provenance',{provenanceVerified:false}],['basis',{supplyBasis:'undocumented'}],['route',{routeViable:false}],['source',{at:initial-181000}]
 ] as [string,Partial<Candidate>][])('revalidates %s before freezing, even when historical membership matches',(_,patch)=>{
  const rows=candidates(initial,10),old=selectBasket(rows,policy,ownMint,true,initial),changed=rows.map((c,i)=>i===0?{...c,...patch}:c);
  expect(()=>revalidateBasket(old,changed,policy,ownMint,true,budget,initial)).toThrow('incomplete');expect(old.ready).toBe(true);
 });
 it('rejects a changed top ten instead of silently funding the historical basket',()=>{const rows=candidates(),old=selectBasket(rows,policy,ownMint,true,initial),next=rows.map((c,i)=>({...c,rankValue:i===0?'1':c.rankValue}));expect(()=>revalidateBasket(old,next,policy,ownMint,true,budget,initial)).toThrow('selection changed');});
 it('quarantines all conflicting observations of a mint instead of selecting the convenient copy',()=>{const rows=candidates(initial,10);const result=selectBasket([...rows,{...rows[0],pool:'zzzz',freezeAuthority:testAddress('freeze')}],policy,ownMint,true,initial);expect(result.selected.some(c=>c.mint===rows[0].mint)).toBe(false);expect(result.ready).toBe(false);});
 it('serializes simultaneous forced refreshes even when their budgets differ',async()=>{let active=0,peak=0;const service=new AutomaticSelectionService(policy,ownMint,async b=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return {candidates:candidates().map(c=>({...c,routeBudget:b.toString()})),complete:true,rawCatalogueHash:'source',observedAt:initial};},()=>initial);await Promise.all(Array.from({length:6},(_,i)=>service.revalidate(budget+BigInt(i))));expect(peak).toBe(1);});
 it('bounds concurrent provider work without dropping the tail of the catalogue',async()=>{let active=0,peak=0;const output=await mapBounded(Array.from({length:31},(_,i)=>i),3,async i=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return i;});expect(peak).toBe(3);expect(output).toEqual(Array.from({length:31},(_,i)=>i));});
});

const config:SelectionEvidenceConfig={version:'ember-evidence-v1',metricsEndpoint:'https://metrics.example/v1',allowedOrigins:['https://metrics.example'],catalogueCompleteContract:true};
function sourceFixture(now=initial){
 const rows=candidates(now,12),catalogue={warming:false,economics:{},totals:{},markets:rows.map(c=>({mint:c.mint,pool:testAddress('dbc-'+c.mint),config:c.config,quoteMint:testAddress('quote'),dammPool:c.pool,symbol:c.symbol,name:'Repeated name',createdAt:c.createdAt/1000,graduated:true,marketCapUsd:Number(c.rankValue)/1e6,volume24hUsd:8000}))};
 const metrics={schemaVersion:1,catalogueHash:hash(rows.map(c=>c.mint).sort()),complete:true,observedAt:now,candidates:rows.map(c=>({mint:c.mint,pool:c.pool,at:now,source:'https://metrics.example/method',liquidityMicroUsd:c.liquidityMicroUsd,volumeMicroUsd:c.volumeMicroUsd,rankValue:c.rankValue,rankBasis:c.rankBasis,supplyBasis:c.supplyBasis,supplyAmountRaw:c.rankValue,supplyDecimals:6,priceMicroUsd:'1000000',category:'token',volumeWindowStart:now-86400000,volumeWindowEnd:now,volumeComplete:true,evidenceHash:hash(c)}))};
 return {rows,catalogue,metrics,configs:{count:1,updatedAt:now,configs:[{config:rows[0].config}]}};
}
describe('automated evidence producer contract',()=>{
 it('proves age from successful pool initialization, never an old arbitrary mention of its PDA',()=>{
  const market={mint:testAddress('age-mint'),pool:testAddress('age-pool'),config:testAddress('age-config')},key=(s:string)=>new PublicKey(s);
  const definition=DynamicBondingCurveIdl.instructions.find(ix=>ix.name==='initialize_virtual_pool_with_spl_token')!;
  const instruction={programId:DYNAMIC_BONDING_CURVE_PROGRAM_ID,accounts:[key(market.config),key(testAddress('authority')),key(testAddress('creator')),key(market.mint),key(testAddress('quote')),key(market.pool)],data:bs58.encode(Uint8Array.from(definition.discriminator))};
  const tx={blockTime:initial/1000-172800,transaction:{message:{accountKeys:[{pubkey:key(market.pool)}],instructions:[instruction]}},meta:{err:null,postBalances:[1000],innerInstructions:[]}};
  expect(verifiedPoolCreationTime(tx as never,market)).toBe(initial-172800000);
  expect(verifiedPoolCreationTime({...tx,transaction:{message:{...tx.transaction.message,instructions:[]}}} as never,market)).toBeNull();
  expect(verifiedPoolCreationTime({...tx,meta:null} as never,market)).toBeNull();
  expect(verifiedPoolCreationTime({...tx,meta:{...tx.meta,err:{InstructionError:[0,'Custom']}}} as never,market)).toBeNull();
 });
 it('bypasses a still-valid 45-second display cache immediately before commitment',async()=>{
  let rows=candidates(initial,10),calls=0;const provider:UniverseProvider=async()=>{calls++;return {candidates:rows,complete:true,rawCatalogueHash:'source',observedAt:initial};};
  const service=new AutomaticSelectionService(policy,ownMint,provider,()=>initial);expect((await service.read(budget)).basket!.ready).toBe(true);
  rows=rows.map((c,i)=>i===0?{...c,liquidityMicroUsd:'0'}:c);
  expect((await service.read(budget)).basket!.ready).toBe(true);expect(calls).toBe(1);
  await expect(service.revalidate(budget)).rejects.toThrow('top ten');expect(calls).toBe(2);
 });
 it('backs off public catalogue failures without replacing the last observation',async()=>{
  const f=sourceFixture();let now=initial,offline=false,attempts=0;
  const service=new MarketDataService(async url=>{if(String(url).endsWith('/markets'))attempts++;return offline?new Response(null,{status:503}):Response.json(String(url).endsWith('/configs')?f.configs:f.catalogue);},()=>now);
  const first=await service.read();expect(first.status).toBe('ready');offline=true;now+=45000;
  const failed=await service.read();expect(failed.status).toBe('stale');expect(failed.observed?.fetchedAt).toBe(first.observed?.fetchedAt);expect(attempts).toBe(3);
  now+=45000;await service.read();expect(attempts).toBe(3);
  now+=46000;await Promise.all([service.read(),service.read()]);expect(attempts).toBe(5);
 });
 it('fetches the full current catalogue and an approved machine feed, not a metrics file',async()=>{
  const f=sourceFixture(),paths:string[]=[];
  const ember={read:async(path:string)=>{paths.push(path);return {at:initial,value:path==='/markets'?f.catalogue:f.configs};}} as EmberClient;
  const approval:EvidenceApproval={ourMint:ownMint,treasury:testAddress('treasury'),emberFeeClaimer:testAddress('fee'),approvedPrograms:[SPL],policy,selectionEvidence:config};let verified=0;
  const provider=createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,approval,true,{clock:()=>initial,fetchMetrics:async url=>{expect(url).toBe(config.metricsEndpoint);return f.metrics;},verifyCandidate:async(c,_,metric,b)=>{verified++;return {...f.rows.find(x=>x.mint===c.mint)!,routeBudget:b.toString(),source:metric.source};}});
  const result=await provider(budget,true);expect(result.complete).toBe(true);expect(verified).toBe(12);expect(paths).toEqual(['/markets','/configs']);expect(selectBasket(result.candidates,policy,ownMint,result.complete,initial).ready).toBe(true);
 });
 it('keeps missing provider, new omitted mint, warming data and source outage blocked',async()=>{
  const f=sourceFixture(),base={ourMint:ownMint,treasury:testAddress('treasury'),emberFeeClaimer:testAddress('fee'),approvedPrograms:[SPL],policy};
  const ember={read:async(path:string)=>({at:initial,value:path==='/markets'?f.catalogue:f.configs})} as EmberClient;
  const deps={clock:()=>initial,fetchMetrics:async()=>f.metrics,verifyCandidate:async(c:Candidate)=>({...f.rows.find(x=>x.mint===c.mint)!})};
  const missing=await createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,base,true,deps)(budget,true);expect(missing.complete).toBe(false);expect(missing.candidates.every(c=>c.evidenceFailures?.some(s=>s.includes('not configured')))).toBe(true);
  f.metrics.candidates.pop();const omitted=await createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,{...base,selectionEvidence:config},true,deps)(budget,true);expect(omitted.complete).toBe(false);
  const good=sourceFixture();f.metrics=good.metrics;f.catalogue.warming=true;expect((await createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,{...base,selectionEvidence:config},true,deps)(budget,true)).complete).toBe(false);
 });
 it('validates host, exact universe, price/supply arithmetic, freshness and a complete 24h window',()=>{
  const f=sourceFixture(),mints=f.rows.map(c=>c.mint);expect(validateMetrics(f.metrics,mints,config,initial,180).candidates).toHaveLength(12);
  expect(()=>approvedMetricsUrl({...config,metricsEndpoint:'https://evil.example/metrics'})).toThrow('origin');
  expect(()=>approvedMetricsUrl({...config,metricsEndpoint:'http://metrics.example/metrics'})).toThrow('endpoint');
  expect(()=>validateMetrics({...f.metrics,candidates:[...f.metrics.candidates,f.metrics.candidates[0]]},mints,config,initial,180)).toThrow('duplicate');
  expect(()=>validateMetrics({...f.metrics,observedAt:initial-181000},mints,config,initial,180)).toThrow('stale');
  expect(()=>validateMetrics({...f.metrics,complete:false},mints,config,initial,180)).toThrow('universe');
  expect(()=>validateMetrics({...f.metrics,candidates:f.metrics.candidates.map((m,i)=>i?m:{...m,rankValue:'1'})},mints,config,initial,180)).toThrow('supply/price');
  expect(()=>validateMetrics({...f.metrics,candidates:f.metrics.candidates.map((m,i)=>i?m:{...m,volumeComplete:false})},mints,config,initial,180)).toThrow('window');
 });
 it('collects built-in Jupiter observations without a custom metrics service while preserving unavailable eligibility evidence',async()=>{
  const f=sourceFixture(),ember={read:async(path:string)=>({at:initial,value:path==='/markets'?f.catalogue:f.configs})} as EmberClient;
  const approval:EvidenceApproval={ourMint:ownMint,treasury:testAddress('treasury'),emberFeeClaimer:testAddress('fee'),approvedPrograms:[SPL],policy,selectionEvidence:{version:'ember-evidence-v1',provider:'jupiter-tokens-v2',allowedOrigins:['https://api.jup.ag'],catalogueCompleteContract:true}};
  let verifies=0,requests=0;const provider=createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,approval,true,{clock:()=>initial,jupiterApiKey:'private-test-key',jupiterWait:async()=>{},fetchMetrics:async()=>{throw Error('custom endpoint must not be used');},verifyCandidate:async candidate=>{verifies++;return candidate;},jupiterFetcher:async url=>{
   requests++;return Response.json(new URL(String(url)).searchParams.get('query')!.split(',').map(id=>({id,liquidity:1,circSupply:1000000,totalSupply:1000000,usdPrice:1,mcap:1000000,stats24h:{buyVolume:10000,sellVolume:10000},updatedAt:new Date(initial).toISOString(),tags:['verified']})));
  }});
  const service=new AutomaticSelectionService(policy,ownMint,provider,()=>initial),result=await service.read(budget);
  expect(requests).toBe(1);expect(verifies).toBe(0);expect(result).toMatchObject({status:'warming',complete:false,basket:null,providerObservation:{coverage:'complete',returnedCount:12,eligibilityComplete:false}});
  expect(result.candidates.every(c=>c.category==='unverified'&&c.evidenceFailures?.some(reason=>reason.includes('USD liquidity is below')))).toBe(true);expect(JSON.stringify(result)).not.toContain('private-test-key');
  await expect(service.revalidate(budget)).rejects.toThrow('top ten');
 });
 it('excludes verified below-threshold liquidity and volume before costly RPC census and route verification',async()=>{
  const f=sourceFixture();f.metrics.candidates[0].liquidityMicroUsd='1';f.metrics.candidates[1].volumeMicroUsd='1';let verifies=0;
  const ember={read:async(path:string)=>({at:initial,value:path==='/markets'?f.catalogue:f.configs})} as EmberClient;
  const approval:EvidenceApproval={ourMint:ownMint,treasury:testAddress('treasury'),emberFeeClaimer:testAddress('fee'),approvedPrograms:[SPL],policy,selectionEvidence:config};
  const provider=createUniverseProvider(new Connection('https://rpc.example'),ember,{} as JupiterClient,approval,true,{clock:()=>initial,fetchMetrics:async()=>f.metrics,verifyCandidate:async c=>{verifies++;return {...f.rows.find(r=>r.mint===c.mint)!};}});
  const result=await provider(budget,true);expect(verifies).toBe(10);expect(result.candidates.filter(c=>c.evidenceFailures?.some(reason=>reason.includes('costly chain checks')))).toHaveLength(2);
 });
});
