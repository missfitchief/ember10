import type { Engine } from '../../packages/core/engine.js';
import type { AutomaticSelectionService } from '../../packages/integrations/automatic-selection.js';
import { budget } from '../../packages/core/money.js';
import { ensure, hash } from '../../packages/core/model.js';
/** No day-level membership cache. The forced current universe is frozen by Engine.plan in the funding transaction. */
export async function commitFreshEpoch(engine:Engine, selection:AutomaticSelectionService, args:Omit<Parameters<Engine['plan']>[0],'basket'|'snapshot'>&{snapshot?:Parameters<Engine['plan']>[0]['snapshot']}, authorizeCommit:()=>Promise<void>, captureSnapshot?:()=>Promise<Parameters<Engine['plan']>[0]['snapshot']>, capturePrice?:()=>Promise<Parameters<Engine['plan']>[0]['price']>) {
 await authorizeCommit();
 const planned=budget(args.funding,args.cost,args.policy,args.price,args.now??Date.now());
 const observation=await selection.revalidate(planned.leg);
 ensure(observation.policyHash===hash(args.policy)&&observation.basket,'current selection policy mismatch');
 await engine.db.observe(observation);
 const snapshot=captureSnapshot?await captureSnapshot():args.snapshot;ensure(snapshot,'fresh holder snapshot required');
 const price=capturePrice?await capturePrice():args.price;
 await authorizeCommit();
 return engine.plan({...args,snapshot,price,basket:observation.basket});
}
