import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Store } from '../../packages/db/store.js';

const address = (value: string | undefined) => value && isIP(value) ? value.toLowerCase() : null;
const payload = (ip: string, at: string, method: string, path: string) => [ip, at, method, path].join('\n');
/** Only the Vercel runtime's overwritten header is accepted at the public edge. */
export function proxyHeaders(request: Request, target: URL, secret = process.env.EMBER10_PROXY_SECRET, platform = process.env.VERCEL): Record<string,string> {
  const ip = platform === '1' ? address(request.headers.get('x-vercel-forwarded-for') ?? undefined) : null;
  if (!secret || secret.length < 32 || !ip) return {};
  const at = String(Date.now());
  return { 'x-ember-client': ip, 'x-ember-time': at, 'x-ember-auth': createHmac('sha256', secret).update(payload(ip, at, 'GET', target.pathname + target.search)).digest('hex') };
}
export function clientKey(peer: string, headers: Record<string, string | string[] | undefined>, method: string, path: string, secret?: string, now = Date.now()) {
  const single = (name: string) => typeof headers[name] === 'string' ? headers[name] as string : undefined;
  const ip = address(single('x-ember-client')), at = single('x-ember-time'), signature = single('x-ember-auth');
  let identity = 'peer:' + peer;
  if (secret && ip && at && /^\d{13}$/.test(at) && Math.abs(now - Number(at)) <= 30000 && signature && /^[a-f0-9]{64}$/.test(signature) && path.startsWith('/api/') && method === 'GET') {
    const expected = createHmac('sha256', secret).update(payload(ip, at, method, path)).digest();
    if (timingSafeEqual(expected, Buffer.from(signature, 'hex'))) identity = 'client:' + ip;
  }
  return createHash('sha256').update(identity).digest('hex');
}
/** Shared database bucket: survives process restarts and multiple backend replicas. */
export async function takeRateLimit(db: Store, key: string, now = Date.now(), limit = 120) {
  const bucket = Math.floor(now / 60000);
  const result = await db.pool.query(`INSERT INTO api_rate_limits(client_key,minute,hits) VALUES($1,$2,1)
    ON CONFLICT(client_key) DO UPDATE SET minute=excluded.minute,hits=CASE WHEN api_rate_limits.minute=excluded.minute THEN api_rate_limits.hits+1 ELSE 1 END RETURNING hits`, [key, bucket]);
  // Cleanup is indexed and bounded by retention, without an unbounded in-process map.
  if (Number(result.rows[0].hits) === 1) await db.pool.query('DELETE FROM api_rate_limits WHERE minute<$1', [bucket - 2]);
  return Number(result.rows[0].hits) <= limit;
}
