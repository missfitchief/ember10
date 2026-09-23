import type { Config } from './config.js';
import type { DeveloperPayoutPolicy } from './developer.js';
export function developerPolicy(c: Config): DeveloperPayoutPolicy {
 return { enabled: c.DEV_PAYOUT_ENABLED, treasury: c.TREASURY ?? '', destination: c.DEVELOPER_PAYOUT_WALLET,
  minimumPayoutLamports: BigInt(c.DEV_MIN_PAYOUT_LAMPORTS), retainedReserveLamports: BigInt(c.DEV_RETAINED_RESERVE_LAMPORTS),
  payoutCostLamports: BigInt(c.DEV_PAYOUT_MAX_COST_LAMPORTS), maxFeeLamports: BigInt(c.MAX_TX_FEE_LAMPORTS), payoutHourUtc: c.DEV_PAYOUT_HOUR_UTC };
}
