import type { Config } from '../../packages/core/config.js';
import type { Approval } from '../../packages/core/approval.js';
import type { Chain, Engine, Intent } from '../../packages/core/engine.js';
import { ensure, hash } from '../../packages/core/model.js';
import { tick } from './runner.js';
import type { Tx } from '../../packages/db/store.js';

export interface ExecutionControl {
 approval: () => Promise<Approval>;
 fundingRoute: (approval: Approval) => Promise<unknown>;
 conditions: (intent: Intent, approval: Approval) => Promise<void>;
 conditionsLocked?: (intent: Intent, tx: Tx) => Promise<void>;
}
/** Shared by the actual worker and orchestration tests. Inspection never depends on active signing approval. */
export function executionAuthorizer(engine: Engine, c: Config, control: ExecutionControl) {
 return async (intent?: Intent) => {
  ensure(c.MODE === 'live' && c.BROADCAST_ENABLED && !c.MASTER_PAUSE, 'configuration blocks new execution');
  const a = await control.approval();
  ensure(!(await engine.db.pool.query('SELECT paused FROM control')).rows[0].paused, 'new execution paused');
  if (intent) await control.conditions(intent, a);
  // Observe the route after any slow evidence refresh so it is current at the signer boundary.
  const route = await control.fundingRoute(a);
  ensure(await engine.fundingRoute(a.expectedFundingRoute, route), 'funding route changed');
  // Re-read approval after asynchronous data/build checks, even if the file changed mid-cycle.
  const effective = await control.approval();
  ensure(hash(effective) === hash(a), 'approval changed during execution checks');
  ensure(!(await engine.db.pool.query('SELECT paused FROM control')).rows[0].paused, 'new execution paused');
  await engine.db.doc('observation', { type: 'worker_readiness', at: Date.now(), policyHash: hash(a.policy), approvalId: a.approvalId, allowed: true });
 };
}
export async function controlledExecutionTick(engine: Engine, chain: Chain, owner: string, c: Config, control: ExecutionControl) {
 await tick(engine, chain, owner, { recoveryOnly: true });
 if (!c.BROADCAST_ENABLED || c.MASTER_PAUSE) return { recoveryOnly: true };
 const authorize = executionAuthorizer(engine, c, control);
 try { await authorize(); } catch {
  await engine.db.doc('observation', { type: 'worker_readiness', at: Date.now(), allowed: false });
  return { recoveryOnly: true };
 }
 return tick(engine, chain, owner, { authorizeNewSigning: authorize, authorizeNewSigningLocked:control.conditionsLocked });
}
