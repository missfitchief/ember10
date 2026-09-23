import { ensure, Policy, Price, usdValue, policyBasketSize } from './model.js';
export function allocate(quantity:bigint, owners:{owner:string;balance:string}[]): {owner:string;amount:string}[]{
 ensure(quantity>=0n,'negative acquisition'); const unique=new Set(owners.map(o=>o.owner)); ensure(unique.size===owners.length,'duplicate owner');
 ensure(owners.every(o=>BigInt(o.balance)>0n),'invalid balance');
 const sum=owners.reduce((s,o)=>s+BigInt(o.balance),0n); ensure(sum>0n||quantity===0n,'no eligible owners');
 if(!sum)return [];
 const rows=owners.map(o=>({owner:o.owner,amount:quantity*BigInt(o.balance)/sum,rem:quantity*BigInt(o.balance)%sum}));
 let dust=quantity-rows.reduce((s,o)=>s+o.amount,0n);
 rows.sort((a,b)=>a.rem===b.rem?(a.owner<b.owner?-1:1):(a.rem>b.rem?-1:1));
 for(const row of rows){if(dust===0n)break;row.amount++;dust--;}
 return rows.sort((a,b)=>a.owner<b.owner?-1:1).map(o=>({owner:o.owner,amount:o.amount.toString()}));
}
export function budget(total:bigint,cost:bigint,policy:Policy,price:Price,now=Date.now()){
 ensure(total>0n&&cost>=0n&&cost<total,'invalid funding');
 ensure(policy.basketBps+policy.buybackBps+policy.operationsBps===10000,'split must sum to 10000');
 ensure(cost*10000n<=total*BigInt(policy.maxCostBps),'cost forecast exceeds cap; accumulate funds');
 const net=total-cost,basket=net*BigInt(policy.basketBps)/10000n,buyback=net*BigInt(policy.buybackBps)/10000n,operations=net*BigInt(policy.operationsBps)/10000n;
 ensure(usdValue(basket,9,price,now,policy.maxPriceAgeSeconds)>=BigInt(policy.minBasketMicroUsd),'waiting for minimum basket funding');
 const size=BigInt(policyBasketSize(policy));
 return {total,cost,net,basket,buyback,operations,leg:basket/size,remainder:net-basket-buyback-operations+basket%size};
}
export function economical(amount:bigint,decimals:number,price:Price|undefined,hasAta:boolean,costMicroUsd:bigint|undefined,policy:Policy,now=Date.now()){
 if(!price||(!hasAta&&costMicroUsd===undefined))return false;
 try {const min=hasAta?BigInt(policy.existingAtaMicroUsd):[BigInt(policy.newAtaMicroUsd),3n*costMicroUsd!].reduce((a,b)=>a>b?a:b);
 return usdValue(amount,decimals,price,now,policy.maxPriceAgeSeconds)>=min;}catch{return false;}
}
