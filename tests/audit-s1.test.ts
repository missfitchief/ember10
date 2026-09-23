import {afterEach,expect,it,vi} from 'vitest';
import {Connection,PublicKey} from '@solana/web3.js';
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {createServer} from '../apps/api/server.js';
import {Store} from '../packages/db/store.js';
import {loadConfig} from '../packages/core/config.js';
import {canonical,defaultPolicy} from '../packages/core/model.js';
import {fullSnapshot} from '../packages/integrations/solana.js';
import {ingestTreasury} from '../packages/integrations/ingestion.js';
import {MarketDataService,MARKET_SOURCE} from '../packages/integrations/market-data.js';
import {CATALOGUE_MAX_BYTES,decimalUnits} from '../packages/integrations/http.js';
import {epochCostForecast} from '../apps/worker/forecast.js';
import {testAddress} from '../packages/integrations/demo.js';
import type {Engine} from '../packages/core/engine.js';
import type {EmberClient} from '../packages/integrations/ember.js';
afterEach(()=>vi.restoreAllMocks());

it('requires configured operator authentication on decoded and absolute-form routes',async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('RETURNING hits')?[{hits:1}]:[],rowCount:0}));
 const db={pool:{query}} as unknown as Store,app=createServer(db,loadConfig({MODE:'prelaunch',OPERATOR_TOKEN:'a-strong-operator-test-token-000000000'}));
 try {for(const url of ['/operator/pause','/%6Fperator/pause','http://example.test/operator/pause','/%6fperator/funding']){
  const response=await app.inject({method:url.endsWith('funding')?'GET':'POST',url,payload:url.endsWith('funding')?undefined:{reason:'must not be applied'}});
  expect(response.statusCode).toBe(401);
 }expect(query.mock.calls.some(([sql])=>/UPDATE control|INSERT INTO operator_audit/.test(sql))).toBe(false);}finally{await app.close();}
});

it('an idle pool error is handled and does not expose connection credentials',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{}),db=new Store('postgresql://secret:password@127.0.0.1:1/unused');
 expect(()=>db.pool.emit('error',Object.assign(new Error('secret password'),{code:'57P01'}))).not.toThrow();
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/password|secret/);expect(log).toHaveBeenCalledOnce();await db.close();
});

it('fullSnapshot emits the real web3 JSON-RPC commitment shape and rejects an older supply slot',async()=>{
 const mint=new PublicKey(testAddress('snapshot-mint')),owner=new PublicKey(testAddress('snapshot-holder')),empty=new PublicKey('11111111111111111111111111111111');
 const mintBytes=Buffer.alloc(MintLayout.span),tokenBytes=Buffer.alloc(AccountLayout.span);
 MintLayout.encode({mintAuthorityOption:0,mintAuthority:empty,supply:100000n,decimals:0,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:empty},mintBytes);
 AccountLayout.encode({mint,owner,amount:100000n,delegateOption:0,delegate:empty,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:empty},tokenBytes);
 const info=(bytes:Buffer)=>({data:[bytes.toString('base64'),'base64'],executable:false,lamports:2039280,owner:TOKEN_PROGRAM_ID.toBase58(),rentEpoch:0});
 const requests:any[]=[];let supplySlot=101;
 const connection=new Connection('http://127.0.0.1:8899',{fetch:async(_input,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  const result=body.method==='getAccountInfo'?{context:{slot:100},value:info(mintBytes)}:body.method==='getProgramAccounts'?{context:{slot:100},value:[{pubkey:testAddress('snapshot-token-account'),account:info(tokenBytes)}]}:{context:{slot:supplySlot},value:{amount:'100000',decimals:0,uiAmount:100000,uiAmountString:'100000'}};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{headers:{'content-type':'application/json'}});
 }});
 const snap=await fullSnapshot(connection,mint.toBase58(),defaultPolicy,true);expect(snap.owners[0].eligible).toBe(true);
 expect(requests.find(r=>r.method==='getTokenSupply').params).toEqual([mint.toBase58(),{commitment:'finalized'}]);
 supplySlot=99;await expect(fullSnapshot(connection,mint.toBase58(),defaultPolicy,true)).rejects.toThrow('predates');
});

it('zero transfers cannot pin the treasury cursor and later missing evidence retains per-signature progress',async()=>{
 const treasury=testAddress('inbound-treasury'),sender=testAddress('inbound-source');let cursor:any,missing=true;
 const query=vi.fn(async(sql:string,params?:any[])=>{if(sql.startsWith('INSERT INTO cursors'))cursor=JSON.parse(params![1]);return {rows:sql.startsWith('SELECT value')&&cursor?[{value:cursor}]:[],rowCount:0};});
 const engine={db:{pool:{query},doc:vi.fn()},ingest:vi.fn()} as unknown as Engine;
 const signature=(signature:string)=>({signature,err:null});
 const rpc={
  getSignaturesForAddress:async(_key:unknown,opts:any)=>opts.until==='good'?[signature('missing')]:[signature('missing'),signature('good'),signature('zero')],
  getParsedTransaction:async(sig:string)=>sig==='missing'&&missing?null:{
   slot:100,meta:{err:null},transaction:{signatures:[sig],message:{accountKeys:[],instructions:[
    {program:'system',parsed:{type:'transfer',info:{source:sender,destination:treasury,lamports:sig==='zero'?0:10}}}
   ]}}
  }
 } as unknown as Connection;
 const ember={payouts:async()=>({value:{payouts:[]}})} as unknown as EmberClient;
 const config={treasury,feeSender:testAddress('fee'),pool:testAddress('pool'),historyStartSignature:'start'};
 await expect(ingestTreasury(engine,rpc,ember,config)).rejects.toThrow('retain cursor');expect(cursor.signature).toBe('good');expect(engine.ingest).toHaveBeenCalledTimes(1);expect(engine.db.doc).toHaveBeenCalledTimes(1);
 missing=false;await ingestTreasury(engine,rpc,ember,config);expect(cursor.signature).toBe('missing');expect(engine.ingest).toHaveBeenCalledTimes(2);
});

it('accepts a catalogue beyond the former 12 MB cap and rejects the documented new cap',async()=>{
 const value={markets:[],warming:false,economics:null,totals:null,padding:'x'.repeat(12_000_001)};
 const service=new MarketDataService(async url=>String(url)===MARKET_SOURCE?Response.json(value):Response.json({count:0,updatedAt:1,configs:[]}));
 expect((await service.read()).status).toBe('ready');
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const oversized=new MarketDataService(async()=>new Response('{}',{headers:{'content-length':String(CATALOGUE_MAX_BYTES+1)}}));
 expect((await oversized.read()).status).toBe('unavailable');expect(log).toHaveBeenCalledWith('Ember catalogue refresh failed',expect.objectContaining({code:'source_size',maxBytes:CATALOGUE_MAX_BYTES}));
});

it('budgets only epoch costs and parses exact exponent-form base units',()=>{
 expect(epochCostForecast(10,100000n,2039280n)).toBe(23632080n);
 expect(epochCostForecast(10,100000n,2039280n)).toBeLessThan(100000000n);
 expect(decimalUnits('1e-9',9)).toBe(1n);expect(decimalUnits('1.5e1',9)).toBe(15000000000n);
 expect(()=>decimalUnits('1e-10',9)).toThrow('precision');expect(()=>decimalUnits('1e999999',9)).toThrow('bounds');
 expect(canonical({at:new Date('2026-09-23T00:00:00Z')})).toBe('{"at":"2026-09-23T00:00:00.000Z"}');
});
