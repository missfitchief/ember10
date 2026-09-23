import { z } from 'zod';
import Decimal from 'decimal.js';
import { program as jupiterProgram } from '@jup-ag/instruction-parser';
import { Connection,PublicKey,SystemProgram,TransactionInstruction,TransactionMessage,VersionedTransaction,ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID,AccountLayout,getMint,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createSyncNativeInstruction,createCloseAccountInstruction } from '@solana/spl-token';
import { boundedFetch } from './http.js';
import { address,ensure,raw,WSOL,Price } from '../core/model.js';
import { Intent } from '../core/engine.js';
export const instructionSchema=z.object({programId:address,accounts:z.array(z.object({pubkey:address,isSigner:z.boolean(),isWritable:z.boolean()})).max(64),data:z.string().max(10000)});
export const buildSchema=z.object({inputMint:address,outputMint:address,inAmount:raw,outAmount:raw,otherAmountThreshold:raw,swapMode:z.literal('ExactIn'),slippageBps:z.number().int(),priceImpactPct:z.string(),routePlan:z.array(z.unknown()),swapInstruction:instructionSchema,addressesByLookupTableAddress:z.record(z.string(),z.array(z.string())).nullable().optional(),blockhashWithMetadata:z.object({blockhash:z.array(z.number()).length(32),lastValidBlockHeight:z.number().int()})}).passthrough();
export class JupiterClient {
 constructor(private key:string){ensure(key.length>0,'Jupiter API key required for pilot adapter');}
 async order(inputMint:string,outputMint:string,amount:string,taker?:string){const params=new URLSearchParams({inputMint,outputMint,amount,slippageBps:'100',...(taker?{taker}: {})});return boundedFetch('https://api.jup.ag/swap/v2/order?'+params,{headers:{'x-api-key':this.key}},500000);}
 async build(outputMint:string,amount:string,taker:string,slippageBps=100){ensure(slippageBps>=0&&slippageBps<=100,'invalid slippage limit');const params=new URLSearchParams({inputMint:WSOL,outputMint,amount,taker,slippageBps:String(slippageBps),onlyDirectRoutes:'true',instructionVersion:'V1',useSharedAccounts:'false',platformFeeBps:'0'});return buildSchema.parse(await boundedFetch('https://api.jup.ag/swap/v2/build?'+params,{headers:{'x-api-key':this.key}},500000));}
 async execute(signedTransaction:string,requestId:string,lastValidBlockHeight:number){return boundedFetch('https://api.jup.ag/swap/v2/execute',{method:'POST',headers:{'x-api-key':this.key,'content-type':'application/json'},body:JSON.stringify({signedTransaction,requestId,lastValidBlockHeight})},100000);}
 async prices(mints:string[],connection:Connection):Promise<Map<string,Price>>{mints.forEach(m=>address.parse(m));const response=await boundedFetch('https://api.jup.ag/price/v3?ids='+mints.join(','),{headers:{'x-api-key':this.key}},100000) as Record<string,{usdPrice:number;blockId:number}>;
  const result=new Map<string,Price>();for(const mint of mints){const r=response[mint];if(r&&Number.isFinite(r.usdPrice)&&r.usdPrice>0&&Number.isSafeInteger(r.blockId)){const at=await connection.getBlockTime(r.blockId);if(at&&Date.now()-at*1000<=120000)result.set(mint,{microUsd:new Decimal(String(r.usdPrice)).mul(1000000).floor().toFixed(0),at:at*1000,source:'Jupiter Price v3; block '+r.blockId});}}return result;}
}
export function validateSwapInstruction(ix:TransactionInstruction,i:Intent,payer:PublicKey,outAmount:string,slippageBps:number){
 ensure(ix.programId.equals(jupiterProgram.programId),'unapproved Jupiter program');
 const decoder=jupiterProgram.coder.instruction as typeof jupiterProgram.coder.instruction & {decode(data:Buffer):{name:string;data:Record<string,any>}|null};
 const decoded=decoder.decode(ix.data);ensure(decoded?.name==='route','only decoded legacy exact-input direct route supported');
 ensure(decoded.data.inAmount.toString()===i.amount&&decoded.data.quotedOutAmount.toString()===outAmount,'decoded swap amount mismatch');
 ensure(decoded.data.slippageBps===slippageBps&&slippageBps<=100&&decoded.data.platformFeeBps===0,'slippage/platform fee exceeds policy');
 ensure(decoded.data.routePlan.length===1,'pilot supports direct route only');
 const source=getAssociatedTokenAddressSync(new PublicKey(WSOL),payer),destination=getAssociatedTokenAddressSync(new PublicKey(i.expected.outputAsset!),payer);
 ensure(ix.keys[0].pubkey.equals(TOKEN_PROGRAM_ID)&&ix.keys[1].pubkey.equals(payer)&&ix.keys[1].isSigner,'swap signer mismatch');
 ensure(ix.keys[2].pubkey.equals(source)&&ix.keys[3].pubkey.equals(destination)&&ix.keys[5].pubkey.toBase58()===i.expected.outputAsset,'swap accounts/mint mismatch');
 ensure(ix.keys[4].pubkey.equals(jupiterProgram.programId)||ix.keys[4].pubkey.equals(destination),'unexpected destination override');
 ensure(ix.keys.filter(k=>k.isSigner).every(k=>k.pubkey.equals(payer)),'unexpected signer');
 return BigInt(outAmount)*BigInt(10000-slippageBps)/10000n;
}
/** No remote setup/cleanup/tip instructions are accepted. Wrapping and ATAs are constructed locally. */
export async function safeJupiterBuild(connection:Connection,jupiter:JupiterClient,payer:PublicKey,i:Intent,approvedPrograms:string[],admission:string[]|import('../core/admission.js').MintAdmission,limits={slippageBps:100,impactBps:200}){
 if(Array.isArray(admission))ensure(admission.includes(i.expected.outputAsset!),'output mint is outside approved pilot');
 else ensure(admission.version==='ember-provenance-v1'&&admission.mint===i.expected.outputAsset&&admission.expiresAt>Date.now()&&!!admission.policyHash&&!!admission.evidenceHash,'fresh funded provenance admission required');
 const started=Date.now(),quote=await jupiter.build(i.expected.outputAsset!,i.amount,payer.toBase58(),limits.slippageBps);
 ensure(quote.inputMint===WSOL&&quote.outputMint===i.expected.outputAsset&&quote.inAmount===i.amount,'quote identity mismatch');
 ensure(new Decimal(quote.priceImpactPct).abs().lte(new Decimal(limits.impactBps).div(10000))&&quote.slippageBps<=limits.slippageBps,'quote exceeds approved impact/slippage limits');
 const mint=new PublicKey(quote.outputMint),metadata=await getMint(connection,mint,'finalized',TOKEN_PROGRAM_ID);ensure(!metadata.mintAuthority&&!metadata.freezeAuthority,'unsupported mint authority');
 const swap=new TransactionInstruction({programId:new PublicKey(quote.swapInstruction.programId),keys:quote.swapInstruction.accounts.map(k=>({...k,pubkey:new PublicKey(k.pubkey)})),data:Buffer.from(quote.swapInstruction.data,'base64')});
 const minimum=validateSwapInstruction(swap,i,payer,quote.outAmount,quote.slippageBps);ensure(minimum>0n&&BigInt(quote.otherAmountThreshold)===minimum,'minimum-output mismatch');
 const source=getAssociatedTokenAddressSync(new PublicKey(WSOL),payer),destination=getAssociatedTokenAddressSync(mint,payer);
 ensure(!(await connection.getAccountInfo(source,'finalized')),'pre-existing wrapped SOL account requires operator review');
 const infos=await connection.getMultipleAccountsInfo(swap.keys.map(k=>k.pubkey),'finalized');
 const destinationInfo=infos[3];
 if(destinationInfo){ensure(destinationInfo.owner.equals(TOKEN_PROGRAM_ID)&&destinationInfo.data.length===165,'invalid output token account');const account=AccountLayout.decode(destinationInfo.data);ensure(account.mint.equals(mint)&&account.owner.equals(payer)&&account.state===1,'invalid or frozen output token account');}
 const ataRent=BigInt(await connection.getMinimumBalanceForRentExemption(165,'finalized'));
 // The WSOL account is always created and closed locally in the same atomic transaction.
 // Its rent needs upfront liquidity but returns to the payer, so it is not a net debit.
 const maxRent=destinationInfo?0n:ataRent,requiredRent=ataRent+maxRent;
 ensure(requiredRent+BigInt(i.expected.maxFee)<=BigInt(String(i.expected.maxTotalCost??'0')),'swap rent/fee allowance insufficient');
 for(let k=0;k<infos.length;k++){const a=infos[k];if(a?.executable)ensure(approvedPrograms.includes(swap.keys[k].pubkey.toBase58()),'route invokes an unapproved executable program');
  if(a?.owner.equals(TOKEN_PROGRAM_ID)&&a.data.length===165){const account=AccountLayout.decode(a.data);if(account.owner.equals(payer))ensure(swap.keys[k].pubkey.equals(source)||swap.keys[k].pubkey.equals(destination),'unrelated treasury token account in route');}}
 const lookups=[];for(const key of Object.keys(quote.addressesByLookupTableAddress??{})){const actual=(await connection.getAddressLookupTable(new PublicKey(key),{commitment:'finalized'})).value;ensure(actual,'lookup table unavailable');ensure(actual.state.deactivationSlot===18446744073709551615n,'lookup table deactivated');lookups.push(actual);}
 const block=await connection.getLatestBlockhash('finalized');
 const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:400000}),createAssociatedTokenAccountIdempotentInstruction(payer,source,payer,new PublicKey(WSOL)),...(destinationInfo?[]:[createAssociatedTokenAccountIdempotentInstruction(payer,destination,payer,mint)]),SystemProgram.transfer({fromPubkey:payer,toPubkey:source,lamports:BigInt(i.amount)}),createSyncNativeInstruction(source),swap,createCloseAccountInstruction(source,payer,payer)];
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:block.blockhash,instructions}).compileToV0Message(lookups));
 ensure(Date.now()-started<15000,'quote stale during validation');
 i.expected={...i.expected,minOutput:minimum.toString(),lastValidHeight:block.lastValidBlockHeight,decimals:metadata.decimals,quotedAt:started,quoteSource:'Jupiter Swap v2 /build',slippageBps:quote.slippageBps,priceImpactPct:quote.priceImpactPct,maxRent:maxRent.toString(),requiredRent:requiredRent.toString()};
 return tx;
}
