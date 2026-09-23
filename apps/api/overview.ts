import { MarketDataService, MARKET_BASIS, MARKET_SOURCE, validMint } from '../../packages/integrations/market-data.js';
import type { PublicOverview } from '../../packages/shared/public.js';

export const publicPolicy: PublicOverview['policy'] = {
  version: 'ember10-v2', basketSize: 10, assetWeightBps: 1000, rewardsBps: 8000, buybackBps: 1000, operationsBps: 1000,
  holderUnits: '100000', rankingBasis: 'Verified circulating market cap (required for selection)',
  eligibilityRules: ['Verified Ember origin and graduated pool', 'At least 24 hours old', 'Verified liquidity ≥ $10,000 and 24h volume ≥ $5,000', 'Complete census of at least 50 owners', 'Supported SPL token with revoked mint and freeze authorities', 'Verified route for intended purchase budget', 'Comparable circulating market cap and fresh complete data', 'Project token and unsupported asset categories excluded']
};
const service = new MarketDataService();
export const projectIdentity = (): PublicOverview['project'] => {
  const value = process.env.OUR_MINT;
  const mint = value && validMint(value) ? value : null;
  return { name: 'EMBER10', phase: 'prelaunch', dataMode: 'real', mint, mintStatus: mint ? 'configured_unverified' : 'not_deployed', buyUrl: null };
};
export const revision = () => process.env.EMBER10_REVISION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
export async function overview(source = service, page: { query?: string; offset?: number; limit?: number; view?: 'all' | 'selection' | 'excluded' } = {}): Promise<PublicOverview> {
  const project = projectIdentity(), { observed, status } = await source.read(project.mint);
  const query = (page.query ?? '').trim().slice(0, 100), offset = Math.max(0, page.offset ?? 0), limit = Math.max(1, Math.min(100, page.limit ?? 100));
  const view = page.view ?? 'all';
  const matches = (observed?.normalized.markets ?? []).filter(m => (view === 'all' || (view === 'selection' ? m.selected : m.eligibility === 'excluded')) && (!query || `${m.mint} ${m.name} ${m.symbol}`.toLowerCase().includes(query.toLowerCase())));
  const markets = matches.slice(offset, offset + limit);
  return {
    schemaVersion: 1, revision: revision(), project, policy: publicPolicy,
    discovery: {
      status, sourceUrl: MARKET_SOURCE, documentationUrl: 'https://embercurve.fun/developers', fetchedAt: observed?.fetchedAt ?? null,
      sourceTimestamp: null, lastSuccessfulAt: observed?.fetchedAt ?? null, refreshSeconds: source.refreshSeconds,
      message: status === 'unavailable' ? 'Ember market data is unavailable. No substitute assets are shown.' : status === 'stale' ? 'Refresh failed or expired. Showing the last successful fetch with its original timestamp.' : status === 'warming' ? 'Catalogue or registry coverage is incomplete or warming. New purchases remain paused.' : 'Real Ember catalogue, ranked by reported USD market cap. Eligibility is checked separately; source observation time and supply basis are unpublished.',
      rankingBasis: MARKET_BASIS, supplyBasis: 'undocumented', evidenceHash: observed?.normalized.evidenceHash ?? null,
      coverage: observed?.normalized.coverage ?? { status: 'unverified', rawRows: 0, uniqueMints: 0, rankedMints: 0, duplicateRows: 0, invalidRows: 0, warming: false, complete: false, note: 'No successfully validated catalogue available.' }
    },
    markets, marketPage: { offset, limit, totalMatches: matches.length, returned: markets.length, query, view, hasMore: offset + markets.length < matches.length },
    selection: { policyVersion: 'ember10-v2', state: status === 'ready' ? 'insufficient' : 'blocked', selectedMints: [], selectedCount: 0, requiredCount: 10, commitmentsAllowed: false,
      reason: 'No candidates have all required checks verified. New purchases remain paused until ten qualify under the unchanged eligibility rules.' },
    fundedBasket: { status: 'unavailable', epochId: null, fundedAt: null, policyVersion: null, members: [], message: 'No verified funded epoch is connected to this public host. A market ranking does not establish a funded basket.' },
    settlement: { status: 'not_configured', broadcastEnabled: false, workerActive: false, lastFinalizedAt: null, message: 'Settlement is not configured on this read-only public host.' },
    accounting: { status: 'unavailable', currency: 'SOL', creatorRevenue: null, holderRewards: null, buybackBurn: null, opsAllocation: null, approvedExpenses: null, retainedReserve: null, withdrawableRemainder: null, pendingTransfers: null, finalizedDevPayments: null, message: 'Project ledger unavailable. Ember platform totals are not EMBER10 revenue or payments. Existing OPS/DEV rules are unchanged; unavailable amounts are not zero.' }
  };
}
