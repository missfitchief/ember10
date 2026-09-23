import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { PublicMarket, PublicOverview } from '../packages/shared/public.js';
import { assertOverview, change, filterMarkets, logoUrl, marketView, marketCounts, marketRequestState, mergeMarketPages, money, routeFromHash, safeUrl, units, validPublicKey } from '../apps/web/view-model.js';
import { creditState, ledgerConnection, ledgerResult, transferUrl, uniqueReceipts, walletResult } from '../apps/web/ledger.js';
import { CreditTable, WalletAvailability } from '../apps/web/records.js';
import { AssetDialog, MarketPanel } from '../apps/web/market.js';

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
    expect(logoUrl('https://embercurve.fun/token.png')).toBeNull();
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

describe('Market snapshot pagination', () => {
  function page(offset:number, mint:string, fetchedAt='2026-09-23T12:00:00Z') {
    return {
      revision:'revision-a', discovery:{fetchedAt,evidenceHash:'catalogue-a',status:'ready'},
      selection:{policyVersion:'ember10-v2'}, markets:[{mint,rank:offset+1}],
      marketPage:{offset,returned:1,totalMatches:3,query:'',view:'all',hasMore:offset<2},
    } as unknown as PublicOverview;
  }
  it('combines contiguous pages of one observation and retains the matching response provenance', () => {
    const first=page(0,'mint-a'), next=page(1,'mint-b');
    next.discovery.status='stale';
    const merged=mergeMarketPages(first,next)!;
    expect(merged.markets.map(row=>row.mint)).toEqual(['mint-a','mint-b']);
    expect(merged.discovery).toBe(next.discovery);
    expect(merged.marketPage.offset+merged.marketPage.returned).toBe(2);
    expect(first.markets).toHaveLength(1);
    expect(mergeMarketPages(merged,page(2,'mint-c'))?.markets).toHaveLength(3);
  });
  it('refuses to mix changed fetch epochs, hashes, search queries or eligibility views', () => {
    const first=page(0,'mint-a');
    expect(mergeMarketPages(first,page(1,'mint-b','2026-09-23T12:01:00Z'))).toBeNull();
    const changed=page(1,'mint-b');changed.discovery.evidenceHash='catalogue-b';
    expect(mergeMarketPages(first,changed)).toBeNull();
    const search=page(1,'mint-b');search.marketPage.query='new query';
    expect(mergeMarketPages(first,search)).toBeNull();
    const selection=page(1,'mint-b');selection.marketPage.view='selection';
    expect(mergeMarketPages(first,selection)).toBeNull();
  });
  it('refuses missing provenance, duplicate mints and gaps rather than masking rank movement', () => {
    const first=page(0,'mint-a');
    expect(mergeMarketPages(first,page(1,'mint-a'))).toBeNull();
    expect(mergeMarketPages(first,page(2,'mint-c'))).toBeNull();
    const unverified=page(1,'mint-b');unverified.discovery.evidenceHash=null;
    expect(mergeMarketPages(first,unverified)).toBeNull();
  });
});

describe('Frontend audit regressions', () => {
  const firstMint = '11111111111111111111111111111111';
  const secondMint = 'So11111111111111111111111111111111111111112';
  function observation(): PublicOverview {
    const market: PublicMarket = {
      mint:firstMint, symbol:'SAME', name:'Same name', imageUrl:null,
      canonicalPool:null, config:null, quoteMint:null, marketCapUsd:'12345.67', priceUsd:null,
      volume24hUsd:'456.78', change24hPct:'-2.5', currency:'USD', supplyBasis:'undocumented',
      sourceTimestamp:null, createdAt:null, rank:1, eligibility:'unknown', reasons:[], selected:false,
      weightBps:null, sourceUrl:'https://embercurve.fun/markets',
    };
    return {
      schemaVersion:1, revision:'audit-test', project:{name:'EMBER10',phase:'prelaunch',dataMode:'real',mint:null,mintStatus:'not_deployed',buyUrl:null},
      policy:{version:'ember10-v2',basketSize:10,assetWeightBps:1000,rewardsBps:8000,buybackBps:1000,operationsBps:1000,holderUnits:'100000',rankingBasis:'Ember market cap USD',eligibilityRules:[]},
      discovery:{status:'ready',sourceUrl:'https://embercurve.fun/markets',documentationUrl:'https://embercurve.fun/developers',fetchedAt:'2026-09-23T12:00:00Z',sourceTimestamp:null,lastSuccessfulAt:'2026-09-23T12:00:00Z',refreshSeconds:45,message:'Source observations',rankingBasis:'Ember market cap USD',supplyBasis:'undocumented',coverage:{status:'unverified',rawRows:18,uniqueMints:17,rankedMints:15,duplicateRows:1,invalidRows:0,warming:false,complete:false,note:'Unverified source coverage'},evidenceHash:'source-a'},
      markets:[market,{...market,mint:secondMint,rank:2,eligibility:'excluded'}],
      marketPage:{offset:0,limit:100,totalMatches:17,returned:2,query:'',view:'all',hasMore:false},
      selection:{policyVersion:'ember10-v2',state:'insufficient',selectedMints:[],selectedCount:0,requiredCount:10,commitmentsAllowed:false,reason:'No verified assets'},
      fundedBasket:{status:'unavailable',epochId:null,fundedAt:null,policyVersion:null,members:[],message:'No funded record'},
      settlement:{status:'not_configured',broadcastEnabled:false,workerActive:false,lastFinalizedAt:null,message:'Not configured'},
      accounting:{status:'unavailable',currency:'SOL',creatorRevenue:null,holderRewards:null,buybackBurn:null,opsAllocation:null,approvedExpenses:null,retainedReserve:null,withdrawableRemainder:null,pendingTransfers:null,finalizedDevPayments:null,message:'No connected ledger'},
    };
  }
  it('renders an existing observation immediately on route entry without a false unavailable or empty flash', () => {
    const html=renderToStaticMarkup(createElement(MarketPanel,{data:observation(),loading:false,error:'',retry:()=>{}}));
    expect(html).toContain('SAME');
    expect(html).toContain('$12.3K');
    expect(html).not.toContain('Source unavailable');
    expect(html).not.toContain('Market data is unavailable');
    expect(html).not.toContain('No market observations reported');
    expect(html).not.toContain('Loading market observations');
  });
  it('cold loads with a skeleton and shows a failure only after the request fails', () => {
    const html=renderToStaticMarkup(createElement(MarketPanel,{loading:true,error:'',retry:()=>{}}));
    expect(html).toContain('Loading market observations');
    expect(html).not.toContain('unavailable');
    expect(html).not.toContain('No market observations');
    const failed=renderToStaticMarkup(createElement(MarketPanel,{loading:false,error:'Network failed',retry:()=>{}}));
    expect(failed).toContain('Market request failed');
    expect(failed).toContain('Network failed');
    expect(failed).not.toContain('No market observations');
  });
  it('keeps duplicate symbols independently visible by short mint and offers mobile eligibility and explicit details', () => {
    const html=renderToStaticMarkup(createElement(MarketPanel,{data:observation(),loading:false,error:'',retry:()=>{}}));
    expect(html).toContain('111111…11111');
    expect(html).toContain('So1111…11112');
    expect(html).toContain('token-mobile-status status-small">Not verified');
    expect(html).toContain('token-mobile-status status-small">Excluded');
    expect(html.match(/class="row-open"/g)).toHaveLength(2);
    expect(filterMarkets(observation().markets,secondMint,false).map(row=>row.mint)).toEqual([secondMint]);
  });
  it('puts desktop metrics in one detail interaction and keeps missing metrics distinct from zero', () => {
    const data=observation();
    const html=renderToStaticMarkup(createElement(AssetDialog,{asset:data.markets[0],data,onClose:()=>{}}));
    expect(html).toContain('Reported 24h volume');
    expect(html).toContain('$456.78');
    expect(html).toContain('-2.50%');
    expect(html).toContain('Reported volume is separate from verified liquidity');
    expect(html).toContain(firstMint);
    expect(html).toContain('Source evidence &amp; observation time');
    const unknown=renderToStaticMarkup(createElement(AssetDialog,{asset:{...data.markets[0],volume24hUsd:null,change24hPct:null},data,onClose:()=>{}}));
    expect(unknown).toContain('Reported 24h volume</dt><dd>Not reported');
    expect(unknown).toContain('Reported 24h change</dt><dd>Not reported');
    const zero=renderToStaticMarkup(createElement(AssetDialog,{asset:{...data.markets[0],volume24hUsd:'0',change24hPct:'0'},data,onClose:()=>{}}));
    expect(zero).toContain('$0.000000');
    expect(zero).toContain('0.00%');
  });
  it('distinguishes cold load, query refresh, valid empty, stale, warming and explicit unavailable responses', () => {
    const data=observation();
    expect(marketRequestState(undefined,true,'')).toBe('loading');
    expect(marketRequestState(undefined,false,'failed')).toBe('failed');
    expect(marketRequestState(data,true,'')).toBe('refreshing');
    expect(marketRequestState({...data,markets:[]},false,'')).toBe('empty');
    expect(marketRequestState(data,false,'failed')).toBe('stale');
    expect(marketRequestState({...data,discovery:{...data.discovery,status:'stale'}},false,'')).toBe('stale');
    expect(marketRequestState({...data,discovery:{...data.discovery,status:'warming'}},false,'')).toBe('warming');
    expect(marketRequestState({...data,discovery:{...data.discovery,status:'unavailable'},markets:[]},false,'')).toBe('unavailable');
    const refresh=renderToStaticMarkup(createElement(MarketPanel,{data,loading:true,error:'',retry:()=>{}}));
    expect(refresh).toContain('SAME');
    expect(refresh).toContain('Refreshing these observations');
  });
  it('keeps catalogue, rankable and search-result counts distinct even for a no-match query', () => {
    const data=observation();
    expect(marketCounts(data)).toEqual({catalogue:17,ranked:15,matches:17,filtered:false});
    const search={...data,markets:[],marketPage:{...data.marketPage,totalMatches:0,query:'no match'}};
    expect(marketCounts(search)).toEqual({catalogue:17,ranked:15,matches:0,filtered:true});
    expect(search.selection).toBe(data.selection);
    expect(search.fundedBasket).toBe(data.fundedBasket);
  });
  it('requires an explicit reward-service response to establish a known unavailable connection', () => {
    expect(ledgerConnection({status:'unavailable',message:'No verified ledger'})).toEqual({availability:'unavailable',ledger:null,message:'No verified ledger'});
    expect(ledgerConnection({assets:[],accrued:[]})).toMatchObject({availability:'available'});
    expect(ledgerConnection({status:'available',assets:[],accrued:[]})).toMatchObject({availability:'available'});
    expect(()=>ledgerConnection({status:'warming',assets:[],accrued:[]})).toThrow('unsupported accounting status');
    expect(()=>ledgerConnection({status:'',assets:[],accrued:[]})).toThrow('unsupported accounting status');
    expect(()=>ledgerConnection({})).toThrow('unreadable');
    expect(()=>ledgerConnection({mode:'demo',status:'unavailable'})).toThrow('Test accounting');
  });
  it('does not turn malformed or mismatched wallet responses into a valid empty balance', () => {
    expect(()=>walletResult({})).toThrow('No balance has been inferred');
    expect(()=>walletResult({address:firstMint,status:'warming',entitlements:[],deliveries:[]})).toThrow('No balance has been inferred');
    expect(()=>walletResult({address:firstMint,entitlements:[],deliveries:[]},secondMint)).toThrow('did not match');
    expect(walletResult({address:firstMint,entitlements:[],deliveries:[]},firstMint).entitlements).toEqual([]);
  });
  it('exposes the known wallet limitation before submission and gives temporary failures distinct retry copy', () => {
    const props={message:'No verified ledger',error:'Network failure',loading:false,phase:'prelaunch',retry:()=>{}};
    const unavailable=renderToStaticMarkup(createElement(WalletAvailability,{...props,availability:'unavailable'}));
    expect(unavailable).toContain('Reward records are not connected yet');
    expect(unavailable).toContain('cannot return its reward balance');
    expect(unavailable).toContain('Unknown rewards are not zero');
    const checking=renderToStaticMarkup(createElement(WalletAvailability,{...props,availability:'checking'}));
    expect(checking).toContain('Prelaunch. Checking');
    expect(checking).not.toContain('not connected yet');
    const failed=renderToStaticMarkup(createElement(WalletAvailability,{...props,availability:'failed'}));
    expect(failed).toContain('could not be checked');
    expect(failed).toContain('Retry connection');
    expect(failed).not.toContain('cannot return its reward balance');
  });
});
