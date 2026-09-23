import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { tokenImageSource, tokenImageUrl } from '../packages/shared/token-image.js';
import { createTokenImageHandler } from '../apps/api/token-image.js';
import { hostedRead } from '../apps/api/hosted.js';

const cid = 'bafybeiacpflqennfh67t6vctwx3sie43drsenrme6i75sa7jmgi2cjy77y';
const source = `https://embercurve.fun/img/${cid}`;
const request = (url = source, init?: RequestInit) => new Request(`https://pilot.example${tokenImageUrl(url)}`, init);
const png = await sharp({ create: { width: 1024, height: 512, channels: 4, background: '#ee713f' } }).png().toBuffer();
const response = () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'set-cookie': 'never=forward' } });
afterEach(() => vi.unstubAllGlobals());

it('uses a same-origin URL for approved content-addressed images', () => {
  expect(tokenImageUrl(source)).toBe(`/api/token-image?source=${encodeURIComponent(source)}`);
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
  expect(result.headers.get('cache-control')).toContain('immutable');
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
  for (const query of ['&source='+encodeURIComponent(source), '&retry=999', '&url=https://evil.test', '&retry=-1']) {
    expect((await handler(new Request(request().url+query))).status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('routes images through the hosted Vercel rewrite independently of the ledger origin', async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL) => response()); vi.stubGlobal('fetch', fetcher);
  const url = new URL(request().url); url.pathname = '/api/index'; url.searchParams.set('__route','token-image');
  const result = await hostedRead(new Request(url), 'https://ledger.example');
  expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe('image/webp');
  expect(fetcher.mock.calls[0][0]).toBe(source);
});
