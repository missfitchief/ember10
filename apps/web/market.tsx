import React, { useEffect, useRef, useState } from 'react';
import type { PublicMarket, PublicOverview } from '../../packages/shared/public.js';
import { api, assertOverview, change, dateTime, filterMarkets, logoUrl, marketView, mergeMarketPages, money, short, sourceUrl } from './view-model.js';
import { Empty, Icon, Skeleton } from './components.js';

function Avatar({ asset }: { asset: PublicMarket }) { const [failed,setFailed] = useState(false); const src = logoUrl(asset.imageUrl); return <span className="token-icon" aria-hidden="true">{src&&!failed?<img src={src} onError={()=>setFailed(true)} alt="" loading="lazy" referrerPolicy="no-referrer"/>:asset.symbol.slice(0,2)}</span>; }
export function MarketPanel({ data, loading, error, retry }: { data?: PublicOverview; loading: boolean; error: string; retry:()=>void }) {
  const [view,setView] = useState<'ranking'|'selection'|'funded'>('ranking');
  const [query,setQuery] = useState('');
  const [limit,setLimit] = useState(20);
  const [detail,setDetail] = useState<{ asset:PublicMarket; snapshot:PublicOverview }>();
  const [page,setPage] = useState<{ key:string; snapshot:PublicOverview }>();
  const [searching,setSearching] = useState(false);
  const [pageError,setPageError] = useState('');
  const [pageNotice,setPageNotice] = useState('');
  const requestVersion = useRef(0);
  const requestView = view==='selection'?'selection':'all';
  const requestKey = JSON.stringify([requestView,query.trim()]);
  const path = (offset=0) => `overview?view=${requestView}&q=${encodeURIComponent(query.trim())}&offset=${offset}&limit=100`;

  useEffect(()=>{
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setPageError(''); setPageNotice(''); setLimit(20);
    if(view==='funded'||!query.trim()&&view==='ranking'){
      setPage(data?{key:requestKey,snapshot:data}:undefined); setSearching(false);
      return ()=>{controller.abort(); ++requestVersion.current;};
    }
    setPage(undefined); setSearching(true);
    const timer = setTimeout(()=>{
      api<PublicOverview>(path(),controller.signal).then(assertOverview).then(value=>{
        if(version===requestVersion.current)setPage({key:requestKey,snapshot:value});
      }).catch(e=>{
        if(version===requestVersion.current)setPageError((e as Error).message);
      }).finally(()=>{
        if(version===requestVersion.current)setSearching(false);
      });
    },300);
    return ()=>{clearTimeout(timer);controller.abort();++requestVersion.current;};
  },[query,view,data]);

  const current = view==='funded'?data:page?.key===requestKey?page.snapshot:undefined;
  const model = current ? marketView(current) : null;
  const rows = current ? filterMarkets(current.markets,query,view==='selection') : [];
  async function more(){
    if(limit<rows.length){setLimit(n=>n+30);return;}
    if(!current?.marketPage.hasMore)return;
    const version = requestVersion.current;
    setSearching(true);setPageError('');setPageNotice('');
    try{
      const next = assertOverview(await api<PublicOverview>(path(current.marketPage.offset+current.marketPage.returned)));
      if(version!==requestVersion.current)return;
      const merged = mergeMarketPages(current,next);
      if(merged){setPage({key:requestKey,snapshot:merged});setLimit(n=>n+30);}
      else {
        // Refetch page one rather than splice together ranks from two catalogue observations.
        setPageNotice('The catalogue changed while paging. Refreshing the first page; observations will not be mixed.');
        const fresh = assertOverview(await api<PublicOverview>(path()));
        if(version!==requestVersion.current)return;
        setPage({key:requestKey,snapshot:fresh});setLimit(20);
        setPageNotice('The catalogue changed while paging. Showing the newest first page.');
      }
    }catch(e){if(version===requestVersion.current)setPageError((e as Error).message);}
    finally{if(version===requestVersion.current)setSearching(false);}
  }
  function tabKey(event: React.KeyboardEvent<HTMLButtonElement>) { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const tabs = ['ranking','selection','funded'] as const; const i = tabs.indexOf(view); const next = event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3; setView(tabs[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
  return <section className="market-panel" aria-label="Market and reward basket"><div className="market-toolbar"><div className="tabs" role="tablist" aria-label="Market and basket views">{([['ranking','Market ranking'],['selection','Eligibility'],['funded','Funded basket']] as const).map(([key,label])=><button type="button" className="tab" key={key} id={`tab-${key}`} role="tab" aria-selected={view===key} aria-controls="market-content" tabIndex={view===key?0:-1} onKeyDown={tabKey} onClick={()=>setView(key)}>{label}{key==='selection'&&current&&<span>{current.selection.selectedCount}/10</span>}</button>)}</div>{view!=='funded'&&<label className="table-search"><Icon name="search"/><span className="sr">Search markets by name, symbol or mint</span><input value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}} placeholder="Find a token or mint" autoComplete="off" spellCheck={false}/></label>}</div>
    <div className="market-source"><span><i className="dot"/>{loading&&!data?'Connecting to source':model?.sourceLabel??'Source unavailable'}{model&&<span className="source-time">· {model.observedLabel}</span>}</span><span>Market cap · USD</span></div>
    <div id="market-content" role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={0}>
      {loading&&!data?<Skeleton/>:!data?<Empty title="Market data is unavailable." text={error||'We cannot verify the ranking right now. No substitute tokens are shown.'}><button className="btn" onClick={retry}>Try again</button></Empty>:view==='funded'?<FundedBasket data={data}/>:<>
        {pageError&&<div className="inline-notice" role="alert">{pageError} Results could not be refreshed; any visible rows retain their displayed observation time.</div>}{pageNotice&&<div className="inline-notice" role="status">{pageNotice}</div>}{searching&&<div className="search-feedback" role="status">Searching the complete observed catalogue…</div>}
        {view==='selection'&&current&&<div className="selection-summary"><strong>{model?.selectedLabel}</strong><p>{current.selection.reason}</p><span className="muted">Policy {current.selection.policyVersion}. Market rank alone does not establish eligibility.</span></div>}
        {current?.discovery.status==='stale'&&<div className="inline-notice" role="status">Last successful fetch: {dateTime(current?.discovery.lastSuccessfulAt)}. These observations are stale; new purchase commitments remain blocked.</div>}
        {current?.discovery.status==='warming'&&<div className="inline-notice" role="status">The catalogue is warming or incomplete. Rows are observations; new purchase commitments remain blocked.</div>}
        {!rows.length?<Empty title={searching?'Searching market observations…':pageError?'Search unavailable.':query?'No matching token.':view==='selection'?'No eligible selection yet.':current?.discovery.status==='unavailable'?'Market data is unavailable.':'No ranked assets reported.'} text={query?'Search reads the complete observed catalogue and cannot change the canonical selection.':view==='selection'?current?.selection.reason??'Selection data is unavailable.':current?.discovery.message??'Market data is unavailable.'}>{view==='selection'&&<button className="btn" onClick={()=>setView('ranking')}>Inspect market observations <Icon name="arrow"/></button>}{current?.discovery.status==='unavailable'&&<button className="btn" onClick={retry}>Try again</button>}</Empty>:<><div className="market-table-wrap"><table className="market-table"><caption className="sr">Observed market-cap ranking. Eligibility and funded membership are separate records.</caption><thead><tr><th scope="col">#</th><th scope="col">Token</th><th scope="col" className="right">Market cap ↓</th><th scope="col" className="right hide-mobile">24h change</th><th scope="col" className="right hide-mid">24h volume</th><th scope="col" className="hide-mobile">Eligibility</th><th scope="col" className="detail-cell"><span className="sr">Details</span></th></tr></thead><tbody>{rows.slice(0,limit).map(asset=><tr key={asset.mint}><td className="rank num">{asset.rank?String(asset.rank).padStart(2,'0'):'—'}</td><td><button className="token-button" onClick={()=>current&&setDetail({asset,snapshot:current})} aria-label={`Inspect ${asset.symbol} ${short(asset.mint)}`}><Avatar asset={asset}/><span className="token-identity"><span className="token-title">{asset.symbol}</span><span className="token-sub">{asset.name||short(asset.mint)}</span></span></button></td><td className="right num market-cap" title={asset.marketCapUsd?`${asset.marketCapUsd} USD`:'Not reported'}>{money(asset.marketCapUsd)}<span className={`mobile-change ${asset.change24hPct?.startsWith('-')?'negative':'positive'}`}>{change(asset.change24hPct)}</span></td><td className={`right num hide-mobile ${asset.change24hPct?.startsWith('-')?'negative':'positive'}`}>{change(asset.change24hPct)}</td><td className="right num hide-mid">{money(asset.volume24hUsd)}</td><td className="hide-mobile"><span className="status-small">{asset.selected?'Selected · unfunded':asset.eligibility==='eligible'?'Eligible':asset.eligibility==='excluded'?'Excluded':'Not verified'}</span></td><td className="detail-cell"><button className="row-open" aria-label={`Details for ${asset.symbol} ${short(asset.mint)}`} onClick={()=>current&&setDetail({asset,snapshot:current})}><Icon name="external"/></button></td></tr>)}</tbody></table></div>{(rows.length>limit||current?.marketPage.hasMore)&&view==='ranking'&&<div className="more-rows"><span>{Math.min(limit,rows.length)} shown · {current?.marketPage.totalMatches.toLocaleString()} matches</span><button className="btn small" disabled={searching} onClick={()=>void more()}>Show more markets</button></div>}</>}
      </>}
    </div><div className="table-note">{model&&<span>{model.coverageLabel}. </span>}Market rank is not basket eligibility. <a href="#transparency">View the rules <Icon name="external"/></a></div>
    {detail&&<AssetDialog asset={detail.asset} data={detail.snapshot} onClose={()=>setDetail(undefined)}/>}
  </section>;
}
function FundedBasket({data}:{data:PublicOverview}) { const funded=data.fundedBasket; if(funded.status!=='funded'||!funded.members.length)return <Empty title={funded.status==='none'?'No funded basket yet.':'Funded basket unavailable.'} text={funded.message}/>; return <div className="funded-view"><div className="selection-summary"><strong>Funded round {funded.epochId}</strong><p>Frozen {dateTime(funded.fundedAt)} · policy {funded.policyVersion}</p><span>Membership belongs to this round and does not change with the market ranking.</span></div><ol className="funded-members">{funded.members.map(member=><li key={member.mint}><span><strong>{member.symbol}</strong><code>{member.mint}</code></span><b>{member.weightBps/100}% <small>purchase budget</small></b></li>)}</ol><p className="table-note">{funded.message}</p></div>; }
function AssetDialog({asset,data,onClose}:{asset:PublicMarket;data:PublicOverview;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null); const [copied,setCopied]=useState('');
  useEffect(()=>{const returnTo=document.activeElement as HTMLElement|null; dialog.current?.showModal(); return()=>{returnTo?.focus();};},[]);
  async function copy(){try{await navigator.clipboard.writeText(asset.mint);setCopied('Mint address copied.');}catch{setCopied('Clipboard unavailable. Select the full mint address above.');}}
  const link=sourceUrl(asset);
  return <dialog ref={dialog} aria-labelledby="asset-title" onCancel={onClose} onClose={onClose}><div className="dialog-header"><div className="dialog-token"><Avatar asset={asset}/><div><h2 id="asset-title">{asset.symbol}</h2><p>{asset.name}</p></div></div><button className="dialog-close" aria-label="Close asset details" onClick={onClose}><Icon name="close"/></button></div><dl className="detail-list"><div><dt>Observed market rank</dt><dd>{asset.rank?`#${asset.rank}`:'Not ranked'}</dd></div><div><dt>Observed market cap</dt><dd>{money(asset.marketCapUsd,false)}</dd></div><div><dt>Market-cap basis</dt><dd>Ember marketCapUsd · USD<br/><span className="muted">Supply basis {data.discovery.supplyBasis}</span></dd></div><div><dt>Fetched at</dt><dd>{dateTime(data.discovery.fetchedAt)}</dd></div><div><dt>Source timestamp</dt><dd>{dateTime(asset.sourceTimestamp)}</dd></div><div><dt>Eligibility</dt><dd>{asset.eligibility==='unknown'?'Not verified':asset.eligibility}</dd></div><div><dt>Selection policy</dt><dd>{data.selection.policyVersion}</dd></div><div><dt>Purchase commitment</dt><dd>{asset.selected?'Selected · not funded':'Not selected'}</dd></div></dl><div className="mint-box" tabIndex={0} aria-label="Full asset mint">{asset.mint}</div><div className="dialog-actions"><button className="btn small" onClick={copy}><Icon name="copy"/>Copy mint</button>{link&&<a className="btn small" href={link} target="_blank" rel="noopener noreferrer">Inspect on Ember <Icon name="external"/></a>}</div><p className="copy-feedback" role="status">{copied}</p><div className="dialog-note">Observed on Ember. This rank does not establish on-chain provenance, a funded purchase or a reward payment.</div><h3 className="detail-subtitle">Eligibility checks</h3><ul className="check-list">{asset.reasons.map((reason,i)=><li key={`${reason.code}-${i}`}><span className={`check-state ${reason.state}`}>{reason.state==='unknown'?'Unverified':reason.state==='pass'?'Passed':'Excluded'}</span><span>{reason.label}</span></li>)}</ul><details><summary>Source evidence</summary><dl className="detail-list"><div><dt>Canonical pool</dt><dd className="mono">{asset.canonicalPool??'Not reported'}</dd></div><div><dt>Ember config</dt><dd className="mono">{asset.config??'Not reported'}</dd></div><div><dt>Quote mint</dt><dd className="mono">{asset.quoteMint??'Not reported'}</dd></div><div><dt>Created</dt><dd>{dateTime(asset.createdAt)}</dd></div></dl></details></dialog>;
}
