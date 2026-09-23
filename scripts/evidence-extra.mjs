import fs from 'node:fs/promises';
const html=await fs.readFile('docs/evidence/ember-developers.txt','utf8');
const entry=html.match(/<script[^>]+src="([^\"]+)"/);if(!entry)throw Error('Public app entry not found; documentation site may have changed');
const entryUrl=new URL(entry[1],'https://embercurve.fun');if(entryUrl.origin!=='https://embercurve.fun')throw Error('Unexpected documentation entry origin');
const s=await(await fetch(entryUrl,{signal:AbortSignal.timeout(20000)})).text();
const paths=[...s.matchAll(/assets\/(?:Developers|How)Page-[^"']+\.js/g)].map(x=>x[0]);
for(const p of [...new Set(paths)]){const txt=await(await fetch('https://embercurve.fun/'+p)).text();await fs.writeFile('docs/evidence/'+p.split('/')[1]+'.txt',txt);console.log(p,txt.length);for(const term of ['50','requests','payouts','32%','Keep it','solana/markets']){const i=txt.indexOf(term);console.log(term,txt.slice(Math.max(i-100,0),i+500));}}
const markets=JSON.parse(await fs.readFile('docs/evidence/ember-markets.json'));
await fs.writeFile('tests/fixtures/ember-market.observed.json',JSON.stringify({observedAt:new Date().toISOString(),source:'https://embercurve.fun/api/solana/markets',data:markets.markets.slice(0,3)},null,2));
for(const p of ['fees/pool/'+markets.markets[0].pool,'holders/'+markets.markets[0].pool]){const r=await fetch('https://embercurve.fun/api/solana/'+p);const body=await r.text();await fs.writeFile('docs/evidence/ember-'+p.split('/')[0]+'.json',body);console.log(p,r.status,body.slice(0,2200));}
