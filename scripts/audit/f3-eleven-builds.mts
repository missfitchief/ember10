import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {epochCostForecast} from '../../apps/worker/forecast.js';
import {safeJupiterBuild} from '../../packages/integrations/jupiter.js';
import {bindNativeCost} from '../../packages/core/execution-cost.js';
import {EmberClient} from '../../packages/integrations/ember.js';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {PublicKey,Keypair,TransactionInstruction}=require('@solana/web3.js');
const {TOKEN_PROGRAM_ID,MintLayout,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync}=require('@solana/spl-token');
const {program}=require('@jup-ag/instruction-parser');
const WSOL='So11111111111111111111111111111111111111112';
// Deterministic fixture identities only. Keys are never used to sign.
const payer=Keypair.fromSeed(Buffer.alloc(32,42)).publicKey;
const maxFee=100000n,rent=2039280n,size=10;
const current=epochCostForecast(size,maxFee,rent),withFloat=current+rent;
const u64=(value:bigint)=>({toArrayLike:(_Type:unknown,_endian:unknown,length:number)=>{const bytes=Buffer.alloc(length);bytes.writeBigUInt64LE(value);return bytes;}});
async function walk(forecast:bigint,actualFee:bigint){
 let remaining=forecast;
 const rows=[];
 for(let index=0;index<11;index++){
  const mint=Keypair.fromSeed(Buffer.alloc(32,index+1)).publicKey;
  const source=getAssociatedTokenAddressSync(new PublicKey(WSOL),payer),destination=getAssociatedTokenAddressSync(mint,payer);
  const swap=new TransactionInstruction({programId:program.programId,keys:[TOKEN_PROGRAM_ID,payer,source,destination,program.programId,mint,program.programId].map((pubkey:any,k:number)=>({pubkey,isSigner:k===1,isWritable:[2,3].includes(k)})),data:program.coder.instruction.encode('route',{routePlan:[{swap:{raydium:{}},percent:100,inputIndex:0,outputIndex:1}],inAmount:u64(100n),quotedOutAmount:u64(200n),slippageBps:100,platformFeeBps:0})});
  const jupiter={build:async()=>({inputMint:WSOL,outputMint:mint.toBase58(),inAmount:'100',outAmount:'200',otherAmountThreshold:'198',swapMode:'ExactIn',slippageBps:100,priceImpactPct:'0.001',routePlan:[{}],swapInstruction:{programId:program.programId.toBase58(),accounts:swap.keys.map((key:any)=>({...key,pubkey:key.pubkey.toBase58()})),data:swap.data.toString('base64')},blockhashWithMetadata:{blockhash:Array(32).fill(0),lastValidBlockHeight:1000}})};
  const mintData=Buffer.alloc(MintLayout.span);
  MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
  const rpc={getAccountInfo:async(key:any)=>key.equals(mint)?{owner:TOKEN_PROGRAM_ID,data:mintData,lamports:Number(rent),executable:false,rentEpoch:0}:null,getMultipleAccountsInfo:async()=>swap.keys.map(()=>null),getMinimumBalanceForRentExemption:async()=>Number(rent),getLatestBlockhash:async()=>({blockhash:PublicKey.default.toBase58(),lastValidBlockHeight:1000})};
  const intent:any={id:index===0?'buyback:epoch':'purchase:epoch:'+mint.toBase58(),epoch_id:'epoch',kind:index===0?'buyback':'swap',asset:'SOL',amount:'100',status:'planned',expected:{inputAsset:'SOL',outputAsset:mint.toBase58(),from:'budget',to:payer.toBase58(),maxFee:maxFee.toString(),maxTotalCost:remaining.toString(),costAccount:'cost:epoch'}};
  try{
   const tx=await safeJupiterBuild(rpc as any,jupiter as any,payer,intent,[],[mint.toBase58()]);
   assert.equal(tx.message.compiledInstructions.filter((ix:any)=>tx.message.staticAccountKeys[ix.programIdIndex].equals(ASSOCIATED_TOKEN_PROGRAM_ID)).length,2);
   assert.equal(intent.expected.requiredRent,(2n*rent).toString());
   bindNativeCost(intent,BigInt(intent.expected.maxRent),BigInt(intent.expected.requiredRent));
   assert.equal(intent.expected.maxNativeCost,(rent+maxFee).toString());
   rows.push({transaction:index+1,kind:intent.kind,before:String(remaining),requiredCash:String(2n*rent+maxFee),netDebit:String(rent+actualFee),status:'build_passed'});
   remaining-=rent+actualFee;
  }catch(error){
   rows.push({transaction:index+1,kind:intent.kind,before:String(remaining),requiredCash:String(2n*rent+maxFee),shortfall:String(2n*rent+maxFee-remaining),status:'build_rejected',reason:(error as Error).message});
   return {forecast:String(forecast),actualFee:String(actualFee),completed:index,remaining:String(remaining),rows};
  }
 }
 assert(remaining>=maxFee,'burn fee allowance remains');
 remaining-=actualFee;
 return {forecast:String(forecast),actualFee:String(actualFee),completed:11,burnAllowancePassed:true,afterBurn:String(remaining),rows};
}
const oldLow=await walk(current,5000n),oldMax=await walk(current,maxFee),newLow=await walk(withFloat,5000n),newMax=await walk(withFloat,maxFee);
assert.equal(oldLow.completed,10);assert.equal(oldLow.remaining,'3189280');assert.equal(oldLow.rows.at(-1)?.shortfall,'989280');
assert.equal(oldMax.completed,10);assert.equal(oldMax.remaining,'2239280');assert.equal(oldMax.rows.at(-1)?.shortfall,'1939280');
assert.equal(newLow.completed,11);assert.equal(newMax.completed,11);assert.equal(newMax.afterBurn,rent.toString());
const payouts=JSON.parse(readFileSync(new URL('../../docs/evidence/ember-payouts.json',import.meta.url),'utf8')).payouts;
const ember=new EmberClient();ember.read=async()=>({at:Date.now(),value:{payouts}});
await assert.rejects(()=>ember.payouts(),error=>error instanceof Error&&error.name==='ZodError');
const unknownDiscriminators=['d19853937cfed8e9','bb64facc31c4af14'].map(hex=>({hex,decoded:program.coder.instruction.decode(Buffer.from(hex,'hex'))}));
assert(unknownDiscriminators.every(row=>row.decoded===null));
const result={revision:'4f9fba2fd95d6fd8057c27d56cfad0297b9f06ce',kind:'local_read_only_adapter_harness',signed:0,broadcast:0,networkRequests:0,fixtureCaveat:'Legacy route instruction and RPC responses are mocked; this does not establish current Jupiter live compatibility.',oldLow,oldMax,newLow,newMax,unknownDiscriminators,payoutCensus:{rows:payouts.length,fullWindowRejectedByStrictSchema:true,keepRows:payouts.filter((p:any)=>p.mode==='keep').map((p:any)=>({kind:p.kind,amount:p.amount,claimed:p.claimed,quoteMint:p.quoteMint})),keepPayoutWSOL:payouts.filter((p:any)=>p.kind==='payout'&&p.mode==='keep'&&p.quoteMint===WSOL).length,missingSignature:payouts.filter((p:any)=>typeof p.signature!=='string').map((p:any)=>p.kind)}};
writeFileSync(process.argv[2] ?? new URL('../../f3-eleven-builds-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,oldLow:{completed:oldLow.completed,remaining:oldLow.remaining,shortfall:oldLow.rows.at(-1)?.shortfall},oldMax:{completed:oldMax.completed,remaining:oldMax.remaining,shortfall:oldMax.rows.at(-1)?.shortfall},newLow:{completed:newLow.completed,afterBurn:newLow.afterBurn},newMax:{completed:newMax.completed,afterBurn:newMax.afterBurn},payoutCensus:result.payoutCensus,output:process.argv[2] ?? fileURLToPath(new URL('../../f3-eleven-builds-results.json',import.meta.url))},null,2));
