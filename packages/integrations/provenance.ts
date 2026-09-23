import {Connection,PublicKey,TransactionInstruction,type ParsedTransactionWithMeta} from '@solana/web3.js';
import {DynamicBondingCurveClient,DynamicBondingCurveIdl,deriveDbcPoolAddress,createDammV2Program,deriveDammV2PoolAddress,deriveDammV2PoolAuthority,DAMM_V2_MIGRATION_FEE_ADDRESS,DAMM_V2_PROGRAM_ID,DYNAMIC_BONDING_CURVE_PROGRAM_ID} from '@meteora-ag/dynamic-bonding-curve-sdk';
import bs58 from 'bs58';
import {getMint,getAccount,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {z} from 'zod';
import Decimal from 'decimal.js';
import type {Approval} from '../core/approval.js';
import {address,ensure,fresh,hash,raw,SPL,WSOL} from '../core/model.js';
import type {Candidate} from '../core/selection.js';
import {EmberClient} from './ember.js';
import {fullSnapshot} from './solana.js';
import {JupiterClient,validateSwapInstruction} from './jupiter.js';
import {boundedFetch} from './http.js';
import {normalizeCatalogue} from './market-data.js';
import {mapBounded,type VerifiedUniverse,type UniverseProvider} from './automatic-selection.js';
import {JupiterTokensCollector,JUPITER_TOKENS_ENDPOINT,type JupiterTokensObservation} from './jupiter-tokens.js';

export interface SelectionEvidenceConfig {version:'ember-evidence-v1';provider?:'custom'|'jupiter-tokens-v2';metricsEndpoint?:string;allowedOrigins:string[];catalogueCompleteContract:boolean}
export type EvidenceApproval=Pick<Approval,'policy'|'ourMint'|'treasury'|'emberFeeClaimer'|'approvedPrograms'>&{selectionEvidence?:SelectionEvidenceConfig};
const boundedRaw=raw.refine(v=>v.length<=100);
const metric=z.object({mint:address,pool:address,at:z.number().int().positive(),source:z.string().url(),liquidityMicroUsd:boundedRaw,volumeMicroUsd:boundedRaw,rankValue:boundedRaw,rankBasis:z.enum(['circulating_market_cap','total_supply_fdv']),supplyBasis:z.string().min(8).max(500).refine(v=>!/unknown|undocumented|unverified/i.test(v)),supplyAmountRaw:boundedRaw,supplyDecimals:z.number().int().min(0).max(18),priceMicroUsd:boundedRaw,category:z.enum(['token','stock','stablecoin','lp','unverified']),volumeWindowStart:z.number().int().positive(),volumeWindowEnd:z.number().int().positive(),volumeComplete:z.boolean(),evidenceHash:z.string().regex(/^[a-f0-9]{64}$/)});
export const metricsSchema=z.object({schemaVersion:z.literal(1),catalogueHash:z.string().regex(/^[a-f0-9]{64}$/),complete:z.boolean(),observedAt:z.number().int().positive(),candidates:z.array(metric).max(20000)});
export type AutomaticMetric=z.infer<typeof metric>;
const row=z.object({mint:address,pool:address,config:address,quoteMint:address,graduated:z.boolean(),signature:z.string().optional()}).passthrough();
export type CatalogueIdentity=z.infer<typeof row>;
export type CandidateVerifier=(candidate:Candidate,market:CatalogueIdentity,metric:AutomaticMetric,budget:bigint)=>Promise<Candidate>;
export interface EvidenceDependencies {fetchMetrics?:(url:string)=>Promise<unknown>;verifyCandidate?:CandidateVerifier;clock?:()=>number;concurrency?:number;jupiterApiKey?:string;jupiterFetcher?:typeof fetch;jupiterWait?:(ms:number)=>Promise<void>}

export function approvedMetricsUrl(config:SelectionEvidenceConfig){
 ensure(config.metricsEndpoint,'automatic evidence endpoint missing');
 const url=new URL(config.metricsEndpoint);
 ensure(config.version==='ember-evidence-v1'&&url.protocol==='https:'&&!url.username&&!url.password&&!url.hash,'unsupported automatic evidence endpoint');
 ensure(config.allowedOrigins.some(origin=>{try{const allowed=new URL(origin);return allowed.protocol==='https:'&&allowed.origin===origin&&url.origin===origin;}catch{return false;}}),'automatic evidence origin is not approved');
 return url.href;
}
/** Network/RPC failures remain exclusions; source strings never contain provider credentials. */
const sourceReference=(value:string)=>{const url=new URL(value);ensure(url.protocol==='https:'&&!url.username&&!url.password,'invalid metric source');return url.origin+url.pathname;};

/** Merely appearing in an old transaction does not prove a pool existed then. Require its successful DBC initializer. */
export function verifiedPoolCreationTime(tx:ParsedTransactionWithMeta|null,market:Pick<CatalogueIdentity,'pool'|'mint'|'config'>):number|null{
 if(!tx?.meta||tx.meta.err!==null||!tx.blockTime)return null;
 const definition=DynamicBondingCurveIdl.instructions.find(ix=>ix.name==='initialize_virtual_pool_with_spl_token');
 ensure(definition,'installed DBC initializer schema missing');
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions??[]).flatMap(group=>group.instructions)];
 for(const ix of instructions){
  if(!ix.programId.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)||!('data' in ix))continue;
  let bytes:Uint8Array;try{bytes=bs58.decode(ix.data);}catch{continue;}
  if(!Buffer.from(bytes.subarray(0,8)).equals(Buffer.from(definition.discriminator)))continue;
  if(ix.accounts[0]?.toBase58()!==market.config||ix.accounts[3]?.toBase58()!==market.mint||ix.accounts[5]?.toBase58()!==market.pool)continue;
  const index=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===market.pool);
  if(index>=0&&tx.meta.postBalances[index]>0)return tx.blockTime*1000;
 }
 return null;
}

export function validateMetrics(value:unknown,mints:string[],config:SelectionEvidenceConfig,now:number,maxAge:number){
 const metrics=metricsSchema.parse(value);
 ensure(metrics.complete&&metrics.catalogueHash===hash([...mints].sort()),'automatic metric universe does not match discovery');
 ensure(fresh(metrics.observedAt,now,maxAge),'automatic metrics stale');
 const seen=new Set<string>();
 for(const m of metrics.candidates){
  ensure(!seen.has(m.mint),'duplicate metric mint');seen.add(m.mint);
  ensure(config.allowedOrigins.includes(new URL(m.source).origin),'metric attribution origin is not approved');
  sourceReference(m.source);
  ensure(fresh(m.at,now,maxAge)&&m.at<=metrics.observedAt,'candidate metrics stale or future');
  ensure(m.volumeComplete&&m.volumeWindowEnd<=m.at&&fresh(m.volumeWindowEnd,now,maxAge)&&m.volumeWindowEnd-m.volumeWindowStart===86_400_000,'24h volume window incomplete');
  ensure(BigInt(m.priceMicroUsd)>0n&&BigInt(m.supplyAmountRaw)>0n,'supply/price evidence missing');
  ensure(BigInt(m.supplyAmountRaw)*BigInt(m.priceMicroUsd)/10n**BigInt(m.supplyDecimals)===BigInt(m.rankValue),'market cap does not match supply/price evidence');
 }
 ensure(seen.size===mints.length&&mints.every(m=>seen.has(m)),'metrics omit current catalogue members');
 return metrics;
}

/** Automatic feed + chain producer. A reviewed metric service is still required for circulating supply/category/24h history. */
export function createUniverseProvider(connection:Connection,ember:EmberClient,jupiter:JupiterClient,approval:EvidenceApproval,completeCensusContract:boolean,deps:EvidenceDependencies={}):UniverseProvider{
 const clock=deps.clock??Date.now,verify=deps.verifyCandidate??chainVerifier(connection,jupiter,approval,completeCensusContract,clock);
 const fetchMetrics=deps.fetchMetrics??((url:string)=>boundedFetch(url,{},12_000_000));
 let jupiterTokens:JupiterTokensCollector|undefined;
 return async (routeBudget,force)=>{
  const [rawCatalogue,rawConfigs]=await Promise.all([ember.read('/markets',force?0:45_000),ember.read('/configs',force?0:45_000)]);
  const normalized=normalizeCatalogue(rawCatalogue.value,rawConfigs.value,approval.ourMint,new Date(rawCatalogue.at).toISOString());
  const identities=z.object({markets:z.array(z.unknown())}).parse(rawCatalogue.value).markets.map(m=>row.safeParse(m)).filter(m=>m.success).map(m=>m.data!);
  const mints=normalized.markets.map(m=>m.mint),catalogueHash=hash([...mints].sort()),config=approval.selectionEvidence;
  let metrics:ReturnType<typeof metricsSchema.parse>|undefined,providerObservation:JupiterTokensObservation|undefined,metricFailure='Automatic metrics provider is not configured.';
  if(config?.provider==='jupiter-tokens-v2')try{
   ensure(config.version==='ember-evidence-v1','automatic provider version unsupported');
   jupiterTokens??=new JupiterTokensCollector({apiKey:deps.jupiterApiKey,allowedOrigins:config.allowedOrigins,endpoint:config.metricsEndpoint,clock,fetcher:deps.jupiterFetcher,wait:deps.jupiterWait});
   providerObservation=await jupiterTokens.read(mints,approval.policy.maxDataAgeSeconds,force);
   metricFailure='Jupiter Tokens observations collected automatically; documented category, circulating-supply methodology and complete USD volume evidence remain unavailable.';
  }catch{metricFailure='Approved Jupiter Tokens collector unavailable; no eligibility evidence was fabricated.';}
  else if(config)try{metrics=validateMetrics(await fetchMetrics(approvedMetricsUrl(config)),mints,config,clock(),approval.policy.maxDataAgeSeconds);}catch{metricFailure='Automatic metrics provider unavailable, incomplete, stale or unbound to this catalogue.';}
  const byMint=new Map(metrics?.candidates.map(m=>[m.mint,m]));
  const reports=new Map(providerObservation?.rows.map(row=>[row.mint,row]));
  const candidates=await mapBounded(normalized.markets,deps.concurrency??3,async market=>{
   const m=identities.find(m=>m.mint===market.mint),metric=byMint.get(market.mint);
   let candidate:Candidate={mint:market.mint,symbol:market.symbol,decimals:0,program:'unknown',pool:market.canonicalPool??m?.pool??'',config:market.config??'',provenanceVerified:false,poolVerified:false,graduated:m?.graduated??false,createdAt:0,liquidityMicroUsd:metric?.liquidityMicroUsd??'0',volumeMicroUsd:metric?.volumeMicroUsd??'0',holders:0,censusComplete:false,mintAuthority:null,freezeAuthority:null,extensions:[],category:metric?.category??'unverified',rankValue:metric?.rankValue??'0',rankBasis:metric?.rankBasis??'unknown',supplyBasis:metric?.supplyBasis??'unknown',source:metric?sourceReference(metric.source):'https://embercurve.fun/api/solana/markets',at:metric?.at??0,routeBudget:routeBudget.toString(),routeViable:false,evidenceFailures:[]};
   const sourceFailures=market.reasons.filter(r=>r.state==='fail'&&!['minimum_age','volume','holders'].includes(r.code)).map(r=>r.label);
   if(sourceFailures.length)candidate.evidenceFailures!.push(...sourceFailures);
   if(providerObservation){
    const reported=reports.get(market.mint);candidate.source=JUPITER_TOKENS_ENDPOINT;
    candidate.evidenceFailures!.push(...providerObservation.blockers);
    if(!reported)candidate.evidenceFailures!.push('Jupiter returned no usable observation for this catalogue mint.');
    else {
     candidate.evidenceHash=reported.evidenceHash;candidate.evidenceFailures!.push(...reported.reasons);
     candidate.category=reported.category;
     // A below-threshold reported total is sufficient to deny eligibility; it is never evidence to pass a pool's liquidity gate.
     if(reported.state==='fresh'&&reported.liquidityUsd!==null&&new Decimal(reported.liquidityUsd).mul(1000000).lt(approval.policy.minLiquidityMicroUsd))candidate.evidenceFailures!.push('Jupiter reported total USD liquidity is below the minimum.');
    }
    return candidate;
   }
   if(!metrics||!metric){candidate.evidenceFailures!.push(metricFailure);return candidate;}
   if(!m||metric.pool!==market.canonicalPool){candidate.evidenceFailures!.push('Metric canonical pool does not match catalogue');return candidate;}
   if(sourceFailures.length||!candidate.graduated||candidate.category!=='token')return candidate;
   if(BigInt(metric.liquidityMicroUsd)<BigInt(approval.policy.minLiquidityMicroUsd)||BigInt(metric.volumeMicroUsd)<BigInt(approval.policy.minVolumeMicroUsd)){
    candidate.evidenceFailures!.push('Verified metric liquidity or 24h USD volume is below the minimum; costly chain checks were not needed to exclude it.');return candidate;
   }
   try{candidate=await verify(candidate,m,metric,routeBudget);}catch{candidate.evidenceFailures!.push('On-chain or route evidence unavailable; verification incomplete');}
   return candidate;
  });
  const complete=!!config?.catalogueCompleteContract&&normalized.coverage.status!=='partial'&&!!metrics;
  return {candidates,complete,rawCatalogueHash:catalogueHash,observedAt:rawCatalogue.at,retryableFailure:!!config&&!metrics&&(!providerObservation||providerObservation.coverage!=='complete'),reason:complete?undefined:!metrics?metricFailure:'Catalogue coverage contract is missing or source is partial/warming.',...(providerObservation?{providerObservation}:{})} satisfies VerifiedUniverse;
 };
}

function chainVerifier(connection:Connection,jupiter:JupiterClient,approval:EvidenceApproval,completeContract:boolean,clock:()=>number):CandidateVerifier{
 // Evidence RPC has explicit per-request bounds. No signer or RPC mutation methods are used.
 connection=new Connection(connection.rpcEndpoint,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(url,init)=>{
  const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});
  ensure(response.ok&&response.body,'evidence RPC unavailable');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>24_000_000){await reader.cancel();throw Error('evidence RPC result exceeds complete-census bound');}chunks.push(r.value);}
  return new Response(Buffer.concat(chunks),{status:response.status,headers:{'content-type':'application/json'}});
 }});
 const dbc=new DynamicBondingCurveClient(connection,'finalized'),damm=createDammV2Program(connection,'finalized');
 return async (input,m,metric,routeBudget)=>{
  const candidate={...input,evidenceFailures:[...(input.evidenceFailures??[])]};
  const [owners,pool,config]=await Promise.all([connection.getMultipleAccountsInfo([new PublicKey(m.pool),new PublicKey(m.config),new PublicKey(candidate.pool)],'finalized'),dbc.state.getPool(m.pool),dbc.state.getPoolConfig(m.config)]);
  ensure(owners[0]?.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)&&owners[1]?.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)&&owners[2]?.owner.equals(DAMM_V2_PROGRAM_ID),'unexpected pool/config account program');
  ensure(pool&&config&&pool.poolState.baseMint.toBase58()===m.mint&&pool.poolState.config.toBase58()===m.config,'pool identity mismatch');
  ensure(config.feeClaimer.toBase58()===approval.emberFeeClaimer&&config.quoteMint.toBase58()===m.quoteMint,'launch provenance mismatch');
  ensure(deriveDbcPoolAddress(config.quoteMint,new PublicKey(m.mint),new PublicKey(m.config)).toBase58()===m.pool,'DBC pool PDA mismatch');
  candidate.provenanceVerified=true;
  ensure(config.migrationOption===1&&pool.poolState.isMigrated===1,'graduated DAMM v2 migration not verified');
  const migrationConfig=DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];ensure(migrationConfig,'unknown DAMM migration configuration');
  ensure(deriveDammV2PoolAddress(migrationConfig,new PublicKey(m.mint),config.quoteMint).toBase58()===candidate.pool,'graduated pool PDA mismatch');
  const migrated=await damm.account.pool.fetch(new PublicKey(candidate.pool));
  ensure(migrated.tokenAMint.toBase58()===m.mint&&migrated.tokenBMint.equals(config.quoteMint)&&migrated.poolStatus===0,'graduated pool identity/status mismatch');
  ensure(migrated.tokenAFlag===0&&migrated.tokenBFlag===0,'unsupported pool token semantics');
  const [metadata,quoteMetadata,baseVault,quoteVault,prices]=await Promise.all([getMint(connection,new PublicKey(m.mint),'finalized',TOKEN_PROGRAM_ID),getMint(connection,config.quoteMint,'finalized',TOKEN_PROGRAM_ID),getAccount(connection,migrated.tokenAVault,'finalized',TOKEN_PROGRAM_ID),getAccount(connection,migrated.tokenBVault,'finalized',TOKEN_PROGRAM_ID),jupiter.prices([m.mint,m.quoteMint],connection)]);
  const authority=deriveDammV2PoolAuthority();
  ensure(baseVault.mint.toBase58()===m.mint&&quoteVault.mint.equals(config.quoteMint)&&baseVault.owner.equals(authority)&&quoteVault.owner.equals(authority)&&!baseVault.isFrozen&&!quoteVault.isFrozen,'pool vault identity/state mismatch');
  ensure(metadata.tlvData.length===0&&quoteMetadata.tlvData.length===0,'token extensions unsupported');
  candidate.poolVerified=true;candidate.decimals=metadata.decimals;candidate.program=SPL;candidate.mintAuthority=metadata.mintAuthority?.toBase58()??null;candidate.freezeAuthority=metadata.freezeAuthority?.toBase58()??null;
  ensure(metadata.decimals===metric.supplyDecimals&&BigInt(metric.supplyAmountRaw)<=metadata.supply,'supply evidence exceeds on-chain supply');
  if(metric.rankBasis==='total_supply_fdv')ensure(BigInt(metric.supplyAmountRaw)===metadata.supply,'FDV supply must match mint');
  const basePrice=prices.get(m.mint),quotePrice=prices.get(m.quoteMint);ensure(basePrice&&quotePrice&&fresh(basePrice.at,clock(),approval.policy.maxPriceAgeSeconds)&&fresh(quotePrice.at,clock(),approval.policy.maxPriceAgeSeconds),'pool USD prices unavailable');
  const baseBalance=baseVault.amount-BigInt(migrated.protocolAFee.toString()),quoteBalance=quoteVault.amount-BigInt(migrated.protocolBFee.toString());ensure(baseBalance>=0n&&quoteBalance>=0n,'pool reserve accounting invalid');
  const vaultValue=baseBalance*BigInt(basePrice.microUsd)/10n**BigInt(metadata.decimals)+quoteBalance*BigInt(quotePrice.microUsd)/10n**BigInt(quoteMetadata.decimals);
  candidate.liquidityMicroUsd=(vaultValue<BigInt(metric.liquidityMicroUsd)?vaultValue:BigInt(metric.liquidityMicroUsd)).toString();
  // Confirm an actual DBC initialization, never merely an old transaction mentioning a future pool PDA.
  let existenceTime:number|null=null;
  if(m.signature)existenceTime=verifiedPoolCreationTime(await connection.getParsedTransaction(m.signature,{commitment:'finalized',maxSupportedTransactionVersion:0}),m);
  if(existenceTime===null){
   const history=await connection.getSignaturesForAddress(new PublicKey(m.pool),{limit:100},'finalized');
   for(const item of history.filter(tx=>tx.err===null&&tx.blockTime).slice(-3).reverse()){
    existenceTime=verifiedPoolCreationTime(await connection.getParsedTransaction(item.signature,{commitment:'finalized',maxSupportedTransactionVersion:0}),m);
    if(existenceTime!==null)break;
   }
  }
  ensure(existenceTime!==null&&existenceTime<=clock(),'pool age evidence missing');candidate.createdAt=existenceTime;
  const snap=await fullSnapshot(connection,m.mint,approval.policy,completeContract);candidate.holders=snap.owners.filter(owner=>BigInt(owner.balance)>0n).length;candidate.censusComplete=true;
  if(routeBudget>0n){
   const started=clock(),q=await jupiter.build(m.mint,routeBudget.toString(),approval.treasury,approval.policy.slippageBps);
   ensure(q.inputMint===WSOL&&q.outputMint===m.mint&&q.inAmount===routeBudget.toString()&&BigInt(q.outAmount)>0n&&q.slippageBps<=approval.policy.slippageBps&&new Decimal(q.priceImpactPct).abs().lte(new Decimal(approval.policy.impactBps).div(10000)),'budget route exceeds policy');
   const ix=new TransactionInstruction({programId:new PublicKey(q.swapInstruction.programId),keys:q.swapInstruction.accounts.map(a=>({...a,pubkey:new PublicKey(a.pubkey)})),data:Buffer.from(q.swapInstruction.data,'base64')});
   const minimum=validateSwapInstruction(ix,{id:'selection-only',epoch_id:null,kind:'swap',asset:'SOL',amount:routeBudget.toString(),status:'read_only',expected:{inputAsset:'SOL',outputAsset:m.mint,from:approval.treasury,maxFee:'0',costAccount:'unfunded'}},new PublicKey(approval.treasury),q.outAmount,q.slippageBps);
   ensure(minimum>0n&&minimum===BigInt(q.otherAmountThreshold),'budget route minimum output mismatch');
   const programInfos=await connection.getMultipleAccountsInfo([ix.programId,...ix.keys.map(a=>a.pubkey)],'finalized');
   ensure(approval.approvedPrograms.includes(ix.programId.toBase58()),'unapproved route program');
   for(let i=0;i<programInfos.length;i++)if(programInfos[i]?.executable)ensure(approval.approvedPrograms.includes(i===0?ix.programId.toBase58():ix.keys[i-1].pubkey.toBase58()),'route executable not approved');
   ensure(clock()-started<15_000,'budget route became stale during evidence validation');candidate.routeViable=true;
  }
  candidate.evidenceAt=clock();candidate.evidenceHash=hash({mint:m.mint,pool:candidate.pool,metric:metric.evidenceHash,snapshot:snap.hash,supply:metadata.supply.toString(),baseVault:baseVault.amount.toString(),quoteVault:quoteVault.amount.toString(),basePrice,quotePrice,existenceTime,budget:routeBudget.toString(),routeViable:candidate.routeViable});
  return candidate;
 };
}

/** Compatibility entry point; metricsFile is deliberately never read. Prefer one long-lived coordinator/provider. */
export async function verifiedUniverse(connection:Connection,ember:EmberClient,jupiter:JupiterClient,approval:EvidenceApproval,routeBudget:bigint,completeContract:boolean){return createUniverseProvider(connection,ember,jupiter,approval,completeContract)(routeBudget,true);}
