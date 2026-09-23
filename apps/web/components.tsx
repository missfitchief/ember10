import React from 'react';
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    basket: <><path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/></>,
    rewards: <><path d="M4 3v17h17M7 15l4-6 4 3 6-8"/></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18M16 12h5v5h-5z"/></>,
    transparency: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, external: <path d="M6 18 18 6M6 6h12v12"/>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>, close: <path d="m6 6 12 12M6 18 18 6"/>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    how: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.how}</svg>;
}
export function Brand({ mobile = false }: { mobile?: boolean }) { return <a className={`brand ${mobile?'mobile-brand':''}`} href="#overview" aria-label="EMBER10 home"><span className="mark" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i}/>)}</span><span>ember <em>10</em></span></a>; }
export function Empty({ title, text, icon = 'basket', children }: { title: string; text: string; icon?: string; children?: React.ReactNode }) { return <div className="empty"><div className="empty-icon"><Icon name={icon}/></div><h3>{title}</h3><p>{text}</p>{children}</div>; }
export function Intro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <header className="page-intro"><div className="eyebrow accent">{eyebrow}</div><h1>{title}</h1><p>{text}</p></header>; }
export function Allocation() { return <article className="panel"><div className="eyebrow muted">Fees with a purpose</div><h3>Every share has a destination.</h3><div className="allocation-track" role="img" aria-label="80 percent rewards, 10 percent buyback and burn, 10 percent operations and developer"><span/><span/><span/></div><div className="allocation-lines">{[['The ten · holder rewards','80%',''],['EMBER10 buyback & burn','10%','neutral'],['Operations + developer','10%','gold']].map(([label,value,color])=><div className="allocation-line" key={label}><span className={`swatch ${color}`}/><span className="muted">{label}</span><strong>{value}</strong></div>)}</div><p className="fineprint">Applied after direct execution costs. Developer earnings are the available OPS/DEV remainder after recorded costs, obligations and retained reserves.</p></article>; }
export function Skeleton() { return <div className="market-skeleton" role="status" aria-label="Loading market observations">{Array.from({length:6},(_,i)=><div className="skeleton-row" aria-hidden="true" key={i}><span className="skeleton avatar"/><span className="skeleton wide"/><span className="skeleton"/></div>)}</div>; }
