import { ensure } from '../core/model.js';
export async function boundedFetch(url:string,init:RequestInit={},maxBytes=12_000_000):Promise<unknown>{
 const parsed=new URL(url);ensure(parsed.protocol==='https:'||(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.protocol==='http:'),'unsafe upstream URL');
 for(let n=0;n<3;n++){
  const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  if((r.status===429||r.status>=500)&&n<2){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,Math.min(Number(r.headers.get('retry-after')??n+1)*1000,5000)));continue;}
  ensure(r.ok,`upstream HTTP ${r.status}`);ensure(Number(r.headers.get('content-length')??0)<=maxBytes,'oversize upstream response');
  const reader=r.body!.getReader();let length=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw Error('oversize upstream response');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }throw Error('upstream unavailable');
}
export function decimalUnits(value:string,decimals:number){
 ensure(/^\d+(\.\d+)?$/.test(value),'unsupported decimal representation');const [whole,part='']=value.split('.');ensure(part.length<=decimals||/^0*$/.test(part.slice(decimals)),'precision exceeds base units');return BigInt(whole)*10n**BigInt(decimals)+BigInt(part.slice(0,decimals).padEnd(decimals,'0')||'0');
}
