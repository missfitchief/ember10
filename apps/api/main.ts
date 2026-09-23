import { loadConfig } from '../../packages/core/config.js';
import { Store } from '../../packages/db/store.js';
import { createServer } from './server.js';
const c=loadConfig();const db=new Store(c.DATABASE_URL);await db.bindMode(c.MODE);const app=createServer(db,c);await app.listen({port:c.API_PORT,host:c.HOST});console.log(`EMBER5 ${c.MODE} API: http://${c.HOST}:${c.API_PORT}`);
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,async()=>{await app.close();await db.close();process.exit(0);});
