import React, { useEffect, useRef, useState } from 'react';
import type { PublicMarket, PublicOverview } from '../../packages/shared/public.js';
import { Flame, Icon } from './components.js';
import { AssetDialog, Avatar } from './market.js';
import { change, dateTime, money, rewardStatusLabel, short, units } from './view-model.js';
import { observedTen } from './orbit-model.js';

// Positions describe artwork only. Token identities and ranks always come from the API.
const positions = [[26, 13], [50, 7], [74, 13], [9, 39], [91, 39], [10, 69], [90, 69], [26, 91], [50, 97], [74, 91]];
type Inspect = (asset: PublicMarket) => void;

function Constellation({ assets, inspect, loading }: { assets: PublicMarket[]; inspect: Inspect; loading: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);
  const [active, setActive] = useState<number>();
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (scene.current) observer.observe(scene.current);
    return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); observer.disconnect(); };
  }, []);
  const still = paused || reduced || !inView || !visible;
  return <div className={`constellation ${still ? 'is-still' : ''}`} ref={scene}>
    <div className="orbit-stage" aria-label="Ten leading observed Ember markets">
      <div className="orbit-aura" aria-hidden="true" />
      <div className="orbit-ring ring-one" aria-hidden="true" /><div className="orbit-ring ring-two" aria-hidden="true" />
      <svg className="orbit-wires" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
        {positions.map(([x, y], i) => {
          const path = `M500 218 Q${500 + (x * 10 - 500) * .58} ${218 + (y * 4.2 - 218) * .12} ${x * 10} ${y * 4.2}`;
          return <g key={i} className={active === i ? 'wire-active' : ''}><path className="orbit-wire" d={path} /><path className="orbit-signal" d={path} pathLength="100" style={{ animationDelay: `${i * -.63}s` }} /></g>;
        })}
      </svg>
      <div className="ember-core" aria-hidden="true"><div className="core-halo" /><div className="core-tile"><div className="core-shine" /><Flame /><span className="core-ten">10</span></div><span className="core-name">EMBER<span>10</span></span><span className="core-caption">ONE INTO TEN</span></div>
      {positions.map(([x, y], i) => {
        const asset = assets[i];
        const style = { '--x': `${x}%`, '--y': `${y}%`, '--drift': `${5.8 + (i % 4) * .6}s`, '--delay': `${i * -.79}s` } as React.CSSProperties;
        return <div className={`orbit-position position-${i} ${active === i ? 'is-active' : ''}`} key={asset?.mint ?? `slot-${i}`} style={style}>
          {asset ? <button className="orbit-token" onClick={() => inspect(asset)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(undefined)} onFocus={() => setActive(i)} onBlur={() => setActive(undefined)} aria-label={`Inspect ${asset.symbol}, rank ${asset.rank}, mint ${asset.mint}`}><span className="orbit-rank">{String(asset.rank).padStart(2, '0')}</span><Avatar asset={asset} loading="eager" /><span className="orbit-token-text"><strong>{asset.symbol}</strong><small>{money(asset.marketCapUsd)}</small></span><span className="orbit-peek" aria-hidden="true"><Icon name="external" /></span></button> : <div className="orbit-token orbit-placeholder" aria-label={`Market slot ${i + 1}: ${loading ? 'loading' : 'unavailable'}`}><span className="placeholder-coin">{String(i + 1).padStart(2, '0')}</span><span className="orbit-token-text"><strong>{loading ? 'Loading' : 'Awaiting data'}</strong><small>Ember market</small></span></div>}
        </div>;
      })}
    </div>
    <div className="orbit-caption"><span>Market leaders. <span className="caption-muted">Not funded holdings.</span></span><button className="motion-toggle" onClick={() => setPaused(value => !value)} aria-pressed={paused || reduced} disabled={reduced} aria-label={reduced ? 'Reduced motion enabled by your device' : paused ? 'Resume token animation' : 'Pause token animation'}><Icon name={paused || reduced ? 'play' : 'pause'} /><span>{reduced ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion'}</span></button></div>
  </div>;
}

function MarketList({ assets, inspect }: { assets: PublicMarket[]; inspect: Inspect }) {
  return <div className="ten-list">{[assets.slice(0, 5), assets.slice(5, 10)].map((group, i) => <div className="ten-list-column" key={i}><div className="ten-column-label" aria-hidden="true"><span>TOKEN / RANK</span><span>MARKET CAP · 24H</span></div>{group.map(asset => <button className="ten-row" key={asset.mint} onClick={() => inspect(asset)} aria-label={`Details for ${asset.symbol}, mint ${asset.mint}`}><span className="ten-row-rank">{String(asset.rank).padStart(2, '0')}</span><Avatar asset={asset} /><span className="ten-row-identity"><strong>{asset.symbol}</strong><code>{short(asset.mint)}</code></span><span className="ten-row-values"><strong>{money(asset.marketCapUsd)}</strong><small className={asset.change24hPct?.startsWith('-') ? 'negative' : asset.change24hPct == null ? 'muted' : 'positive'}>{change(asset.change24hPct)}</small></span><Icon name="external" /></button>)}</div>)}</div>;
}

export function Homepage({ data, loading, error, retry }: { data?: PublicOverview; loading: boolean; error: string; retry: () => void }) {
  const [detail, setDetail] = useState<{ asset: PublicMarket; snapshot: PublicOverview }>();
  const observations = observedTen(data?.markets ?? []);
  const inspect: Inspect = asset => { if (data) setDetail({ asset, snapshot: data }); };
  const stale = data?.discovery.status === 'stale';
  const validEmpty = data?.discovery.status === 'ready' && !observations.length;
  const sourceLabel = stale ? 'Stale data' : data?.discovery.status === 'warming' ? 'Partial catalogue' : data?.discovery.status === 'unavailable' ? 'Source unavailable' : validEmpty ? 'No ranked markets' : observations.length ? 'Ember market data' : loading ? 'Connecting to Ember' : 'Source unavailable';
  const scrollToTen = () => document.getElementById('the-ten')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  return <div className="orbit-home">
    <section className="orbit-hero" aria-labelledby="hero-title"><div className="hero-kicker"><svg className="tiny-spark" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6"/></svg> THE EMBER ECOSYSTEM, TOGETHER</div><h1 id="hero-title">One token.<br /><span>Ten possibilities.</span></h1><p className="orbit-description">Creator fees. Ten Ember tokens. Your share.</p><Constellation assets={observations} inspect={inspect} loading={loading && !data} />
      <div className="orbit-actions"><button className="btn primary orbit-cta" onClick={scrollToTen}>Meet the ten <Icon name="arrow" /></button><a className="btn orbit-secondary" href="#wallet">My rewards <Icon name="wallet" /></a></div>
      <p className="orbit-eligibility">{data ? <><strong>{units(data.policy.holderUnits, 0)} EMBER10</strong> to qualify <span>·</span> No staking</> : loading ? 'Eligibility loading…' : 'Eligibility unavailable'}<a href="#how" aria-label="How EMBER10 rewards work"><Icon name="how" /></a></p>
      <a className="orbit-prelaunch" href="#transparency">{rewardStatusLabel(data)} <Icon name="external" /></a>
    </section>
    <section id="the-ten" className="orbit-markets" aria-labelledby="ten-title"><div className="orbit-section-heading"><div><div className="eyebrow">THE CURRENT LINEUP</div><h2 id="ten-title">Ten worth watching<span>.</span></h2></div><a href="#basket" className="text-link">All markets <Icon name="arrow" /></a></div><div className="orbit-source"><span className={stale ? 'source-stale' : ''}><i className="dot" />{sourceLabel}{loading && !!data ? ' · refreshing' : ''}</span><span>{data?.discovery.fetchedAt && <time dateTime={data.discovery.fetchedAt} title={dateTime(data.discovery.fetchedAt)}>{new Date(data.discovery.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</time>}<span className="refresh-label"> · Refreshes every 45s</span></span></div>
      {observations.length ? <MarketList assets={observations} inspect={inspect} /> : <div className="orbit-no-data" role="status"><Flame /><h3>{validEmpty ? 'No ranked markets yet.' : loading ? 'Finding the sparks…' : 'Waiting for Ember.'}</h3><p>{validEmpty ? 'Ember returned a current catalogue with no ranked assets.' : loading ? 'Reading the current market ranking.' : 'A current market ranking is unavailable. Try again shortly.'}</p>{!loading && <button className="btn small" onClick={retry}>Refresh markets <Icon name="refresh" /></button>}</div>}
      <div className="orbit-market-foot"><span>{stale ? 'Last available ranking. ' : data?.discovery.status === 'warming' ? 'Incomplete catalogue. ' : ''}Observed market cap · eligibility checked separately.</span><a href="#basket">{data ? `${data.selection.selectedCount}/10 selected` : 'Selection pending'} <Icon name="arrow" /></a></div>
    </section>
    <section className="orbit-flow" aria-labelledby="flow-title"><div className="orbit-flow-intro"><span className="eyebrow">A SIMPLE SPLIT</span><h2 id="flow-title">Small sparks.<br />Shared upside.</h2><a className="text-link" href="#how">How it works <Icon name="arrow" /></a></div><div className="split-visual"><div className="split-track" role="img" aria-label="Proposed split after direct costs: 80 percent holder rewards, 10 percent buyback and burn, 10 percent operations and developer">{Array.from({ length: 10 }, (_, i) => <span key={i} className={i < 8 ? 'split-reward' : i === 8 ? 'split-burn' : 'split-ops'} />)}</div><div className="split-labels"><div><strong>80<span>%</span></strong><span><i className="dot" />Holder rewards</span></div><div><strong>10<span>%</span></strong><span><i className="dot" />Buyback & burn</span></div><div><strong>10<span>%</span></strong><span><i className="dot" />Ops & dev</span></div></div><p>After direct costs. <a href="#transparency">See the full accounting <Icon name="external" /></a></p></div></section>
    {detail && <AssetDialog asset={detail.asset} data={detail.snapshot} onClose={() => setDetail(undefined)} />}
  </div>;
}
