import {mkdir,writeFile} from 'node:fs/promises';
const dir = new URL('../docs/evidence/', import.meta.url); await mkdir(dir,{recursive:true});
const urls = [
 ['ember-developers','https://embercurve.fun/developers'], ['ember-how','https://embercurve.fun/how'],
 ...['markets','quotes','configs','payouts','pools.csv'].map(x=>['ember-'+x.replace('.csv',''),'https://embercurve.fun/api/solana/'+x]),
 ['jupiter-build-docs','https://developers.jup.ag/docs/swap/build.md'],
 ['jupiter-rates','https://developers.jup.ag/docs/api-rate-limit.md'],
 ['jupiter-unauthenticated','https://api.jup.ag/swap/v2/order?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000']
];
const index=[];
for(const [name,url] of urls){
 const observedAt=new Date().toISOString();
 try {const r=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.byteLength;if(size>12000000)throw Error('response too large');chunks.push(Buffer.from(chunk));}const body=Buffer.concat(chunks).toString('utf8');
 const file=name+(r.headers.get('content-type')?.includes('json')?'.json':'.txt');
 await writeFile(new URL(file,dir),body); index.push({url,observedAt,status:r.status,contentType:r.headers.get('content-type'),bytes:body.length,file});
 console.log(name,r.status,body.length,body.slice(0,150).replace(/\s+/g,' '));
 }catch(e){index.push({url,observedAt,error:e.message}); console.log(name,'unavailable',e.message);}
}
await writeFile(new URL('index.json',dir),JSON.stringify(index,null,2));
