/** After npm ci and npm run build: node scripts/audit-public.mjs <origin> <output.json> */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const deployment=JSON.parse(await readFile(new URL('../docs/deployment.json',import.meta.url),'utf8'));
const origin=process.argv[2]??deployment.url,output=process.argv[3];if(!output)throw Error('Supply an output JSON file outside the repository');
const target=new URL(origin);assert.equal(target.protocol,'https:');assert.equal(target.origin,origin);assert.equal(target.username,'');assert.equal(target.password,'');
const report={at:new Date().toISOString(),origin,revision:deployment.deployedApplicationRevision,assets:[],logos:[]};
async function get(path){const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path);return response;}
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const status=await(await get('/api/status')).json();assert.equal(status.revision,report.revision);assert.equal(status.mode,'prelaunch');assert.equal(status.broadcastEnabled,false);assert.equal(status.workerActive,false);assert.equal(status.paused,true);report.status=status;
 const data=await(await get('/api/overview?limit=10')).json();assert.equal(data.project.dataMode,'real');assert.equal(data.project.mint,null);assert.equal(data.selection.commitmentsAllowed,false);assert.equal(data.markets.length,10);report.observedAt=data.discovery.fetchedAt;
 const root=new URL('../dist/web/',import.meta.url),names=await readdir(new URL('assets/',root));
 for(const path of ['index.html',...names.map(n=>'assets/'+n),'favicon.svg','ember10-share.png','ember10-share.svg']){const expected=await readFile(new URL(path,root)),actual=Buffer.from(await(await get('/'+path)).arrayBuffer());assert.equal(hash(actual),hash(expected),path);report.assets.push({path,bytes:actual.length,sha256:hash(actual)});}
 for(const market of data.markets){const response=await get('/api/token-image?source='+encodeURIComponent(market.imageUrl)+'&v=3'),bytes=Buffer.from(await response.arrayBuffer()),meta=await sharp(bytes).metadata();assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(meta.format,'webp');assert(meta.width>0&&meta.width<=160&&meta.height>0&&meta.height<=160);report.logos.push({mint:market.mint,bytes:bytes.length,width:meta.width,height:meta.height,sha256:hash(bytes)});}
 report.passed=true;
}catch(error){report.passed=false;report.failure=String(error.stack);process.exitCode=1;}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,revision:report.revision,assets:report.assets.length,logos:report.logos.length,failure:report.failure}));
