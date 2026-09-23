import type { Store } from '../../packages/db/store.js';
import type { Config } from '../../packages/core/config.js';
import { ensure, fresh, hash } from '../../packages/core/model.js';
import { DeveloperAccounting } from '../../packages/core/developer.js';
import { developerPolicy } from '../../packages/core/developer-config.js';
import type { SelectionObservation } from '../../packages/integrations/automatic-selection.js';
import { publicMarketSource } from './catalogue.js';
import { loadApproval, assertProspectiveApproval } from '../../packages/core/approval.js';
import { overview } from './overview.js';
import type { PublicOverview } from '../../packages/shared/public.js';

export async function backendOverview(db: Store, c: Config, page: Parameters<typeof overview>[1] = {}, source = publicMarketSource): Promise<PublicOverview> {
 ensure(c.MODE === 'live' || c.MODE === 'prelaunch', 'non-production ledger cannot supply overview');
 const result = await overview(source, page), { observed } = await source.read(c.OUR_MINT ?? null);
 let approvedPolicy: string | null = null;
 if (c.MODE === 'live') try { const a = await loadApproval(c); assertProspectiveApproval(a); approvedPolicy = hash(a.policy); } catch { /* Records remain readable; new commitment authority is absent. */ }
 return db.tx(async tx => {
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const installation = (await tx.query('SELECT mode FROM installation')).rows[0];
  ensure(installation?.mode === c.MODE, 'database mode mismatch');
  const selection: SelectionObservation | undefined = (await tx.query("SELECT body FROM current_observation_records WHERE kind='observation' AND body->>'type'='eligible_selection' ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0]?.body;
  const control = (await tx.query('SELECT paused,reason FROM control')).rows[0];
  const worker = (await tx.query("SELECT expires_at FROM leases WHERE name='worker'")).rows[0];
  const active = !!worker && new Date(worker.expires_at).getTime() > Date.now();
  const readiness = (await tx.query("SELECT body FROM current_observation_records WHERE kind='observation' AND body->>'type'='worker_readiness' ORDER BY created_at DESC LIMIT 1")).rows[0]?.body;
  const epoch = (await tx.query('SELECT e.id,e.created_at,b.body AS basket,p.body AS policy FROM epochs e JOIN documents b ON b.id=e.basket_id JOIN documents p ON p.id=e.policy_id ORDER BY e.created_at DESC,e.id DESC LIMIT 1')).rows[0];
  const lastFinalized = (await tx.query("SELECT max(i.updated_at) AS at FROM intents i JOIN chain_receipts r ON r.intent_id=i.id WHERE i.status='finalized'")).rows[0]?.at;
  const usable = !!selection && selection.status === 'ready' && selection.complete && fresh(selection.observedAt, Date.now(), selection.policy.maxDataAgeSeconds) && selection.policyHash === hash(selection.policy);
  const members = usable ? selection!.basket?.selected ?? [] : [];
  const eligibleReady = usable && selection!.basket?.ready && members.length === 10;
  const ready = c.MODE === 'live' && c.BROADCAST_ENABLED && !c.MASTER_PAUSE && !control.paused && active && approvedPolicy === selection?.policyHash && readiness?.allowed === true && readiness.policyHash === approvedPolicy && fresh(readiness.at, Date.now(), 45);
  result.project = { ...result.project, mint: c.OUR_MINT ?? null, phase: c.MODE === 'live' ? 'configured' : 'prelaunch', mintStatus: c.OUR_MINT ? 'configured_unverified' : 'not_deployed' };
  if (selection) result.policy = { ...result.policy, holderUnits: selection.policy.holderUnits, minBasketMicroUsd: selection.policy.minBasketMicroUsd, policyHash: selection.policyHash, rankingBasis: selection.policy.rankingBasis };
  result.selection = { policyVersion: 'ember10-v2', state: eligibleReady ? 'ready' : usable ? 'insufficient' : 'blocked', selectedMints: members.map(x => x.mint), selectedCount: members.length, requiredCount: 10, commitmentsAllowed: !!(eligibleReady && ready),
   reason: !selection ? 'Automatic eligibility evidence has not been produced.' : !usable ? 'Eligibility evidence is unavailable, incomplete or stale. New commitments are blocked.' : selection.reason,
   observedAt: selection ? new Date(selection.observedAt).toISOString() : null, evidenceHash: selection?.evidenceHash ?? null, sourceHash: selection?.sourceHash ?? null, policyHash: selection?.policyHash ?? null, complete: !!(usable && selection.complete) };
  // Keep reported market ranking separate from eligibility and the immutable funded epoch.
  const universe = new Map(selection?.basket?.universe.map(x => [x.mint, x]) ?? []);
  const candidates = new Map(selection?.candidates.map(x => [x.mint, x]) ?? []);
  const selected = new Set(members.map(x => x.mint));
  const all = (observed?.normalized.markets ?? []).map(m => {
   const candidate = universe.get(m.mint);
   if (!candidate || !usable) return { ...m, selected: false, weightBps: null, eligibility: m.eligibility === 'excluded' ? 'excluded' as const : 'unknown' as const,
    reasons: [...m.reasons,...(candidates.get(m.mint)?.evidenceFailures ?? []).map(reason => ({ code:'verification_unavailable', state:'unknown' as const, label:reason }))] };
   return { ...m, eligibility: candidate.reasons.length ? 'excluded' as const : 'eligible' as const,
    reasons: candidate.reasons.length ? candidate.reasons.map(reason => ({ code: 'policy_exclusion', state: 'fail' as const, label: reason })) : [{ code: 'verified_policy', state: 'pass' as const, label: 'All current eligibility gates verified; this is not a funded purchase.' }],
    selected: selected.has(m.mint), weightBps: selected.has(m.mint) ? 1000 : null };
  });
  const { query, offset, limit, view } = result.marketPage;
  const matches = all.filter(m => (view === 'all' || (view === 'selection' ? m.selected : m.eligibility === 'excluded')) && (!query || `${m.mint} ${m.name} ${m.symbol}`.toLowerCase().includes(query.toLowerCase())));
  result.markets = matches.slice(offset, offset + limit); result.marketPage = { ...result.marketPage, totalMatches: matches.length, returned: result.markets.length, hasMore: offset + result.markets.length < matches.length };
  result.fundedBasket = epoch ? { status: 'funded', epochId: epoch.id, fundedAt: new Date(epoch.created_at).toISOString(), policyVersion: `ember${epoch.policy.version === 1 ? 5 : 10}-v${epoch.policy.version}`, members: epoch.basket.selected.map((x: {mint:string;symbol:string;weightBps:number}) => ({ mint: x.mint, symbol: x.symbol, weightBps: x.weightBps })), message: 'Immutable funded epoch. Current rank changes affect future commitments only.' } : { status: 'none', epochId: null, fundedAt: null, policyVersion: null, members: [], message: 'No funded epoch is recorded in this authoritative ledger.' };
  result.settlement = { status: c.MODE === 'prelaunch' ? 'not_configured' : c.MASTER_PAUSE || control.paused || !c.BROADCAST_ENABLED ? 'paused' : 'configured', broadcastEnabled: c.BROADCAST_ENABLED, workerActive: active, lastFinalizedAt: lastFinalized ? new Date(lastFinalized).toISOString() : null, message: 'Finalized records remain visible during pauses; pauses prevent new signing and resend. A worker lease is not proof of a payment.' };
  const dev = await new DeveloperAccounting(db, c.MODE).summary(developerPolicy(c), tx);
  const totals = (await tx.query(`SELECT
   (SELECT count(*) FROM incoming_transfers WHERE classification='creator_fee') AS receipts,
   (SELECT coalesce(sum(amount),0)::text FROM incoming_transfers WHERE classification='creator_fee' AND asset='SOL') AS revenue,
   (SELECT coalesce(sum((funding->>'basket')::numeric),0)::text FROM epochs) AS rewards,
   (SELECT coalesce(sum((funding->>'buyback')::numeric),0)::text FROM epochs) AS buyback`)).rows[0];
  if (dev.hasRecords || Number(totals.receipts) > 0 || epoch) result.accounting = { status: 'available', currency: 'SOL', unit: 'lamports', creatorRevenue: totals.revenue, holderRewards: totals.rewards, buybackBurn: totals.buyback, opsAllocation: dev.allocation, approvedExpenses: dev.approvedExpenses, outstandingPayables: dev.outstandingPayables, paidExpenses: dev.paidExpenses, retainedReserve: dev.retainedReserve, withdrawableRemainder: dev.withdrawableRemainder, pendingTransfers: dev.pendingTransfers, reservedPayoutCosts: dev.reservedPayoutCosts, finalizedDevPayments: dev.finalizedDevPayments, developerPayoutEnabled: dev.enabled, message: 'Exact ledger lamports. Reward and buyback figures are allocations, not finalized payments. Developer remainder deducts operating obligations, reserve and payout cost; operations-wallet funding is not developer profit.' };
  return result;
 });
}
