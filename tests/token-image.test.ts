import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { tokenImageSource, tokenImageUrl } from '../packages/shared/token-image.js';
import { createTokenImageHandler as createHandler } from '../apps/api/token-image.js';
import { createCatalogueImageAuthorizer } from '../apps/api/catalogue.js';
import { MarketDataService } from '../packages/integrations/market-data.js';
import { testAddress } from '../packages/integrations/demo.js';
import { hostedRead } from '../apps/api/hosted.js';

const cid = 'bafybeiacpflqennfh67t6vctwx3sie43drsenrme6i75sa7jmgi2cjy77y';
const source = `https://embercurve.fun/img/${cid}`;
const request = (url = source, init?: RequestInit) => new Request(`https://pilot.example${tokenImageUrl(url)}`, init);
const png = await sharp({ create: { width: 1024, height: 512, channels: 4, background: '#ee713f' } }).png().toBuffer();
const response = () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'set-cookie': 'never=forward' } });
// Decoder/cache unit tests authorize only this fixture; catalogue tests below use
// the real normalized discovery and membership authorizer.
const createTokenImageHandler = (fetcher: typeof fetch) => createHandler(fetcher, async requested => requested.cid === cid ? tokenImageSource(source) : null);
const config = testAddress('image-config');
const registry = { count: 1, updatedAt: 1, configs: [{ config }] };
const logo = (n: number) => n === 0 ? source : `https://embercurve.fun/img/b${'abcdefghijklmnopqrstuvwxyz234567'[n % 32].repeat(52)}`;
const market = (n: number, extra = {}) => ({ mint: testAddress('logo-mint-'+n), pool: testAddress('logo-pool-'+n), config, quoteMint: testAddress('quote'), symbol: 'LOGO'+n, name: 'Logo '+n, image: logo(n), createdAt: 1, graduated: true, marketCapUsd: 1000-n, ...extra });
const catalogue = (markets: unknown[], warming = false) => ({ markets, warming, economics: {}, totals: {} });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('uses a same-origin URL for approved content-addressed images', () => {
  expect(tokenImageUrl(source)).toBe(`/api/token-image?source=${encodeURIComponent(source)}&v=3`);
  expect(tokenImageSource(source.replace('embercurve.fun', 'www.embercurve.fun'))?.url).toBe(source);
  expect(tokenImageSource(`https://ipfs.io/ipfs/${cid}`)?.cid).toBe(cid);
  expect(tokenImageSource(`https://gateway.pinata.cloud/ipfs/${cid}`)?.cid).toBe(cid);
  expect(tokenImageSource(`https://arweave.net/${'a'.repeat(43)}`)?.cid).toBeNull();
});

it('rejects arbitrary hosts, private addresses, credentials, ports and non-image paths before fetching', async () => {
  const fetcher = vi.fn(), handler = createTokenImageHandler(fetcher);
  for (const url of [null, '', 'javascript:alert(1)', 'http://embercurve.fun/img/'+cid,
    'https://127.0.0.1/img/'+cid, 'https://embercurve.fun.evil.test/img/'+cid,
    'https://user:pass@embercurve.fun/img/'+cid, 'https://embercurve.fun:8443/img/'+cid,
    source+'?url=http://127.0.0.1', source+'#fragment', source+'/../admin',
    'https://embercurve.fun/api/status', 'https://embercurve.fun/img/%2e%2e%2fadmin',
    `https://ipfs.io/ipns/${cid}`]) {
    expect(tokenImageUrl(url)).toBeNull();
    const result = await handler(new Request('https://pilot.example/api/token-image?source='+encodeURIComponent(url ?? '')));
    expect(result.status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('decodes and resizes real raster bytes, strips upstream headers and caches successful thumbnails', async () => {
  const fetcher = vi.fn(async () => response()), handler = createTokenImageHandler(fetcher);
  const result = await handler(request()), bytes = Buffer.from(await result.arrayBuffer());
  expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe('image/webp');
  expect(result.headers.get('set-cookie')).toBeNull(); expect(result.headers.get('x-content-type-options')).toBe('nosniff');
  expect(result.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=60');
  expect(await sharp(bytes).metadata()).toMatchObject({ width: 160, height: 80, format: 'webp' });
  expect(bytes.length).toBeLessThan(png.length);
  const options = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(options[0]).toBe(source); expect(options[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
  expect(options[1].headers).not.toHaveProperty('authorization');
  expect(await (await handler(request())).arrayBuffer()).toEqual(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.length));
  const head = await handler(request(source, { method: 'HEAD' })); expect(await head.text()).toBe(''); expect(head.headers.get('content-length')).toBe(String(bytes.length));
  const cached = await handler(request(source, { headers: { 'if-none-match': result.headers.get('etag')! } }));
  expect(cached.status).toBe(304); expect(await cached.text()).toBe(''); expect(fetcher).toHaveBeenCalledTimes(1);
});

it('coalesces concurrent copies of the same logo', async () => {
  const fetcher = vi.fn(async () => response()), handler = createTokenImageHandler(fetcher);
  const results = await Promise.all(Array.from({ length: 20 }, () => handler(request())));
  expect(results.every(r => r.ok)).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
});

it('uses alternate gateways only for the same CID, never a different token', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValueOnce(response());
  expect((await createTokenImageHandler(fetcher)(request())).status).toBe(200);
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([source, `https://ipfs.io/ipfs/${cid}`]);
});

it.each(['html', 'svg', 'fake-png', 'redirect', 'oversized-header', 'oversized-stream'])('rejects %s without caching errors', async kind => {
  let available = false;
  const fetcher = vi.fn(async () => {
    if (available) return response();
    if (kind === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } });
    if (kind === 'oversized-header') return new Response(new Uint8Array(png), { headers: { 'content-length': '4000001' } });
    if (kind === 'oversized-stream') return new Response(new Uint8Array(4_000_001));
    const body = kind === 'fake-png' ? new Uint8Array([137,80,78,71,13,10,26,10]) : kind === 'svg' ? '<svg onload="alert(1)"/>' : '<html>error</html>';
    return new Response(body, { headers: { 'content-type': 'image/png' } });
  });
  const handler = createTokenImageHandler(fetcher), failed = await handler(request());
  expect(failed.status).toBe(502); expect(failed.headers.get('cache-control')).toBe('no-store');
  available = true; expect((await handler(request())).status).toBe(200);
});

it('rejects writes and malformed query parameters', async () => {
  const fetcher = vi.fn(), handler = createTokenImageHandler(fetcher);
  expect((await handler(request(source, { method: 'POST' }))).status).toBe(405);
  for (const query of ['&source='+encodeURIComponent(source), '&retry=999', '&retry=-1']) {
    expect((await handler(new Request(request().url+query))).status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('routes images through the hosted Vercel rewrite independently of the ledger origin', async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/markets') ? Response.json(catalogue([market(0)])) : String(url).endsWith('/configs') ? Response.json(registry) : response()); vi.stubGlobal('fetch', fetcher);
  const url = new URL(request().url); url.pathname = '/api/index'; url.searchParams.set('__route','token-image');
  url.searchParams.set('route','token-image'); url.searchParams.set('url','https://evil.test');
  const result = await hostedRead(new Request(url), 'https://ledger.example');
  expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe('image/webp');
  expect(fetcher.mock.calls.map(call => call[0])).toContain(source);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('bootstraps ten distinct logos on a cold instance from one full catalogue read', async () => {
  const fetchCatalogue = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith('/configs') ? registry : catalogue(Array.from({ length: 10 }, (_, n) => market(n)))));
  const service = new MarketDataService(fetchCatalogue), fetchImage = vi.fn(async () => response());
  const handler = createHandler(fetchImage, createCatalogueImageAuthorizer(service));
  const results = await Promise.all(Array.from({ length: 10 }, (_, n) => handler(request(logo(n)))));
  expect(results.every(result => result.status === 200)).toBe(true);
  expect(fetchCatalogue).toHaveBeenCalledTimes(2); expect(fetchImage).toHaveBeenCalledTimes(10);
});

it('rejects arbitrary valid CIDs before image slots and still serves a catalogue logo', async () => {
  const fetchCatalogue = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith('/configs') ? registry : catalogue([market(0)])));
  const service = new MarketDataService(fetchCatalogue), fetchImage = vi.fn(async () => response());
  const handler = createHandler(fetchImage, createCatalogueImageAuthorizer(service));
  const results = await Promise.all(Array.from({ length: 24 }, (_, n) => handler(request(logo(n+1)))));
  expect(results.every(result => result.status === 404 && result.headers.get('cache-control') === 'no-store')).toBe(true);
  expect(fetchImage).not.toHaveBeenCalled(); expect(fetchCatalogue).toHaveBeenCalledTimes(2);
  expect((await handler(request())).status).toBe(200); expect(fetchImage).toHaveBeenCalledTimes(1);
});

it('authorizes the same listed CID through approved aliases and fetches only its catalogue URL', async () => {
  const service = new MarketDataService(async url => Response.json(String(url).endsWith('/configs') ? registry : catalogue([market(0)])));
  const fetchImage = vi.fn().mockRejectedValueOnce(Error('source unavailable')).mockResolvedValueOnce(response());
  const handler = createHandler(fetchImage, createCatalogueImageAuthorizer(service));
  expect((await handler(request(`https://gateway.pinata.cloud/ipfs/${cid}`))).status).toBe(200);
  expect((await handler(request(`https://ipfs.io/ipfs/${cid}`))).status).toBe(200);
  expect(fetchImage.mock.calls.map(call => call[0])).toEqual([source, `https://ipfs.io/ipfs/${cid}`]);
});

it('keeps logos from the full excluded and warming catalogue, including rows beyond the first page', async () => {
  const rows = Array.from({ length: 102 }, (_, n) => market(n, { image: n === 101 ? source : undefined, suspect: n === 101 }));
  const service = new MarketDataService(async url => Response.json(String(url).endsWith('/configs') ? {} : catalogue(rows, true)));
  const handler = createHandler(async () => response(), createCatalogueImageAuthorizer(service));
  expect((await handler(request())).status).toBe(200);
  const data = await service.read(); expect(data.status).toBe('warming');
  expect(data.observed?.normalized.markets.find(row => row.imageUrl === source)).toMatchObject({ rank: null, eligibility: 'excluded' });
});

it('serves warm last-good logos without awaiting a stalled refresh, and preserves them after failed refresh', async () => {
  let now = Date.now(), fail = false, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new MarketDataService(async url => {
    if (fail) { await gate; throw Error('offline'); }
    return Response.json(String(url).endsWith('/configs') ? registry : catalogue([market(0)]));
  }, () => now);
  await service.read(); const original = service.snapshot();
  const handler = createHandler(async () => response(), createCatalogueImageAuthorizer(service));
  now += 181_000; fail = true; vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await handler(request())).status).toBe(200);
  release(); expect((await service.read()).status).toBe('stale');
  expect(service.snapshot()).toBe(original); expect((await handler(request())).status).toBe(200);
});

it('rechecks catalogue membership before cached bytes, HEAD and an ETag 304', async () => {
  let now = Date.now(), rows = [market(0)];
  const service = new MarketDataService(async url => Response.json(String(url).endsWith('/configs') ? registry : catalogue(rows)), () => now);
  const fetchImage = vi.fn(async () => response()), handler = createHandler(fetchImage, createCatalogueImageAuthorizer(service));
  const first = await handler(request()), etag = first.headers.get('etag')!; expect(first.status).toBe(200);
  rows = []; now += 46_000; await service.read();
  for (const init of [{}, { method: 'HEAD' }, { headers: { 'if-none-match': etag } }]) {
    const denied = await handler(request(source, init)); expect(denied.status).toBe(404); expect(denied.headers.get('cache-control')).toBe('no-store');
  }
  expect(fetchImage).toHaveBeenCalledTimes(1);
});

it('fails closed during a cold catalogue outage and recovers when a later read succeeds', async () => {
  let now = Date.now(), offline = true; vi.spyOn(console, 'error').mockImplementation(() => {});
  const service = new MarketDataService(async url => { if (offline) throw Error('offline'); return Response.json(String(url).endsWith('/configs') ? registry : catalogue([market(0)])); }, () => now);
  const fetchImage = vi.fn(async () => response()), handler = createHandler(fetchImage, createCatalogueImageAuthorizer(service));
  const failed = await handler(request()); expect(failed.status).toBe(503); expect(failed.headers.get('cache-control')).toBe('no-store'); expect(fetchImage).not.toHaveBeenCalled();
  offline = false; now += 91_000;
  expect((await handler(request())).status).toBe(200); expect(fetchImage).toHaveBeenCalledTimes(1);
});

it('bounds cold authorization and gateway reads with one request deadline', async () => {
  vi.useFakeTimers();
  const fetchImage = vi.fn(() => new Promise<Response>(() => {}));
  const handler = createHandler(fetchImage, async () => { await new Promise(resolve => setTimeout(resolve, 17_000)); return tokenImageSource(source); });
  const result = handler(request());
  await vi.advanceTimersByTimeAsync(25_000);
  const failed = await result; expect(failed.status).toBe(503); expect(failed.headers.get('cache-control')).toBe('no-store');
  expect(fetchImage).toHaveBeenCalledTimes(2);
  for (const [, options] of fetchImage.mock.calls as unknown as [unknown, RequestInit][]) expect(options.signal?.aborted).toBe(true);
});

it('does not let one aborted caller cancel another caller sharing the same image job', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const fetchImage = vi.fn(async () => { await gate; return response(); });
  const handler = createTokenImageHandler(fetchImage), controller = new AbortController();
  const first = handler(request(source, { signal: controller.signal })), second = handler(request());
  await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(1));
  controller.abort(); expect((await first).status).toBe(503);
  const options = (fetchImage.mock.calls[0] as unknown as [string, RequestInit])[1]; expect(options.signal?.aborted).toBe(false);
  release(); expect((await second).status).toBe(200); expect(fetchImage).toHaveBeenCalledTimes(1);
});
