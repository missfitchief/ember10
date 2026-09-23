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
  project: { name: 'EMBER10'; phase: 'prelaunch'; dataMode: 'real'; mint: string | null; mintStatus: 'not_deployed' | 'configured_unverified'; buyUrl: null };
  policy: { version: 'ember10-v2'; basketSize: 10; assetWeightBps: 1000; rewardsBps: 8000; buybackBps: 1000; operationsBps: 1000; holderUnits: string; rankingBasis: string; eligibilityRules: string[] };
  discovery: { status: DiscoveryStatus; sourceUrl: string; documentationUrl: string; fetchedAt: string | null; sourceTimestamp: string | null; lastSuccessfulAt: string | null; refreshSeconds: number; message: string; rankingBasis: string; supplyBasis: 'undocumented'; coverage: { status: 'unverified' | 'partial'; rawRows: number; uniqueMints: number; rankedMints: number; duplicateRows: number; invalidRows: number; warming: boolean; complete: false; note: string }; evidenceHash: string | null };
  markets: PublicMarket[];
  marketPage: { offset: number; limit: number; totalMatches: number; returned: number; query: string; hasMore: boolean };
  selection: { policyVersion: 'ember10-v2'; state: 'ready' | 'insufficient' | 'blocked'; selectedMints: string[]; selectedCount: number; requiredCount: 10; commitmentsAllowed: false; reason: string };
  fundedBasket: { status: 'unavailable' | 'none' | 'funded'; epochId: string | null; fundedAt: string | null; policyVersion: string | null; members: { mint: string; symbol: string; weightBps: number }[]; message: string };
  settlement: { status: 'not_configured'; broadcastEnabled: false; workerActive: false; lastFinalizedAt: null; message: string };
  accounting: { status: 'unavailable'; currency: 'SOL'; creatorRevenue: null; holderRewards: null; buybackBurn: null; opsAllocation: null; approvedExpenses: null; retainedReserve: null; withdrawableRemainder: null; pendingTransfers: null; finalizedDevPayments: null; message: string };
}
export interface PublicWalletRewards { address: string; status: 'unavailable'; eligibility: null; entitlements: never[]; deliveries: never[]; reason: string }
