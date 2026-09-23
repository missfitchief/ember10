import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import Decimal from 'decimal.js';

const [base, expectedRevision, output] = process.argv.slice(2);
assert(base && expectedRevision && output, 'Usage: node scripts/verify-public.mjs <https-origin> <revision> <output.json>');
const origin = new URL(base);
assert(['https:', 'http:'].includes(origin.protocol));
const checks = [];
async function request(path, expected = 200, method = 'GET') {
  const response = await fetch(new URL(path, origin), { method, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  checks.push({ path, method, expected, actual: response.status, passed: response.status === expected });
  assert.equal(response.status, expected, `${method} ${path}`);
  return { text, type: response.headers.get('content-type') };
}
const [home, state, view, wallet, write, operator, invalid] = await Promise.all([
  request('/'), request('/api/status'), request('/api/overview?limit=100'),
  request('/api/wallets/So11111111111111111111111111111111111111112/rewards'),
  request('/api/status', 405, 'POST'), request('/api/operator/resume', 404),
  request('/api/wallets/invalid/rewards', 400)
]);
assert.match(home.type, /text\/html/);
const status = JSON.parse(state.text), overview = JSON.parse(view.text), lookup = JSON.parse(wallet.text);
assert.equal(status.revision, expectedRevision);
assert.equal(overview.revision, expectedRevision);
assert.equal(status.hostedSnapshot, false);
assert.equal(status.broadcastEnabled, false);
assert.equal(overview.project.name, 'EMBER10');
assert.equal(overview.project.dataMode, 'real');
assert.equal(overview.project.mint, null);
assert.equal(overview.policy.basketSize, 10);
assert.equal(overview.policy.assetWeightBps, 1000);
assert.equal(overview.policy.rewardsBps + overview.policy.buybackBps + overview.policy.operationsBps, 10000);
assert.equal(overview.selection.commitmentsAllowed, false);
assert.equal(overview.fundedBasket.members.length, 0);
assert.equal(overview.accounting.creatorRevenue, null);
assert.equal(lookup.status, 'unavailable');
assert(!view.text.includes('DEMO synthetic fixture'));
assert(!view.text.includes('demo-epoch-001'));
assert.equal(overview.discovery.status, 'ready', 'Public catalogue must be available for this verification');
assert(overview.discovery.coverage.rawRows > 0);
let previous = null;
const seen = new Set();
for (const row of overview.markets) {
  assert.equal(bs58.decode(row.mint).length, 32);
  assert(!seen.has(row.mint)); seen.add(row.mint);
  if (row.rank !== null) {
    assert(!row.reasons.some(reason => reason.code === 'source_suspect'));
    const cap = new Decimal(row.marketCapUsd);
    assert(cap.isFinite());
    assert(previous === null || cap.lte(previous));
    previous = cap;
  }
}
const result = {
  verifiedAt: new Date().toISOString(), url: origin.origin, revision: expectedRevision,
  checks, contractChecks: 'passed', status,
  overview: { ...overview, markets: overview.markets.slice(0, 10) },
  boundary: 'Real-source discovery only; project mint, funded ledger and settlement remain unconfigured.'
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ url: result.url, revision: result.revision, httpChecks: checks.length, discovery: overview.discovery.status, returnedMarkets: overview.markets.length, sourceRows: overview.discovery.coverage.rawRows, proof: output }));
