/** Controlled browser regressions against the actual app, using isolated API fixtures.
 * PLAYWRIGHT_MODULE=<installed entry> node --import tsx tests/ui-r3.browser.mjs
 * BASE_URL defaults to dev:web on port 5192. EVIDENCE_DIR optionally records results.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { overview } from '../apps/api/overview.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5192';
const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ee713f' } }).png().toBuffer();
const imageSources = ['a', 'b'].map(char => `https://embercurve.fun/img/b${char.repeat(52)}`);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const results = [];
const wait = async (condition, description) => {
  for (let i = 0; i < 150; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw Error(`Timed out: ${description}`);
};
async function setup(hash = 'basket', logos = false) {
  const state = { generation: 0, failParent: false, failSearch: false, failLogo: true, failedImageCalls: 0, errors: [] };
  const page = await browser.newPage({ viewport: { width: 1440, height: logos ? 2800 : 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5_000);
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__heldPages = [];
    window.__holdPages = false;
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!window.__holdPages || url.pathname !== '/api/overview' || Number(url.searchParams.get('offset')) <= 0) return nativeFetch(input, options);
      // Deliberately ignore cancellation. The application generation guard must
      // reject a late response even when the transport still completes its work.
      const entry = { ready: false, released: false, aborted: false };
      options?.signal?.addEventListener('abort', () => { entry.aborted = true; });
      window.__heldPages.push(entry);
      return new Promise((resolve, reject) => {
        nativeFetch(input, { ...options, signal: undefined }).then(response => response.json()).then(body => {
          entry.body = body; entry.ready = true;
          entry.release = () => { entry.released = true; resolve(new Response(JSON.stringify(entry.body), { headers: { 'content-type': 'application/json' } })); };
        }).catch(reject);
      });
    };
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/token-image') {
      const failed = url.searchParams.get('source') === imageSources[0] && state.failLogo;
      if (failed) state.failedImageCalls++;
      return route.fulfill(failed ? { status: 503, json: { error: 'temporary_catalogue_outage' }, headers: { 'cache-control': 'no-store' } } : { contentType: 'image/png', body: png, headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname !== '/api/overview') return route.fulfill({ status: 404, json: { message: 'Unexpected fixture request' } });
    const parent = !url.search;
    if (parent) state.generation++;
    if (parent && state.failParent || !parent && state.failSearch) return route.fulfill({ status: 503, json: { message: 'Deliberate isolated request failure' } });
    const generation = state.generation;
    const markets = Array.from({ length: 350 }, (_, i) => ({
      mint: `fixture-mint-${String(i).padStart(4, '0')}`, name: `Alpha asset ${i}`, symbol: `TEST${i}`,
      imageUrl: logos && i < 2 ? imageSources[i] : null, canonicalPool: null, config: null, quoteMint: null,
      marketCapUsd: String(350000 - i - generation * 1000), priceUsd: null, volume24hUsd: null, change24hPct: null,
      currency: 'USD', supplyBasis: 'undocumented', sourceTimestamp: null, createdAt: null, rank: i + 1,
      eligibility: 'unknown', reasons: [], selected: false, weightBps: null, sourceUrl: 'https://embercurve.fun/markets',
    }));
    const source = { refreshSeconds: 45, read: async () => ({ status: 'ready', observed: {
      fetchedAt: new Date(Date.UTC(2026, 8, 23, 12, generation)).toISOString(), normalized: { markets, evidenceHash: `fixture-${generation}`, coverage: { status: 'unverified', rawRows: 350, uniqueMints: 350, rankedMints: 350, duplicateRows: 0, invalidRows: 0, warming: false, complete: false, note: 'Isolated browser fixture' } },
    } }) };
    return route.fulfill({ json: await overview(source, { query: url.searchParams.get('q') ?? '', view: url.searchParams.get('view') ?? 'all', offset: Number(url.searchParams.get('offset') ?? 0), limit: 100 }) });
  });
  await page.clock.install();
  await page.goto(`${base}/#${hash}`);
  await wait(() => state.generation > 0, 'initial overview');
  const rows = () => page.locator('.market-table tbody tr').count();
  const more = async expected => { await page.getByRole('button', { name: 'Show more markets' }).click(); if (expected != null) await wait(async () => await rows() === expected, `${expected} rows`); };
  const poll = async () => { const before = state.generation; await page.clock.fastForward(45_000); await wait(() => state.generation > before, 'parent poll'); };
  const release = async index => { await page.evaluate(index => window.__heldPages[index].release(), index); await page.waitForTimeout(50); };
  return { page, state, rows, more, poll, release };
}
try {
  // Matching late page after a replacing parent poll.
  {
    const { page, state, rows, more, release } = await setup();
    await wait(async () => await rows() === 20, 'first page');
    for (const count of [50, 80, 100]) await more(count);
    await page.clock.fastForward(44_000);
    await page.evaluate(() => { window.__holdPages = true; });
    await more();
    await wait(() => page.evaluate(() => window.__heldPages[0]?.ready), 'deferred matching page');
    const oldTime = await page.locator('.source-time').innerText();
    const oldGeneration = state.generation;
    await page.clock.fastForward(2_000);
    await wait(() => state.generation > oldGeneration, 'replacement poll');
    await wait(async () => (await page.locator('.source-time').innerText()) !== oldTime, 'new observation selected');
    const newTime = await page.locator('.source-time').innerText();
    await release(0);
    assert.equal(await rows(), 100);
    assert.equal(await page.locator('.source-time').innerText(), newTime);
    assert.equal(await page.getByText(/The catalogue changed while paging/).count(), 0);
    assert.equal(await page.evaluate(() => window.__heldPages[0].aborted), true);
    assert.deepEqual(state.errors, []);
    results.push('Late matching page cannot overwrite a replacing parent poll, even when fetch ignores abort');
    await page.close();
  }
  // Nonmatching late page after explicit Refresh list; refresh must also prevent a duplicate in-flight page.
  {
    const { page, state, rows, more, poll, release } = await setup();
    await wait(async () => await rows() === 20, 'first page');
    for (const count of [50, 80, 100, 140]) await more(count);
    await poll();
    await wait(() => page.getByRole('button', { name: 'Refresh list' }).isVisible(), 'retained list notice');
    for (const count of [170, 200]) await more(count);
    await page.evaluate(() => { window.__holdPages = true; });
    await more();
    await wait(() => page.evaluate(() => window.__heldPages[0]?.ready), 'deferred changed page');
    assert.equal(await page.getByRole('button', { name: 'Show more markets' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Refresh list' }).click();
    await wait(async () => await rows() === 20 && !(await page.getByRole('button', { name: 'Show more markets' }).isDisabled()), 'explicit refresh completion');
    const freshTime = await page.locator('.source-time').innerText();
    await release(0);
    assert.equal(await rows(), 20);
    assert.equal(await page.locator('.source-time').innerText(), freshTime);
    assert.equal(await page.getByText(/The catalogue changed while paging/).count(), 0);
    assert.equal(await page.evaluate(() => window.__heldPages.length), 1);
    assert.equal(await page.evaluate(() => window.__heldPages[0].aborted), true);
    assert.deepEqual(state.errors, []);
    results.push('Default Refresh list cancels/invalidate pending paging and late mismatch cannot undo it');
    await page.close();
  }
  {
    const { page, state, rows, poll } = await setup();
    await wait(async () => await rows() === 20, 'first page');
    await page.getByPlaceholder('Find a token or mint').fill('a');
    await page.clock.fastForward(350);
    await wait(() => page.locator('.market-counts').getByText(/search matches/).isVisible(), 'successful search');
    state.failParent = true;
    await poll();
    await wait(() => page.getByText(/The latest background source check failed/).isVisible(), 'separate background warning');
    await page.getByPlaceholder('Find a token or mint').fill('asset');
    await page.clock.fastForward(350);
    await wait(async () => !(await page.locator('#market-content').getAttribute('aria-busy') === 'true'), 'fresh query after parent failure');
    assert.equal(await rows(), 20);
    assert.match(await page.locator('.market-source').innerText(), /Catalogue observation/);
    assert.equal(await page.getByText(/This list request failed/).count(), 0);
    assert.equal(await page.getByText(/^Stale observation\. Last successful/).count(), 0);
    state.failParent = false;
    await poll();
    await wait(() => page.getByRole('button', { name: 'Refresh list' }).isVisible(), 'source recovers independently');
    state.failSearch = true;
    await page.getByRole('button', { name: 'Refresh list' }).click();
    await wait(() => page.getByText(/This list request failed/).isVisible(), 'separate list-request failure');
    assert.equal(await page.getByText(/The latest background source check failed/).count(), 0);
    state.failSearch = false;
    await page.locator('.market-panel').getByRole('button', { name: 'Retry', exact: true }).click();
    await wait(async () => await page.getByText(/This list request failed/).count() === 0, 'list recovery');
    await page.getByRole('tab', { name: /Eligibility/ }).click();
    await page.clock.fastForward(350);
    await wait(() => page.getByRole('heading', { name: 'No eligible selection yet.' }).isVisible(), 'eligibility empty state precedes query');
    assert.equal(await page.getByRole('heading', { name: 'No matching token.' }).count(), 0);
    assert.match(await page.locator('.market-panel .empty').innerText(), /No candidates have all required checks verified/);
    assert.deepEqual(state.errors, []);
    results.push('Successful query stays correctly labelled despite parent failure; eligibility-empty policy takes priority over query');
    await page.close();
  }
  {
    const { page, state, poll } = await setup('overview', true);
    const failedHero = page.locator('.orbit-token').filter({ has: page.locator('.orbit-token-text strong', { hasText: /^TEST0$/ }) }).first();
    const healthyHero = page.locator('.orbit-token').filter({ has: page.locator('.orbit-token-text strong', { hasText: /^TEST1$/ }) }).first();
    await wait(() => healthyHero.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), 'healthy image');
    const healthyNode = await healthyHero.locator('img').elementHandle();
    const exhaust = async () => {
      await wait(() => state.failedImageCalls > 0, 'real failed image request');
      for (let attempt = 0; attempt < 4; attempt++) { await page.clock.fastForward(3_000); await page.waitForTimeout(60); }
      const calls = state.failedImageCalls;
      await page.clock.fastForward(3_000); await page.waitForTimeout(60);
      assert.equal(state.failedImageCalls, calls, 'bounded automatic retries must be exhausted before testing poll recovery');
    };
    await exhaust();
    assert.equal(await failedHero.locator('img').count(), 0);
    assert.equal(await page.locator('.ten-row').first().locator('img').count(), 0);
    await failedHero.click();
    await exhaust();
    assert.equal(await page.locator('dialog .token-icon img').count(), 0);
    state.failLogo = false;
    await poll();
    for (const locator of [failedHero.locator('img'), page.locator('.ten-row').first().locator('img'), page.locator('dialog .token-icon img')]) {
      await wait(async () => await locator.count() === 1 && await locator.evaluate(img => img.complete && img.naturalWidth > 0), 'failed avatar recovers after a successful observation');
    }
    assert.equal(await healthyNode.evaluate(node => node.isConnected), true, 'healthy image must not be remounted');
    assert.deepEqual(state.errors, []);
    results.push('Exhausted real image failures recover in hero, homepage list and detail after good poll; healthy image DOM persists');
    await page.close();
  }
  {
    // Fresh browser context: previously decoded logo bytes must not mask an error.
    const { page, state, poll } = await setup('basket', true);
    await wait(() => state.failedImageCalls > 0, 'real failed market-table image');
    for (let attempt = 0; attempt < 4; attempt++) { await page.clock.fastForward(3_000); await page.waitForTimeout(60); }
    const calls = state.failedImageCalls;
    await page.clock.fastForward(3_000); await page.waitForTimeout(60);
    assert.equal(state.failedImageCalls, calls, 'market-table retries have exhausted');
    assert.equal(await page.locator('.market-table tbody tr').first().locator('img').count(), 0);
    state.failLogo = false;
    await poll();
    await wait(() => page.locator('.market-table tbody tr').first().locator('img').evaluate(img => img.complete && img.naturalWidth > 0), 'table avatar recovery');
    assert.deepEqual(state.errors, []);
    results.push('Exhausted real market-table image failure recovers after a successful observation');
    await page.close();
  }
  const evidence = { passed: true, results, scope: 'Application UI with browser-only controlled API/image fixtures, deferred fetches deliberately ignoring abort; no live financial data or execution.' };
  if (process.env.EVIDENCE_DIR) { await mkdir(process.env.EVIDENCE_DIR, { recursive: true }); await writeFile(`${process.env.EVIDENCE_DIR}/frontend-r3-browser.json`, JSON.stringify(evidence, null, 2)); }
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
