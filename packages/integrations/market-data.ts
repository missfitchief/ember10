import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import bs58 from 'bs58';
import { z } from 'zod';
import type { EligibilityCheck, PublicMarket, PublicOverview } from '../shared/public.js';

export const MARKET_SOURCE = 'https://embercurve.fun/api/solana/markets';
export const CONFIG_SOURCE = 'https://embercurve.fun/api/solana/configs';
export const MARKET_BASIS = 'Ember-reported marketCapUsd (USD; supply basis undocumented)';
export const validMint = (value: string) => { try { return value.length >= 32 && value.length <= 44 && bs58.decode(value).length === 32; } catch { return false; } };
const mint = z.string().refine(validMint);
const rowSchema = z.object({
  mint, pool: mint, config: mint, quoteMint: mint, dammPool: z.string().nullable().optional(),
  symbol: z.string().max(64), name: z.string().max(300), image: z.string().optional(),
  createdAt: z.number().int().nonnegative().max(8_640_000_000_000), graduated: z.boolean(),
  marketCapUsd: z.unknown().optional(), priceUsd: z.unknown().optional(), volume24hUsd: z.unknown().optional(), change24h: z.unknown().optional(),
  holders: z.number().finite().nonnegative().optional(), holdersCapped: z.boolean().optional(),
  suspect: z.boolean().optional(), paused: z.boolean().optional(), chain: z.string().optional(), engine: z.string().optional()
}).passthrough();
export const publicCatalogueSchema = z.object({ markets: z.array(z.unknown()).max(20_000), warming: z.boolean(), economics: z.unknown(), totals: z.unknown() }).passthrough();
const configSchema = z.object({ count: z.number().int().nonnegative(), updatedAt: z.number().finite(), configs: z.array(z.object({ config: mint }).passthrough()) }).passthrough();

/** Preserve the source's decimal value; never coerce absent/empty/formatted strings to zero. */
export function decimalValue(value: unknown, signed = false): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string' && (value.length > 128 || !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))) return null;
  // Bound exponent before toFixed: a finite Decimal can otherwise expand into GBs.
  try { const n = new Decimal(value); return n.isFinite() && Math.abs(n.e) <= 100 && (signed || !n.isNegative()) ? n.toFixed() : null; } catch { return null; }
}
function imageUrl(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value, 'https://embercurve.fun'); return url.origin === 'https://embercurve.fun' && url.pathname.startsWith('/img/') && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const check = (code: string, state: EligibilityCheck['state'], label: string): EligibilityCheck => ({ code, state, label });
export type NormalizedCatalogue = { markets: PublicMarket[]; coverage: PublicOverview['discovery']['coverage']; evidenceHash: string };

/** The full catalogue is fetched without search/featured/page filters. Market ranking is not eligibility. */
export function normalizeCatalogue(raw: unknown, rawConfigs: unknown, ownMint: string | null, fetchedAt: string): NormalizedCatalogue {
  const catalogue = publicCatalogueSchema.parse(raw);
  const registry = configSchema.safeParse(rawConfigs);
  const registered = registry.success && registry.data.count === registry.data.configs.length ? new Set(registry.data.configs.map(x => x.config)) : null;
  const groups = new Map<string, z.infer<typeof rowSchema>[]>(); let invalidRows = 0;
  for (const rawRow of catalogue.markets) {
    const parsed = rowSchema.safeParse(rawRow);
    if (!parsed.success) { invalidRows++; continue; }
    groups.set(parsed.data.mint, [...(groups.get(parsed.data.mint) ?? []), parsed.data]);
  }
  const now = Date.parse(fetchedAt);
  const markets: PublicMarket[] = [...groups].map(([key, rows]) => {
    // DAMM after graduation is the documented display pool. Conflicting pools/caps are
    // unresolved, never summed or silently picked to produce a more attractive rank.
    const poolFor = (r: typeof rows[number]) => r.graduated && r.dammPool && validMint(r.dammPool) ? r.dammPool : r.pool;
    const pools = new Set(rows.map(poolFor)), caps = new Set(rows.map(r => decimalValue(r.marketCapUsd)));
    const conflict = pools.size !== 1 || caps.size !== 1 || new Set(rows.map(r => r.config)).size !== 1;
    const m = [...rows].sort((a, b) => a.pool < b.pool ? -1 : a.pool > b.pool ? 1 : a.createdAt - b.createdAt)[0];
    const graduated = rows.every(r => r.graduated), createdAt = Math.max(...rows.map(r => r.createdAt));
    const cap = conflict ? null : decimalValue(m.marketCapUsd), volume = decimalValue(m.volume24hUsd);
    const reasons: EligibilityCheck[] = [
      check('provenance', registered ? registered.has(m.config) ? 'unknown' : 'fail' : 'unknown', registered?.has(m.config) ? 'Listed config; on-chain origin unverified' : 'Ember origin unverified'),
      check('graduation', graduated ? 'pass' : 'fail', graduated ? 'Reported graduated; pool unverified' : 'Not graduated'),
      check('minimum_age', createdAt * 1000 <= now - 86400_000 ? 'pass' : 'fail', 'Minimum age: 24 hours'),
      check('liquidity', 'unknown', 'Verified liquidity ≥ $10,000 required'),
      check('volume', volume === null ? 'unknown' : new Decimal(volume).lt(5000) ? 'fail' : 'unknown', 'Verified 24h volume ≥ $5,000 required'),
      check('holders', m.holders !== undefined && m.holders < 50 ? 'fail' : 'unknown', 'Complete census of ≥ 50 holders required'),
      check('token_safety', 'unknown', 'SPL program and revoked authorities unverified'),
      check('route', 'unknown', 'Budget-sized purchase route unverified'),
      check('ranking_basis', 'unknown', 'Circulating supply basis unverified')
    ];
    if (m.mint === ownMint) reasons.push(check('own_token', 'fail', 'Project token is excluded'));
    if (m.chain && m.chain !== 'solana' || m.engine && m.engine !== 'dbc') reasons.push(check('unsupported_asset', 'fail', 'Unsupported chain or launch engine'));
    if (rows.some(r => r.suspect)) reasons.push(check('source_suspect', 'fail', 'Flagged suspect by Ember'));
    if (rows.some(r => r.paused)) reasons.push(check('source_paused', 'fail', 'Source market is paused'));
    if (conflict) reasons.push(check('duplicate_conflict', 'fail', 'Conflicting pool or value for this mint'));
    if (cap === null) reasons.push(check('market_cap_missing', 'fail', 'Comparable market cap unavailable'));
    return { mint: key, symbol: m.symbol, name: m.name, imageUrl: imageUrl(m.image), canonicalPool: conflict ? null : poolFor(m), config: m.config, quoteMint: m.quoteMint,
      marketCapUsd: cap, priceUsd: decimalValue(m.priceUsd), volume24hUsd: volume, change24hPct: decimalValue(m.change24h, true), currency: 'USD', supplyBasis: 'undocumented', sourceTimestamp: null,
      createdAt: new Date(createdAt * 1000).toISOString(), rank: null, eligibility: reasons.some(r => r.state === 'fail') ? 'excluded' : 'unknown', reasons,
      selected: false, weightBps: null, sourceUrl: `https://embercurve.fun/t/${key}` };
  });
  // Ember's current market context and market helper both exclude `suspect` rows.
  // Retain their values/reasons for inspection but do not call them rankable markets.
  const rankable = (row: PublicMarket) => row.marketCapUsd !== null && !row.reasons.some(r => r.code === 'source_suspect');
  const tie = (a: PublicMarket, b: PublicMarket) => a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0;
  markets.sort((a, b) => !rankable(a) ? !rankable(b) ? tie(a, b) : 1 : !rankable(b) ? -1 : new Decimal(b.marketCapUsd!).cmp(a.marketCapUsd!) || tie(a, b));
  let rank = 0; for (const row of markets) if (rankable(row)) row.rank = ++rank;
  const partial = catalogue.warming || invalidRows > 0 || !registered;
  return { markets, evidenceHash: createHash('sha256').update(JSON.stringify(raw)).digest('hex'), coverage: {
    status: partial ? 'partial' : 'unverified', rawRows: catalogue.markets.length, uniqueMints: groups.size, rankedMints: rank,
    duplicateRows: catalogue.markets.length - invalidRows - groups.size, invalidRows, warming: catalogue.warming, complete: false,
    note: 'Full endpoint; duplicate mints collapsed. Ember suspect flags excluded from ranking but retained for inspection. No independent total-count or circulating-supply contract.'
  } };
}

async function fetchJson(url: string, fetcher: typeof fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('source_unavailable'); }
      if (Number(response.headers.get('content-length') ?? 0) > 12_000_000) { await response.body.cancel(); throw new Error('source_size'); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.length; if (bytes > 12_000_000) { await reader.cancel(); throw new Error('source_size'); } chunks.push(result.value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) { if (attempt === 1) throw error; await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('source_unavailable');
}
type Observation = { normalized: NormalizedCatalogue; fetchedAt: string };
export class MarketDataService {
  private lastGood: Observation | null = null;
  private lastAttempt = -Infinity;
  private pending: Promise<void> | null = null;
  private failed = false;
  readonly refreshSeconds: number;
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args), private clock = Date.now, refreshSeconds = 45) { this.refreshSeconds = Math.max(30, Math.min(60, refreshSeconds)); }
  async read(ownMint: string | null = null) {
    const now = this.clock();
    if (now - this.lastAttempt >= this.refreshSeconds * 1000) {
      this.lastAttempt = now;
      this.pending = (async () => { try {
        const [raw, configs] = await Promise.all([fetchJson(MARKET_SOURCE, this.fetcher), fetchJson(CONFIG_SOURCE, this.fetcher).catch(() => null)]);
        const fetchedAt = new Date(this.clock()).toISOString();
        this.lastGood = { normalized: normalizeCatalogue(raw, configs, ownMint, fetchedAt), fetchedAt }; this.failed = false;
      } catch { this.failed = true; } finally { this.pending = null; } })();
    }
    if (this.pending) await this.pending;
    const observed = this.lastGood;
    const status = !observed ? 'unavailable' : this.failed || this.clock() - Date.parse(observed.fetchedAt) > 180_000 ? 'stale' : observed.normalized.coverage.status === 'partial' ? 'warming' : 'ready';
    return { observed, status } as const;
  }
}
