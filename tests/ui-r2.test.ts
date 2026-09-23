import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, filterMarkets } from '../apps/web/view-model.js';
import { overview } from '../apps/api/overview.js';
import type { MarketDataService } from '../packages/integrations/market-data.js';
import type { PublicMarket } from '../packages/shared/public.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Round two public regressions', () => {
  it('keeps multi-field search results identical to the authoritative server projection', async () => {
    const markets = [
      { mint: 'mint-one', name: 'Alpha asset', symbol: 'FIRST', selected: false },
      { mint: 'mint-two', name: 'Alpha asset', symbol: 'SECOND', selected: true },
    ] as PublicMarket[];
    const source = { refreshSeconds: 45, read: async () => ({ status: 'ready', observed: { fetchedAt: '2026-09-23T12:00:00Z', normalized: { markets, evidenceHash: 'fixture', coverage: {} } } }) } as unknown as MarketDataService;
    for (const query of ['asset FIRST', 'mint-two Alpha', ' ASSET second ', 'FIRST Alpha', 'not found']) {
      for (const selectionOnly of [false, true]) {
        const result = await overview(source, { query, view: selectionOnly ? 'selection' : 'all' });
        expect(filterMarkets(markets, query, selectionOnly).map(row => row.mint)).toEqual(result.markets.map(row => row.mint));
        expect(filterMarkets(result.markets, query, selectionOnly)).toHaveLength(result.marketPage.totalMatches);
      }
    }
  });

  it('allows a cold catalogue retry to finish after the former 15 second cutoff', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      requestSignal = init.signal;
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      // Upstream cold path: 8s attempt + 1s backoff + 8s successful retry.
      setTimeout(() => resolve(new Response(JSON.stringify({ status: 'ready' }))), 17_000);
    })));
    const response = api<{ status: string }>('overview');
    await vi.advanceTimersByTimeAsync(15_001);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_999);
    await expect(response).resolves.toEqual({ status: 'ready' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds stalled requests, aborts their work and clears timers after caller cancellation', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      signals.push(init.signal);
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const stalled = expect(api('epochs')).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(30_000);
    await stalled;
    expect(signals[0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const controller = new AbortController();
    const cancelled = expect(api('status', controller.signal)).rejects.toThrow('Aborted');
    controller.abort();
    await cancelled;
    expect(signals[1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
