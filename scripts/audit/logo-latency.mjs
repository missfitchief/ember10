import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [origin,version,output]=process.argv.slice(2);
const data=await(await fetch(origin+'/api/overview?limit=10')).json();
const report={at:new Date().toISOString(),origin,version,passes:[]};
for(let pass=0;pass<2;pass++){
 const rows=await Promise.all(data.markets.map(async m=>{const start=performance.now();try{const r=await fetch(origin+'/api/token-image?source='+encodeURIComponent(m.imageUrl)+'&v='+version,{signal:AbortSignal.timeout(30000)});const body=Buffer.from(await r.arrayBuffer()),bytes=body.length,sha256=createHash('sha256').update(body).digest('hex');return {mint:m.mint,status:r.status,ms:Math.round(performance.now()-start),cache:r.headers.get('x-vercel-cache'),age:r.headers.get('age'),cacheControl:r.headers.get('cache-control'),bytes,sha256};}catch(e){return {mint:m.mint,error:String(e),ms:Math.round(performance.now()-start)}}}));
 report.passes.push({pass,medianMs:rows.map(r=>r.ms).sort((a,b)=>a-b)[5],rows});
}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.passes.map(p=>({pass:p.pass,medianMs:p.medianMs,statuses:p.rows.map(r=>r.status),caches:p.rows.map(r=>r.cache)}))));
assert(report.passes.every(p=>p.rows.every(r=>r.status===200)));
