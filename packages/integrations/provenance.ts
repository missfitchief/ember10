import {Connection,PublicKey} from '@solana/web3.js';
import {DynamicBondingCurveClient,deriveDbcPoolAddress} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {getMint,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {EmberClient,catalogueSchema} from './ember.js';
import {Approval} from '../core/approval.js';
import {ensure,hash,SPL} from '../core/model.js';
import {Candidate} from '../core/selection.js';
import {fullSnapshot} from './solana.js';
import {JupiterClient} from './jupiter.js';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {address,raw} from '../core/model.js';
/** Provider-specific pool volume/liquidity/circulating-supply evidence is kept explicit.
 * The observed Ember catalogue lacks a comparable circulating supply contract and pool
 * liquidity field. A reviewed feed must supply these; the worker cannot invent them. */
const metric=z.object({mint:address,pool:address,at:z.number(),source:z.string().url(),liquidityMicroUsd:raw,volumeMicroUsd:raw,rankValue:raw,rankBasis:z.string(),supplyBasis:z.string().min(1),category:z.enum(['token','stock','stablecoin','lp','unverified']),graduatedPoolVerified:z.boolean(),evidenceHash:z.string().length(64)});
export const metricsSchema=z.object({catalogueHash:z.string(),complete:z.boolean(),observedAt:z.number(),candidates:z.array(metric)});
export async function verifiedUniverse(connection:Connection,ember:EmberClient,jupiter:JupiterClient,approval:Approval,routeBudget:bigint,completeContract:boolean){
 const rawCatalogue=await ember.read('/markets'),catalogue=catalogueSchema.parse(rawCatalogue.value),configs=(await ember.configs()).value;
 ensure(!catalogue.warming&&configs.count===configs.configs.length,'incomplete discovery/config catalogue');
 const metrics=metricsSchema.parse(JSON.parse(await readFile(approval.metricsFile,'utf8')));
 const universeMints=[...new Set(catalogue.markets.map(m=>m.mint))].sort();
 ensure(metrics.complete&&metrics.catalogueHash===hash(universeMints),'metrics do not cover current complete candidate universe');
 ensure(universeMints.every(m=>metrics.candidates.some(x=>x.mint===m)),'missing candidate metrics');
 const dbc=new DynamicBondingCurveClient(connection,'finalized'),result:Candidate[]=[];
 for(const m of catalogue.markets){const metric=metrics.candidates.find(x=>x.mint===m.mint&&x.pool===(m.dammPool??m.pool));
  // Record exclusions for every catalogue row, including missing/unsupported observations.
  let candidate:Candidate={mint:m.mint,symbol:m.symbol,decimals:0,program:'unknown',pool:m.pool,config:m.config,provenanceVerified:false,poolVerified:false,graduated:m.graduated,createdAt:m.createdAt*1000,liquidityMicroUsd:metric?.liquidityMicroUsd??'0',volumeMicroUsd:metric?.volumeMicroUsd??'0',holders:0,censusComplete:false,mintAuthority:null,freezeAuthority:null,extensions:[],category:metric?.category??'unverified',rankValue:metric?.rankValue??'0',rankBasis:metric?.rankBasis??'unknown',supplyBasis:metric?.supplyBasis??'',source:metric?.source??'unverified catalogue',at:metric?.at??0,routeBudget:routeBudget.toString(),routeViable:false};
  if(!metric||metric.category!=='token'||!m.graduated||Date.now()-metric.at>approval.policy.maxDataAgeSeconds*1000){result.push(candidate);continue;}
  try {
   ensure(configs.configs.some(x=>x.config===m.config),'unknown Ember launch config');
   const pool=await dbc.state.getPool(m.pool),config=await dbc.state.getPoolConfig(m.config);ensure(pool&&config,'pool/config account unavailable');
   ensure(pool.poolState.baseMint.toBase58()===m.mint&&pool.poolState.config.toBase58()===m.config,'on-chain pool identity mismatch');
   ensure(config.feeClaimer.toBase58()===approval.emberFeeClaimer,'unverified fee claimer');
   ensure(deriveDbcPoolAddress(config.quoteMint,new PublicKey(m.mint),new PublicKey(m.config)).toBase58()===m.pool,'pool PDA mismatch');
   const metadata=await getMint(connection,new PublicKey(m.mint),'finalized',TOKEN_PROGRAM_ID);
   candidate={...candidate,decimals:metadata.decimals,program:SPL,provenanceVerified:true,poolVerified:pool.poolState.isMigrated===1&&metric.graduatedPoolVerified,mintAuthority:metadata.mintAuthority?.toBase58()??null,freezeAuthority:metadata.freezeAuthority?.toBase58()??null};
   const snap=await fullSnapshot(connection,m.mint,approval.policy,completeContract);candidate.holders=snap.owners.filter(x=>BigInt(x.balance)>0n).length;candidate.censusComplete=true;
   const q=await jupiter.build(m.mint,routeBudget.toString(),approval.treasury,approval.policy.slippageBps);candidate.routeViable=q.inAmount===routeBudget.toString()&&BigInt(q.outAmount)>0n&&q.slippageBps<=approval.policy.slippageBps&&new Decimal(q.priceImpactPct).abs().lte(new Decimal(approval.policy.impactBps).div(10000));
  }catch{/* Fail closed, retain candidate evidence and explicit failed gates in selection. */}
  result.push(candidate);
 }
 return {candidates:result,complete:true,rawCatalogueHash:hash(universeMints),observedAt:rawCatalogue.at};
}
