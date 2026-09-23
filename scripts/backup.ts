import {spawn} from 'node:child_process';
import {mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {loadConfig} from '../packages/core/config.js';
import {Store} from '../packages/db/store.js';
import {ensure} from '../packages/core/model.js';
const c=loadConfig(),[action='backup',fileArg]=process.argv.slice(2);
ensure(['backup','restore'].includes(action),'Use backup or restore');
const source=new URL(c.DATABASE_URL),target=new URL(action==='restore'?process.env.RESTORE_DATABASE_URL??'':c.DATABASE_URL);
if(action==='restore')ensure(source.host!==target.host||source.pathname!==target.pathname,'restore must target a different empty database');
await mkdir('.runtime/backups',{recursive:true});
const file=resolve(fileArg??`.runtime/backups/ember5-${new Date().toISOString().replaceAll(':','-')}.dump`);
if(action==='restore'){await stat(file);const db=new Store(target.toString());const tables=await db.pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");await db.close();ensure(tables.rows[0].n===0,'restore target is not empty');}
const name=action==='backup'?'pg_dump':'pg_restore';const binary=process.env.PG_BIN_DIR?join(process.env.PG_BIN_DIR,name+(process.platform==='win32'?'.exe':'')):name;
const auth=['--host',target.hostname,'--port',target.port||'5432','--username',decodeURIComponent(target.username),'--dbname',decodeURIComponent(target.pathname.slice(1))];
const args=action==='backup'?[...auth,'--format=custom','--file',file]:[...auth,'--exit-on-error','--no-owner',file];
await new Promise<void>((resolve,reject)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','inherit','inherit'],env:{...process.env,PGPASSWORD:decodeURIComponent(target.password),PGSSLMODE:target.searchParams.get('sslmode')??'prefer'}});child.on('error',()=>reject(Error('PostgreSQL client tools unavailable. Set PG_BIN_DIR to the installed pg_dump/pg_restore directory.')));child.on('exit',code=>code===0?resolve():reject(Error('PostgreSQL backup/restore failed; inspect local diagnostics.')));});
if(action==='restore'){const db=new Store(target.toString());await db.pool.query("UPDATE control SET paused=true,reason='Restored backup: reconcile before enabling execution'");await db.close();}
console.log(action==='backup'?'Private backup written: '+file:'Restore complete and paused. No worker was started.');
