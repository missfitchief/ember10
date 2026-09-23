import type { PublicMarket } from '../../packages/shared/public.js';

/** Display source-ranked observations, never infer funded or eligible membership. */
export function observedTen(markets: PublicMarket[]): PublicMarket[] {
  const seen = new Set<string>();
  return markets.filter(asset => asset.rank != null && Number.isInteger(asset.rank) && asset.rank > 0)
    .sort((a, b) => a.rank! - b.rank! || a.mint.localeCompare(b.mint))
    .filter(asset => { if (seen.has(asset.mint)) return false; seen.add(asset.mint); return true; })
    .slice(0, 10);
}
