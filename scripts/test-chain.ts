/** Real test-chain settlement; swaps are deliberately simulated using a funded test market.
 * Never imports deterministic demo keys. Never connects to mainnet. */
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {createMint,getOrCreateAssociatedTokenAccount,mintTo,setAuthority,AuthorityType,createAccount} from '@solana/spl-token';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {Store} from '../packages/db/store.js';
import {migrate} from '../packages/db/migrate.js';
import {Engine} from '../packages/core/engine.js';
import {defaultPolicy,ensure,SOL,SPL,canonical,MAINNET_GENESIS} from '../packages/core/model.js';
import {loadConfig} from '../packages/core/config.js';
import {SolanaChain,FileTestSigner,fullSnapshot,parsedTransfers} from '../packages/integrations/solana.js';
import {selectBasket,Candidate} from '../packages/core/selection.js';
import {runIntent} from '../apps/worker/runner.js';
import {exportEpoch} from '../apps/api/queries.js';
const cluster=process.env.TEST_CLUSTER??'localnet';ensure(['localnet','devnet'].includes(cluster),'only test networks supported');
const rpc=process.env.TEST_RPC_URL??(cluster==='devnet'?'https://api.devnet.solana.com':'http://127.0.0.1:8899');
const connection=new Connection(rpc,'finalized');ensure(await connection.getGenesisHash()!==MAINNET_GENESIS,'mainnet is forbidden');
await mkdir('.runtime',{recursive:true});await mkdir('docs/test-chain',{recursive:true});
const sessionPath=`.runtime/${cluster}-exercise.json`;let state:any=existsSync(sessionPath)?JSON.parse(await readFile(sessionPath,'utf8')):null;
const save=()=>writeFile(sessionPath,canonical(state));
async function finalized(signature:string){for(let n=0;n<120;n++){const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(status?.confirmationStatus==='finalized'){ensure(!status.err,'test setup transaction failed');return;}await new Promise(r=>setTimeout(r,1000));}throw Error('test setup awaiting finality; resume later');}
if(!state){const funding=Keypair.generate(),keeper=Keypair.generate(),holders=Array.from({length:4},()=>Keypair.generate());state={phase:'funding',funding:Array.from(funding.secretKey),keeper:Array.from(keeper.secretKey),holders:holders.map(k=>Array.from(k.secretKey)),rewardMints:[],setupReceipts:[],createdAt:Date.now()};await save();}
const funding=Keypair.fromSecretKey(Uint8Array.from(state.funding)),keeper=Keypair.fromSecretKey(Uint8Array.from(state.keeper)),holders:Keypair[]=state.holders.map((k:number[])=>Keypair.fromSecretKey(Uint8Array.from(k)));
if(state.phase==='funding'){
 if(!state.airdrop){state.airdrop=await connection.requestAirdrop(funding.publicKey,2_000_000_000);await save();}await finalized(state.airdrop);
 const sig=await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:funding.publicKey,toPubkey:keeper.publicKey,lamports:1_500_000_000n})),[funding],{commitment:'finalized'});state.setupReceipts.push(sig);state.phase='mints';await save();
}
if(state.phase==='mints'){
 for(let k=state.rewardMints.length;k<6;k++){
  const mint=await createMint(connection,keeper,keeper.publicKey,null,6,undefined,{commitment:'finalized'});const ata=await getOrCreateAssociatedTokenAccount(connection,keeper,mint,funding.publicKey,false,'finalized');
  state.setupReceipts.push(await mintTo(connection,keeper,mint,ata.address,keeper,1_000_000_000_000n,[],{commitment:'finalized'}));
  if(k===5){for(let n=0;n<holders.length;n++){const a=await getOrCreateAssociatedTokenAccount(connection,keeper,mint,holders[n].publicKey,false,'finalized');state.setupReceipts.push(await mintTo(connection,keeper,mint,a.address,keeper,BigInt([150000,300000,100000,99999][n])*1000000n,[],{commitment:'finalized'}));}
   const second=await createAccount(connection,keeper,mint,holders[0].publicKey,undefined,{commitment:'finalized'});state.setupReceipts.push(await mintTo(connection,keeper,mint,second,keeper,50000000000n,[],{commitment:'finalized'}));}
  state.setupReceipts.push(await setAuthority(connection,keeper,mint,keeper,AuthorityType.MintTokens,null,[],{commitment:'finalized'}));state.rewardMints.push(mint.toBase58());await save();
 }
 // One recipient has all five ATAs; another has none. Both are eligible.
 for(const mint of state.rewardMints.slice(0,5))await getOrCreateAssociatedTokenAccount(connection,keeper,new PublicKey(mint),holders[0].publicKey,false,'finalized');
 state.openingBalance=String(await connection.getBalance(keeper.publicKey,'finalized'));state.openingSlot=await connection.getSlot('finalized');state.phase='settlement';await save();
}
const ourMint=state.rewardMints[5],pool=funding.publicKey.toBase58();
const cfg=loadConfig({MODE:'test',CLUSTER:cluster,OUR_MINT:ourMint,TREASURY:keeper.publicKey.toBase58(),RPC_URL:rpc,BROADCAST_ENABLED:'true',MASTER_PAUSE:'false'});
const db=new Store(process.env.TEST_DATABASE_URL??'postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_test');await migrate(db);await db.bindMode('test');
const engine=new Engine(db,'test'),chain=new SolanaChain(cfg,new FileTestSigner(keeper,cluster),{signer:funding,outputFor:i=>BigInt(i.amount)*5n});
const leased=await db.lease('test-chain-exercise',7200);ensure(leased,'another worker holds the lease');const lease=leased;
await db.pool.query("UPDATE control SET paused=false,reason='Test-chain settlement exercise'");
const policy={...defaultPolicy,exclusions:[{owner:funding.publicKey.toBase58(),reason:'test market inventory'},{owner:keeper.publicKey.toBase58(),reason:'test treasury'}]};
await engine.ingest({signature:'test-opening-capital:'+state.openingSlot,instruction:'opening-balance',asset:SOL,amount:state.openingBalance,source:pool,destination:keeper.publicKey.toBase58(),slot:state.openingSlot,finalized:true,error:null,kind:'seed',attributionVerified:true,rawEvidence:{testOnly:true,openingCapitalSnapshot:true,setupReceipts:state.setupReceipts}}, {treasury:keeper.publicKey.toBase58()});
if(!state.fundingSignature){state.fundingSignature=await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:funding.publicKey,toPubkey:keeper.publicKey,lamports:300000000n})),[funding],{commitment:'finalized'});await save();}
const observed=await parsedTransfers(connection,state.fundingSignature);ensure(observed&&!observed.tx.meta?.err,'missing finalized funding');const transfer=observed.transfers.find(t=>t.destination===keeper.publicKey.toBase58())!;
await engine.ingest({signature:state.fundingSignature,instruction:transfer.instruction,asset:SOL,amount:transfer.amount,source:pool,destination:transfer.destination,slot:observed.tx.slot,finalized:true,error:null,kind:'creator_fee',attributionVerified:true,pool,publishedPool:pool,rawEvidence:{testOnly:true,simulatedCreatorFunding:true,transfer}},{pool,treasury:transfer.destination,feeSender:pool});
const now=Date.now();const candidates:Candidate[]=state.rewardMints.slice(0,5).map((mint:string,k:number)=>({mint,symbol:'TEST'+(k+1),decimals:6,program:SPL,pool,config:pool,provenanceVerified:true,poolVerified:true,graduated:true,createdAt:now-172800000,liquidityMicroUsd:'20000000000',volumeMicroUsd:'10000000000',holders:100,censusComplete:true,mintAuthority:null,freezeAuthority:null,extensions:[],category:'token',rankValue:String(5-k),rankBasis:policy.rankingBasis,supplyBasis:'synthetic test ranking',source:'Simulated test market; not Ember or Jupiter liquidity',at:now,routeBudget:'100000000',routeViable:true}));
const snap=await fullSnapshot(connection,ourMint,policy,true);const basket=selectBasket(candidates,policy,ourMint,true,now);
await engine.plan({id:'test-chain-epoch-001',policy,basket,snapshot:snap,funding:300000000n,cost:20000000n,price:{microUsd:'200000000',at:now,source:'test valuation'},minReserve:100000000n,maxRound:300000000n,maxDay:1000000000n,treasury:keeper.publicKey.toBase58(),ourMint,routeUnchanged:true,lease});
async function finish(id:string,crash=false){if(crash){try{await runIntent(engine,chain,id,lease,'after_send');}catch(e){ensure((e as Error).message.startsWith('INJECTED_CRASH'),'unexpected error');}}
 for(let n=0;n<180;n++){await runIntent(engine,chain,id,lease);const r=(await db.pool.query('SELECT status,reason FROM intents WHERE id=$1',[id])).rows[0];if(r.status==='finalized')return;if(['needs_review','waiting_for_route'].includes(r.status))throw Error(r.reason);await new Promise(r=>setTimeout(r,1000));}throw Error('Awaiting finality. Resume the same exercise; do not reset its database.');}
for(const [n,i]of (await db.pool.query("SELECT id FROM intents WHERE kind='swap' ORDER BY id")).rows.entries())await finish(i.id,n===0);
for(const asset of candidates){const ata=new Map<string,{exists:boolean;valid:boolean;costMicroUsd:bigint}>();for(let n=0;n<holders.length;n++){const a=await chain.destinationStatus(holders[n].publicKey.toBase58(),asset.mint);ata.set(holders[n].publicKey.toBase58(),{...a,valid:a.valid&&n!==2,costMicroUsd:1000000n});}
 const id=await engine.schedulePayout({asset,chain,price:{microUsd:'1000000',at:Date.now(),source:'test fixed price'},ata,policy,costAccount:'reserve',lease,sourceTokenAccount:chain.destination(keeper.publicKey.toBase58(),asset.mint)});if(id)await finish(id);
}
await finish('buyback:test-chain-epoch-001');await finish('burn:buyback:test-chain-epoch-001');
const record=await exportEpoch(db,'test-chain-epoch-001');await writeFile('docs/test-chain/epoch.json',canonical(record));await writeFile('docs/test-chain/status.json',JSON.stringify({status:'executed',cluster,rpc,at:new Date().toISOString(),funding:state.fundingSignature,setup:state.setupReceipts,notes:'Actual transfers and burn; simulated swaps and creator fees. One eligible holder carries forward. All mints are test-only.'},null,2));
console.log('Test-chain exercise complete. Public receipts: docs/test-chain/epoch.json');await db.close();
