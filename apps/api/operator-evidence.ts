import type { Connection } from '@solana/web3.js';
import type { Config } from '../../packages/core/config.js';
import { ensure, MAINNET_GENESIS } from '../../packages/core/model.js';
import { parsedTransfers } from '../../packages/integrations/solana.js';
/** Labels are not chain evidence. Only an independently fetched, finalized transaction on the configured chain is accepted. */
export async function verifiedOperatorTransfer(connection:Connection,c:Config,signature:string){
 ensure(c.MODE==='live'||c.MODE==='test','financial evidence requires a live or isolated test ledger');
 const genesis=await connection.getGenesisHash();
 ensure(c.MODE==='live'?genesis===MAINNET_GENESIS:genesis!==MAINNET_GENESIS,'RPC genesis does not match evidence ledger');
 const record=await parsedTransfers(connection,signature);
 ensure(record&&record.tx.meta&&record.tx.meta.err===null&&record.tx.slot>0,'finalized successful transfer metadata required');
 ensure(record.tx.transaction.signatures[0]===signature,'RPC evidence signature mismatch');
 return record;
}
