import { it, expect, vi, afterEach } from 'vitest';
import { hostedRead } from '../apps/api/hosted.js';
import archive from '../deploy/hosted-demo.json';
import entry from '../api/index.js';

const request = (path: string, options?: RequestInit) => hostedRead(new Request('https://demo.example/api/' + path, options), '');
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('does not interpret the hosting runtime context as a backend URL', async () => {
  vi.stubEnv('EMBER5_API_ORIGIN', '');
  const handler = entry.fetch as (request: Request, context: unknown) => Promise<Response>;
  const response = await handler(new Request('https://demo.example/api/status'), { waitUntil() {} });
  expect(response.status).toBe(200); expect((await response.json()).mode).toBe('demo');
});

it('serves an explicitly recorded, non-broadcasting demo with no worker', async () => {
  const status = await (await request('status')).json();
  expect(status).toMatchObject({ mode: 'demo', hostedSnapshot: true, broadcastEnabled: false, workerActive: false, paused: true });
  expect((await (await request('project')).json()).buyUrl).toBeNull();
  expect((await (await request('basket')).json()).selected).toHaveLength(5);
});
it('preserves exact recorded wallet credits and does not invent rewards for other addresses', async () => {
  for (const wallet of archive.wallets) {
    expect(await (await request(`wallets/${wallet.address}/rewards`)).json()).toEqual(wallet);
  }
  const empty = await (await request('wallets/11111111111111111111111111111111/rewards')).json();
  expect(empty.entitlements).toEqual([]); expect(empty.deliveries).toEqual([]);
  expect((await request('wallets/not-a-wallet/rewards')).status).toBe(400);
});
it('rejects writes, privileged routes and path/query escape attempts', async () => {
  expect((await request('status', { method: 'POST' })).status).toBe(405);
  for (const path of ['operator/resume', 'index?__route=../operator/pause', 'epochs?limit=1000']) {
    expect((await request(path)).status).toBeGreaterThanOrEqual(400);
  }
});
it('exports the original complete public trace and exact allocation CSV', async () => {
  const path = `epochs/${archive.epoch.epoch.id}/export`;
  const data = await (await request(path)).json();
  expect(data).toEqual(archive.epoch); expect(data.testOnly).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(/signed_payload|signedPayload|secretKey/);
  const csv = await request(path + '?format=csv');
  expect(csv.headers.get('content-type')).toBe('text/csv');
  expect((await csv.text()).split('\n')).toHaveLength(archive.epoch.entitlements.length + 1);
});
it('never falls back to demo when an explicitly configured backend fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const response = await hostedRead(new Request('https://demo.example/api/status'), 'https://ledger.example');
  expect(response.status).toBe(503); expect(await response.text()).toContain('No demo values have been substituted');
});
it('forwards only approved public reads without credentials or caller headers', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ mode: 'prelaunch' })); vi.stubGlobal('fetch', fetch);
  await hostedRead(new Request('https://demo.example/api/index?__route=status&secret=hidden', { headers: { authorization: 'Bearer private' } }), 'https://ledger.example');
  expect(fetch.mock.calls[0][0].toString()).toBe('https://ledger.example/api/status');
  expect(fetch.mock.calls[0][1].headers).toEqual({ accept: 'application/json' });
});
