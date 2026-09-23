import {it,expect,vi} from 'vitest';
import {program} from '@jup-ag/instruction-parser';
import {PublicKey,TransactionInstruction,VersionedTransaction,TransactionMessage,SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {validateSwapInstruction,buildSchema,JupiterClient} from '../packages/integrations/jupiter.js';
import {testKey,testAddress} from '../packages/integrations/demo.js';
import {FileTestSigner,SolanaChain} from '../packages/integrations/solana.js';
import {WSOL,MAINNET_GENESIS} from '../packages/core/model.js';
import {loadConfig} from '../packages/core/config.js';
import {Intent} from '../packages/core/engine.js';
import {decimalUnits} from '../packages/integrations/http.js';
it('does not activate a file signer on mainnet and signs a real test message',async()=>{const key=testKey('signer');expect(()=>new FileTestSigner(key,'mainnet-beta')).toThrow();const tx=new VersionedTransaction(new TransactionMessage({payerKey:key.publicKey,recentBlockhash:testAddress('blockhash'),instructions:[SystemProgram.transfer({fromPubkey:key.publicKey,toPubkey:testKey('recipient').publicKey,lamports:1n})]}).compileToV0Message());const signed=await new FileTestSigner(key,'localnet').sign(tx);expect(signed.signatures[0].some(x=>x!==0)).toBe(true);});
it('converts human-unit receipt values exactly and rejects imprecise input',()=>{expect(decimalUnits('0.000000001',9)).toBe(1n);expect(decimalUnits('123456789.123456',6)).toBe(123456789123456n);expect(()=>decimalUnits('0.0000000001',9)).toThrow();expect(decimalUnits('1e9',9)).toBe(1000000000000000000n);expect(()=>decimalUnits('1e-10',9)).toThrow();});
it('rejects external swap instructions with arbitrary signer, recipient, debit or minimum',()=>{
 const payer=testKey('treasury').publicKey,output=testKey('asset').publicKey;const source=getAssociatedTokenAddressSync(new PublicKey(WSOL),payer),destination=getAssociatedTokenAddressSync(output,payer);
 const instruction=new TransactionInstruction({programId:program.programId,keys:[TOKEN_PROGRAM_ID,payer,source,destination,program.programId,output,program.programId].map((pubkey,k)=>({pubkey,isSigner:k===1,isWritable:[2,3].includes(k)})),data:program.coder.instruction.encode('route',{routePlan:[{swap:{raydium:{}},percent:100,inputIndex:0,outputIndex:1}],inAmount:{toArrayLike:(Type:any,endian:any,length:any)=>{const b=Buffer.alloc(length);b.writeBigUInt64LE(100n);return b;}} as any,quotedOutAmount:{toArrayLike:(Type:any,endian:any,length:any)=>{const b=Buffer.alloc(length);b.writeBigUInt64LE(200n);return b;}} as any,slippageBps:100,platformFeeBps:0})});
 const intent:Intent={id:'q',epoch_id:null,kind:'swap',asset:'SOL',amount:'100',status:'planned',expected:{inputAsset:'SOL',outputAsset:output.toBase58(),from:'budget',costAccount:'reserve',maxFee:'10000'}};
 expect(validateSwapInstruction(instruction,intent,payer,'200',100)).toBe(198n);
 expect(()=>validateSwapInstruction(instruction,{...intent,amount:'101'},payer,'200',100)).toThrow('amount');
 expect(()=>validateSwapInstruction(instruction,intent,testKey('wrong').publicKey,'200',100)).toThrow('signer');
 const wrong=new TransactionInstruction({...instruction,keys:instruction.keys.map((k,n)=>n===3?{...k,pubkey:testKey('thief').publicKey}:k)});expect(()=>validateSwapInstruction(wrong,intent,payer,'200',100)).toThrow('accounts');
 expect(()=>validateSwapInstruction(instruction,intent,payer,'200',1000)).toThrow('slippage');
});
it('authenticated Jupiter adapter cannot silently use an anonymous endpoint',()=>{expect(()=>new JupiterClient('')).toThrow('API key');expect(()=>buildSchema.parse({inputMint:WSOL,inAmount:123})).toThrow();});
it('rejects the actual observed mainnet genesis even when a test RPC URL is mislabeled',async()=>{const chain=new SolanaChain(loadConfig({MODE:'test',CLUSTER:'devnet',BROADCAST_ENABLED:'true'}),new FileTestSigner(testKey('test'),'devnet'));vi.spyOn(chain.connection,'getGenesisHash').mockResolvedValue(MAINNET_GENESIS);await expect(chain.verifyCluster()).rejects.toThrow('mainnet genesis forbidden');});
it('master pause blocks signing before any provider call',async()=>{const signer=new FileTestSigner(testKey('test'),'devnet'),chain=new SolanaChain(loadConfig({MODE:'test',CLUSTER:'devnet',BROADCAST_ENABLED:'true'}),signer);const sign=vi.spyOn(signer,'sign'),rpc=vi.spyOn(chain.connection,'getGenesisHash');await expect(chain.prepare({} as Intent)).rejects.toThrow('master pause');expect(sign).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();});
it('rejects failed transaction simulation before producing a broadcastable result',async()=>{const signer=new FileTestSigner(testKey('test'),'devnet'),chain=new SolanaChain(loadConfig({MODE:'test',CLUSTER:'devnet',BROADCAST_ENABLED:'true',MASTER_PAUSE:'false'}),signer);const tx=new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:testAddress('blockhash'),instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(testAddress('recipient')),lamports:1n})]}).compileToV0Message());await signer.sign(tx);vi.spyOn(chain.connection,'simulateTransaction').mockResolvedValue({context:{slot:1},value:{err:{InstructionError:[0,'InvalidAccountData']},logs:[]}} as never);await expect(chain.checkedSigned(tx,{expected:{}} as Intent,123)).rejects.toThrow('simulation failed');});

