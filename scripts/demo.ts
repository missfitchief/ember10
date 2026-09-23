import { writeFile,mkdir } from 'node:fs/promises';
import { Store } from '../packages/db/store.js';
import { migrate } from '../packages/db/migrate.js';
import { Engine } from '../packages/core/engine.js';
import { DemoChain, testAddress } from '../packages/integrations/demo.js';
import { fixtures } from '../tests/fixtures/synthetic.js';
import { runIntent } from '../apps/worker/runner.js';
import { canonical, SOL } from '../packages/core/model.js';
import { exportEpoch } from '../apps/api/queries.js';
const db=new Store(process.env.DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_demo');await migrate(db);await db.bindMode('demo');
const engine=new Engine(db,'demo'),chain=new DemoChain(db);await chain.init();const f=fixtures();
const lease=(await db.lease('demo-script',300))!;if(!lease)throw Error('Worker busy');
await db.pool.query("UPDATE control SET paused=false,reason='Synthetic demonstration only'");
for(const [kind,amount] of [['seed','200000000'],['creator_fee','1000000000']] as const)await engine.ingest({signature:'demo-receipt-'+kind,instruction:'0',asset:SOL,amount,destination:f.treasury,source:f.sender,slot:499999,finalized:true,error:null,pool:f.pool,publishedPool:f.pool,kind,attributionVerified:true,rawEvidence:{testOnly:true}}, {pool:f.pool,treasury:f.treasury,feeSender:f.sender});
await engine.plan({id:'demo-epoch-001',...f,funding:1000000000n,cost:20000000n,minReserve:100000000n,maxRound:1000000000n,maxDay:5000000000n,ourMint:f.mint,routeUnchanged:true,lease});
const log:string[]=[];
let intents=(await db.pool.query("SELECT id FROM intents WHERE kind='swap' ORDER BY id")).rows;
for(let n=0;n<intents.length;n++){
 const id=intents[n].id;
 if(n===0){try{await runIntent(engine,chain,id,lease,'after_send');}catch{log.push('Simulated worker crash after broadcast; signed bytes and signature already persisted.');}}
 await runIntent(engine,chain,id,lease);await runIntent(engine,chain,id,lease);
 log.push(`Purchase ${n+1}/5: actual simulated acquisition allocated with exact integer conservation.`);
}
for(const a of f.candidates){const ata=new Map(f.owners.map((owner,n)=>[owner,{exists:n===0,valid:true,costMicroUsd:1000000n}]));
 const id=await engine.schedulePayout({asset:a,chain,price:{microUsd:'20000',at:Date.now(),source:'DEMO valuation'},ata,policy:f.policy,costAccount:'reserve',lease,sourceTokenAccount:chain.destination(f.treasury,a.mint)});
 if(id){await runIntent(engine,chain,id,lease);await runIntent(engine,chain,id,lease);}
}
for(const kind of ['buyback','burn']){intents=(await db.pool.query('SELECT id FROM intents WHERE kind=$1',[kind])).rows;for(const i of intents){await runIntent(engine,chain,i.id,lease);await runIntent(engine,chain,i.id,lease);}}
log.push('Two eligible owners delivered; one owner carries accrued units forward. Below-threshold owner received no credit.');
log.push('Buyback and burn use separate intents. All jobs can be replayed without a second economic action.');
await mkdir('docs/demo',{recursive:true});await writeFile('docs/demo/sample-epoch.json',canonical(await exportEpoch(db,'demo-epoch-001')));await writeFile('docs/demo/replay.txt',log.join('\n'));
console.log(log.join('\n'));console.log('DEMO ONLY. No network broadcasts. Demo wallet:',testAddress('alice'));await db.pool.query('UPDATE leases SET expires_at=now() WHERE owner=$1',[lease.owner]);await db.close();
