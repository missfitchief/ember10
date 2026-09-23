import {spawn,ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import {Store} from '../packages/db/store.js';
import {migrate} from '../packages/db/migrate.js';
import {fixtures} from '../tests/fixtures/synthetic.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const children:ChildProcess[]=[];const start=(file:string,args:string[]=[],env=process.env)=>{const child=spawn(process.execPath,['--import','tsx',file,...args],{stdio:'inherit',windowsHide:true,env});children.push(child);return child;};
const demo=process.argv.includes('--demo');const f=fixtures();
const env={...process.env,MODE:demo?'demo':process.env.MODE??'prelaunch',DATABASE_URL:demo?'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_demo':process.env.DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_prelaunch',...(demo?{OUR_MINT:f.mint,TREASURY:f.treasury,OUR_POOL:f.pool,API_PORT:'4311',API_PROXY:'http://127.0.0.1:4311'}: {})};
let db=new Store(env.DATABASE_URL);try{await db.pool.query('SELECT 1');}catch{await db.close();start('scripts/database.ts');let ready=false;for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,1000));db=new Store(env.DATABASE_URL);try{await db.pool.query('SELECT 1');ready=true;break;}catch{await db.close();}}if(!ready)throw Error('Local database startup failed');}await migrate(db);await db.bindMode(env.MODE as 'prelaunch');await db.close();
if(demo){const seed=start('scripts/demo.ts',[],env);await new Promise<void>((resolve,reject)=>seed.on('exit',code=>code===0?resolve():reject(Error('demo setup failed'))));}
start('apps/api/main.ts',[],env);start('apps/worker/main.ts',[],env);start('node_modules/vite/bin/vite.js',['--config','apps/web/vite.config.ts',...(demo?['--port','5174']:[])],env);
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{for(const child of children)child.kill('SIGTERM');});
