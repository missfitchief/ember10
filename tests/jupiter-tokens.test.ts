import {describe,it,expect} from 'vitest';
import {JupiterTokensCollector,normalizeJupiterToken,JUPITER_TOKENS_ENDPOINT} from '../packages/integrations/jupiter-tokens.js';
import {testAddress} from '../packages/integrations/demo.js';
import {hash,SPL} from '../packages/core/model.js';

const initial=Date.UTC(2026,8,23,18),mints=(n:number)=>Array.from({length:n},(_,i)=>testAddress('jupiter-observation-'+i));
const row=(mint:string,at=initial)=>({id:mint,symbol:'SAME',decimals:6,tokenProgram:SPL,circSupply:1000000.25,totalSupply:2000000.5,usdPrice:0.12345,mcap:123450.03,fdv:246900.06,liquidity:50000,stats24h:{buyVolume:40000,sellVolume:30000},tags:['verified'],updatedAt:new Date(at).toISOString()});
const requested=(url:Parameters<typeof fetch>[0])=>new URL(String(url)).searchParams.get('query')!.split(',');

describe('built-in Jupiter Tokens V2 collector',()=>{
 it('looks up every current mint in <=100 batches with bounded concurrency, and never searches by duplicate symbol',async()=>{
  const ids=mints(205),requests:string[][]=[];let active=0,peak=0,now=initial;
  const collector=new JupiterTokensCollector({apiKey:'test-key-not-for-public-output',allowedOrigins:['https://api.jup.ag'],clock:()=>now,wait:async ms=>{now+=ms;},fetcher:async(url,init)=>{
   expect(new URL(String(url)).origin+new URL(String(url)).pathname).toBe(JUPITER_TOKENS_ENDPOINT);expect(init?.redirect).toBe('error');expect((init?.headers as Record<string,string>)['x-api-key']).toBe('test-key-not-for-public-output');
   const batch=requested(url);requests.push(batch);active++;peak=Math.max(peak,active);await Promise.resolve();active--;return Response.json(batch.map(m=>row(m)));
  }});
  const result=await collector.read([...ids,ids[0]],180);expect(requests.map(b=>b.length).sort((a,b)=>a-b)).toEqual([5,100,100]);expect(peak).toBeLessThanOrEqual(2);
  expect(new Set(requests.flat())).toEqual(new Set(ids));expect(result).toMatchObject({coverage:'complete',requestedCount:205,returnedCount:205,eligibilityComplete:false,catalogueHash:hash([...ids].sort())});
  expect(result.rows.every(r=>r.category==='unverified'&&r.volumeComplete===null&&r.volumeWindowStart===null&&r.volumeWindowEnd===null)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('test-key-not-for-public-output');expect(result.blockers).toHaveLength(3);
 });
 it('coalesces reads, refreshes after 45 seconds, discovers new mints and lets forced reads bypass a successful cache',async()=>{
  let now=initial,calls=0;const ids=mints(2),collector=new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],clock:()=>now,wait:async ms=>{now+=ms;},fetcher:async url=>{calls++;return Response.json(requested(url).map(m=>row(m,now)));}});
  await Promise.all([collector.read(ids,180),collector.read(ids,180)]);expect(calls).toBe(1);await collector.read(ids,180);expect(calls).toBe(1);
  now+=45000;await collector.read(ids,180);expect(calls).toBe(2);await collector.read([...ids,testAddress('new-jupiter-mint')],180);expect(calls).toBe(3);
  const value=await collector.read(ids,180,true);expect(calls).toBe(4);value.rows[0].usdPrice='999';expect((await collector.read(ids,180)).rows[0].usdPrice).not.toBe('999');
 });
 it('distinguishes fetch coverage from source freshness and preserves missing fields as null',()=>{
  const value=normalizeJupiterToken({id:mints(1)[0],liquidity:null,circSupply:null,stats24h:null},initial,180);
  expect(value).toMatchObject({sourceUpdatedAt:null,state:'unavailable',circulatingSupply:null,liquidityUsd:null,buyVolume24h:null,sellVolume24h:null,category:'unverified'});
  expect(normalizeJupiterToken(row(mints(1)[0],initial-181000),initial,180).state).toBe('stale');
  expect(normalizeJupiterToken(row(mints(1)[0],initial+1000),initial,180).state).toBe('stale');
  expect(normalizeJupiterToken({...row(mints(1)[0]),audit:{isSus:false},tags:['stocks']},initial,180)).toMatchObject({suspicious:true,category:'stock'});
 });
 it('does not promote verified tags or provider numeric market cap to verified supply/category/volume evidence',()=>{
  const value=normalizeJupiterToken(row(mints(1)[0]),initial,180);
  expect(value).toMatchObject({state:'fresh',circulatingSupply:'1000000.25',marketCapUsd:'123450.03',precision:'provider_json_numbers',category:'unverified',volumeUnit:'undocumented',volumeComplete:null});
 });
 it('quarantines duplicate mint responses and reports omitted mints without inventing zero data',async()=>{
  const ids=mints(3),collector=new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],clock:()=>initial,fetcher:async()=>Response.json([row(ids[0]),row(ids[0]),row(ids[1])])});
  const result=await collector.read(ids,180);expect(result.coverage).toBe('partial');expect(result.rows.map(r=>r.mint)).toEqual([ids[1]]);expect(result.missingMints.sort()).toEqual([ids[0],ids[2]].sort());expect(result.failures.find(f=>f.mint===ids[0])?.reason).toContain('duplicate');
 });
 it('rejects unrequested mints and malformed finite-number fields for the affected batch',async()=>{
  for(const response of [[row(testAddress('unexpected-token'))],[{...row(mints(1)[0]),liquidity:-1}],[{...row(mints(1)[0]),circSupply:'1000000'}]]){
   const collector=new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],clock:()=>initial,fetcher:async()=>Response.json(response)});
   expect(await collector.read(mints(1),180)).toMatchObject({coverage:'unavailable',returnedCount:0,missingMints:mints(1)});
  }
 });
 it('stops queued work on rate limit and applies bounded retry backoff',async()=>{
  let now=initial,calls=0;const collector=new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],clock:()=>now,wait:async ms=>{now+=ms;},fetcher:async()=>{calls++;return new Response(null,{status:429,headers:{'retry-after':'600'}});}});
  const result=await collector.read(mints(350),180);expect(calls).toBeLessThanOrEqual(2);expect(result.coverage).toBe('unavailable');expect(result.missingMints).toHaveLength(350);
  const after=calls;await collector.read(mints(350),180,true);expect(calls).toBe(after);await expect(collector.read(mints(351),180,true)).rejects.toThrow('backoff');
  now+=200000;await collector.read(mints(350),180);expect(calls).toBe(after);now+=101000;await collector.read(mints(350),180);expect(calls).toBeGreaterThan(after);
 });
 it('rejects oversized responses without copying their body into evidence or errors',async()=>{
  const collector=new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],clock:()=>initial,fetcher:async()=>new Response('secret-upstream-'+'.'.repeat(1000001))});
  const result=await collector.read(mints(1),180);expect(result.coverage).toBe('unavailable');expect(JSON.stringify(result)).not.toContain('secret-upstream');
 });
 it('requires the exact reviewed HTTPS endpoint and fixed approved origin',()=>{
  expect(()=>new JupiterTokensCollector({allowedOrigins:['https://other.example']})).toThrow('origin');
  for(const endpoint of ['http://api.jup.ag/tokens/v2/search','https://api.jup.ag/other','https://evil.example/tokens/v2/search',JUPITER_TOKENS_ENDPOINT+'?api-key=secret'])expect(()=>new JupiterTokensCollector({allowedOrigins:['https://api.jup.ag'],endpoint})).toThrow('endpoint');
 });
});
