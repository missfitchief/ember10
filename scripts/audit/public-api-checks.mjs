import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.argv[2],out=process.argv[3],report={at:new Date().toISOString(),origin,checks:[]};
try{
for(const [path,method,status] of [['/api/token-image?source='+encodeURIComponent('https://embercurve.fun/img/b'+'a'.repeat(52))+'&v=3','GET',404],['/api/token-image?source='+encodeURIComponent('http://127.0.0.1/a'),'GET',400],['/api/overview?limit=101','GET',400],['/api/status','POST',405],['/api/operator/pause','POST',405],['/api/operator/pause','GET',404]]){
 const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(30000)});await r.arrayBuffer();assert.equal(r.status,status,path);if(path.startsWith('/api/token-image'))assert.equal(r.headers.get('cache-control'),'no-store');report.checks.push({path,method,status:r.status,cacheControl:r.headers.get('cache-control')});
}
report.passed=true;
}catch(e){report.passed=false;report.failure=String(e.stack);process.exitCode=1;}
await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
