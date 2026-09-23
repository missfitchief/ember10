import {beforeAll,describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {overview} from '../apps/api/overview.js';
import {MarketDataService} from '../packages/integrations/market-data.js';
import type {PublicOverview} from '../packages/shared/public.js';
import {Homepage} from '../apps/web/homepage.js';
import {Transparency} from '../apps/web/records.js';
import {AssetDialog} from '../apps/web/market.js';

let original:PublicOverview;
beforeAll(async()=>{
 const markets=JSON.parse(readFileSync(new URL('./fixtures/ember-catalogue-2026-09-23.json',import.meta.url),'utf8'));
 const configs=JSON.parse(readFileSync(new URL('./fixtures/ember-configs-2026-09-23.json',import.meta.url),'utf8'));
 original=await overview(new MarketDataService(async url=>Response.json(String(url).endsWith('/configs')?configs:markets)));
});
const home=(data:PublicOverview)=>renderToStaticMarkup(createElement(Homepage,{data,loading:false,error:'',retry(){}}));
const transparency=(data:PublicOverview)=>renderToStaticMarkup(createElement(Transparency,{data}));
describe('Orbit integration with authoritative backend records',()=>{
 it('renders ledger lamports as exact SOL and preserves unknown amounts and units',()=>{
  const data=structuredClone(original);Object.assign(data.accounting,{status:'available',unit:'lamports',opsAllocation:'1000000000',approvedExpenses:null,retainedReserve:'1',withdrawableRemainder:'0',finalizedDevPayments:'9007199254740993123456789'});
  const html=transparency(data);expect(html).toContain('<strong>1 SOL</strong>');expect(html).toContain('<strong>0.000000001 SOL</strong>');expect(html).toContain('<strong>0 SOL</strong>');expect(html).toContain('9,007,199,254,740,993.123456789 SOL');expect(html).toContain('Unreported');expect(html).not.toContain('1000000000 SOL');
  delete data.accounting.unit;expect(transparency(data)).not.toContain('<strong>1 SOL</strong>');
 });
 it('reads configured, paused and payout states without inventing a destination or delivered payment',()=>{
  const data=structuredClone(original);data.project.phase='configured';data.settlement.status='paused';data.accounting.developerPayoutEnabled=true;
  expect(home(data)).toContain('Settlement paused · inspect reward records');expect(home(data)).not.toContain('Prelaunch · rewards are not active');
  const html=transparency(data);expect(html).toContain('<dt>Project phase</dt><dd>Configured</dd>');expect(html).toContain('<dt>Settlement</dt><dd>Paused</dd>');expect(html).toContain('Enabled · subject to checks');expect(html).toContain('<dt>Developer receiving wallet</dt><dd>Not reported</dd>');expect(html).not.toContain('Payouts disabled');
  data.accounting.developerPayoutEnabled=false;expect(transparency(data)).toContain('Payouts disabled');
 });
 it('renders current selection and overlapping funded membership independently',()=>{
  const data=structuredClone(original),asset={...data.markets[0],selected:true,eligibility:'eligible' as const};data.fundedBasket={status:'funded',epochId:'immutable-test-round',fundedAt:new Date().toISOString(),policyVersion:'ember10-v2',members:[{mint:asset.mint,symbol:asset.symbol,weightBps:1000}],message:'Controlled funded fixture'};
  const html=renderToStaticMarkup(createElement(AssetDialog,{asset,data,onClose(){}}));expect(html).toContain('Current eligible selection');expect(html).toContain('Selected for next basket');expect(html).toContain('Round immutable-test-round');expect(html).not.toContain('Selected · not funded');expect(html).not.toContain('Selected · unfunded');
 });
 it('distinguishes an accepted empty observation from a source outage',()=>{
  const data=structuredClone(original);data.markets=[];data.discovery.status='ready';const html=home(data);expect(html).toContain('No ranked markets yet.');expect(html).toContain('current catalogue with no ranked assets');expect(html).not.toContain('Source unavailable');expect(html).not.toContain('No verified market response');
  data.discovery.status='unavailable';expect(home(data)).toContain('Source unavailable');expect(home(data)).not.toContain('No ranked markets yet.');
 });
});
