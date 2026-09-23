import { defaultPolicy, SPL } from '../../packages/core/model.js';
import { Candidate, selectBasket, snapshot } from '../../packages/core/selection.js';
import { testAddress } from '../../packages/integrations/demo.js';
export function fixtures(now=Date.now()){
 const mint=testAddress('our-mint'),treasury=testAddress('treasury'),pool=testAddress('pool'),sender=testAddress('fee-sender');
 const policy={...defaultPolicy,version:1,exclusions:[{owner:treasury,reason:'project treasury'}]};
 const candidates:Candidate[]=Array.from({length:5},(_,k)=>({mint:testAddress('reward-'+k),symbol:['CINDER','FLARE','COAL','SPARK','GLOW'][k],decimals:6,program:SPL,pool:testAddress('pool-'+k),config:testAddress('config'),provenanceVerified:true,poolVerified:true,graduated:true,createdAt:now-172800000,liquidityMicroUsd:'15000000000',volumeMicroUsd:'8000000000',holders:65,censusComplete:true,mintAuthority:null,freezeAuthority:null,extensions:[],category:'token',rankValue:String(500000000000-k*70000000000),rankBasis:policy.rankingBasis,supplyBasis:'synthetic circulating supply',source:'DEMO synthetic fixture',at:now,routeBudget:'1000000000',routeViable:true}));
 const accounts=[['alice-1','alice','60000000000'],['alice-2','alice','90000000000'],['bob-1','bob','300000000000'],['dust-1','dust','100000000000'],['below-1','below','99000000000'],['treasury-1','treasury','1000000000000']].map(([a,o,amount])=>({address:testAddress(a),mint,program:SPL,owner:testAddress(o),amount,state:'initialized' as const}));
 const snap=snapshot({mint,decimals:6,program:SPL,slot:500000,accounts,complete:true,supply:accounts.reduce((s,a)=>s+BigInt(a.amount),0n).toString(),supplySlot:500000,policy});
 return {mint,treasury,pool,sender,policy,candidates,basket:selectBasket(candidates,policy,mint,true,now),snapshot:snap,price:{microUsd:'100000000',at:now,source:'DEMO fixed SOL valuation'},owners:['alice','bob','dust','below'].map(testAddress)};
}
