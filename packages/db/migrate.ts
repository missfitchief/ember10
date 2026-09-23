import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { loadConfig } from '../core/config.js';
export async function migrate(db:Store){await db.tx(async t=>{await t.query('SELECT pg_advisory_xact_lock(557788)');await t.query('CREATE TABLE IF NOT EXISTS migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 const dir=new URL('./migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
 if((await t.query('SELECT id FROM migrations WHERE id=$1',[f])).rowCount)continue;await t.query(await readFile(new URL(f,dir),'utf8'));await t.query('INSERT INTO migrations(id) VALUES($1)',[f]);}});}
if(process.argv[1]===fileURLToPath(import.meta.url)){const c=loadConfig();const db=new Store(c.DATABASE_URL);await migrate(db);await db.bindMode(c.MODE);await db.close();console.log('Migrations applied.');}
