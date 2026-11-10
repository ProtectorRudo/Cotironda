/**
 * MVP324 — offline, read-only packaging gate for buyer tracking Edge.
 * No Supabase credentials, HTTP requests, secrets, DB writes or deployment.
 *
 * The active pilot Edge v25 has 29 files; 28 match this source tree exactly.
 * The authorized extensions since v25 are MVP322's source-reviewed prices
 * and MVP326's status-only projection, plus the pre-existing transitive
 * source dependencies. Exact baseline removal is enforced (34 files).
 *
 * Usage: node scripts/piloto/mvp324-bundle-seguimiento-readonly.mjs [--paths]
 */
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,relative,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const FILE=fileURLToPath(import.meta.url);
const REPO=resolve(dirname(FILE),'../..');
export const EDGE_ENTRY_MVP324=
 'supabase/functions/cotironda-piloto-seguimiento/index.ts';
const ADDITIONAL_MODULE=
 'src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts';
const STATUS_MODULE=
 'src/domain/ia-central/estado-revision-comercial-mvp326.ts';
export const MISSING_TRANSITIVE_MVP324=Object.freeze([
 'src/domain/auditoria-condiciones-mvp167.ts',
 'src/domain/auditoria-descuentos-mvp166.ts',
 'src/domain/comparacion-ofertas.ts'
]);
const ACTIVE_INDEX_BLOB_SHA='9c38a10ba6b4ffd726ad2348a748b1598954bffc';
export const ACTIVE_FILES_MVP324=Object.freeze([
 EDGE_ENTRY_MVP324,
 'supabase/functions/_shared/cotironda-finalist-notice.ts',
 'src/domain/resumen-cobertura-comprador-mvp175.ts',
 'src/domain/diagnostico-ronda-mvp172.ts',
 'src/domain/adaptador-documental-mvp162.ts',
 'src/domain/aridos-bolson-mvp164.ts',
 'src/domain/cotejo-presentaciones-mvp174.ts',
 'src/domain/equivalencia-catalogo-mvp171.ts',
 'src/domain/resumen-economia-comprador-mvp180.ts',
 'src/domain/resumen-importes-cotizados-mvp186.ts',
 'src/domain/alternativas-cobertura-mvp189.ts',
 'src/domain/cobertura-importes-cierre-mvp194.ts',
 'src/domain/condiciones-economicas-por-oferta-mvp204.ts',
 'src/domain/precios-cotizados-sin-iva-mvp185.ts',
 'src/domain/comparacion-pares-exacta.ts',
 'src/domain/materiales-cotizados-comprador-mvp210.ts',
 'src/domain/enlace-seguimiento-piloto-mvp212.ts',
 'src/domain/rubros-comprador-mvp216.ts',
 'src/domain/ia-central/vista-comprador-rubros-mvp227.ts',
 'src/domain/ia-central/vista-pendientes-rubros-mvp299.ts',
 'src/domain/ia-central/vista-proveedores-cierre-mvp303.ts',
 'src/domain/ia-central/contactos-consentidos-cierre-mvp304.ts',
 'src/domain/ia-central/resumen-comparador-rubros-mvp255.ts',
 'src/domain/ia-central/opciones-cobertura-rubros-mvp254.ts',
 'src/domain/ia-central/calificador-cotizaciones-mvp225.ts',
 'src/domain/ia-central/evidencia-moneda-mvp241.ts',
 'src/domain/ia-central/evidencia-condiciones-mvp242.ts',
 'src/domain/ia-central/fidelidad-importes-fuente-mvp244.ts',
 'src/domain/ia-central/diagnostico-presentaciones-mvp243.ts'
]);
const IMPORT_MARKER=
 "import {preliminarAnonimoPresupuestosMvp322} from\n"+
 " '../../../src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts';\n";
const ADDITION_RE=/\s*\/\/ MVP322: same buyer token and independent source-verified rubric RPC\.[\s\S]*?\s*if\(preliminar\)publicResult=\{\.\.\.publicResult,\s*preliminar_cotizaciones_ia:preliminar\};/g;
const STATUS_IMPORT_MARKER=
 "import {estadoRevisionComercialMvp326} from\n"+
 " '../../../src/domain/ia-central/estado-revision-comercial-mvp326.ts';\n";
const STATUS_ADDITION_RE=/\s*\/\/ MVP326: independently token-bound status, not a new AI review\.[\s\S]*?\s*\}catch\{\/\* Optional count projection fails closed\. \*\/\}/g;
const blobSha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
const fail=m=>{throw new Error('mvp324_bundle_gate:'+m)};
const inside=(root,path)=>path===root||path.startsWith(root+sep);
function relativeImports(source){
 // Covers static TypeScript imports (including multiline specifiers) and
 // re-exports. Dynamic imports must be individually security-reviewed.
 if(/(?:^|[^\w])import\s*\(/u.test(source))fail('dynamic_import_not_reviewed');
 const specs=[];
 const statement=/(?:^|\n)\s*(?:import|export)\s+[\s\S]*?;/gu;
 for(const match of source.matchAll(statement)){
   const s=match[0];
   const from=s.match(/\bfrom\s*['"]([^'"]+)['"]/u);
   const sideEffect=s.match(/^\s*import\s*['"]([^'"]+)['"]/u);
   const spec=from?.[1]??sideEffect?.[1];
   if(spec?.startsWith('.'))specs.push(spec);
 }
 return specs;
}
export function inspectSeguimientoBundleMvp324(root=REPO){
 const absRoot=realpathSync(root);
 const entry=resolve(absRoot,EDGE_ENTRY_MVP324);
 const index=readFileSync(entry,'utf8');
 if(index.split(IMPORT_MARKER).length!==2)fail('new_import_not_exactly_once');
 if([...index.matchAll(ADDITION_RE)].length!==1)fail('new_projection_not_exactly_once');
 if(index.split(STATUS_IMPORT_MARKER).length!==2)
   fail('review_import_not_exactly_once');
 if([...index.matchAll(STATUS_ADDITION_RE)].length!==1)
   fail('review_projection_not_exactly_once');
 const original=index.replace(IMPORT_MARKER,'').replace(ADDITION_RE,'')
   .replace(STATUS_IMPORT_MARKER,'').replace(STATUS_ADDITION_RE,'');
 if(blobSha(original)!==ACTIVE_INDEX_BLOB_SHA)
   fail('live_index_baseline_drift_unreviewed_change');
 if(!index.includes("const preliminar=preliminarAnonimoPresupuestosMvp322(ai.data,safe);"))
   fail('source_verified_projection_absent');
 if(!index.includes("const reduced=estadoRevisionComercialMvp326(status.data,safe);"))
   fail('terminal_review_stage_projection_absent');
 for(const p of [ADDITIONAL_MODULE,STATUS_MODULE]){
  const source=readFileSync(resolve(absRoot,p),'utf8');
  if(/(?:\bfetch\s*\(|\bcreateClient\s*\(|\bDeno\.serve\b)/u.test(source))
    fail('projection_must_be_pure:'+p);
 }
 const seen=new Set(),stack=[EDGE_ENTRY_MVP324],filePaths=[];
 while(stack.length){
   const name=stack.pop();
   if(seen.has(name))continue;
   if(!name.endsWith('.ts')&&!name.endsWith('.tsx')&&!name.endsWith('.js'))
     fail('unexpected_file_type:'+name);
   const full=resolve(absRoot,name);
   if(!inside(absRoot,full)||isAbsolute(name)||name.startsWith('..'))
     fail('import_outside_repository');
   let source;
   try{source=readFileSync(full,'utf8')}
   catch {fail('missing_import:'+name)}
   if(source.length>200000)fail('module_oversized:'+name);
   seen.add(name);
   filePaths.push(name);
   for(const spec of relativeImports(source)){
     if(/[?#]/u.test(spec))fail('relative_query_import_not_reviewed');
     const target=resolve(dirname(full),spec);
     if(!inside(absRoot,target))fail('path_traversal_import');
     const path=relative(absRoot,target).split(sep).join('/');
     stack.push(path);
   }
   if(filePaths.length>40)fail('unexpected_dependency_growth');
 }
 const expected=new Set([...ACTIVE_FILES_MVP324,ADDITIONAL_MODULE,
  STATUS_MODULE,...MISSING_TRANSITIVE_MVP324]);
 if(expected.size!==34||seen.size!==34||[...expected].some(f=>!seen.has(f))||
    [...seen].some(f=>!expected.has(f)))
   fail('dependency_closure_diff:'+[
      ...[...seen].filter(x=>!expected.has(x)),
      ...[...expected].filter(x=>!seen.has(x)).map(x=>'missing:'+x)
    ].join(','));
 return Object.freeze({
   state:'mvp324_bundle_offline_verified',
   entrypoint_path:EDGE_ENTRY_MVP324,
   file_count:seen.size,unchanged_active_files:28,
   new_or_changed_files:[EDGE_ENTRY_MVP324,ADDITIONAL_MODULE,STATUS_MODULE],
   missing_transitive_dependencies:MISSING_TRANSITIVE_MVP324,
   baseline_blob_sha:ACTIVE_INDEX_BLOB_SHA,
   verify_jwt_must_remain_false:true,
   scheduled_jobs_created:false,whapi_touched:false,
   deployment_authorized:false,
   filePaths:Object.freeze(filePaths.sort())
 });
}
if(process.argv[1]&&resolve(process.argv[1])===FILE){
 try {
   const summary=inspectSeguimientoBundleMvp324();
   if(process.argv.includes('--paths'))
     process.stdout.write(summary.filePaths.join('\n')+'\n');
   else process.stdout.write(JSON.stringify({
     ...summary,filePaths:undefined
   },null,2)+'\n');
 }catch(err){process.stderr.write(String(err.message||err)+'\n');process.exitCode=1}
}
