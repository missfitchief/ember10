/** Browser regression suite. Run against dev:web with only intercepted fixture APIs:
 * PLAYWRIGHT_MODULE=<installed playwright entry> node --import tsx tests/ui-r2.browser.mjs
 * BASE_URL and EVIDENCE_DIR are optional. No fixture is bundled into the application.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { overview } from '../apps/api/overview.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5192';
const markets = Array.from({ length: 250 }, (_, i) => ({
  mint: `fixture-mint-${String(i).padStart(4, '0')}`, name: `Alpha asset ${i}`, symbol: `TEST${i}`,
  imageUrl: null, canonicalPool: null, config: null, quoteMint: null, marketCapUsd: String(250000 - i),
  priceUsd: null, volume24hUsd: null, change24hPct: null, currency: 'USD', supplyBasis: 'undocumented',
  sourceTimestamp: null, createdAt: null, rank: i + 1, eligibility: 'unknown', reasons: [], selected: i < 10,
  weightBps: null, sourceUrl: 'https://embercurve.fun/markets',
}));
let poll = 0, searches = 0, selections = 0, stalledStatus = false, sourceStatus = 'ready';
const source = { refreshSeconds: 45, read: async () => ({ status: sourceStatus, observed: {
  fetchedAt: new Date(Date.UTC(2026, 8, 23, 12, poll)).toISOString(), normalized: {
    markets, evidenceHash: `fixture-${poll}`, coverage: { status: 'unverified', rawRows: 250, uniqueMints: 250, rankedMints: 250, duplicateRows: 0, invalidRows: 0, warming: false, complete: true, note: 'Browser test fixture' },
  },
} }) };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/overview') {
    const query = url.searchParams.get('q') ?? '';
    const view = url.searchParams.get('view') ?? 'all';
    if (!url.search) poll++;
    if (query) searches++;
    if (view === 'selection') selections++;
    const result = await overview(source, { query, view, offset: Number(url.searchParams.get('offset') ?? 0), limit: 100 });
    await route.fulfill({ json: result });
  } else if (url.pathname === '/api/transparency') {
    await route.fulfill({ json: { status: 'available', receivedLamports: '1000000000', finalizedPayoutTransactions: '0', assets: [], accrued: [], balances: [], accountingHealth: 'not_checked' } });
  } else if (url.pathname === '/api/epochs') {
    await route.fulfill({ json: { status: 'available', items: [{ id: 'browser-fixture-round', status: 'planned' }], nextCursor: null } });
  } else if (url.pathname === '/api/status') {
    if (stalledStatus) return;
    await route.fulfill({ json: { cluster: 'devnet', nextEvaluation: null } });
  } else await route.fulfill({ status: 404, json: { message: 'Unexpected fixture path' } });
});
const waitFor = async (condition, label) => {
  for (let i = 0; i < 100; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw Error(`Timed out: ${label}`);
};
const rowCount = () => page.locator('.market-table tbody tr').count();
try {
  await page.clock.install();
  await page.goto(base + '/#basket');
  await waitFor(async () => await rowCount() === 20, 'initial market list');
  for (const expected of [50, 80, 100, 140]) {
    await page.getByRole('button', { name: 'Show more markets' }).click();
    await waitFor(async () => await rowCount() === expected, `${expected} default rows`);
  }
  const defaultPoll = poll;
  await page.clock.fastForward(45_000);
  await waitFor(() => poll > defaultPoll, 'default parent poll');
  await waitFor(() => page.getByRole('button', { name: 'Refresh list' }).isVisible(), 'default retention notice');
  assert.equal(await rowCount(), 140, 'default expansion survives parent poll');
  await page.getByRole('button', { name: 'Refresh list' }).click();
  await waitFor(async () => await rowCount() === 20, 'explicit default refresh');
  await page.getByPlaceholder('Find a token or mint').fill('a');
  await page.clock.fastForward(350);
  await waitFor(() => searches === 1, 'search response');
  for (const expected of [50, 80, 100, 140]) {
    await page.getByRole('button', { name: 'Show more markets' }).click();
    await waitFor(async () => await rowCount() === expected, `${expected} search rows`);
  }
  const beforeSearches = searches, beforePoll = poll;
  await page.clock.fastForward(45_000);
  await waitFor(() => poll > beforePoll, 'parent poll');
  await waitFor(() => page.getByRole('button', { name: 'Refresh list' }).isVisible(), 'retained-page notice');
  assert.equal(await rowCount(), 140, 'searched expansion survives parent poll');
  assert.equal(searches, beforeSearches, 'parent poll does not refetch search offset zero');
  const originalTime = await page.locator('.source-time').innerText();
  for (const health of ['stale', 'unavailable']) {
    const beforeHealthPoll = poll;
    sourceStatus = health;
    await page.clock.fastForward(45_000);
    await waitFor(() => poll > beforeHealthPoll, 'source health poll');
    await waitFor(() => page.getByText(/^Stale observation\. Last successful fetch:/).isVisible(), 'retained source failure warning');
    assert.equal(await rowCount(), 140, 'outage retains expanded rows');
    assert.equal(await page.locator('.source-time').innerText(), originalTime, 'outage retains original provenance');
  }
  sourceStatus = 'ready';
  await page.clock.fastForward(45_000);
  await page.getByRole('button', { name: 'Refresh list' }).click();
  await waitFor(async () => await rowCount() === 20, 'explicit refresh resets search');
  await page.getByPlaceholder('Find a token or mint').fill('0 TEST0');
  await page.clock.fastForward(350);
  await waitFor(async () => await rowCount() === 1, 'cross-field multiword match');
  assert.match(await page.locator('.market-counts').innerText(), /1 search matches/);
  await page.getByPlaceholder('Find a token or mint').fill('');
  await page.getByRole('tab', { name: /Eligibility/ }).click();
  await page.clock.fastForward(350);
  await waitFor(async () => await rowCount() === 10, 'eligibility result');
  const beforeSelection = selections;
  await page.clock.fastForward(45_000);
  await waitFor(() => page.getByRole('button', { name: 'Refresh list' }).isVisible(), 'filtered retention notice');
  assert.equal(await rowCount(), 10);
  assert.equal(selections, beforeSelection, 'parent poll preserves eligibility request');

  stalledStatus = true;
  await page.goto(base + '/#rewards');
  await waitFor(() => page.getByText('browser-fixture-round', { exact: true }).isVisible(), 'round history while status stalls');
  await waitFor(async () => (await page.locator('.reward-stats').innerText()).includes('1 SOL'), 'available ledger while status stalls');
  await page.clock.fastForward(28_100);
  await waitFor(async () => (await page.locator('.reward-stats').innerText()).includes('Unreported'), 'stalled status is bounded');
  await page.setViewportSize({ width: 320, height: 780 });
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  const controlled = await menu.getAttribute('aria-controls');
  assert.equal(await page.locator(`#${controlled}`).count(), 1);
  assert.equal(await page.locator(`#${controlled}`).isVisible(), false);
  await menu.click();
  assert.equal(await page.locator(`#${controlled}`).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(`#${controlled}`).isVisible(), false);
  assert.equal(await menu.evaluate(node => node === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const evidence = { passed: true, assertions: ['140 default rows survive parent poll', '140 searched rows survive parent poll without offset-zero refetch', 'Retained searches show stale and unavailable source health without changing provenance', 'Explicit refresh resets searched list to 20 rows', 'Server/client multiword results agree', 'Eligibility view retained across parent poll', 'Ledger and epochs render while status stalls', 'Stalled status reaches bounded unavailable state', 'Mobile navigation target exists when closed; Escape returns focus', '320px no horizontal overflow', 'No page errors'], publicData: 'Intercepted browser-only fixtures; no financial operations or live-status claims' };
  if (process.env.EVIDENCE_DIR) { await mkdir(process.env.EVIDENCE_DIR, { recursive: true }); await writeFile(process.env.EVIDENCE_DIR + '/frontend-browser.json', JSON.stringify(evidence, null, 2)); }
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
