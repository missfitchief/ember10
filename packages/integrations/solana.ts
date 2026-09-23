import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync, getMint, getAccount, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createBurnCheckedInstruction, ACCOUNT_SIZE } from '@solana/spl-token';
import bs58 from 'bs58';
import { readFile } from 'node:fs/promises';
import { Config } from '../core/config.js';
import { Chain, Intent, Outcome, Signed, TransferEvidence } from '../core/engine.js';
import { ensure, hash, Policy, SOL, SPL, MAINNET_GENESIS } from '../core/model.js';
import { snapshot, TokenAccount } from '../core/selection.js';
import { boundedFetch } from './http.js';
export interface Signer {publicKey:PublicKey;sign(tx:VersionedTransaction):Promise<VersionedTransaction>}
export class FileTestSigner implements Signer {
 publicKey:PublicKey; constructor(private key:Keypair,cluster:string){ensure(cluster!=='mainnet-beta','test signer forbidden on mainnet');this.publicKey=key.publicKey;}
 static async load(path:string,cluster:string){const bytes=JSON.parse(await readFile(path,'utf8'));return new FileTestSigner(Keypair.fromSecretKey(Uint8Array.from(bytes)),cluster);}
 async sign(tx:VersionedTransaction){tx.sign([this.key]);return tx;}
}
export class RemoteSigner implements Signer {
 constructor(public publicKey:PublicKey,private endpoint:string,private token:string){ensure(new URL(endpoint).protocol==='https:','signer requires HTTPS');}
 async sign(tx:VersionedTransaction){const before=Buffer.from(tx.message.serialize());const r=await boundedFetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+this.token},body:JSON.stringify({message:before.toString('base64'),publicKey:this.publicKey.toBase58()})},10000) as {signature:string};
  const sig=Buffer.from(r.signature,'base64');ensure(sig.length===64,'invalid signer signature');tx.addSignature(this.publicKey,sig);ensure(before.equals(Buffer.from(tx.message.serialize())),'signer changed message');return tx;}
}
export async function fullSnapshot(connection:Connection,mint:string,policy:Policy,completeContract:boolean){
 ensure(completeContract,'RPC complete census contract not configured');const key=new PublicKey(mint);const mintInfo=await getMint(connection,key,'finalized',TOKEN_PROGRAM_ID);
 ensure(mintInfo.mintAuthority===null&&mintInfo.freezeAuthority===null,'mint authority unsupported for pilot');
 const response=await connection.getProgramAccounts(TOKEN_PROGRAM_ID,{commitment:'finalized',withContext:true,filters:[{dataSize:165},{memcmp:{offset:0,bytes:mint}}]});
 const accounts:TokenAccount[]=response.value.map(a=>{const p=AccountLayout.decode(a.account.data);return {address:a.pubkey.toBase58(),mint:p.mint.toBase58(),program:a.account.owner.toBase58(),owner:p.owner.toBase58(),amount:p.amount.toString(),state:p.state===1?'initialized':p.state===2?'frozen':'uninitialized'};});
 const supply=await connection.getTokenSupply(key,{commitment:'finalized',minContextSlot:response.context.slot} as never);
 return snapshot({mint,decimals:mintInfo.decimals,program:SPL,slot:response.context.slot,accounts,complete:true,supply:supply.value.amount,supplySlot:supply.context.slot,policy});
}
export async function parsedTransfers(connection:Connection,signature:string){
 const tx=await connection.getParsedTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!tx)return null;
 const transfers:TransferEvidence[]=[];
 const visit=(ix:any,identity:string)=>{if(!ix.parsed)return;const p=ix.parsed;const info=p.info;
  if(ix.program==='system'&&p.type==='transfer'){ensure(Number.isSafeInteger(info.lamports)&&info.lamports>=0,'unsafe native transfer integer');transfers.push({instruction:identity,asset:SOL,source:info.source,destination:info.destination,amount:String(info.lamports)});}
  if(ix.program==='spl-token'&&['transfer','transferChecked'].includes(p.type)){
   const index=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===info.source);const balance=tx.meta?.preTokenBalances?.find(b=>b.accountIndex===index)??tx.meta?.postTokenBalances?.find(b=>b.accountIndex===index);
   transfers.push({instruction:identity,asset:info.mint??balance?.mint??'',source:info.source,destination:info.destination,amount:info.tokenAmount?.amount??String(info.amount)});
  }
 };
 tx.transaction.message.instructions.forEach((ix,k)=>visit(ix,String(k)));for(const inner of tx.meta?.innerInstructions??[])inner.instructions.forEach((ix,k)=>visit(ix,`${inner.index}.${k}`));
 return {tx,transfers};
}
export class SolanaChain implements Chain {
 mode:'test'|'live';connection:Connection;secondary?:Connection;
 constructor(public config:Config,public signer:Signer,public simulatedMarket?:{signer:Keypair;outputFor:(i:Intent)=>bigint},public swapBuilder?:(i:Intent)=>Promise<VersionedTransaction>){
  ensure(config.MODE==='test'||config.MODE==='live','prelaunch/demo have no signer');this.mode=config.MODE;
  this.connection=new Connection(config.RPC_URL,'finalized');if(config.SECONDARY_RPC_URL)this.secondary=new Connection(config.SECONDARY_RPC_URL,'finalized');
  ensure(!simulatedMarket||config.MODE==='test','simulated swaps forbidden live');
 }
 destination(owner:string,asset:string){return asset===SOL?owner:getAssociatedTokenAddressSync(new PublicKey(asset),new PublicKey(owner),true).toBase58();}
 async verifyCluster(){const genesis=await this.connection.getGenesisHash();if(this.config.MODE==='test')ensure(genesis!==MAINNET_GENESIS,'mainnet genesis forbidden to test signer');
  if(this.config.MODE==='live')ensure(genesis===MAINNET_GENESIS,'wrong genesis for live');return genesis;}
 async destinationStatus(owner:string,asset:string){const ata=new PublicKey(this.destination(owner,asset));const info=await this.connection.getAccountInfo(ata,'finalized');if(!info)return {exists:false,valid:true,rent:BigInt(await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE,'finalized'))};
  const account=await getAccount(this.connection,ata,'finalized',TOKEN_PROGRAM_ID);return {exists:true,valid:account.owner.toBase58()===owner&&account.mint.toBase58()===asset&&!account.isFrozen,rent:0n};}
 async prepare(i:Intent,authorizeSigning?:()=>Promise<void>):Promise<Signed>{
  ensure(!this.config.MASTER_PAUSE,'master pause prevents new signing');
  ensure(this.config.BROADCAST_ENABLED,'broadcast disabled; inspection only');
  ensure(this.mode!=='live'||authorizeSigning,'live preparation requires a fresh signing authorization');
  await this.verifyCluster();const payer=this.signer.publicKey;ensure(!this.config.TREASURY||payer.toBase58()===this.config.TREASURY,'signer/treasury mismatch');
  const ix:TransactionInstruction[]=[];let tx:VersionedTransaction;
  const addAta=(owner:PublicKey,mint:PublicKey)=>{const ata=getAssociatedTokenAddressSync(mint,owner,true);ix.push(createAssociatedTokenAccountIdempotentInstruction(payer,ata,owner,mint));return ata;};
  if(i.kind==='swap'||i.kind==='buyback'){
   if(this.simulatedMarket){
    const market=this.simulatedMarket.signer,mint=new PublicKey(i.expected.outputAsset!);const metadata=await getMint(this.connection,mint,'finalized');ensure(metadata.freezeAuthority===null,'test mint freeze authority unsupported');
    const dest=addAta(payer,mint);ix.push(SystemProgram.transfer({fromPubkey:payer,toPubkey:market.publicKey,lamports:BigInt(i.amount)}));
    ix.push(createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint,market.publicKey),mint,dest,market.publicKey,this.simulatedMarket.outputFor(i),metadata.decimals));
   }else {ensure(this.swapBuilder,'live swap validator/build adapter not configured');tx=await this.swapBuilder(i);const fee=await this.connection.getFeeForMessage(tx.message,'finalized');ensure(fee.value!==null&&BigInt(fee.value)<=BigInt(i.expected.maxFee),'fee cap');await authorizeSigning?.();const signed=await this.signer.sign(tx);return this.checkedSigned(signed,i);}
  }else if(i.kind==='burn'){
   const mint=new PublicKey(i.asset),metadata=await getMint(this.connection,mint,'finalized');ix.push(createBurnCheckedInstruction(getAssociatedTokenAddressSync(mint,payer),mint,payer,BigInt(i.amount),metadata.decimals));
  }else{
   for(const p of i.expected.transfers??[]){ensure(p.destination===this.destination(p.owner,i.asset),'noncanonical destination');
    if(i.asset===SOL){const developer=i.expected.purpose==='developer_payout';ensure(i.kind==='operations'&&(developer?this.config.DEV_PAYOUT_ENABLED&&p.owner===this.config.DEVELOPER_PAYOUT_WALLET:p.owner===this.config.OPERATIONS),'unapproved SOL recipient');ix.push(SystemProgram.transfer({fromPubkey:payer,toPubkey:new PublicKey(p.owner),lamports:BigInt(p.amount)}));}
    else {const mint=new PublicKey(i.asset),owner=new PublicKey(p.owner),status=await this.destinationStatus(p.owner,i.asset);ensure(status.valid,'recipient ATA is invalid or frozen');
     const metadata=await getMint(this.connection,mint,'finalized');ensure(metadata.decimals===i.expected.decimals,'mint decimals changed');ensure(metadata.mintAuthority===null&&metadata.freezeAuthority===null,'unsupported active authority');
     const destination=status.exists?new PublicKey(p.destination):addAta(owner,mint);const source=getAssociatedTokenAddressSync(mint,payer);ensure(source.toBase58()===i.expected.sourceTokenAccount,'source account mismatch');
     ix.push(createTransferCheckedInstruction(source,mint,destination,payer,BigInt(p.amount),metadata.decimals));}
   }
  }
  const block=await this.connection.getLatestBlockhash('finalized');const legacy=new Transaction({feePayer:payer,recentBlockhash:block.blockhash}).add(...ix);
  const ataCount=ix.filter(x=>x.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).length;
  const rentBound=BigInt(await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE,'finalized'))*BigInt(ataCount);
  ensure(rentBound+BigInt(i.expected.maxFee)<=BigInt(String(i.expected.maxTotalCost??'0')),'rent/fee allowance insufficient; defer before signing');
  tx=new VersionedTransaction(legacy.compileMessage());if(this.simulatedMarket&&(i.kind==='swap'||i.kind==='buyback'))tx.sign([this.simulatedMarket.signer]);
  const fee=await this.connection.getFeeForMessage(tx.message,'finalized');ensure(fee.value!==null&&BigInt(fee.value)<=BigInt(i.expected.maxFee),'transaction fee cap');await authorizeSigning?.();tx=await this.signer.sign(tx);
  return this.checkedSigned(tx,i,block.lastValidBlockHeight);
 }
 async checkedSigned(tx:VersionedTransaction,i:Intent,height?:number){
  ensure(tx.serialize().length<=1232,'batch exceeds transaction size; reduce recipients');
  const sim=await this.connection.simulateTransaction(tx,{sigVerify:true,commitment:'finalized'});ensure(!sim.value.err,'simulation failed');ensure((sim.value.unitsConsumed??0)<=1_400_000,'compute limit');
  const blockhash=tx.message.recentBlockhash;ensure((await this.connection.isBlockhashValid(blockhash,{commitment:'finalized'})).value,'blockhash invalid');
  // For external builders, the conservative bound comes from their persisted verified metadata.
  ensure(height!==undefined||typeof i.expected.lastValidHeight==='number','missing expiry metadata');
  const bytes=Buffer.from(tx.serialize());return {signature:bs58.encode(tx.signatures[0]),bytes,blockhash,lastValidHeight:height??Number(i.expected.lastValidHeight),messageHash:hash(Buffer.from(tx.message.serialize()).toString('base64')),approvedPlan:i.expected};
 }
 async broadcast(s:Signed){ensure(this.config.BROADCAST_ENABLED&&!this.config.MASTER_PAUSE,'broadcast paused; inspection only');await this.verifyCluster();ensure((await this.connection.isBlockhashValid(s.blockhash,{commitment:'finalized'})).value,'blockhash expired; reconcile only');ensure(await this.connection.getBlockHeight('finalized')<=s.lastValidHeight,'expired block height');
  const signature=await this.connection.sendRawTransaction(s.bytes,{skipPreflight:false,maxRetries:0,preflightCommitment:'finalized'});ensure(signature===s.signature,'RPC returned different signature');}
 async inspect(i:Intent,s:Signed):Promise<Outcome>{
  let status;try{status=(await this.connection.getSignatureStatuses([s.signature],{searchTransactionHistory:true})).value[0];}catch{return {status:'unknown',signature:s.signature};}
  if(status?.confirmationStatus==='finalized'){
   const parsed=await parsedTransfers(this.connection,s.signature);if(!parsed)return {status:'unknown',signature:s.signature};const {tx,transfers}=parsed;const meta=tx.meta;ensure(meta,'missing transaction metadata');ensure(tx.transaction.signatures[0]===s.signature,'RPC transaction signature mismatch');
   ensure(Number.isSafeInteger(meta.fee)&&[...meta.preBalances,...meta.postBalances].every(Number.isSafeInteger),'unsafe native integer representation');
   const base={signature:s.signature,slot:tx.slot,fee:String(meta.fee),error:meta.err,raw:{blockTime:tx.blockTime,status,transfers}};
   if(meta.err)return {...base,status:'failed'};
   const accountKeys=tx.transaction.message.accountKeys;
   ensure(accountKeys[0].pubkey.equals(this.signer.publicKey)&&accountKeys[0].signer,'unexpected payer');
   let rent=0n;for(let k=0;k<meta.preBalances.length;k++)if(meta.preBalances[k]===0&&meta.postBalances[k]>0&&accountKeys[k].pubkey.toBase58()!==this.simulatedMarket?.signer.publicKey.toBase58()){
    const account=await this.connection.getAccountInfo(accountKeys[k].pubkey,'finalized');if(account?.owner.equals(TOKEN_PROGRAM_ID))rent+=BigInt(meta.postBalances[k]);
   }
   if(i.kind==='swap'||i.kind==='buyback'){
    const target=this.destination(this.signer.publicKey.toBase58(),i.expected.outputAsset!);const k=accountKeys.findIndex(x=>x.pubkey.toBase58()===target);ensure(k>=0,'output account missing');
    const pre=meta.preTokenBalances?.find(b=>b.accountIndex===k),post=meta.postTokenBalances?.find(b=>b.accountIndex===k);ensure(post&&post.mint===i.expected.outputAsset&&post.owner===this.signer.publicKey.toBase58(),'output identity mismatch');
    const output=BigInt(post.uiTokenAmount.amount)-BigInt(pre?.uiTokenAmount.amount??'0');const input=BigInt(meta.preBalances[0])-BigInt(meta.postBalances[0])-BigInt(meta.fee)-rent;
    return {...base,status:'finalized',rent:rent.toString(),input:input.toString(),output:output.toString()};
   }
   if(i.kind==='burn'){
    const burns=tx.transaction.message.instructions.filter((ix:any)=>ix.program==='spl-token'&&ix.parsed?.type==='burnChecked') as any[];
    ensure(burns.length===1&&burns[0].parsed.info.mint===i.asset&&burns[0].parsed.info.authority===this.signer.publicKey.toBase58()&&burns[0].parsed.info.account===this.destination(this.signer.publicKey.toBase58(),i.asset),'burn evidence mismatch');
    return {...base,status:'finalized',rent:rent.toString(),burned:burns[0].parsed.info.tokenAmount.amount};
   }
   return {...base,status:'finalized',rent:rent.toString(),transfers:transfers.filter(tr=>tr.asset===i.asset)};
  }
  if(status)return {status:'pending',signature:s.signature};
  const height=await this.connection.getBlockHeight('finalized');if(height>s.lastValidHeight){
   if(this.secondary){const fallback=(await this.secondary.getSignatureStatuses([s.signature],{searchTransactionHistory:true})).value[0];if(fallback)return {status:'unknown',signature:s.signature};}
   return {status:'expired',signature:s.signature,raw:{finalizedHeight:height,historySearched:true,automaticReplacement:false}};
  }return {status:'unknown',signature:s.signature};
 }
}
