/** Reproducible offline evidence only. Fixtures are never imported by a production endpoint. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { normalizeCatalogue, MARKET_SOURCE } from '../packages/integrations/market-data.js';

const capturedAt = '2026-09-23T15:03:19.224Z';
const rawText = await readFile('tests/fixtures/ember-catalogue-2026-09-23.json', 'utf8');
const configText = await readFile('tests/fixtures/ember-configs-2026-09-23.json', 'utf8');
const raw = JSON.parse(rawText), configs = JSON.parse(configText);
const normalized = normalizeCatalogue(raw, configs, null, capturedAt);
const mintCompare = (a: { mint: string }, b: { mint: string }) => a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0;
const rawTopTen = [...raw.markets].filter(r => typeof r.marketCapUsd === 'number' && Number.isFinite(r.marketCapUsd))
  .sort((a, b) => new Decimal(b.marketCapUsd).cmp(a.marketCapUsd) || mintCompare(a, b)).slice(0, 10)
  .map(r => ({ mint: r.mint, symbol: r.symbol, marketCapUsd: String(r.marketCapUsd), suspect: r.suspect, graduated: r.graduated }));
const reasonCounts: Record<string, number> = {};
for (const row of normalized.markets) for (const reason of row.reasons) if (reason.state !== 'pass') reasonCounts[`${reason.code}:${reason.state}`] = (reasonCounts[`${reason.code}:${reason.state}`] ?? 0) + 1;
const proof = {
  schema: 'ember10.data-fix-proof.v1', implementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), generatedAt: new Date().toISOString(),
  deployment: { mode: 'prelaunch', dataMode: 'real', publicDeploymentVerified: false, reason: 'Local owner evidence. Canonical integrator must append actual deployed revision verification.' },
  source: { url: MARKET_SOURCE, fetchedAt: capturedAt, sourceTimestamp: null, sourceTimestampReason: 'No catalogue-level observation timestamp in the current response; HTTP Date and createdAt are not market observation times.', cacheControl: 'public, max-age=5', documentedRefreshSeconds: 15, clientRefreshSeconds: 45, rawBytes: Buffer.byteLength(rawText), rawSha256: createHash('sha256').update(rawText).digest('hex'), configSha256: createHash('sha256').update(configText).digest('hex'), registryRows: configs.configs.length, registryCount: configs.count, registryUpdatedAt: configs.updatedAt },
  coverage: normalized.coverage,
  rankingBasis: 'Ember-reported marketCapUsd, USD, exact decimal-string normalization of JSON numeric values; supply basis undocumented. No quote conversion or FDV substitution.',
  rawTopTen,
  sourceFilteredTopTen: normalized.markets.filter(r => r.rank !== null).slice(0, 10).map(r => ({ rank: r.rank, mint: r.mint, symbol: r.symbol, marketCapUsd: r.marketCapUsd, eligibility: r.eligibility })),
  sourceComparison: { observedFrontendAt: '2026-09-23T15:05:18Z', sourceJs: 'https://embercurve.fun/assets/index-BnVC4qJ7.js', sourceFilter: 'Market context removes suspect:true rows; market filtering helper independently rejects suspect:true.', rawRows: raw.markets.length, suspectRows: raw.markets.filter((r: { suspect?: boolean }) => r.suspect).length, sourceVisibleRows: raw.markets.filter((r: { suspect?: boolean }) => !r.suspect).length, normalizedRankableMints: normalized.coverage.rankedMints, discrepancy: 'Source UI counts the repeated HEATBLAST pool/mint row twice; this adapter collapses it. Rounded values move between independent reads. Dated reference observations are never used as input.' },
  selection: { policyVersion: 'ember10-v2', requiredCount: 10, weightBps: 1000, selectedMints: [], selectedCount: 0, commitmentsAllowed: false, reason: 'No candidate passes all accepted provenance, liquidity, complete holder census, token-authority/program, route and circulating-supply requirements. Missing evidence remains unknown; new purchases paused.' },
  fundedBasket: { status: 'unavailable', epochId: null, reason: 'No verified production ledger attached. Historical v1 baskets and liabilities are unchanged.' },
  reasonCounts,
  exclusionEvidence: normalized.markets.map(r => ({ mint: r.mint, rank: r.rank, eligibility: r.eligibility, reasons: r.reasons.filter(x => x.state !== 'pass').map(x => ({ code: x.code, state: x.state })) })),
  providerLimitations: ['No independently checkable complete universe count or pagination contract', 'No catalogue-level observation timestamp', 'No documented circulating-supply basis', 'No comparable liquidity field (quoteReserve is not total USD liquidity)', 'Published holder count is not a verified full census', 'Listed configs do not prove on-chain pool identity/authorities or a budget-sized route'],
  acceptance: { productionDemoFallback: 'removed', syntheticArchive: 'preserved only as an isolated historical/demo artifact; not imported by hosted API', projectMint: 'null / Contract not deployed', userPolicy: 'ten equal budgets, 80/10/10 unchanged, OPS/DEV unchanged', publicIssueResolved: false }
};
await writeFile('docs/DATA-FIX-PROOF.json', JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ path: 'docs/DATA-FIX-PROOF.json', implementationCommit: proof.implementationCommit, coverage: proof.coverage, selectedCount: 0 }));
