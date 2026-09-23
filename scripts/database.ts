import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../packages/db/store.js';
import { migrate } from '../packages/db/migrate.js';
const databaseDir=resolve('.runtime/postgres');
const pg=new EmbeddedPostgres({databaseDir,user:'ember5',password:'local-development-only',port:55432,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>console.error(String(m).slice(0,300))});
if(!existsSync(resolve(databaseDir,'PG_VERSION')))await pg.initialise();
await pg.start();
for(const mode of ['prelaunch','demo','test']){
 const admin=pg.getPgClient();await admin.connect();const exists=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',['ember5_'+mode]);
 if(!exists.rowCount)await admin.query(`CREATE DATABASE ember5_${mode} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);await admin.end();
 const db=new Store(`postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_${mode}`);await migrate(db);await db.bindMode(mode as 'demo');await db.close();
}
console.log('PostgreSQL ready at 127.0.0.1:55432. Separate prelaunch, demo and test databases.');
let stopping=false;for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{if(stopping)return;stopping=true;await pg.stop();process.exit(0);});
setInterval(()=>{},30000);
