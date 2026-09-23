import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { PublicMarket, PublicOverview } from '../packages/shared/public.js';
import { assertOverview, change, filterMarkets, logoUrl, marketView, money, routeFromHash, safeUrl, units, validPublicKey } from '../apps/web/view-model.js';
import { creditState, ledgerResult, transferUrl, uniqueReceipts, walletResult } from '../apps/web/ledger.js';
import { CreditTable } from '../apps/web/records.js';

describe('Public UI adapters', () => {
  it('keeps exact raw-unit balances above Number precision and unknown values distinct from zero', () => {
    expect(units('9007199254740993123456789', 9)).toBe('9,007,199,254,740,993.123456789');
    expect(units('0', 9)).toBe('0');
    expect(units(null, 9)).toBe('Unreported');
    expect(units('100', undefined)).toBe('100 raw units');
    expect(money(null)).toBe('Unavailable');
    expect(money('0')).toBe('$0.000000');
    expect(money('1234567')).toBe('$1.2M');
    expect(change(null)).toBe('—');
    expect(change('0')).toBe('0.00%');
  });

  it('validates Solana public-key bytes rather than address length alone', () => {
    expect(validPublicKey('11111111111111111111111111111111')).toBe(true);
    expect(validPublicKey('1111111111111111111111111111111')).toBe(false);
    expect(validPublicKey('0'.repeat(32))).toBe(false);
    expect(validPublicKey('')).toBe(false);
  });

  it('rejects unsafe metadata destinations and untrusted image hosts', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('https://user:secret@embercurve.fun/')).toBeNull();
    expect(logoUrl('https://example.com/token.png')).toBeNull();
    expect(logoUrl('https://embercurve.fun/token.png')).toBe('https://embercurve.fun/token.png');
    expect(logoUrl('http://embercurve.fun/token.png')).toBeNull();
  });

  it('does not accept the former hosted synthetic contract as normal public data', () => {
    expect(() => assertOverview({ schemaVersion: 1, project: { dataMode: 'demo' }, markets: [] } as unknown as PublicOverview)).toThrow('No replacement assets');
    expect(() => assertOverview({ project: { dataMode: 'real' }, markets: [] } as unknown as PublicOverview)).toThrow();
    expect(() => walletResult({ mode: 'demo', address: 'fixture', entitlements: [] })).toThrow('Test reward records');
    expect(ledgerResult({ mode: 'test', accrued: [], assets: [] })).toBeNull();
  });

  it('filters a server page for presentation without changing ranks or canonical selection', () => {
    const rows = [
      { mint: 'mint-a', symbol: 'ALPHA', name: 'Alpha', rank: 1, selected: false },
      { mint: 'mint-b', symbol: 'BETA', name: 'Beta', rank: 2, selected: true },
    ] as PublicMarket[];
    expect(filterMarkets(rows, 'MINT-B', false)).toEqual([rows[1]]);
    expect(filterMarkets(rows, '', true)).toEqual([rows[1]]);
    expect(rows.map(row => [row.rank, row.selected])).toEqual([[1, false], [2, true]]);
  });

  it('labels stale observations and ranked-mint coverage independently from selection', () => {
    const overview = { markets: [], discovery: { status: 'stale', sourceTimestamp: null, fetchedAt: '2026-09-23T12:00:00Z', coverage: { rankedMints: 17, status: 'partial' } }, selection: { selectedCount: 3, requiredCount: 10 } } as unknown as PublicOverview;
    expect(marketView(overview)).toMatchObject({ sourceLabel: 'Stale observation', coverageLabel: '17 ranked mints · coverage partial', selectedLabel: '3 / 10 selected' });
    expect(marketView(overview).observedLabel).toContain('UTC');
  });

  it('preserves unavailable wallet evidence instead of interpreting failure as zero', () => {
    const result = walletResult({ address: 'wallet', status: 'unavailable', eligibility: null, entitlements: [], deliveries: [], reason: 'Ledger is not connected' });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'Ledger is not connected', snapshotSlot: null, eligibility: null });
    expect(ledgerResult({ status: 'unavailable', accrued: [], assets: [] })).toBeNull();
  });

  it('keeps finalized payout counts separate from fee receipts and acquisition intents', () => {
    const ledger = ledgerResult({ receivedLamports: '300', finalizedPayoutTransactions: '2', accrued: [], assets: [], receipts: [{}, {}, {}], intents: [{ kind: 'buy' }] });
    expect(ledger?.receivedLamports).toBe('300');
    expect(ledger?.finalizedPayoutTransactions).toBe('2');
    expect(ledgerResult({ accrued: [], assets: [] })?.finalizedPayoutTransactions).toBeNull();
  });

  it('distinguishes credited, pending, partial, and fully paid rewards', () => {
    const base = { asset: 'mint', credited: '100' };
    expect(creditState({ ...base, paid: '0', pending: '100' })).toBe('Awaiting delivery');
    expect(creditState({ ...base, paid: '40', pending: '60' })).toBe('Partially paid');
    expect(creditState({ ...base, paid: '100', pending: '0' })).toBe('Paid');
    expect(creditState({ ...base, paid: '?', pending: '0' })).toBe('Unreported');
    const html = renderToStaticMarkup(createElement(CreditTable, { rows: [{ ...base, paid: '40', pending: '60' }], ledger: null }));
    expect(html).toContain('Partially paid');
    expect(html).toContain('40 raw units');
    expect(html).toContain('60 raw units');
  });

  it('deduplicates intents and transfers using terminal evidence and requires a verified explorer network', () => {
    const signature = '1'.repeat(88);
    expect(uniqueReceipts([{ id: 'a', asset: 'mint', status: 'submitted' }], [{ id: 'a', asset: 'mint', status: 'finalized', result: { signature } }])).toEqual([{ id: 'a', asset: 'mint', status: 'finalized', result: { signature } }]);
    expect(transferUrl(signature, undefined)).toBeNull();
    expect(transferUrl('invented', 'mainnet-beta')).toBeNull();
    expect(transferUrl(signature, 'devnet')).toContain('?cluster=devnet');
    expect(routeFromHash('#wallet')).toBe('wallet');
    expect(routeFromHash('#claim')).toBe('overview');
  });
});
