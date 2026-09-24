import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicOverview } from '../../packages/shared/public.js';
import { api, assertOverview, phaseLabel, routeFromHash, routes, type Route } from './view-model.js';
import { Allocation, Brand, Icon, Intro } from './components.js';
import { Homepage } from './homepage.js';
import { LogoRecoveryContext, MarketPanel } from './market.js';
import { Rewards, Transparency, Wallet } from './records.js';
import './style.css';
import './orbit.css';

function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(location.hash));
  const [data, setData] = useState<PublicOverview>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const previousRoute = useRef(route);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  async function reload() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try { const overview = assertOverview(await api<PublicOverview>('overview', controller.signal)); if (mounted.current) { setData(overview); setError(''); } }
    catch (e) { if (mounted.current) { setError(controller.signal.aborted ? 'The source took too long to respond. Please retry.' : (e as Error).message); setData(current => current ? { ...current, discovery: { ...current.discovery, status: 'stale', message: 'Refresh failed. Showing the previous real observation.' }, selection: { ...current.selection, commitmentsAllowed: false } } : undefined); } }
    finally { request.current = null; if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void reload(); const interval = setInterval(reload, 45000); return () => { mounted.current = false; clearInterval(interval); request.current?.abort(); }; }, []);
  useEffect(() => {
    function routeChanged() { if (location.hash === '#main') { document.getElementById('main')?.focus(); return; } setRoute(routeFromHash(location.hash)); setMenu(false); }
    addEventListener('hashchange', routeChanged); return () => removeEventListener('hashchange', routeChanged);
  }, []);
  useEffect(() => {
    document.title = route === 'overview' ? 'EMBER10 — One token. Ten possibilities.' : `EMBER10 — ${routes[route]}`;
    if (previousRoute.current !== route) { previousRoute.current = route; window.scrollTo({ top: 0, behavior: 'instant' }); document.getElementById('main')?.focus({ preventScroll: true }); setAnnouncement(`${routes[route]} page`); }
  }, [route]);
  useEffect(() => { if (!menu) return; function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } } addEventListener('keydown', dismiss); return () => removeEventListener('keydown', dismiss); }, [menu]);
  const navigation = (mobile = false) => (mobile ? Object.keys(routes) : ['basket', 'rewards', 'how', 'transparency']).map(key => {
    const destination = key as Route;
    return <a key={destination} href={`#${destination}`} onClick={() => setMenu(false)} aria-current={route === destination ? 'page' : undefined} className={`nav-item ${route === destination ? 'active' : ''}`}>{mobile && <Icon name={destination} />}{routes[destination]}</a>;
  });
  const logoRecovery = data && ['ready', 'warming'].includes(data.discovery.status) ? data.discovery.fetchedAt : null;
  return <LogoRecoveryContext.Provider value={logoRecovery}>
    <a className="skip" href="#main" onClick={event=>{event.preventDefault();const main=document.getElementById('main');main?.focus({preventScroll:true});main?.scrollIntoView({behavior:'instant'});}}>Skip to content</a>
    <header className="site-header"><div className="header-inner"><Brand /><nav className="desktop-navigation" aria-label="Main navigation">{navigation()}</nav><div className="header-actions"><span className="pill gold"><i className="dot" />{phaseLabel(data)}</span><a className="btn small desktop-action" href="#wallet" aria-current={route === 'wallet' ? 'page' : undefined}>My rewards <Icon name="arrow" /></a><div className="mobile-menu"><button ref={menuButton} aria-label={menu ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menu} aria-controls="mobile-menu-links" className="menu-button" onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button><nav id="mobile-menu-links" aria-label="Mobile navigation" hidden={!menu}>{navigation(true)}</nav></div></div></div></header>
    <div className="sr" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    <main id="main" tabIndex={-1}>
      {error && <div className="connection-error" role="alert"><span><strong>{data ? 'Background market check failed.' : 'Connection unavailable.'}</strong> {data ? 'Each displayed list retains its own successful observation and original fetch time.' : error}</span><button className="btn small" onClick={() => void reload()}>Retry</button></div>}
      {route === 'overview' && <Homepage data={data} loading={loading} error={error} retry={() => void reload()} />}
      {route === 'basket' && <><Intro eyebrow="THE EMBER ECOSYSTEM" title="Explore the ten." text="Inspect market observations, eligibility and funded rounds." /><MarketPanel data={data} loading={loading} error={error} retry={() => void reload()} /></>}
      {route === 'rewards' && <Rewards data={data} />}{route === 'wallet' && <Wallet data={data} />}{route === 'transparency' && <Transparency data={data} />}
      {route === 'how' && <><Intro eyebrow="A simple idea. A visible process." title="From creator fees to holder rewards." text="The proposed system turns received creator fees into ten equal purchase budgets. Rewards depend on actual funding and verified eligibility; holding EMBER10 does not guarantee a return." /><div className="rule-list">{[['01 / RECEIVE', 'Start with received fees.', 'Verified creator fees enter the treasury. Direct execution costs and existing obligations are accounted for first.'], ['02 / PURCHASE', 'Ten budgets. Equal weight.', '80% of net new creator fees funds equal purchases of ten eligible Ember tokens. All ten must pass the policy before new commitments.'], ['03 / CREDIT', 'Account for every share.', 'Actual acquired units are credited by eligible snapshot balance. Small rewards accumulate until economical to deliver.']].map(([number, title, text]) => <article className="panel" key={number}><span className="rule-index">{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="lower-grid"><Allocation /><article className="panel how-dev"><div className="eyebrow muted">Operations & developer</div><h3>A remainder, never an extra fee.</h3><p>The final 10% covers operations and developer compensation. Only the available OPS/DEV remainder after recorded costs, obligations and retained reserves may be paid to a configured receiving wallet.</p><p>Holder rewards and buyback funds stay separate. Existing credits remain owed after selling.</p><a className="link-inline panel-link" href="#transparency">Inspect accounting rules <Icon name="arrow" /></a></article></div></>}
      <footer className="footer"><div className="footer-brand"><Brand /><span className="contract-state">{data ? data.project.mint ? 'Contract verification pending' : 'Prelaunch · not deployed' : 'Project identity pending'}</span></div><div className="footer-copy"><p>Independent of Ember. Rewards depend on received fees; EMBER10 controls the treasury. No guaranteed returns or redemption.</p>{data?.project.mint && <p className="mono break">Project mint: {data.project.mint}</p>}</div><div className="footer-links"><a href="#transparency">Rules & transparency <Icon name="external" /></a><a href="https://embercurve.fun/" target="_blank" rel="noopener noreferrer">Explore Ember <Icon name="external" /></a></div></footer>
    </main>
  </LogoRecoveryContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App />);
