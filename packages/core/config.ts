import { z } from 'zod';
import { existsSync } from 'node:fs';
import { address, raw, WSOL } from './model.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const bool=z.enum(['true','false']).default('false').transform(x=>x==='true');
const optionalAddress=z.preprocess(v=>v===''?undefined:v,address.optional());
export const configSchema=z.object({
 MODE:z.enum(['prelaunch','demo','test','live']).default('prelaunch'),
 CLUSTER:z.enum(['localnet','devnet','mainnet-beta']).default('localnet'),
 DATABASE_URL:z.string().url().default('postgresql://ember5:local-development-only@127.0.0.1:55432/ember5_prelaunch'),
 RPC_URL:z.string().url().default('http://127.0.0.1:8899'), SECONDARY_RPC_URL:z.string().url().optional(),
 OUR_MINT:optionalAddress, OUR_POOL:optionalAddress, TREASURY:optionalAddress, OPERATIONS:optionalAddress,
 QUOTE_MINT:z.string().default(WSOL), SIGNER_FILE:z.string().optional(), SIGNER_URL:z.string().url().optional(),
 SIGNER_TOKEN:z.string().optional(), JUPITER_API_KEY:z.string().optional(), OPERATOR_TOKEN:z.string().min(32).optional(),
 BROADCAST_ENABLED:bool, MASTER_PAUSE:z.enum(['true','false']).default('true').transform(x=>x==='true'),
 APPROVAL_FILE:z.string().optional(), MAX_ROUND_LAMPORTS:raw.default('1000000000'), MAX_DAY_LAMPORTS:raw.default('5000000000'),
 MIN_RESERVE_LAMPORTS:raw.default('100000000'), MAX_TX_FEE_LAMPORTS:raw.default('100000'),
 DEVELOPER_PAYOUT_WALLET:optionalAddress, DEV_PAYOUT_ENABLED:bool,
 DEV_MIN_PAYOUT_LAMPORTS:raw.default('10000000'), DEV_RETAINED_RESERVE_LAMPORTS:raw.default('100000000'),
 DEV_PAYOUT_MAX_COST_LAMPORTS:raw.default('100000'), DEV_PAYOUT_HOUR_UTC:z.coerce.number().int().min(0).max(23).default(0),
 EMBER10_PROXY_SECRET:z.string().min(32).optional(),
 API_PORT:z.coerce.number().int().min(1024).max(65535).default(4310), HOST:z.string().default('127.0.0.1'),
 CENSUS_COMPLETE_CONTRACT:z.enum(['true','false']).default('false').transform(x=>x==='true')
}).superRefine((c,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 if(c.MODE==='demo'&&c.BROADCAST_ENABLED)fail('demo can never broadcast');
 if(c.MODE==='prelaunch'&&c.BROADCAST_ENABLED)fail('prelaunch can never broadcast');
 if(c.MODE==='test'&&c.CLUSTER==='mainnet-beta')fail('test keys cannot use mainnet');
 if(c.DEV_PAYOUT_ENABLED&&(!c.DEVELOPER_PAYOUT_WALLET||c.MODE!=='live'))fail('developer payouts require a live approved destination');
 if(c.DEVELOPER_PAYOUT_WALLET===c.TREASURY&&c.DEVELOPER_PAYOUT_WALLET)fail('developer destination must differ from treasury');
 if(c.MODE==='live'){
  if(c.CLUSTER!=='mainnet-beta')fail('live requires mainnet identity');
  if(!c.TREASURY||!c.SECONDARY_RPC_URL)fail('live inspection requires treasury and independent history provider');
  if(c.SIGNER_FILE)fail('live file keys forbidden');
  if(c.BROADCAST_ENABLED){
   if(!c.OUR_MINT||!c.OUR_POOL||!c.OPERATIONS||!c.JUPITER_API_KEY)fail('live signing configuration incomplete');
   if(!c.SIGNER_URL)fail('live signing requires remote secret-store signer');
   if(!c.APPROVAL_FILE)fail('separate signed-off pilot approval required');
  }
 }
 if(c.OUR_MINT==='9LYpEqkpgCoZ99NsrPuoobDZsShteajdqtCtpKscStq7')fail('competitor mint is forbidden as project identity');
});
export type Config=z.infer<typeof configSchema>;
export const loadConfig=(env:NodeJS.ProcessEnv=process.env)=>configSchema.parse(env);
