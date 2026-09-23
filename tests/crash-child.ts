import {Store} from '../packages/db/store.js';
import {Engine} from '../packages/core/engine.js';
import {DemoChain} from '../packages/integrations/demo.js';
import {runIntent,CrashPoint} from '../apps/worker/runner.js';
const [url,id,point]=process.argv.slice(2),db=new Store(url),engine=new Engine(db,'demo'),chain=new DemoChain(db);
const lease=await db.lease('crash-child',60);if(!lease)process.exit(2);
try{await runIntent(engine,chain,id,lease,point as CrashPoint);process.exit(3);}catch(e){if((e as Error).message.startsWith('INJECTED_CRASH'))process.exit(77);throw e;}
