/**
 * MVP332 — OFFLINE immutable Whapi v70 -> dynamic recipient candidate gate.
 * No network, no credentials, no SQL, no WhatsApp, no deployment.
 *
 * The 60-file v70 deployed baseline was inspected in Supabase, read-only.
 * Exactly 57 modules are byte-identical to development. 3 modules may change,
 * and 1 new module is allowed. ALL 61 candidate SHA-256 hashes are frozen.
 *
 * Usage:
 *   node scripts/piloto/mvp332-whapi-bundle-readonly.mjs
 *   node scripts/piloto/mvp332-whapi-bundle-readonly.mjs --paths
 */
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const MANIFEST='scripts/piloto/mvp332-whapi-v70-bundle-manifest.json';
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const CHANGED=[
 'supabase/functions/cotironda-piloto-whapi/index.ts',
 'supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts',
 'supabase/functions/cotironda-piloto-whapi/buyer-tracking-confirmation-mvp289.ts',
 'supabase/functions/cotironda-piloto-whapi/dynamic-recipient-mvp313.ts'
];
const fail=code=>{throw Error('mvp332_whapi_bundle:'+code)};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const inside=(root,path)=>path===root||path.startsWith(root+sep);

function imports(source,moduleName){
 // One pre-existing pinned runtime dependency from the LIVE v70 bundle.
 // This precise npm module is version-pinned and source hashes are frozen.
 const dynamics=[...source.matchAll(/(?:^|[^\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu)];
 const hasDynamic=/(?:^|[^\w])import\s*\(/u.test(source);
 const historicPdf=moduleName===
  'supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';
 if(hasDynamic&&!(historicPdf&&dynamics.length===1&&
   dynamics[0][1]==='npm:unpdf@2.1.0'&&
   source.includes("await import('npm:unpdf@2.1.0');")))
  fail('dynamic_import_not_reviewed:'+moduleName);
 const out=[];
 const statements=/(?:^|\n)\s*(?:import|export)\s+[\s\S]*?;/gu;
 for(const m of source.matchAll(statements)){
  const from=m[0].match(/\bfrom\s*['"]([^'"]+)['"]/u);
  const sideEffect=m[0].match(/^\s*import\s*['"]([^'"]+)['"]/u);
  const spec=from?.[1]??sideEffect?.[1];
  if(spec?.startsWith('.'))out.push(spec);
 }
 return out;
}

export function inspeccionarWebhookMvp332(root=ROOT){
 const abs=realpathSync(root);
 const manifest=JSON.parse(readFileSync(resolve(abs,MANIFEST),'utf8'));
 if(manifest.kind!=='cotironda_mvp332_webhook_rollout_manifest'||
    manifest.project_ref!=='ilggkalaafhtiysyzlmg'||
    manifest.live_edge_version!==70||
    manifest.live_file_count!==60||
    manifest.candidate_file_count!==61||
    manifest.entrypoint!==ENTRY||
    manifest.deployment_authorized!==false||
    manifest.installed_sql_mvp309_315!==true||
    JSON.stringify(manifest.approved_changed_paths)!==JSON.stringify(CHANGED)||
    !Array.isArray(manifest.files)||manifest.files.length!==61)
  fail('wrong_baseline_manifest');
 const expected=new Map();
 const changed=new Set();
 for(const f of manifest.files){
  if(!f||typeof f.path!=='string'||
     !/^(?:src\/domain\/|supabase\/functions\/)[A-Za-z0-9_./-]+\.ts$/u.test(f.path)||
     f.path.includes('..')||expected.has(f.path)||
     typeof f.candidate_sha256!=='string'||
     !/^[a-f0-9]{64}$/u.test(f.candidate_sha256)||
     !(f.active_sha256===null||
      (typeof f.active_sha256==='string'&&
       /^[a-f0-9]{64}$/u.test(f.active_sha256))))
   fail('invalid_manifest_entry');
  expected.set(f.path,f.candidate_sha256);
  if(f.active_sha256!==f.candidate_sha256)changed.add(f.path);
  if(f.active_sha256===null&&f.path!==CHANGED[3])
   fail('unexpected_new_module');
 }
 if(changed.size!==4||CHANGED.some(p=>!changed.has(p)))
  fail('unexpected_source_changes');

 const seen=new Set(),queue=[ENTRY];
 while(queue.length){
  const name=queue.pop();
  if(seen.has(name))continue;
  if(!expected.has(name))fail('unreviewed_import:'+name);
  const full=resolve(abs,name);
  if(!inside(abs,full)||isAbsolute(name)||name.startsWith('..'))
   fail('path_outside_repo');
  let content;
  try{content=readFileSync(full,'utf8')}
  catch{fail('missing_source:'+name)}
  if(content.length>210000)fail('module_too_large:'+name);
  if(hash(content)!==expected.get(name))
   fail('candidate_hash_drift:'+name);
  seen.add(name);
  for(const spec of imports(content,name)){
   if(/[?#]/u.test(spec))fail('import_query_not_reviewed');
   const target=resolve(dirname(full),spec);
   if(!inside(abs,target))fail('import_path_traversal');
   queue.push(relative(abs,target).split(sep).join('/'));
  }
  if(seen.size>61)fail('unexpected_module_growth');
 }
 if(seen.size!==61||[...expected.keys()].some(name=>!seen.has(name)))
  fail('missing_or_extra_graph_module');

 const entry=readFileSync(resolve(abs,ENTRY),'utf8');
 const required=[
  "COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED",
  "COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED",
  "COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED",
  "COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED",
  "COTIRONDA_PILOT_WEBHOOK_SECRET",
  "COTIRONDA_PILOT_WHAPI_CHANNEL",
  "liberarPedidoAutomaticoMvp306(",
  "resolverDestinatarioMvp313(",
  "CAPTION_PEDIDO_COTIRONDA_MVP305",
  "COTIRONDA_PILOT_WHAPI_TOKEN"
 ];
 if(required.some(word=>!entry.includes(word)))
  fail('pilot_safety_gate_missing');
 const sorted=[...seen].sort();
 return Object.freeze({
  estado:'bundle_whapi_mvp332_candidate_verified',
  active_files:60,candidate_files:61,unchanged_files:57,
  changed_files:Object.freeze(CHANGED.slice()),
  file_paths:Object.freeze(sorted),
  project_ref:manifest.project_ref,
  active_version_expected:70,
  deployment_authorized:false,
  messages_sent:0,sql_modified:false,whapi_modified:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  const r=inspeccionarWebhookMvp332();
  if(process.argv.includes('--paths'))
   process.stdout.write(r.file_paths.join('\n')+'\n');
  else process.stdout.write(JSON.stringify({...r,file_paths:undefined},null,2)+'\n');
 }catch(err){process.stderr.write(String(err.message||'error')+'\n');process.exitCode=1;}
}
