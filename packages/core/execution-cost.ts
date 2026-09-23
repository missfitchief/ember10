import type { Intent } from './engine.js';
import { ensure, SOL } from './model.js';

/** A cash budget is not evidence of what one transaction can debit. */
export function maximumNativeCost(i:Pick<Intent,'kind'|'asset'|'expected'>):bigint|null {
 const fee=BigInt(i.expected.maxFee);
 ensure(fee>=0n,'negative fee cap');
 // These locally constructed transaction kinds never create accounts.
 if(i.kind==='burn'||i.kind==='operations'&&i.asset===SOL)return fee;
 const cap=i.expected.maxNativeCost,rent=i.expected.maxRent;
 if(typeof cap!=='string'||typeof rent!=='string'||!/^\d+$/.test(cap)||!/^\d+$/.test(rent))return null;
 return BigInt(cap)===fee+BigInt(rent)?BigInt(cap):null;
}

/** Call after the last fresh budget check, immediately before signing. */
export function bindNativeCost(i:Intent,rent:bigint,requiredRent=rent){
 ensure(rent>=0n&&requiredRent>=rent,'invalid native rent bound');
 const fee=BigInt(i.expected.maxFee);
 ensure(fee+requiredRent<=BigInt(String(i.expected.maxTotalCost??'0')),'rent/fee allowance insufficient; defer before signing');
 i.expected={...i.expected,maxRent:rent.toString(),requiredRent:requiredRent.toString(),maxNativeCost:(fee+rent).toString()};
}
