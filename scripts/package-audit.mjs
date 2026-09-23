/** Export only committed files. Run from a clean repository: node scripts/package-audit.mjs <output-directory> */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const root=git('rev-parse','--show-toplevel').toString().trim();process.chdir(root);
if(!process.argv[2])throw Error('Provide an output directory outside the repository');
const destination=resolve(process.argv[2]),rel=relative(root,destination);
if(!rel||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))throw Error('Output must be outside the repository');
if(git('status','--porcelain','--untracked-files=normal').length)throw Error('Commit all intended changes before packaging');
const packageRevision=git('rev-parse','HEAD').toString().trim(),deployment=JSON.parse(readFileSync('docs/deployment.json','utf8'));
const applicationRevision=deployment.deployedApplicationRevision;
if(git('diff','--name-only',applicationRevision,packageRevision,'--','apps','api','packages','tests','package.json','package-lock.json','vercel.json','compose.yaml','deploy').length)throw Error('Runtime/test/config differs from recorded tested application revision; refresh evidence first');
const paths=git('ls-tree','-r','--name-only','-z','HEAD').toString().split('\0').filter(Boolean);
const forbidden=paths.filter(p=>/(^|\/)(\.git|\.runtime|node_modules|\.vercel)(\/|$)/.test(p)||/(^|\/)\.env(?:$|\.)/.test(p)&&!p.endsWith('/.env.example')&&p!=='.env.example'||/\.(key\.json|dump)$/.test(p));
if(forbidden.length)throw Error('Private/runtime files are tracked: '+forbidden.join(', '));
mkdirSync(destination,{recursive:true});const stem='EMBER10-external-audit-'+packageRevision.slice(0,7),archive=resolve(destination,stem+'.zip'),manifestPath=resolve(destination,stem+'-MANIFEST.json');
if(existsSync(archive)||existsSync(manifestPath))throw Error('Refusing to overwrite an existing audit package');
const digest=b=>createHash('sha256').update(b).digest('hex');
const files=paths.map(path=>{const body=git('show','HEAD:'+path);return {path,bytes:body.length,sha256:digest(body)};});
// Windows checkout conversion must not change the committed bytes hashed above.
git('-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=zip','--prefix=ember10/','--output='+archive,'HEAD');
const archiveBytes=readFileSync(archive),manifest={schemaVersion:1,createdAt:new Date().toISOString(),repository:'https://github.com/missfitchief/ember10',packageRevision,applicationRevision,sourceTree:git('rev-parse','HEAD^{tree}').toString().trim(),archive:{file:stem+'.zip',bytes:archiveBytes.length,sha256:digest(archiveBytes)},fileCount:files.length,files};
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(destination,stem+'-SHA256.txt'),`${manifest.archive.sha256}  ${stem}.zip\n${digest(readFileSync(manifestPath))}  ${stem}-MANIFEST.json\n`);
console.log(JSON.stringify({archive,manifest:manifestPath,fileCount:files.length,packageRevision,applicationRevision,sha256:manifest.archive.sha256}));
