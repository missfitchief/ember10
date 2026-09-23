/** Public read-only contract v1. Amounts are exact decimal strings, never fixture fallbacks. */
export type DiscoveryStatus = 'ready' | 'warming' | 'stale' | 'unavailable';
export type CheckState = 'pass' | 'fail' | 'unknown';
export interface EligibilityCheck { code: string; state: CheckState; label: string }
export interface PublicMarket {
  mint: string; symbol: string; name: string; imageUrl: string | null;
  canonicalPool: string | null; config: string | null; quoteMint: string | null;
  marketCapUsd: string | null; priceUsd: string | null; volume24hUsd: string | null; change24hPct: string | null;
  currency: 'USD'; supplyBasis: 'undocumented'; sourceTimestamp: string | null; createdAt: string | null;
  rank: number | null; eligibility: 'eligible' | 'excluded' | 'unknown'; reasons: EligibilityCheck[];
  selected: boolean; weightBps: number | null; sourceUrl: string;
}
export interface PublicOverview {
  schemaVersion: 1; revision: string | null;
  project: { name: 'EMBER10'; phase: 'prelaunch' | 'configured'; dataMode: 'real'; mint: string | null; mintStatus: 'not_deployed' | 'configured_unverified'; buyUrl: null };
  policy: { version: 'ember10-v2'; basketSize: 10; assetWeightBps: 1000; rewardsBps: 8000; buybackBps: 1000; operationsBps: 1000; holderUnits: string; rankingBasis: string; eligibilityRules: string[]; minBasketMicroUsd?: string; policyHash?: string };
  discovery: { status: DiscoveryStatus; sourceUrl: string; documentationUrl: string; fetchedAt: string | null; sourceTimestamp: string | null; lastSuccessfulAt: string | null; refreshSeconds: number; message: string; rankingBasis: string; supplyBasis: 'undocumented'; coverage: { status: 'unverified' | 'partial'; rawRows: number; uniqueMints: number; rankedMints: number; duplicateRows: number; invalidRows: number; warming: boolean; complete: false; note: string }; evidenceHash: string | null };
  markets: PublicMarket[];
  marketPage: { offset: number; limit: number; totalMatches: number; returned: number; query: string; view: 'all' | 'selection' | 'excluded'; hasMore: boolean };
  selection: { policyVersion: 'ember10-v2'; state: 'ready' | 'insufficient' | 'blocked'; selectedMints: string[]; selectedCount: number; requiredCount: 10; commitmentsAllowed: boolean; reason: string; observedAt?: string | null; evidenceHash?: string | null; sourceHash?: string | null; policyHash?: string | null; complete?: boolean };
  fundedBasket: { status: 'unavailable' | 'none' | 'funded'; epochId: string | null; fundedAt: string | null; policyVersion: string | null; members: { mint: string; symbol: string; weightBps: number }[]; message: string };
  settlement: { status: 'not_configured' | 'paused' | 'configured'; broadcastEnabled: boolean; workerActive: boolean; lastFinalizedAt: string | null; message: string };
  accounting: { status: 'unavailable' | 'available'; currency: 'SOL'; unit?: 'lamports'; creatorRevenue: string | null; holderRewards: string | null; buybackBurn: string | null; opsAllocation: string | null; approvedExpenses: string | null; retainedReserve: string | null; withdrawableRemainder: string | null; pendingTransfers: string | null; finalizedDevPayments: string | null; outstandingPayables?: string | null; paidExpenses?: string | null; reservedPayoutCosts?: string | null; developerPayoutEnabled?: boolean; nextDailyEvaluation?: string | null; message: string };
}
export interface PublicWalletRewards { address: string; status: 'unavailable'; eligibility: null; entitlements: never[]; deliveries: never[]; reason: string }
