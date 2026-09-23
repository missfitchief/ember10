import React, { useEffect, useRef, useState } from 'react';
import type { PublicMarket, PublicOverview } from '../../packages/shared/public.js';
import { api, assertOverview, change, dateTime, eligibilityLabel, filterMarkets, logoUrl, marketCounts, marketRequestState, marketView, mergeMarketPages, money, short, sourceUrl } from './view-model.js';
import { Empty, Icon, Skeleton } from './components.js';

const logoRetryDelays = [800, 2200];
function LogoImage({ src, symbol, loading }: { src: string; symbol: string; loading: 'eager' | 'lazy' }) {
  const [{ attempt, failed }, setRequest] = useState({ attempt: 0, failed: false });
  useEffect(() => {
    if (!failed || attempt >= logoRetryDelays.length) return;
    const timer = window.setTimeout(() => setRequest(current => current.failed && current.attempt === attempt ? { attempt: attempt + 1, failed: false } : current), logoRetryDelays[attempt]);
    return () => window.clearTimeout(timer);
  }, [attempt, failed]);
  useEffect(() => {
    const online = () => setRequest(current => current.failed ? { attempt: 0, failed: false } : current);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  if (failed) return <>{symbol.slice(0, 2)}</>;
  return <img key={attempt} src={attempt ? `${src}&retry=${attempt}` : src} onError={() => setRequest(current => current.attempt === attempt ? { ...current, failed: true } : current)} alt="" loading={loading} referrerPolicy="no-referrer"/>;
}

export function Avatar({ asset, loading = 'lazy' }: { asset: PublicMarket; loading?: 'eager' | 'lazy' }) {
  const source = logoUrl(asset.imageUrl);
  const src = source?.startsWith('/api/token-image?source=') ? source : null;
  return <span className="token-icon" aria-hidden="true">{src ? <LogoImage key={JSON.stringify([asset.mint, src])} src={src} symbol={asset.symbol} loading={loading}/> : asset.symbol.slice(0, 2)}</span>;
}
export const TokenIcon = Avatar;
type MarketPage = { key: string; snapshot?: PublicOverview; busy: boolean; error: string; notice: string };

export function MarketPanel({ data, loading, error, retry }: { data?: PublicOverview; loading: boolean; error: string; retry: () => void }) {
  const [view, setView] = useState<'ranking' | 'selection' | 'funded'>('ranking');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [detail, setDetail] = useState<{ asset: PublicMarket; snapshot: PublicOverview }>();
  const [page, setPage] = useState<MarketPage>();
  const cache = useRef(new Map<string, PublicOverview>());
  const requestVersion = useRef(0);
  const requestView = view === 'selection' ? 'selection' : 'all';
  const requestKey = JSON.stringify([requestView, query.trim()]);
  const defaultRanking = view === 'ranking' && !query.trim();
  const path = (offset = 0) => `overview?view=${requestView}&q=${encodeURIComponent(query.trim())}&offset=${offset}&limit=100`;
  const matchingPage = page?.key === requestKey ? page : undefined;
  // The app already owns a valid observation. Read it on the first render, before any effect.
  const current = view === 'funded' ? data : matchingPage?.snapshot ?? (defaultRanking ? data : cache.current.get(requestKey));
  const pending = view !== 'funded' && (defaultRanking ? loading || !!matchingPage?.busy : !matchingPage || matchingPage.busy);
  const requestError = matchingPage?.error || error;
  const retainedSourceHealth = current && current !== data && data?.discovery.status !== 'ready' ? data?.discovery.status : undefined;
  const sourceFailed = retainedSourceHealth === 'stale' || retainedSourceHealth === 'unavailable';
  const state = marketRequestState(current, pending, requestError || (sourceFailed ? 'Latest source check failed' : ''));
  const model = current ? marketView(current) : null;
  const counts = current ? marketCounts(current) : null;
  const rows = current ? filterMarkets(current.markets, query, view === 'selection') : [];

  function remember(key: string, snapshot: PublicOverview) {
    if (cache.current.size >= 12 && !cache.current.has(key)) cache.current.delete(cache.current.keys().next().value!);
    cache.current.set(key, snapshot);
  }
  useEffect(() => { setLimit(20); }, [requestKey, view]);
  // Only a new query or view starts a page request. Parent polls are handled below.
  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    if (view === 'funded' || defaultRanking) {
      setPage({ key: requestKey, snapshot: data, busy: false, error: '', notice: '' });
      return () => { controller.abort(); ++requestVersion.current; };
    }
    setPage({ key: requestKey, snapshot: cache.current.get(requestKey), busy: true, error: '', notice: '' });
    const timer = setTimeout(() => {
      api<PublicOverview>(path(), controller.signal).then(assertOverview).then(value => {
        if (version !== requestVersion.current) return;
        remember(requestKey, value);
        setPage({ key: requestKey, snapshot: value, busy: false, error: '', notice: '' });
      }).catch(e => {
        if (version === requestVersion.current) setPage(previous => ({ key: requestKey, snapshot: previous?.key === requestKey ? previous.snapshot : undefined, busy: false, error: (e as Error).message, notice: '' }));
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); ++requestVersion.current; };
  }, [requestKey, view]);

  useEffect(() => {
    if (view === 'funded') return;
    setPage(previous => {
      if (previous?.key !== requestKey || !previous.snapshot) return defaultRanking ? { key: requestKey, snapshot: data, busy: false, error: '', notice: '' } : previous;
      const snapshot = previous.snapshot;
      if (defaultRanking && snapshot.markets.length <= (data?.markets.length ?? 0)) return { key: requestKey, snapshot: data, busy: false, error: '', notice: '' };
      const changed = snapshot.discovery.fetchedAt !== data?.discovery.fetchedAt || snapshot.discovery.evidenceHash !== data?.discovery.evidenceHash || snapshot.discovery.status !== data?.discovery.status || snapshot.revision !== data?.revision;
      return changed ? { ...previous, notice: 'A newer observation may be available. Your current list is retained until you refresh it.' } : previous;
    });
  }, [data]);

  async function more() {
    if (limit < rows.length) { setLimit(n => n + 30); return; }
    if (!current?.marketPage.hasMore) return;
    const version = requestVersion.current;
    setPage({ key: requestKey, snapshot: current, busy: true, error: '', notice: '' });
    try {
      const next = assertOverview(await api<PublicOverview>(path(current.marketPage.offset + current.marketPage.returned)));
      if (version !== requestVersion.current) return;
      const merged = mergeMarketPages(current, next);
      if (merged) {
        remember(requestKey, merged);
        setPage({ key: requestKey, snapshot: merged, busy: false, error: '', notice: '' }); setLimit(n => n + 30);
      } else {
        setPage({ key: requestKey, snapshot: current, busy: false, error: '', notice: 'The catalogue changed while paging. Your current list is retained. Refresh the list to start from the newest observation.' });
      }
    } catch (e) {
      if (version === requestVersion.current) setPage({ key: requestKey, snapshot: current, busy: false, error: (e as Error).message, notice: '' });
    }
  }
  function tabKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['ranking', 'selection', 'funded'] as const;
    const i = tabs.indexOf(view);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    setView(tabs[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  }
  const open = (asset: PublicMarket) => { if (current) setDetail({ asset, snapshot: current }); };
  const retryRequest = () => {
    if (defaultRanking) { setPage(undefined); setLimit(20); retry(); return; }
    // Retry the exact query without mutating the canonical selection or clearing last-good rows.
    const version = ++requestVersion.current;
    setPage({ key: requestKey, snapshot: current, busy: true, error: '', notice: '' });
    api<PublicOverview>(path()).then(assertOverview).then(snapshot => {
      if (version !== requestVersion.current) return;
      remember(requestKey, snapshot); setLimit(20); setPage({ key: requestKey, snapshot, busy: false, error: '', notice: '' });
    }).catch(e => { if (version === requestVersion.current) setPage({ key: requestKey, snapshot: current, busy: false, error: (e as Error).message, notice: '' }); });
  };
  return <section className="market-panel" aria-label="Market and reward basket">
    <div className="market-toolbar"><div className="tabs" role="tablist" aria-label="Market and basket views">{([['ranking', 'Market ranking'], ['selection', 'Eligibility'], ['funded', 'Funded basket']] as const).map(([key, label]) => <button type="button" className="tab" key={key} id={`tab-${key}`} role="tab" aria-selected={view === key} aria-controls="market-content" tabIndex={view === key ? 0 : -1} onKeyDown={tabKey} onClick={() => setView(key)}>{label}{key === 'selection' && data && <span>{data.selection.selectedCount}/10</span>}</button>)}</div>{view !== 'funded' && <label className="table-search"><Icon name="search"/><span className="sr">Search markets by name, symbol or mint</span><input maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a token or mint" autoComplete="off" spellCheck={false}/></label>}</div>
    <div className="market-source"><span><i className="dot"/>{view === 'funded' ? 'Frozen round membership' : state === 'loading' ? 'Loading observations' : state === 'stale' ? 'Stale observation' : model?.sourceLabel ?? 'Request failed'}{model && view !== 'funded' && <span className="source-time"> · {model.observedLabel}</span>}</span><span>{view === 'funded' ? 'Immutable funded record' : 'Market cap · USD'}</span></div>
    <div id="market-content" role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={0} aria-busy={pending}>
      {view === 'funded' ? data ? <FundedBasket data={data}/> : loading ? <Skeleton/> : <Empty title="Funded basket unavailable." text={error || 'No verified funded record is available.'}/> : state === 'loading' ? <Skeleton/> : state === 'failed' ? <Empty title="Market request failed." text={requestError || error || 'We could not read the source. No substitute assets are shown.'}><button className="btn" onClick={retryRequest}>Try again</button></Empty> : <>
        {requestError && current && <div className="inline-notice" role="alert">Refresh failed. The visible observations retain their last successful fetch time. <button className="btn small" onClick={retryRequest}>Retry</button></div>}
        {matchingPage?.notice && <div className="inline-notice" role="status">{matchingPage.notice} <button className="btn small" onClick={retryRequest}>Refresh list</button></div>}
        {pending && <div className="search-feedback" role="status">Refreshing these observations…</div>}
        {view === 'selection' && current && <div className="selection-summary"><strong>{model?.selectedLabel}</strong><p>{current.selection.reason}</p><span className="muted">Policy {current.selection.policyVersion}. Market rank alone does not establish eligibility.</span></div>}
        {state === 'stale' && <div className="inline-notice" role="status">Stale observation. Last successful fetch: {dateTime(current?.discovery.lastSuccessfulAt ?? current?.discovery.fetchedAt)}. New purchase commitments remain blocked.</div>}
        {retainedSourceHealth === 'warming' && <div className="inline-notice" role="status">The latest source check is warming or incomplete. Your retained list keeps its original observation time; new purchase commitments remain blocked.</div>}
        {current?.discovery.status === 'warming' && <div className="inline-notice" role="status">The catalogue is warming or incomplete. Rows are observations; new purchase commitments remain blocked.</div>}
        {counts && state !== 'unavailable' && <div className="market-counts"><span><strong>{counts.catalogue.toLocaleString()}</strong> catalogue mints</span><span><strong>{counts.ranked.toLocaleString()}</strong> ranked by market cap</span>{counts.filtered && <span><strong>{counts.matches.toLocaleString()}</strong> {view === 'selection' ? 'selection matches' : 'search matches'}</span>}<p>Unranked and excluded assets stay searchable for inspection. Search never changes selection or funded membership.</p></div>}
        {!rows.length ? <Empty title={state === 'unavailable' ? 'Market data is unavailable.' : query ? 'No matching token.' : view === 'selection' ? 'No eligible selection yet.' : state === 'warming' ? 'Waiting for market observations.' : 'No market observations reported.'} text={state === 'unavailable' ? current?.discovery.message ?? 'The source has not supplied a valid observation.' : query ? 'No catalogue mint matches this search. Try a name, symbol or full mint address.' : view === 'selection' ? current?.selection.reason ?? 'No assets passed the selection policy in this observation.' : current?.discovery.message ?? 'The source returned a valid empty result.'}>{view === 'selection' && <button className="btn" onClick={() => setView('ranking')}>Inspect market observations <Icon name="arrow"/></button>}{state === 'unavailable' && <button className="btn" onClick={retryRequest}>Try again</button>}</Empty> : <>
          <div className="market-table-wrap"><table className="market-table"><caption className="sr">Observed market-cap ranking. Eligibility and funded membership are separate records.</caption><thead><tr><th scope="col">#</th><th scope="col">Token</th><th scope="col" className="right">Market cap ↓</th><th scope="col" className="right hide-mobile">24h change</th><th scope="col" className="right hide-mid">24h volume</th><th scope="col" className="hide-mobile">Eligibility</th><th scope="col" className="detail-cell"><span className="sr">Details</span></th></tr></thead><tbody>{rows.slice(0, limit).map(asset => <tr key={asset.mint}><td className="rank num">{asset.rank ? String(asset.rank).padStart(2, '0') : '—'}</td><td><button className="token-button" onClick={() => open(asset)} aria-label={`Inspect ${asset.symbol} ${short(asset.mint)}`}><Avatar asset={asset}/><span className="token-identity"><span className="token-title">{asset.symbol}</span><span className="token-sub">{asset.name}</span><code className="token-mint">{short(asset.mint)}</code><span className="token-mobile-status status-small">{eligibilityLabel(asset)}</span></span></button></td><td className="right num market-cap" title={asset.marketCapUsd ? `${asset.marketCapUsd} USD` : 'Not reported'}>{money(asset.marketCapUsd)}<span className={`mobile-change ${asset.change24hPct?.startsWith('-') ? 'negative' : 'positive'}`}>{change(asset.change24hPct)}</span></td><td className={`right num hide-mobile ${asset.change24hPct?.startsWith('-') ? 'negative' : 'positive'}`}>{change(asset.change24hPct)}</td><td className="right num hide-mid">{money(asset.volume24hUsd)}</td><td className="hide-mobile"><span className="status-small">{eligibilityLabel(asset)}</span></td><td className="detail-cell"><button className="row-open" aria-label={`Details for ${asset.symbol} ${short(asset.mint)}`} onClick={() => open(asset)}><span>Details</span><Icon name="arrow"/></button></td></tr>)}</tbody></table></div>
          <div className="more-rows"><span>{Math.min(limit, rows.length)} shown · {counts?.matches.toLocaleString()} {counts?.filtered ? 'matches' : 'catalogue mints'}{counts && !counts.filtered ? ` · ${counts.ranked.toLocaleString()} ranked` : ''}</span>{(rows.length > limit || current?.marketPage.hasMore) && view === 'ranking' && <button className="btn small" disabled={pending || !!matchingPage?.busy} onClick={() => void more()}>Show more markets</button>}</div>
        </>}
      </>}
    </div>
    <div className="table-note">{model && <span>{model.coverageLabel}. </span>}Market rank is not basket eligibility. <a href="#transparency">View the rules <Icon name="external"/></a></div>
    {detail && <AssetDialog asset={detail.asset} data={detail.snapshot} onClose={() => setDetail(undefined)}/>}
  </section>;
}

function FundedBasket({ data }: { data: PublicOverview }) {
  const funded = data.fundedBasket;
  if (funded.status !== 'funded' || !funded.members.length) return <Empty title={funded.status === 'none' ? 'No funded basket yet.' : 'Funded basket unavailable.'} text={funded.message}/>;
  return <div className="funded-view"><div className="selection-summary"><strong>Funded round {funded.epochId}</strong><p>Frozen {dateTime(funded.fundedAt)} · policy {funded.policyVersion}</p><span>Membership belongs to this round and does not change with the market ranking.</span></div><ol className="funded-members">{funded.members.map(member => <li key={member.mint}><span><strong>{member.symbol}</strong><code>{member.mint}</code></span><b>{member.weightBps / 100}% <small>purchase budget</small></b></li>)}</ol><p className="table-note">{funded.message}</p></div>;
}

export function AssetDialog({ asset, data, onClose }: { asset: PublicMarket; data: PublicOverview; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { const returnTo = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { returnTo?.focus(); }; }, []);
  async function copy() { try { await navigator.clipboard.writeText(asset.mint); setCopied('Mint address copied.'); } catch { setCopied('Clipboard unavailable. Select the full mint address below.'); } }
  const link = sourceUrl(asset);
  return <dialog ref={dialog} aria-labelledby="asset-title" onCancel={onClose} onClose={onClose}>
    <div className="dialog-header"><div className="dialog-token"><Avatar asset={asset} loading="eager"/><div><h2 id="asset-title">{asset.symbol}</h2><p>{asset.name}</p><code className="token-mint">{short(asset.mint)}</code></div></div><button className="dialog-close" aria-label="Close asset details" onClick={onClose}><Icon name="close"/></button></div>
    <p className="dialog-note">An Ember market observation, not proof of a funded purchase or reward payment. Reported volume is separate from verified liquidity and eligibility checks.</p>
    <dl className="detail-list"><div><dt>Observed market rank</dt><dd>{asset.rank ? `#${asset.rank}` : 'Not ranked'}</dd></div><div><dt>Observed market cap</dt><dd>{money(asset.marketCapUsd, false)}</dd></div><div><dt>Reported 24h change</dt><dd>{asset.change24hPct == null ? 'Not reported' : change(asset.change24hPct)}</dd></div><div><dt>Reported 24h volume</dt><dd>{asset.volume24hUsd == null ? 'Not reported' : money(asset.volume24hUsd, false)}</dd></div><div><dt>Eligibility</dt><dd>{eligibilityLabel(asset)}</dd></div><div><dt>Current selection</dt><dd>{asset.selected ? 'Selected for next basket' : 'Not selected for next basket'}</dd></div><div><dt>Funded membership</dt><dd>{data.fundedBasket.members.some(member => member.mint === asset.mint) ? `Round ${data.fundedBasket.epochId}` : data.fundedBasket.status === 'unavailable' ? 'Unreported' : 'Not in the recorded funded basket'}</dd></div></dl>
    <div className="mint-box" tabIndex={0} aria-label="Full asset mint">{asset.mint}</div><div className="dialog-actions"><button className="btn small" onClick={copy}><Icon name="copy"/>Copy mint</button>{link && <a className="btn small" href={link} target="_blank" rel="noopener noreferrer">Inspect on Ember <Icon name="external"/></a>}</div><p className="copy-feedback" role="status">{copied}</p>
    <h3 className="detail-subtitle">Eligibility checks</h3><ul className="check-list">{asset.reasons.map((reason, i) => <li key={`${reason.code}-${i}`}><span className={`check-state ${reason.state}`}>{reason.state === 'unknown' ? 'Unverified' : reason.state === 'pass' ? 'Passed' : 'Excluded'}</span><span>{reason.label}</span></li>)}</ul>
    <details><summary>Source evidence & observation time</summary><dl className="detail-list"><div><dt>Observation status</dt><dd>{marketView(data).sourceLabel}</dd></div><div><dt>Fetched at</dt><dd>{dateTime(data.discovery.fetchedAt)}</dd></div><div><dt>Source timestamp</dt><dd>{dateTime(asset.sourceTimestamp)}</dd></div><div><dt>Market-cap basis</dt><dd>Ember marketCapUsd · USD<br/><span className="muted">Supply basis {data.discovery.supplyBasis}</span></dd></div><div><dt>Selection policy</dt><dd>{data.selection.policyVersion}</dd></div><div><dt>Canonical pool</dt><dd className="mono">{asset.canonicalPool ?? 'Not reported'}</dd></div><div><dt>Ember config</dt><dd className="mono">{asset.config ?? 'Not reported'}</dd></div><div><dt>Quote mint</dt><dd className="mono">{asset.quoteMint ?? 'Not reported'}</dd></div><div><dt>Created</dt><dd>{dateTime(asset.createdAt)}</dd></div></dl></details>
  </dialog>;
}
