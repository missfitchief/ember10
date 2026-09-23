import {Connection,PublicKey} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {Engine} from '../core/engine.js';
import {EmberClient,catalogueSchema} from './ember.js';
import {parsedTransfers} from './solana.js';
import {decimalUnits} from './http.js';
import {canonical,ensure,SOL,WSOL} from '../core/model.js';
/** A bounded published ledger is a matching index, never the durable chain cursor. */
export async function ingestTreasury(engine:Engine,rpc:Connection,ember:EmberClient,config:{treasury:string;pool:string;feeSender:string;historyStartSignature:string}){
 const db=engine.db,cursor=(await db.pool.query("SELECT value FROM cursors WHERE name='treasury-signatures'")).rows[0]?.value;
 const until=cursor?.signature??config.historyStartSignature;ensure(until,'an audited history start is required');
 const signatures=[];let before:string|undefined,complete=false;
 for(let page=0;page<100;page++){const rows=await rpc.getSignaturesForAddress(new PublicKey(config.treasury),{before,until,limit:1000},'finalized');signatures.push(...rows);if(rows.length<1000){complete=true;break;}before=rows.at(-1)!.signature;}
 ensure(complete,'history pagination bound reached; cursor not advanced');
 const published=(await ember.payouts(config.pool)).value.payouts;
 for(const s of [...signatures].reverse()){
  if(s.err)continue;const evidence=await parsedTransfers(rpc,s.signature);ensure(evidence,'history provider returned null; retain cursor');ensure(!evidence.tx.meta?.err,'finalized transaction error');
  for(const tr of evidence.transfers.filter(x=>x.destination===config.treasury&&x.asset===SOL)){
   const matches=published.filter(p=>{try{return p.signature===s.signature&&p.pool===config.pool&&p.mode==='keep'&&p.kind==='payout'&&p.quoteMint===WSOL&&decimalUnits(String(p.amount),9)===BigInt(tr.amount);}catch{return false;}});
   const uniqueTransfer=evidence.transfers.filter(x=>x.destination===config.treasury&&x.source===config.feeSender&&x.amount===tr.amount&&x.asset===SOL).length===1;
   const verified=matches.length===1&&uniqueTransfer&&tr.source===config.feeSender;
   await engine.ingest({...tr,signature:s.signature,slot:evidence.tx.slot,finalized:true,error:null,pool:config.pool,publishedPool:matches[0]?.pool,kind:tr.source===config.feeSender?'creator_fee':'deposit',attributionVerified:verified,rawEvidence:{published:matches,transfer:tr,observedAt:Date.now(),scope:'Only exact finalized native SOL Keep-it matches'}},config);
  }
 }
 if(signatures.length)await db.pool.query("INSERT INTO cursors(name,value) VALUES('treasury-signatures',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()",[canonical({signature:signatures[0].signature,oldestBoundary:until})]);
 return {scanned:signatures.length,coverage:'RPC finalized signature history; published-window gaps quarantine inbound fee-sender transfers'};
}
export async function fundingRoute(ember:EmberClient,pool:string){const observed=await ember.read('/markets');const catalogue=catalogueSchema.parse(observed.value);const market=catalogue.markets.find(m=>m.pool===pool);ensure(market,'our pool missing from catalogue');const fees=await ember.fees(pool);const state=fees.value as Record<string,unknown>;
 return {pool:market.pool,mint:market.mint,module:market.mode,creator:market.creator,quoteMint:market.quoteMint,dammPool:market.dammPool??null,feeBps:market.feeBps,feeSource:state.feeSource,taxBps:state.taxBps,creatorSideBps:state.creatorSideBps};}
export async function ingestTokenDeposits(engine:Engine,rpc:Connection,treasury:string){
 const accounts=await rpc.getTokenAccountsByOwner(new PublicKey(treasury),{programId:TOKEN_PROGRAM_ID},'finalized');
 for(const a of accounts.value){const token=AccountLayout.decode(a.account.data);ensure(token.owner.toBase58()===treasury,'treasury token-account owner mismatch');const destination=a.pubkey.toBase58(),name='token-inbound:'+destination;
  const cursor=(await engine.db.pool.query('SELECT value FROM cursors WHERE name=$1',[name])).rows[0]?.value;
  const signatures=[];let before:string|undefined,complete=false;
  for(let page=0;page<100;page++){const rows=await rpc.getSignaturesForAddress(a.pubkey,{before,until:cursor?.signature,limit:1000},'finalized');signatures.push(...rows);if(rows.length<1000){complete=true;break;}before=rows.at(-1)!.signature;}
  ensure(complete,'token account history exceeds verified pagination bound');
  for(const s of [...signatures].reverse()){
   if(s.err||(await engine.db.pool.query('SELECT id FROM attempts WHERE signature=$1',[s.signature])).rowCount)continue;
   const evidence=await parsedTransfers(rpc,s.signature);ensure(evidence,'missing token transfer history; cursor retained');
   for(const tr of evidence.transfers.filter(t=>t.destination===destination&&t.asset===token.mint.toBase58()))await engine.ingest({...tr,signature:s.signature,slot:evidence.tx.slot,finalized:true,error:evidence.tx.meta?.err??null,kind:'deposit',attributionVerified:false,rawEvidence:{transfer:tr,beneficiary:treasury,source:'unsolicited token transfer; never creator revenue'}},{treasury:destination});
  }
  if(signatures.length)await engine.db.pool.query('INSERT INTO cursors(name,value) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()',[name,canonical({signature:signatures[0].signature})]);
 }
 const unsupported=await rpc.getTokenAccountsByOwner(new PublicKey(treasury),{programId:TOKEN_2022_PROGRAM_ID},'finalized');
 if(unsupported.value.length)await engine.db.doc('observation',{type:'unsupported_unsolicited_accounts',slot:unsupported.context.slot,accounts:unsupported.value.map(a=>a.pubkey.toBase58()),action:'excluded from spending and baseline SPL accounting; extensions require separate review'});
}
