import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {address,defaultPolicy,ensure,raw} from './model.js';
import {Config} from './config.js';
export const policySchema=z.object({version:z.number().int().positive(),basketBps:z.number().int().min(0).max(10000),buybackBps:z.number().int().min(0).max(10000),operationsBps:z.number().int().min(0).max(10000),holderUnits:raw,minBasketMicroUsd:raw,maxCostBps:z.number().int().min(0).max(1000),minLiquidityMicroUsd:raw,minVolumeMicroUsd:raw,minOwners:z.number().int().min(1),minAgeSeconds:z.number().int().min(86400),existingAtaMicroUsd:raw,newAtaMicroUsd:raw,maxPriceAgeSeconds:z.number().int().min(1).max(120),maxDataAgeSeconds:z.number().int().min(1).max(180),slippageBps:z.number().int().min(0).max(100),impactBps:z.number().int().min(0).max(200),evaluationSeconds:z.number().int().min(3600),rankingBasis:z.enum(['circulating_market_cap','total_supply_fdv']),snapshotMethod:z.literal('finalized_full_census'),exclusions:z.array(z.object({owner:address,reason:z.string().min(5).max(200)}))}).refine(p=>p.basketBps+p.buybackBps+p.operationsBps===10000,'split must total 10000');
export const approvalSchema=z.object({approvalId:z.string().min(8),approvedBy:z.string().min(2),approvedAt:z.string().datetime(),expiresAt:z.string().datetime(),ourMint:address,ourPool:address,treasury:address,operations:address,feeSender:address,emberFeeClaimer:address,historyStartSignature:z.string().min(60),maxRoundLamports:raw,maxDayLamports:raw,approvedMints:z.array(address).min(6),approvedPrograms:z.array(address).min(1),expectedFundingRoute:z.record(z.string(),z.unknown()),policy:policySchema,metricsFile:z.string().min(1)});
export type Approval=z.infer<typeof approvalSchema>;
export async function loadApproval(c:Config){ensure(c.MODE==='live'&&c.APPROVAL_FILE,'live approval missing');const a=approvalSchema.parse(JSON.parse(await readFile(c.APPROVAL_FILE,'utf8')));
 ensure(Date.parse(a.expiresAt)>Date.now()&&Date.parse(a.approvedAt)<=Date.now(),'pilot approval expired/not effective');
 ensure(a.ourMint===c.OUR_MINT&&a.ourPool===c.OUR_POOL&&a.treasury===c.TREASURY&&a.operations===c.OPERATIONS,'approval identity mismatch');
 ensure(BigInt(c.MAX_ROUND_LAMPORTS)<=BigInt(a.maxRoundLamports)&&BigInt(c.MAX_DAY_LAMPORTS)<=BigInt(a.maxDayLamports),'spend limits exceed approval');
 ensure(a.policy.exclusions.some(e=>e.owner===a.treasury)&&a.policy.exclusions.some(e=>e.owner===a.operations),'mandatory wallet exclusions missing');
 return a;}
export {defaultPolicy};
