import { afterEach, expect, it, vi } from 'vitest';
import { hostedRead } from '../apps/api/hosted.js';
import entry from '../api/index.js';
const request=(path:string,options?:RequestInit)=>hostedRead(new Request('https://pilot.example/api/'+path,options),'');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('does not call an unavailable empty catalogue a complete universe',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 const basket=await(await request('basket')).json();
 expect(basket.discovery.status).toBe('unavailable');expect(basket.universe).toEqual([]);
 expect(basket.universeComplete).toBe(false);expect(basket.ready).toBe(false);
});
it('ignores hosting runtime context and defaults to real prelaunch without fixture identity',async()=>{
 vi.stubEnv('EMBER5_API_ORIGIN','');vi.stubEnv('OUR_MINT','');vi.stubEnv('EMBER10_REVISION','tested-commit');
 const handler=entry.fetch as (request:Request,context:unknown)=>Promise<Response>;
 const status=await (await handler(new Request('https://pilot.example/api/status'),{waitUntil(){}})).json();
 expect(status).toMatchObject({mode:'prelaunch',dataMode:'real',hostedSnapshot:false,broadcastEnabled:false,workerActive:false,paused:true,revision:'tested-commit'});
 const project=await (await request('project')).json();expect(project.mint).toBeNull();expect(project.buyUrl).toBeNull();expect(project.policy.basketSize).toBe(10);
});
it('reports absent wallet and ledger evidence as unavailable, never synthetic payments or zero balances',async()=>{
 const wallet=await(await request('wallets/11111111111111111111111111111111/rewards')).json();
 expect(wallet.status).toBe('unavailable');expect(wallet.entitlements).toEqual([]);expect(wallet.deliveries).toEqual([]);
 const ledger=await(await request('transparency')).json();expect(ledger.receivedLamports).toBeNull();expect(ledger.finalizedPayoutTransactions).toBeNull();
 expect((await request('epochs/demo-epoch-001/export')).status).toBe(404);
 expect((await request('wallets/not-a-wallet/rewards')).status).toBe(400);
});
it('rejects writes, privileged routes and malformed pagination',async()=>{
 expect((await request('status',{method:'POST'})).status).toBe(405);
 for(const path of ['operator/resume','index?__route=../operator/pause','epochs?limit=1000','overview?offset=-1','overview?q='+ 'a'.repeat(101)])expect((await request(path)).status).toBeGreaterThanOrEqual(400);
});
it('configured backend failures and demo backends cannot become a production fallback',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 expect((await hostedRead(new Request('https://pilot.example/api/status'),'https://ledger.example')).status).toBe(503);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({mode:'demo',hostedSnapshot:true})));
 const rejected=await hostedRead(new Request('https://pilot.example/api/wallets/11111111111111111111111111111111/rewards'),'https://ledger.example');
 expect(rejected.status).toBe(503);expect(await rejected.text()).toContain('No demo values');
});
it('forwards approved reads only after a production mode check, without caller credentials',async()=>{
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({mode:'prelaunch'})));vi.stubGlobal('fetch',fetch);
 await hostedRead(new Request('https://pilot.example/api/index?__route=epochs&limit=10&secret=hidden',{headers:{authorization:'Bearer private'}}),'https://ledger.example');
 expect(fetch.mock.calls.map(x=>x[0].toString())).toEqual(['https://ledger.example/api/status','https://ledger.example/api/epochs?limit=10']);
 expect(fetch.mock.calls[1][1].headers).toEqual({accept:'application/json'});
});
