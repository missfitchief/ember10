import { MarketDataService, validMint } from '../../packages/integrations/market-data.js';
import { tokenImageSource, type TokenImageSource } from '../../packages/shared/token-image.js';

// Shared within an API instance. An image request can also bootstrap a cold instance
// when the browser's overview was served by another serverless instance.
export const publicMarketSource = new MarketDataService();
export type ImageAuthorizer = (source: TokenImageSource) => Promise<TokenImageSource | null>;
const identity = (source: TokenImageSource) => source.cid ? `ipfs:${source.cid}` : source.url;

export function createCatalogueImageAuthorizer(service = publicMarketSource): ImageAuthorizer {
  let indexed: ReturnType<MarketDataService['snapshot']> = null;
  let sources = new Map<string, TokenImageSource>();
  function lookup(observation: ReturnType<MarketDataService['snapshot']>, requested: TokenImageSource) {
    if (!observation) throw Error('Catalogue unavailable');
    if (indexed !== observation) {
      const next = new Map<string, TokenImageSource>();
      // All normalized markets qualify for logo display, regardless of rank,
      // eligibility, warming coverage, pagination or financial selection.
      for (const row of observation.normalized.markets) {
        const source = tokenImageSource(row.imageUrl);
        if (source) next.set(identity(source), source);
      }
      sources = next; indexed = observation;
    }
    return sources.get(identity(requested)) ?? null;
  }
  return async requested => {
    const configured = process.env.OUR_MINT;
    const ownMint = configured && validMint(configured) ? configured : null;
    const snapshot = service.snapshot();
    if (snapshot) {
      const allowed = lookup(snapshot, requested);
      if (allowed) {
        // Last-good logos do not wait behind a slow or failed refresh. The service
        // coalesces this normal TTL-controlled refresh; callers cannot force one.
        void service.read(ownMint).catch(() => {});
        return allowed;
      }
    }
    // Cold bootstrap and a newly published source both need current discovery.
    // Concurrent calls share the service's pending read/backoff, not image slots.
    return lookup((await service.read(ownMint)).observed, requested);
  };
}

export const authorizeCatalogueImage = createCatalogueImageAuthorizer();
