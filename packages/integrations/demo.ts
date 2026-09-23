import { createHash } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Chain, Intent, Outcome, Signed } from '../core/engine.js';
import { canonical, ensure, hash } from '../core/model.js';
import { Store } from '../db/store.js';
export const testKey=(label:string)=>Keypair.fromSeed(createHash('sha256').update('EMBER5 TEST ONLY '+label).digest());
export const testAddress=(label:string)=>testKey(label).publicKey.toBase58();
export class DemoChain implements Chain {
 readonly mode='demo' as const;
 unavailable=new Set<string>();failNext=new Set<string>();unknown=false;expired=false;
 constructor(public db:Store){}
 async init(){await this.db.pool.query('CREATE TABLE IF NOT EXISTS demo_chain (signature text PRIMARY KEY, bytes_hash text NOT NULL, result jsonb NOT NULL, broadcasts integer NOT NULL DEFAULT 1)');}
 destination(owner:string,asset:string){return getAssociatedTokenAddressSync(new PublicKey(asset),new PublicKey(owner),true).toBase58();}
 async prepare(i:Intent):Promise<Signed>{ensure(!this.unavailable.has(i.expected.outputAsset??i.asset),'synthetic route unavailable');
 const attempt=Number((await this.db.pool.query('SELECT count(*)::int AS n FROM attempts WHERE intent_id=$1',[i.id])).rows[0].n);
 const bytes=Buffer.from(canonical({label:'DEMO ONLY — NOT A SOLANA TRANSACTION',intent:i,attempt}));return {signature:'demo:'+hash(bytes.toString()),bytes,blockhash:'demo-blockhash',lastValidHeight:1000000000,messageHash:hash(bytes.toString()),approvedPlan:{...i.expected,maxNativeCost:i.expected.maxFee,maxRent:'0',requiredRent:'0'}};}
 async inspect(_i:Intent,s:Signed):Promise<Outcome>{if(this.expired)return {status:'expired',signature:s.signature,testOnly:true};if(this.unknown)return {status:'unknown',signature:s.signature,testOnly:true};const r=await this.db.pool.query('SELECT result FROM demo_chain WHERE signature=$1',[s.signature]);return r.rows[0]?.result??{status:'pending',signature:s.signature,testOnly:true};}
 async broadcast(s:Signed){ensure(s.signature.startsWith('demo:'),'demo rejects real payloads');ensure(!this.expired,'expired synthetic transaction');const {intent:i}=JSON.parse(s.bytes.toString()) as {intent:Intent};
 const failure=this.failNext.delete(i.id);
 const result:Outcome={status:failure?'failed':'finalized',signature:s.signature,slot:500001,fee:'5000',rent:'0',error:failure?'synthetic atomic failure':null,testOnly:true,
 input:i.amount,output:(BigInt(i.amount)*5n).toString(),burned:i.kind==='burn'?i.amount:undefined,
 transfers:i.expected.transfers?.map((p,k)=>({instruction:String(k),asset:i.asset,source:String(i.expected.sourceTokenAccount),destination:p.destination,amount:p.amount})),raw:{source:'deterministic database-backed simulation'}};
 await this.db.pool.query('INSERT INTO demo_chain(signature,bytes_hash,result) VALUES($1,$2,$3) ON CONFLICT(signature) DO UPDATE SET broadcasts=demo_chain.broadcasts+1',[s.signature,hash(s.bytes.toString()),canonical(result)]);
 }
}
