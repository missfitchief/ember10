import bs58 from 'bs58';
import { overview, projectIdentity, publicPolicy, revision } from './overview.js';
import type { PublicWalletRewards } from '../../packages/shared/public.js';
import { proxyHeaders } from './proxy.js';
import { tokenImage } from './token-image.js';

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const validAddress = (address: string) => {
  try { return address.length >= 32 && address.length <= 44 && bs58.decode(address).length === 32; }
  catch { return false; }
};
const isPublicRoute = (route: string) => /^(overview|status|project|basket|transparency|epochs)$/.test(route)
  || /^epochs\/[a-zA-Z0-9_:.-]{1,200}(\/export)?$/.test(route)
  || /^wallets\/[1-9A-HJ-NP-Za-km-z]{32,44}\/rewards$/.test(route);

async function backendRead(route: string, params: URLSearchParams, origin: string, request: Request, signal: AbortSignal) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Backend must be an HTTPS origin without credentials');
  }
  const url = new URL('/api/' + route, base);
  for (const name of ['limit', 'cursor', 'format', 'q', 'offset', 'view']) {
    const value = params.get(name); if (value !== null) url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    headers: { accept: params.get('format') === 'csv' ? 'text/csv' : 'application/json', ...proxyHeaders(request, url) },
    redirect: 'error', signal
  });
  if (!response.body) throw new Error('Missing backend response');
  const chunks: Uint8Array[] = []; let length = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    length += chunk.byteLength; if (length > 4000000) throw new Error('Backend response too large');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  return new Response(body, { status: response.status, headers: {
    ...headers, 'content-type': response.headers.get('content-type') ?? 'application/json',
    ...(route.endsWith('/export') && params.get('format')==='csv' ? {'content-disposition':'attachment; filename="epoch-allocations.csv"'} : {})
  } });
}

export async function hostedRead(request: Request, backendOrigin = process.env.EMBER5_API_ORIGIN): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'read_only', message: 'This host cannot start financial operations.' }, 405);
  const url = new URL(request.url);
  const route = url.searchParams.get('__route') ?? url.pathname.replace(/^\/api\//, '');
  if (route === 'token-image') return tokenImage(request);
  if (route.startsWith('wallets/') && !validAddress(route.split('/')[1] ?? '')) return json({ error: 'invalid_request', message: 'Check the address and request parameters.' }, 400);
  if (!isPublicRoute(route)) return json({ error: 'not_found' }, 404);
  const limit = url.searchParams.get('limit') ?? '20';
  if (!/^[0-9]+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || (url.searchParams.get('cursor')?.length ?? 0) > 200) return json({ error: 'invalid_request' }, 400);
  if (route === 'overview') {
    const offset = url.searchParams.get('offset') ?? '0', query = url.searchParams.get('q') ?? '';
    const view = url.searchParams.get('view') ?? 'all';
    if (!/^[0-9]{1,6}$/.test(offset) || query.length > 100 || !['all', 'selection', 'excluded'].includes(view)) return json({ error: 'invalid_request', message: query.length > 100 ? 'Search must contain at most 100 characters.' : 'Check the requested market page and view.' }, 400);
    if (!backendOrigin) return json(await overview(undefined, { query, offset: Number(offset), limit: Number(url.searchParams.get('limit') ?? '100'), view: view as 'all' | 'selection' | 'excluded' }));
  }
  if (backendOrigin) {
    try {
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(25000)]);
      const state = await backendRead('status', new URLSearchParams(), backendOrigin, request,signal);
      const status = await state.json();
      if (!state.ok || !['prelaunch', 'live'].includes(status.mode) || status.hostedSnapshot || status.testOnly) throw new Error('Non-production ledger');
      if (route === 'status') return json({ ...status, hostedRevision: revision() });
      const response = await backendRead(route, url.searchParams, backendOrigin, request,signal);
      if (route === 'overview') {
        const value = await response.json();
        if (!response.ok || value.schemaVersion !== 1 || value.project?.dataMode !== 'real' || value.project?.name !== 'EMBER10' || !Array.isArray(value.markets) || value.testOnly || value.hostedSnapshot) throw new Error('Invalid production overview');
        return json({ ...value, hostedRevision: revision() });
      }
      return response;
    } catch { return json({ error: 'service_unavailable', message: 'The configured reward API is unavailable or not a production ledger. No demo values have been substituted.' }, 503); }
  }
  if (route === 'status') return json({ mode: 'prelaunch', phase: 'prelaunch', dataMode: 'real', hostedSnapshot: false, broadcastEnabled: false, workerActive: false, paused: true, revision: revision(), waitingReason: 'Contract not deployed; settlement not configured.' });
  if (route === 'project') return json({ ...projectIdentity(), policy: publicPolicy, pool: null, treasury: null, operations: null });
  if (route === 'basket') { const value = await overview(); return json({ ...value.selection, selected: [], universe: value.markets, universePage: value.marketPage, universeComplete: value.discovery.status === 'ready' && value.discovery.fetchedAt !== null && !value.marketPage.hasMore, ready: false, discovery: value.discovery, fundedBasket: value.fundedBasket }); }
  if (route === 'transparency') return json({ status: 'unavailable', receivedLamports: null, assets: [], accrued: [], finalizedPayoutTransactions: null, burns: [], balances: [], reconciliation: null, incidents: [], accountingHealth: 'unavailable', message: 'No verified project ledger is connected.' });
  if (route === 'epochs') return json({ status: 'unavailable', items: [], nextCursor: null, message: 'No verified project ledger is connected.' });
  if (route.startsWith('wallets/')) {
    const wallet: PublicWalletRewards = { address: route.split('/')[1], status: 'unavailable', eligibility: null, entitlements: [], deliveries: [], reason: 'No verified project holder snapshot or rewards ledger is connected. This does not mean that the address has zero rewards.' };
    return json(wallet);
  }
  return json({ error: 'not_found' }, 404);
}
