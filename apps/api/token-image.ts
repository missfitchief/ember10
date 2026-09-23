import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { tokenImageSource } from '../../packages/shared/token-image.js';

const MAX_IMAGE_BYTES = 4_000_000;
const MAX_CACHE_BYTES = 16_000_000;
const MAX_CACHE_ENTRIES = 256;
const MAX_CONCURRENT_IMAGES = 16;
const CACHE_MS = 86_400_000;
type Image = { bytes: Buffer; type: string; etag: string; expires: number };
const error = (status: number) => Response.json({ error: status === 400 ? 'invalid_image_source' : 'image_unavailable' }, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

function imageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

// No caller-controlled host, redirects, credentials, cookies, or upstream headers.
// Failed reads are never cached; a later visit/retry can recover immediately.
export function createTokenImageHandler(fetchImage: typeof fetch = (...args) => fetch(...args)) {
  const cache = new Map<string, Image>();
  const pending = new Map<string, Promise<Image>>();
  let cacheBytes = 0;
  function forget(key: string) { const entry = cache.get(key); if (entry) cacheBytes -= entry.bytes.length; cache.delete(key); }
  async function load(source: NonNullable<ReturnType<typeof tokenImageSource>>): Promise<Image> {
    const urls = [...new Set([source.url, ...(source.cid ? [
      `https://ipfs.io/ipfs/${source.cid}`, `https://dweb.link/ipfs/${source.cid}`
    ] : [])])];
    for (const url of urls) {
      try {
        const upstream = await fetchImage(url, {
          headers: { accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif' },
          redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(6000)
        });
        if (!upstream.ok || !upstream.body || Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
          await upstream.body?.cancel(); throw new Error('Image unavailable');
        }
        const chunks: Uint8Array[] = []; let size = 0;
        for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > MAX_IMAGE_BYTES) throw new Error('Image too large');
          chunks.push(chunk);
        }
        const original = Buffer.concat(chunks);
        if (!imageType(original)) throw new Error('Unsupported image content');
        // A fixed thumbnail bounds decode work and avoids multi-megabyte mobile icons.
        // Decode/re-encode strips metadata and rejects invalid raster bodies.
        const bytes = await sharp(original, { limitInputPixels: 16_777_216, animated: false })
          .timeout({ seconds: 2 }).rotate().resize(160, 160, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84, effort: 3 }).toBuffer();
        return { bytes, type: 'image/webp', etag: `"${createHash('sha256').update(bytes).digest('hex')}"`, expires: Date.now() + CACHE_MS };
      } catch { /* Try another gateway for the exact same content ID, never another token. */ }
    }
    throw new Error('Image unavailable');
  }
  return async function tokenImage(request: Request): Promise<Response> {
    if (!['GET', 'HEAD'].includes(request.method)) return error(405);
    const params = new URL(request.url).searchParams;
    const source = tokenImageSource(params.get('source'));
    if (!source || params.getAll('source').length !== 1 ||
      [...params.keys()].some(key => !['source', 'retry', '__route'].includes(key)) ||
      (params.has('retry') && !/^[0-2]$/.test(params.get('retry')!))) return error(400);
    let image = cache.get(source.url);
    if (image && image.expires <= Date.now()) { forget(source.url); image = undefined; }
    try {
      if (!image) {
        let job = pending.get(source.url);
        if (!job) {
          if (pending.size >= MAX_CONCURRENT_IMAGES) return error(503);
          job = load(source).then(value => {
            while (cache.size && (cache.size >= MAX_CACHE_ENTRIES || cacheBytes + value.bytes.length > MAX_CACHE_BYTES)) forget(cache.keys().next().value!);
            cache.set(source.url, value); cacheBytes += value.bytes.length;
            return value;
          }).finally(() => { pending.delete(source.url); });
          pending.set(source.url, job);
        }
        image = await job;
      }
      const headers = {
        'content-type': image.type, 'content-length': String(image.bytes.length),
        'cache-control': 'public, max-age=86400, s-maxage=31536000, immutable',
        'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
        'cross-origin-resource-policy': 'same-origin', etag: image.etag
      };
      if (request.headers.get('if-none-match') === image.etag) return new Response(null, { status: 304, headers });
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(image.bytes), { headers });
    } catch { return error(502); }
  };
}

export const tokenImage = createTokenImageHandler();
