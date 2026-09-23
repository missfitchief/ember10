import {afterEach,expect,it,vi} from 'vitest';
import {csv} from '../apps/api/queries.js';
import {hostedRead} from '../apps/api/hosted.js';
import {epochPage} from '../apps/web/ledger.js';
import {money} from '../apps/web/view-model.js';
import {policySchema} from '../packages/core/approval.js';
import {defaultPolicy} from '../packages/core/model.js';
import {createServer} from '../apps/api/server.js';
import {loadConfig} from '../packages/core/config.js';
import type {Store} from '../packages/db/store.js';
afterEach(()=>vi.unstubAllGlobals());
it('protects spreadsheet formulas after spaces and controls while quoting ordinary text',()=>{
 const output=csv([{asset:'\t =HYPERLINK("x")',owner:'normal',amount:'10',paid:'0',unpaid:'10'}]);
 expect(output).toContain('"\'\t =HYPERLINK(""x"")"');expect(output).toContain('"normal","10","0","10"');
});
it('promotes compact market-cap rounding boundaries and rejects a zero holder threshold',()=>{
 expect(money('999950')).toBe('$1.0M');expect(money('999950000')).toBe('$1.0B');
 expect(policySchema.safeParse({...defaultPolicy,holderUnits:'0'}).success).toBe(false);
});
it('distinguishes unavailable history from empty history and rejects malformed or demo pages',()=>{
 expect(epochPage({status:'unavailable',items:[],nextCursor:null}).status).toBe('unavailable');
 expect(epochPage({items:[],nextCursor:null}).items).toEqual([]);
 expect(epochPage({items:[{id:'round',status:'funded'}],nextCursor:'round'}).nextCursor).toBe('round');
 expect(()=>epochPage({items:[{}]})).toThrow();expect(()=>epochPage({mode:'demo',items:[]})).toThrow();
});
it('labels demo records consistently on ordinary public JSON routes',async()=>{
 const db={pool:{query:async(sql:string)=>({rows:sql.includes('RETURNING hits')?[{hits:1}]:[],rowCount:0})}} as unknown as Store;
 const app=createServer(db,loadConfig({MODE:'demo'}));
 for(const url of ['/api/epochs','/api/basket','/api/project']){const response=await app.inject({method:'GET',url});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({mode:'demo',testOnly:true});}await app.close();
});
it('keeps CSV download headers and shares one bounded deadline across the proxy requests',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({mode:'prelaunch'})).mockResolvedValueOnce(new Response('asset,amount\nSOL,1',{headers:{'content-type':'text/csv'}}));vi.stubGlobal('fetch',fetch);
 const response=await hostedRead(new Request('https://pilot.test/api/epochs/round/export?format=csv'),'https://ledger.test');
 expect(response.status).toBe(200);expect(response.headers.get('content-disposition')).toBe('attachment; filename="epoch-allocations.csv"');expect(await response.text()).toContain('SOL,1');
 expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
});
