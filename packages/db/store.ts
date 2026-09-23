import pg, { PoolClient } from 'pg';
import { canonical, ensure, hash, Mode } from '../core/model.js';
export type Tx=PoolClient;
export class Store {
 pool:pg.Pool;
 constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:5000});this.pool.on('error',(error:Error&{code?:string})=>{console.error('Database idle connection lost; pool will replace it',{code:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'connection_error'});});}
 async tx<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async bindMode(mode:Mode){await this.tx(async t=>{await t.query('INSERT INTO installation(mode) VALUES($1) ON CONFLICT DO NOTHING',[mode]);const r=await t.query('SELECT mode FROM installation');ensure(r.rows[0].mode===mode,'database mode mismatch; use a separate database');});}
 async close(){await this.pool.end();}
 async doc(kind:string,body:unknown,t?:Tx){const id=kind+':'+hash(body);await (t??this.pool).query('INSERT INTO documents(id,kind,hash,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,kind,hash(body),canonical(body)]);return id;}
 async observe<T extends {type:string}>(body:T){ensure(['observed_market','eligible_selection','worker_readiness'].includes(body.type),'unknown operational observation');const id='observation:'+hash(body);await this.pool.query('INSERT INTO operational_observations(type,id,body) VALUES($1,$2,$3) ON CONFLICT(type) DO UPDATE SET id=excluded.id,body=excluded.body,created_at=clock_timestamp()',[body.type,id,canonical(body)]);return id;}
 async document<T>(id:string,t?:Tx):Promise<T>{const r=await(t??this.pool).query('SELECT body FROM documents WHERE id=$1',[id]);ensure(r.rowCount,'document missing');return r.rows[0].body;}
 async lease(owner:string,seconds=30){return this.tx(async t=>{const r=await t.query(`INSERT INTO leases(name,owner,fence,expires_at) VALUES('worker',$1,1,clock_timestamp()+$2*interval '1 second') ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,fence=leases.fence+1,expires_at=excluded.expires_at WHERE leases.expires_at<clock_timestamp() OR leases.owner=excluded.owner RETURNING fence`,[owner,seconds]);return r.rowCount?{owner,fence:String(r.rows[0].fence)}:null;});}
 async fence(t:Tx,lease:Lease){const r=await t.query("SELECT *,expires_at>clock_timestamp() AS valid FROM leases WHERE name='worker' FOR UPDATE");ensure(r.rows[0]?.owner===lease.owner&&String(r.rows[0].fence)===lease.fence&&r.rows[0].valid,'stale worker fence');}
 async lock(t:Tx){await t.query('SELECT id FROM control WHERE id=true FOR UPDATE');}
 async balance(asset:string,account:string,t?:Tx){const r=await(t??this.pool).query('SELECT coalesce(sum(amount),0)::text AS n FROM postings WHERE asset=$1 AND account=$2',[asset,account]);return BigInt(r.rows[0].n);}
 async balances(t?:Tx){return (await(t??this.pool).query('SELECT asset,account,sum(amount)::text AS amount FROM postings GROUP BY asset,account HAVING sum(amount)<>0 ORDER BY asset,account')).rows;}
 async event(t:Tx,id:string,kind:string,postings:{asset:string;account:string;amount:bigint}[],evidence:unknown={},epoch:string|null=null){
  const existing=await t.query('SELECT id FROM ledger_events WHERE id=$1',[id]);if(existing.rowCount)return false;
  const sums=new Map<string,bigint>();for(const p of postings)sums.set(p.asset,(sums.get(p.asset)??0n)+p.amount);ensure([...sums.values()].every(x=>x===0n),'unbalanced event');
  await t.query('INSERT INTO ledger_events(id,kind,epoch_id,evidence) VALUES($1,$2,$3,$4)',[id,kind,epoch,canonical(evidence)]);
  let line=0;for(const p of postings){if(p.amount===0n)continue;await t.query('INSERT INTO postings VALUES($1,$2,$3,$4,$5)',[id,line++,p.asset,p.account,p.amount.toString()]);}
  const negatives=await t.query("SELECT asset,account FROM postings WHERE account NOT LIKE 'external:%' GROUP BY asset,account HAVING sum(amount)<0");ensure(!negatives.rowCount,'negative reserve/liability');return true;
 }
 async move(t:Tx,id:string,asset:string,from:string,to:string,amount:bigint,evidence:unknown={},epoch:string|null=null){ensure(amount>=0n,'negative movement');return this.event(t,id,'movement',[{asset,account:from,amount:-amount},{asset,account:to,amount}],evidence,epoch);}
 async incident(kind:string,details:unknown){await this.tx(async t=>{await this.lock(t);await this.recordIncident(t,kind,details);});}
 async recordIncident(t:Tx,kind:string,details:unknown){await t.query('INSERT INTO incidents(kind,details) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM incidents WHERE kind=$1 AND resolved_at IS NULL)',[kind,canonical(details)]);await t.query('UPDATE control SET paused=true,reason=$1',[kind]);}
}
export interface Lease {owner:string;fence:string}
