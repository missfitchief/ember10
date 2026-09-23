/** Inspect the actual response without running app JavaScript, as a social crawler would. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const [base, canonical, output] = process.argv.slice(2);
assert(base && canonical && output, 'Usage: node scripts/verify-sharing.mjs <served-origin> <canonical-origin> <proof.json>');
const expected = new URL('/',canonical).href;
const response = await fetch(new URL('/',base), {headers:{'user-agent':'Twitterbot/1.0'},signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const html = await response.text();
assert(!html.includes('__PUBLIC_SITE_URL__'));
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([,key,value])=>[key.toLowerCase(),value]));
const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag])=>attrs(tag));
const meta = Object.fromEntries(tags.filter(t=>t.property||t.name).map(t=>[t.property??t.name,t.content]));
const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag])=>attrs(tag));
assert.equal(links.find(link=>link.rel==='canonical')?.href,expected);
assert.equal(meta['og:url'],expected);
assert.equal(meta['og:type'],'website');
assert.equal(meta['og:site_name'],'EMBER10');
assert.match(meta['og:description'],/Prelaunch.*rewards are not active yet/);
assert.equal(meta['twitter:card'],'summary_large_image');
assert.match(meta['twitter:description'],/Prelaunch/);
assert.equal(meta['og:image'],expected+'ember10-share.png');
assert.equal(meta['twitter:image'],meta['og:image']);
assert(meta['og:image:alt'] && meta['twitter:image:alt']);
// Local previews retain production canonical URLs; fetch their corresponding local static asset.
const imageUrl = new URL(new URL(meta['og:image']).pathname,base);
const imageResponse = await fetch(imageUrl,{signal:AbortSignal.timeout(30000)});
assert.equal(imageResponse.status,200);
assert.match(imageResponse.headers.get('content-type')??'',/image\/png/);
const bytes = Buffer.from(await imageResponse.arrayBuffer());
assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
assert.equal(width,1200); assert.equal(height,630);
assert.equal(meta['og:image:width'],String(width)); assert.equal(meta['og:image:height'],String(height));
const proof = {verifiedAt:new Date().toISOString(),servedOrigin:base,canonical:expected,htmlStatus:response.status,
  initialHtmlMetadata:meta,image:{url:imageUrl.href,width,height,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},passed:true,
  scope:'Initial HTML and original share image verified without executing JavaScript. External social-network cache refresh is not asserted.'};
await writeFile(output,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({passed:true,canonical:expected,image:{width,height},output}));
