import type { Engine } from '../../packages/core/engine.js';
import type { AutomaticSelectionService } from '../../packages/integrations/automatic-selection.js';
import { budget } from '../../packages/core/money.js';
import { ensure, hash } from '../../packages/core/model.js';
/** No day-level membership cache. The forced current universe is frozen by Engine.plan in the funding transaction. */
export async function commitFreshEpoch(engine:Engine, selection:AutomaticSelectionService, args:Omit<Parameters<Engine['plan']>[0],'basket'>, authorizeCommit:()=>Promise<void>) {
 await authorizeCommit();
 const planned=budget(args.funding,args.cost,args.policy,args.price,args.now??Date.now());
 const observation=await selection.revalidate(planned.leg);
 ensure(observation.policyHash===hash(args.policy)&&observation.basket,'current selection policy mismatch');
 await engine.db.doc('observation',observation);
 await authorizeCommit();
 return engine.plan({...args,basket:observation.basket});
}
