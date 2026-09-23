/** Public allowlist. Raw provider bodies, operator notes, credentials and signed bytes never cross this boundary. */
const fields = new Set(['status','signature','instruction','slot','fee','rent','input','output','transfers','burned','testOnly','settlementPrice','microUsd','at','source','asset','destination','amount','owner','mint','pool','kind','receiptId','receiptIds','evidenceHash','policyHash','actor','finalized','attributionVerified','fundingUses','sourceTokenAccount','error']);
export function publicEvidence(value: unknown): unknown {
 if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
 if (typeof value === 'string') {
  if (/https?:\/\//i.test(value)) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.origin + u.pathname : '[private source]'; } catch { return '[source redacted]'; } }
  return value.length <= 200 ? value : '[details withheld]';
 }
 if (Array.isArray(value)) return value.map(publicEvidence);
 if (typeof value !== 'object') return null;
 return Object.fromEntries(Object.entries(value).filter(([key]) => fields.has(key)).map(([key, item]) => [key, key === 'error' && item != null ? 'transaction_error' : publicEvidence(item)]));
}
