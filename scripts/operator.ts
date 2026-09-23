import {writeFile,readFile} from 'node:fs/promises';
import {loadConfig} from '../packages/core/config.js';
import {Store} from '../packages/db/store.js';
import {policySchema} from '../packages/core/approval.js';
import {ensure,canonical} from '../packages/core/model.js';
const c=loadConfig(),[command,arg]=process.argv.slice(2);ensure(c.OPERATOR_TOKEN,'Set a server-side OPERATOR_TOKEN (at least 32 characters).');
if(command==='policy'){
 ensure(arg,'policy JSON path required');const policy=policySchema.parse(JSON.parse(await readFile(arg,'utf8')));const db=new Store(c.DATABASE_URL);await db.bindMode(c.MODE);
 const id=await db.tx(async t=>{await db.lock(t);const max=(await t.query("SELECT coalesce(max((body->>'version')::int),0) AS version FROM documents WHERE kind='policy'")).rows[0].version;ensure(policy.version>max,'policy version must increase');const id=await db.doc('policy',policy,t);await t.query("INSERT INTO operator_audit(actor,action,body) VALUES('local-authenticated-operator','publish-policy',$1)",[canonical({id})]);return id;});console.log(id);await db.close();
}else{
 const paths:Record<string,string>={selection:'selection',funding:'funding',plan:'plan',snapshots:'snapshots',pause:'pause',resume:'resume',reconcile:'reconcile',capital:'capital'};
 ensure(command in paths||command==='export','Commands: selection, funding, plan, snapshots, pause [reason], resume, reconcile, export <epoch-id>, policy <json-file>');
 const post=['pause','resume','reconcile','capital'].includes(command);const url=`http://127.0.0.1:${c.API_PORT}/`+(command==='export'?'api/epochs/'+encodeURIComponent(arg??'')+'/export':'operator/'+paths[command]);
 const r=await fetch(url,{method:post?'POST':'GET',headers:{authorization:'Bearer '+c.OPERATOR_TOKEN,'content-type':'application/json'},...(post?{body:JSON.stringify(command==='pause'?{reason:arg??'Operator pause'}:command==='capital'?{signature:arg}:{})}: {})});ensure(r.ok,`operator request failed (${r.status})`);const body=await r.json();if(command==='export'){await writeFile('epoch-export.json',JSON.stringify(body,null,2));console.log('epoch-export.json');}else console.log(JSON.stringify(body,null,2));
}
