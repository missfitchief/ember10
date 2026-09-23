import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {address,defaultPolicy,ensure,raw} from './model.js';
import {Config} from './config.js';
export const policySchema=z.object({version:z.union([z.literal(1),z.literal(2)]),basketBps:z.number().int().min(0).max(10000),buybackBps:z.number().int().min(0).max(10000),operationsBps:z.number().int().min(0).max(10000),holderUnits:raw,minBasketMicroUsd:raw,maxCostBps:z.number().int().min(0).max(1000),minLiquidityMicroUsd:raw,minVolumeMicroUsd:raw,minOwners:z.number().int().min(1),minAgeSeconds:z.number().int().min(86400),existingAtaMicroUsd:raw,newAtaMicroUsd:raw,maxPriceAgeSeconds:z.number().int().min(1).max(120),maxDataAgeSeconds:z.number().int().min(1).max(180),slippageBps:z.number().int().min(0).max(100),impactBps:z.number().int().min(0).max(200),evaluationSeconds:z.number().int().min(3600),rankingBasis:z.enum(['circulating_market_cap','total_supply_fdv']),snapshotMethod:z.literal('finalized_full_census'),exclusions:z.array(z.object({owner:address,reason:z.string().min(5).max(200)}))}).refine(p=>p.basketBps+p.buybackBps+p.operationsBps===10000,'split must total 10000');
const httpsOrigin=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;},'exact HTTPS origin required');
export const approvalSchema=z.object({approvalId:z.string().min(8),approvedBy:z.string().min(2),approvedAt:z.string().datetime(),expiresAt:z.string().datetime(),ourMint:address,ourPool:address,treasury:address,operations:address,feeSender:address,emberFeeClaimer:address,historyStartSignature:z.string().min(60),maxRoundLamports:raw,maxDayLamports:raw,
 approvedMints:z.array(address).default([]),approvedPrograms:z.array(address).min(1),expectedFundingRoute:z.record(z.string(),z.unknown()),policy:policySchema,
 metricsFile:z.string().min(1).optional(),
 assetAdmission:z.object({version:z.literal('ember-provenance-v1')}).optional(),
 selectionEvidence:z.object({version:z.literal('ember-evidence-v1'),metricsEndpoint:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;},'HTTPS evidence endpoint required'),allowedOrigins:z.array(httpsOrigin).min(1),catalogueCompleteContract:z.boolean()}).optional(),
 developerPayout:z.object({destination:address,minimumPayoutLamports:raw,retainedReserveLamports:raw,payoutCostLamports:raw,maxFeeLamports:raw,payoutHourUtc:z.number().int().min(0).max(23)}).optional()
});
export type Approval=z.infer<typeof approvalSchema>;
export async function loadApproval(c:Config){ensure(c.MODE==='live'&&c.APPROVAL_FILE,'live approval missing');const a=approvalSchema.parse(JSON.parse(await readFile(c.APPROVAL_FILE,'utf8')));
 ensure(Date.parse(a.expiresAt)>Date.now()&&Date.parse(a.approvedAt)<=Date.now(),'pilot approval expired/not effective');
 ensure(a.ourMint===c.OUR_MINT&&a.ourPool===c.OUR_POOL&&a.treasury===c.TREASURY&&a.operations===c.OPERATIONS,'approval identity mismatch');
 ensure(BigInt(c.MAX_ROUND_LAMPORTS)<=BigInt(a.maxRoundLamports)&&BigInt(c.MAX_DAY_LAMPORTS)<=BigInt(a.maxDayLamports),'spend limits exceed approval');
 ensure(a.policy.exclusions.some(e=>e.owner===a.treasury)&&a.policy.exclusions.some(e=>e.owner===a.operations),'mandatory wallet exclusions missing');
 if(c.DEVELOPER_PAYOUT_WALLET)ensure(a.policy.exclusions.some(e=>e.owner===c.DEVELOPER_PAYOUT_WALLET),'developer wallet exclusion missing');
 if(c.DEV_PAYOUT_ENABLED){const p=a.developerPayout;ensure(p&&p.destination===c.DEVELOPER_PAYOUT_WALLET,'developer destination is not approved');
  ensure(p.minimumPayoutLamports===c.DEV_MIN_PAYOUT_LAMPORTS&&p.retainedReserveLamports===c.DEV_RETAINED_RESERVE_LAMPORTS&&p.payoutCostLamports===c.DEV_PAYOUT_MAX_COST_LAMPORTS&&p.maxFeeLamports===c.MAX_TX_FEE_LAMPORTS&&p.payoutHourUtc===c.DEV_PAYOUT_HOUR_UTC,'developer policy differs from approval');}
 return a;}
/** Applies only to NEW commitments, never reinterprets a stored epoch policy. */
export function assertProspectiveApproval(a:Approval){ensure(a.policy.version===2&&BigInt(a.policy.minBasketMicroUsd)>=50000000n,'new EMBER10 basket minimum is USD 50');ensure(a.policy.basketBps===8000&&a.policy.buybackBps===1000&&a.policy.operationsBps===1000,'EMBER10 allocation must remain 80/10/10');ensure(a.assetAdmission?.version==='ember-provenance-v1','reviewed automatic asset admission required');}
export {defaultPolicy};
