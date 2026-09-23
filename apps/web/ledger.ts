import type { PublicWalletRewards } from '../../packages/shared/public.js';
import { decimal } from './view-model.js';
export interface Credit { asset:string; credited:string; paid:string; pending:string }
export interface Delivery { id:string; asset:string; status:string; result?:{signature?:string} }
export interface WalletResult { address:string; status?:string; reason:string; snapshotSlot:number|null; eligibility:{eligible?:boolean;reason?:string}|null; entitlements:Credit[]; deliveries:Delivery[] }
export interface Ledger { receivedLamports:string|null; finalizedPayoutTransactions:string|null; assets:{mint:string;symbol:string;decimals:number}[]; accrued:Credit[]; balances:{asset:string;account:string;amount:string}[]; accountingHealth:string; burns:unknown[]; reconciliation:unknown; incidents:unknown[] }
export type Epoch = { id:string; status:string; reason?:string; created_at?:string };
export interface EpochDetail { mode?:string; testOnly?:boolean; epoch:Epoch; snapshot:{slot:number;hash:string}; entitlements:unknown[]; intents:(Delivery&{kind:string})[]; transfers:Delivery[] }
export type PublicRecord = Record<string,unknown>;
const array = <T>(v:unknown):T[] => Array.isArray(v)?v as T[]:[];
const raw = (v:unknown) => typeof v==='string'&&/^\d+$/.test(v)?v:null;
export function walletResult(input: PublicWalletRewards|PublicRecord): WalletResult {
  const v=input as PublicRecord;
  if(v.mode==='demo'||v.mode==='test'||v.testOnly===true)throw Error('Test reward records are not presented as real wallet rewards.');
  return {address:String(v.address??''),status:typeof v.status==='string'?v.status:undefined,reason:String(v.reason??''),snapshotSlot:typeof v.snapshotSlot==='number'?v.snapshotSlot:null,eligibility: v.eligibility&&typeof v.eligibility==='object'?v.eligibility as WalletResult['eligibility']:null,entitlements:array<Credit>(v.entitlements),deliveries:array<Delivery>(v.deliveries)};
}
export function ledgerResult(v:PublicRecord):Ledger|null {
  if(v.status==='unavailable'||v.mode==='demo'||v.mode==='test'||v.testOnly===true||!Array.isArray(v.accrued)||!Array.isArray(v.assets))return null;
  return {receivedLamports:raw(v.receivedLamports),finalizedPayoutTransactions:raw(v.finalizedPayoutTransactions),assets:array(v.assets),accrued:array(v.accrued),balances:array(v.balances),accountingHealth:String(v.accountingHealth??'unreported'),burns:array(v.burns),reconciliation:v.reconciliation??null,incidents:array(v.incidents)};
}
export function creditState(row:Credit) { const paid=decimal(row.paid),pending=decimal(row.pending); if(!paid||!pending)return 'Unreported'; if(paid.gt(0)&&pending.gt(0))return 'Partially paid'; if(pending.gt(0))return 'Awaiting delivery'; if(paid.gt(0))return 'Paid'; return 'No accrued units'; }
/** A transfer repeats its originating intent. Prefer the terminal transfer evidence by ID. */
export function uniqueReceipts(intents:Delivery[],transfers:Delivery[]) { return [...new Map([...intents,...transfers].map(row=>[row.id,row])).values()]; }
export function transferUrl(signature:string|undefined,cluster:string|undefined) { if(!signature||!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)||!['mainnet-beta','devnet'].includes(cluster??''))return null; return `https://explorer.solana.com/tx/${signature}${cluster==='devnet'?'?cluster=devnet':''}`; }
