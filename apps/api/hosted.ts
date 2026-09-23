import bs58 from 'bs58';
import archive from '../../deploy/hosted-demo.json' with { type: 'json' };

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const validAddress = (address: string) => {
  try { return address.length >= 32 && address.length <= 44 && bs58.decode(address).length === 32; }
  catch { return false; }
};
const isPublicRoute = (route: string) => /^(status|project|basket|transparency|epochs)$/.test(route)
  || /^epochs\/[a-zA-Z0-9_:.-]{1,200}(\/export)?$/.test(route)
  || /^wallets\/[1-9A-HJ-NP-Za-km-z]{32,44}\/rewards$/.test(route);

async function backendRead(route: string, params: URLSearchParams, origin: string) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Backend must be an HTTPS origin without credentials');
  }
  const url = new URL('/api/' + route, base);
  for (const name of ['limit', 'cursor', 'format']) {
    const value = params.get(name); if (value !== null) url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    headers: { accept: params.get('format') === 'csv' ? 'text/csv' : 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (!response.body) throw new Error('Missing backend response');
  const chunks: Uint8Array[] = []; let length = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    length += chunk.byteLength; if (length > 4000000) throw new Error('Backend response too large');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  return new Response(body, { status: response.status, headers: {
    ...headers, 'content-type': response.headers.get('content-type') ?? 'application/json'
  } });
}

function wallet(address: string) {
  return archive.wallets.find(wallet => wallet.address === address) ?? {
    address, eligibility: null, snapshotSlot: archive.epoch.snapshot.slot,
    entitlements: [], deliveries: [], reason: 'Address did not hold project tokens at the recorded demo snapshot'
  };
}

export async function hostedRead(request: Request, backendOrigin = process.env.EMBER5_API_ORIGIN): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'read_only', message: 'This host cannot start financial operations.' }, 405);
  const url = new URL(request.url);
  const route = url.searchParams.get('__route') ?? url.pathname.replace(/^\/api\//, '');
  if (route.startsWith('wallets/') && !validAddress(route.split('/')[1] ?? '')) return json({ error: 'invalid_request', message: 'Check the address and request parameters.' }, 400);
  if (!isPublicRoute(route)) return json({ error: 'not_found' }, 404);
  const limit = url.searchParams.get('limit') ?? '20';
  if (!/^[0-9]+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || (url.searchParams.get('cursor')?.length ?? 0) > 200) return json({ error: 'invalid_request' }, 400);
  if (backendOrigin) {
    try { return await backendRead(route, url.searchParams, backendOrigin); }
    catch { return json({ error: 'service_unavailable', message: 'The configured reward API is unavailable. No demo values have been substituted.' }, 503); }
  }
  if (archive.status.mode !== 'demo' || archive.status.broadcastEnabled || !archive.epoch.testOnly) return json({ error: 'invalid_demo_archive' }, 503);
  if (route === 'status') return json({ ...archive.status, asOf: archive.capturedAt });
  if (route === 'project') return json(archive.project);
  if (route === 'basket') return json({ ...archive.basket, historicalDemo: true, stale: false });
  if (route === 'transparency') return json(archive.transparency);
  if (route === 'epochs') return json({ items: archive.epochs.items.filter(e => !url.searchParams.get('cursor') || e.id < url.searchParams.get('cursor')!).slice(0, Number(limit)), nextCursor: null });
  if (route.startsWith('wallets/')) return json(wallet(route.split('/')[1]));
  if (route === `epochs/${archive.epoch.epoch.id}` || route === `epochs/${archive.epoch.epoch.id}/export`) {
    if (url.searchParams.get('format') === 'csv') {
      const keys = ['asset', 'owner', 'amount', 'paid', 'unpaid'] as const;
      const cell = (value: string) => '"' + value.replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
      const text = [keys.join(','), ...archive.epoch.entitlements.map(row => keys.map(key => cell(row[key])).join(','))].join('\n');
      return new Response(text, { headers: { ...headers, 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="demo-allocations.csv"' } });
    }
    return json(archive.epoch);
  }
  return json({ error: 'not_found' }, 404);
}
