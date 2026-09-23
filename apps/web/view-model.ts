import bs58 from 'bs58';
import Decimal from 'decimal.js';
import type { PublicMarket, PublicOverview } from '../../packages/shared/public.js';

export const routes = { overview: 'Overview', basket: 'The ten', rewards: 'Rewards', wallet: 'My rewards', transparency: 'Transparency', how: 'How it works' } as const;
export type Route = keyof typeof routes;
export const routeFromHash = (hash: string): Route => Object.hasOwn(routes, hash.slice(1)) ? hash.slice(1) as Route : 'overview';
export const short = (value: string) => value.length > 15 ? `${value.slice(0,6)}…${value.slice(-5)}` : value;
export function validPublicKey(value: string) { try { return bs58.decode(value).length === 32; } catch { return false; } }
export function safeUrl(value: string | null | undefined, hosts?: string[]) {
  if (!value) return null;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!hosts || hosts.includes(u.hostname)) ? u.href : null; } catch { return null; }
}
export const sourceUrl = (market: PublicMarket) => safeUrl(market.sourceUrl, ['embercurve.fun']);
export const logoUrl = (value: string | null) => safeUrl(value, ['embercurve.fun', 'www.embercurve.fun', 'ipfs.io', 'gateway.pinata.cloud', 'arweave.net']);
export function dateTime(value: string | number | null | undefined) {
  if (value == null) return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not reported' : `${new Intl.DateTimeFormat('en-GB', { month:'short', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC' }).format(date)} UTC`;
}
export function decimal(value: unknown): Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number' || value === '') return null;
  try { const n = new Decimal(value); return n.isFinite() ? n : null; } catch { return null; }
}
function grouped(value: string) { const [whole,fraction] = value.split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.'+fraction : ''); }
export function money(value: string | null | undefined, compact = true) {
  const n = decimal(value); if (!n || n.isNegative()) return 'Unavailable';
  if (compact) { for (const [unit, divisor] of [['T', '1000000000000'],['B', '1000000000'],['M', '1000000'],['K', '1000']]) { if (n.gte(divisor)) return `$${n.div(divisor).toFixed(1)}${unit}`; } }
  return `$${grouped(n.toFixed(n.gte(1) ? 2 : 6))}`;
}
export function change(value: string | null) { const n = decimal(value); return n ? `${n.gt(0)?'+':''}${n.toFixed(2)}%` : '—'; }
export function units(value: string | null | undefined, decimals: number | undefined) {
  if (value == null || !/^\d+$/.test(value)) return 'Unreported';
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return `${value} raw units`;
  // Decimal's default precision would round a large integer during division. Format the exact digits.
  const digits = value.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  if (decimals === 0) return grouped(digits);
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return grouped(digits.slice(0, -decimals) + (fraction ? `.${fraction}` : ''));
}
export function marketView(data: PublicOverview) {
  return {
    rows: data.markets,
    sourceLabel: data.discovery.status === 'stale' ? 'Stale observation' : data.discovery.status === 'warming' ? 'Source warming' : data.discovery.status === 'unavailable' ? 'Source unavailable' : 'Catalogue observation',
    observedLabel: data.discovery.sourceTimestamp ? `Source time ${dateTime(data.discovery.sourceTimestamp)}` : `Fetched ${dateTime(data.discovery.fetchedAt)}`,
    coverageLabel: `${data.discovery.coverage.rankedMints.toLocaleString()} ranked mints · coverage ${data.discovery.coverage.status}`,
    selectedLabel: `${data.selection.selectedCount} / ${data.selection.requiredCount} selected`,
  };
}
export const eligibilityLabel = (asset: PublicMarket) => asset.selected ? 'Selected · unfunded' : asset.eligibility === 'eligible' ? 'Eligible' : asset.eligibility === 'excluded' ? 'Excluded' : 'Not verified';

/** Counts describe different sets; inspecting a search never changes selection. */
export function marketCounts(data: PublicOverview) {
  return {
    catalogue: data.discovery.coverage.uniqueMints,
    ranked: data.discovery.coverage.rankedMints,
    matches: data.marketPage.totalMatches,
    filtered: !!data.marketPage.query || data.marketPage.view !== 'all',
  };
}

/** A missing page during a request is loading, never evidence of an outage or empty result. */
export function marketRequestState(snapshot: PublicOverview | undefined, pending: boolean, error: string) {
  if (!snapshot) return error ? 'failed' : 'loading';
  if (snapshot.discovery.status === 'unavailable') return pending ? 'loading' : 'unavailable';
  if (error || snapshot.discovery.status === 'stale') return 'stale';
  if (pending) return 'refreshing';
  if (snapshot.discovery.status === 'warming') return 'warming';
  return snapshot.markets.length ? 'ready' : 'empty';
}
export function filterMarkets(rows: PublicMarket[], query: string, selectionOnly: boolean) {
  const q = query.trim().toLowerCase();
  return rows.filter(row => (!selectionOnly || row.selected) && (!q || `${row.symbol} ${row.name} ${row.mint}`.toLowerCase().includes(q)));
}

/** Pages can only be combined when they describe the same fetched ranking and request. */
export function mergeMarketPages(previous: PublicOverview, next: PublicOverview): PublicOverview | null {
  const a = previous.discovery, b = next.discovery;
  if (!a.fetchedAt || !a.evidenceHash || a.fetchedAt !== b.fetchedAt || a.evidenceHash !== b.evidenceHash
    || previous.revision !== next.revision || previous.selection.policyVersion !== next.selection.policyVersion
    || previous.marketPage.query !== next.marketPage.query || previous.marketPage.view !== next.marketPage.view
    || previous.marketPage.totalMatches !== next.marketPage.totalMatches
    || next.marketPage.offset !== previous.marketPage.offset + previous.marketPage.returned) return null;
  const mints = new Set(previous.markets.map(asset => asset.mint));
  // An overlap can mean the catalogue moved even if its metadata was not updated. Never hide it by deduplicating.
  if (next.markets.some(asset => mints.has(asset.mint))) return null;
  return { ...next, markets: [...previous.markets, ...next.markets] };
}

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { headers: { accept:'application/json' }, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(body?.message || body?.reason || 'The service is unavailable. Please try again.');
  if (!body || typeof body !== 'object') throw Error('The service returned an unreadable response.');
  return body as T;
}
export function assertOverview(data: PublicOverview) {
  if (data.schemaVersion !== 1 || data.project?.dataMode !== 'real' || !Array.isArray(data.markets) || !data.discovery || !data.selection || !data.fundedBasket || !data.accounting) throw Error('The public data contract is unavailable. No replacement assets are shown.');
  return data;
}
