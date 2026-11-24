/**
 * D016 — reconstrucción reproducible OFFLINE de los 61 módulos que el
 * Supabase PILOTO tiene en Edge Whapi v76, SOLO dentro del checkout CI.
 *
 * 59 archivos GitHub ya coinciden byte a byte; los otros dos se aplican como
 * parches de líneas con validación SHA completa contra el manifest v76.
 * No conecta con Supabase/WhatsApp/Vercel ni ejecuta deploy.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verificarBundleWhapiV76} from './v2-d016-whapi-overlay.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PATCH='scripts/piloto/v2-d016-whapi-v76-two-file-patch.json';
const MANIFEST='scripts/piloto/v2-d016-whapi-live-v76-bundle-manifest.json';
const DELTA=[
 'supabase/functions/cotironda-piloto-whapi/index.ts',
 'supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts'
];
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const fail=reason=>{throw Error('d016_live_v76_rebuild:'+reason)};

export function verificarYReconstruirV76(root=ROOT,{write=false}={}){
 const manifest=JSON.parse(readFileSync(resolve(ROOT,MANIFEST),'utf8'));
 const patch=JSON.parse(readFileSync(resolve(ROOT,PATCH),'utf8'));
 if(patch.kind!=='cotironda_whapi_live_v76_two_file_patch'||
    patch.version!==76||patch.expectedBundleSha256!==manifest.ezbr_sha256||
    patch.manifestFile!==MANIFEST||!Array.isArray(patch.files)||
    patch.files.length!==2||
    !Array.isArray(manifest.files)||manifest.files.length!==61||
    manifest.project_ref!=='ilggkalaafhtiysyzlmg'||manifest.edge_version!==76)
  fail('wrong_manifest_or_patch');
 const manifestMap=new Map(manifest.files.map(f=>[f.path,f.sha256]));
 if(manifestMap.size!==61)fail('duplicate_manifest');
 const deltaPaths=new Set(patch.files.map(x=>x.path));
 if(deltaPaths.size!==2||DELTA.some(x=>!deltaPaths.has(x)))fail('wrong_patch_targets');
 // VALIDAR TODO ANTES DE MODIFICAR ARCHIVOS en el checkout.
 const updated=new Map();
 for(const entry of manifest.files){
  const path=resolve(root,entry.path);
  if(!path.startsWith(resolve(root)+'/'))fail('path_escape');
  const original=readFileSync(path,'utf8');
  const delta=patch.files.find(x=>x.path===entry.path);
  if(!delta){
   if(sha(original)!==entry.sha256)fail('unmodified_source_drift:'+entry.path);
   continue;
  }
  if(delta.liveSha256!==entry.sha256||!Array.isArray(delta.hunks))
   fail('patch_manifest_mismatch:'+entry.path);
  const lines=original.split('\n');
  for(const h of [...delta.hunks].reverse()){
   if(!Number.isSafeInteger(h.fromLine)||h.fromLine<0||
      !Array.isArray(h.remove)||!Array.isArray(h.insert)||
      !h.remove.every(x=>typeof x==='string')||
      !h.insert.every(x=>typeof x==='string')||
      JSON.stringify(lines.slice(h.fromLine,h.fromLine+h.remove.length))!==
       JSON.stringify(h.remove))
    fail('patch_context_drift:'+entry.path);
   lines.splice(h.fromLine,h.remove.length,...h.insert);
  }
  const restored=lines.join('\n');
  if(sha(restored)!==entry.sha256)fail('patch_hash_mismatch:'+entry.path);
  updated.set(entry.path,restored);
 }
 if(updated.size!==2)fail('not_two_patches');
 if(write){
  // Solo para CI: muta el checkout temporal, nunca la función LIVE.
  if(process.env.GITHUB_ACTIONS!=='true')fail('write_only_github_actions');
  for(const [p,v] of updated)writeFileSync(resolve(root,p),v,'utf8');
  const verified=verificarBundleWhapiV76(root);
  if(!verified.verified||verified.files!==61)fail('postcheck_bundle_failed');
 }
 return Object.freeze({status:write?'checkout_restored':'dry_run_valid',
   filesExact:61,filesPatched:2,filesUnchanged:59,networkCalls:0});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2];
  if(!['--verify','--apply-to-checkout'].includes(mode))
   fail('explicit_mode_required');
  const result=verificarYReconstruirV76(ROOT,
   {write:mode==='--apply-to-checkout'});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){process.stderr.write(String(e.message||e)+'\n');process.exitCode=1;}
}
