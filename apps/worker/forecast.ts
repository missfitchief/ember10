/** Epoch cost pays treasury purchase ATAs and swap/buyback/burn fees.
 * Holder deliveries use the separately gated reserve and are scheduled only when economical. */
export function epochCostForecast(size: number, maxFee: bigint, treasuryAtaRent: bigint): bigint {
  if (!Number.isInteger(size) || size < 1 || size > 10 || maxFee < 0n || treasuryAtaRent < 0n) throw Error('invalid epoch cost inputs');
  return (BigInt(size) + 2n) * maxFee + (BigInt(size) + 1n) * treasuryAtaRent;
}
