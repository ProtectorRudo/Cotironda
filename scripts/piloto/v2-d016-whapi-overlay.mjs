/** D016: generar candidato Whapi V2 SIN EDITAR index.ts (MVP332 inmutable).
 * Primero incorpora el overlay validado V2-02, luego D016 exclusivamente
 * detrás de feature flag. La copia generada jamás se versiona ni despliega.
 *
 * node scripts/piloto/v2-d016-whapi-overlay.mjs --write-candidate
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generarWebhookV202} from './v2-02-whapi-overlay.mjs';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';

const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const CANDIDATE='supabase/functions/cotironda-piloto-whapi/index.v2-d016-candidate.ts';
// Huella del index.ts REAL Supabase Edge v76: obtenida con get_edge_function
// el 14/11/2026; 61 archivos, bundle ezbr SHA 656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e.
// El index.ts de la rama GitHub NO es igual al de v76 (16 bloques de deriva).
export const D016_LIVE_V76_INDEX_SHA256='349831d3be81d0da95ba0cc3b699256521e35d4b7c0f1923e3dc2a6a714d0c7d';
const LIVE_CANDIDATE='supabase/functions/cotironda-piloto-whapi/index.v2-d016-live-v76-candidate.ts';
const LIVE_MANIFEST='scripts/piloto/v2-d016-whapi-live-v76-bundle-manifest.json';
const LIVE_BUNDLE='656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e';
export function verificarBundleWhapiV76(snapshotRoot){
 // Exige el bundle completo, NO solo index.ts. Conserva 61 módulos
 // del Edge ACTIVO y rechaza contenidos mezclados desde ramas antiguas.
 if(typeof snapshotRoot!=='string'||snapshotRoot.trim()==='')
  throw Error('d016_live_v76_snapshot_root_required');
 const root=realpathSync(snapshotRoot);
 const manifest=JSON.parse(readFileSync(resolve(ROOT,LIVE_MANIFEST),'utf8'));
 if(manifest.kind!=='cotironda_d016_live_whapi_v76_bundle_fingerprint'||
    manifest.project_ref!=='ilggkalaafhtiysyzlmg'||
    manifest.function_slug!=='cotironda-piloto-whapi'||
    manifest.edge_version!==76||
    manifest.verify_jwt!==false||
    manifest.ezbr_sha256!==LIVE_BUNDLE||
    manifest.file_count!==61||
    manifest.deployment_authorized!==false||
    !Array.isArray(manifest.files)||manifest.files.length!==61)
  throw Error('d016_live_v76_manifest_invalid');
 const seen=new Set();
 for(const entry of manifest.files){
  if(!entry||typeof entry.path!=='string'||
     !/^(?:src\/domain\/|supabase\/functions\/)[A-Za-z0-9_./-]+\.ts$/u.test(entry.path)||
     entry.path.includes('..')||seen.has(entry.path)||
     typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/u.test(entry.sha256))
   throw Error('d016_live_v76_manifest_entry_invalid');
  seen.add(entry.path);
  const file=realpathSync(resolve(root,entry.path));
  if(!file.startsWith(root+sep))
   throw Error('d016_live_v76_snapshot_path_escape');
  const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
  if(actual!==entry.sha256)
   throw Error('d016_live_v76_bundle_hash_mismatch:'+entry.path);
 }
 if(!seen.has(ENTRY))
  throw Error('d016_live_v76_entry_missing');
 return Object.freeze({version:76,files:seen.size,verified:true,
  bundleSha256:LIVE_BUNDLE});
}
export function verificarBaseWhapiV76(source){
 if(typeof source!=='string'||
  createHash('sha256').update(source,'utf8').digest('hex')!==D016_LIVE_V76_INDEX_SHA256)
  throw Error('d016_live_v76_input_sha_mismatch');
 if(!source.includes("import {notificarSeguimientoMvp289} from './buyer-tracking-confirmation-mvp289.ts';")||
    !source.includes('buyerLinkRequests')||source.includes('notificarAccesoWhatsappD016'))
  throw Error('d016_live_v76_source_guard_invalid');
 return true;
}
function one(s,old,neu,tag){
 const i=s.indexOf(old);
 if(i<0||s.indexOf(old,i+old.length)!==-1)
  throw Error('d016_overlay_anchor_invalid:'+tag);
 return s.slice(0,i)+neu+s.slice(i+old.length);
}
export function generarWebhookD016(original){
 if(typeof original!=='string'||original.includes('notificarAccesoWhatsappD016'))
  throw Error('d016_overlay_base_invalid');
 let out=generarWebhookV202(original);
 const imp="import {notificarSeguimientoMvp289} from './buyer-tracking-confirmation-mvp289.ts';";
 out=one(out,imp,imp+"\nimport {notificarAccesoWhatsappD016,permitirAvisoD016,permitirRecuperacionD016} from './buyer-whatsapp-entry-d016.ts';",'import');
 const start=` for(const notice of buyerLinkRequests){
  if(!sec.outbound||Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')==='false')continue;
  const result=await notificarSeguimientoMvp289({`;
 const overlay=` for(const notice of buyerLinkRequests){
  const d016Enabled=Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')==='true';
  // MVP289 y D016 tienen interruptores separados: el OFF legado
  // no bloquea el enlace V2 autorizado. Outbound OFF siempre bloquea ambos.
  if(!permitirAvisoD016(sec.outbound,d016Enabled,
    Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')))continue;
  // D016 sustituye MVP289 para este evento: jamás DOS WhatsApps.
  if(d016Enabled){
   const access=await notificarAccesoWhatsappD016({
    enabled:true,webhookAutenticado:true,compradorVerificado:true,
    ...notice,
    portalOrigin:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'',
    portalSha:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'',
    approvedSha:Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'',
    hmacKeyHex:Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'',
    rpc:async(name,params)=>{
     const r=await db.rpc(name,params);
     return {data:r.data,error:r.error};
    },
    authorizeChat:async(recipient,expectedChatHmac)=>{
     if(recipient!==notice.recipient)return false;
     const calculated=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
      '|'+recipient);
     return equalSecret(calculated,expectedChatHmac);
    },
    send:async(recipient,body)=>{
     if(recipient!==notice.recipient)throw Error('d016_buyer_chat_changed');
     const response=await fetch('https://gate.whapi.cloud/messages/text',{
      method:'POST',headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({to:recipient,body}),signal:AbortSignal.timeout(12000)
     });
     const payload=response.ok?await response.json().catch(()=>null):null;
     const value=payload&&typeof payload==='object'?
      payload as Record<string,unknown>:null;
     const nested=value?.message&&typeof value.message==='object'?
      value.message as Record<string,unknown>:null;
     const id=value?.message_id??nested?.id??value?.id;
     return {accepted:response.ok&&value?.sent===true,
      messageId:typeof id==='string'?id:null};
    }
   });
   if(access.estado==='conciliacion_requerida')
    return json(503,'buyer_d016_link_reconciliation_required');
   continue;
  }
  const result=await notificarSeguimientoMvp289({`;
 out=one(out,start,overlay,'send');
 // SEGUIMIENTO COTI: el comando recovery también debe respetar el gate D016
 // independiente. Si D016 OFF, se mantiene la compuerta original MVP289.
 const legacyRecovery=`       trial.buyer===true&&!supplierKnown&&!centralSupplier&&sec.outbound&&
       pilotEnvNotDenied('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED'))`;
 const d016Recovery=`       trial.buyer===true&&!supplierKnown&&!centralSupplier&&
       permitirRecuperacionD016(sec.outbound,
        Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')==='true',
        Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')))`;
 out=one(out,legacyRecovery,d016Recovery,'recovery');
 // D013: reutiliza motor PRODUCTO+zona y verificador técnico YA probados.
 // Compone solo el candidato OFFLINE. D013 OFF mantiene íntegro el buyer
 // histórico; D013 ON elimina confirmación innecesaria y entrega la ronda
 // preparada al mismo despachador privado SQL con sus gates y leases.
 const originalBuyerImport=
  "import {procesarCompradorCentralMvp226} from './ai-central-buyer-mvp226.ts';";
 const d013BuyerImport=originalBuyerImport+
  "\nimport {procesarCompradorCentralMvp226 as procesarCompradorCentralV2D013} from './ai-central-buyer-v2-d013.ts';";
 out=one(out,originalBuyerImport,d013BuyerImport,'d013-import');
 const legacyBuyerCall=`    const result=await procesarCompradorCentralMvp226({
      habilitado:true,publicar:false, // MVP280: buyer must approve`;
 const d013BuyerCall=`    const d013Enabled=Deno.env.get('COTIRONDA_PILOT_V2_D013_PRODUCT_MATCHING_ENABLED')==='true';
    const buyerWorker=d013Enabled?
      procesarCompradorCentralV2D013:procesarCompradorCentralMvp226;
    const result=await buyerWorker({
      habilitado:true,publicar:d013Enabled, // D013 sin confirmacion; SQL sigue gateado`;
 out=one(out,legacyBuyerCall,d013BuyerCall,'d013-buyer-call');
 const legacyBuyerBlock=`    if(result.estado==='ronda_publicada')
       return json(503,'buyer_review_bypassed_by_text_broker');`;
 // La fuente live v76 usa 6 espacios para return (el index GitHub también).
 const actualBuyerBlock=`    if(result.estado==='ronda_publicada')
       return json(503,'buyer_review_bypassed_by_text_broker');`;
 const candidateBuyerBlock=`    if(result.estado==='ronda_publicada'){
      if(!d013Enabled||!result.requestId)
        return json(503,'buyer_review_bypassed_by_text_broker');
      trialDispatchChats.add(chatHash);
      buyerLinkRequests.push({mode:'auto',requestId:result.requestId,
       chatHmac:chatHash,eventHmac:messageHash,recipient:row.chat_id});
    }`;
 out=one(out,legacyBuyerBlock,candidateBuyerBlock,'d013-buyer-release');
 if(!out.includes('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')||
  !out.includes('buyer_d016_link_reconciliation_required'))
  throw Error('d016_overlay_incomplete');
 return out;
}
// Modo de publicación futura: genera el candidato SOBRE LA FUENTE REAL v76,
// no sobre el index.ts GitHub; nunca despliega. El operador debe haber comprobado
// por separado la versión v76 + bundle SHA/61 módulos en Supabase piloto.
// Ejemplo: node scripts/piloto/v2-d016-whapi-overlay.mjs --live-v76-source /ruta/privada/index.ts --write-live-v76-candidate
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  const sourceIndex=process.argv.indexOf('--live-v76-source');
  const live=sourceIndex>=0;
  // El inspector histórico MVP332 valida el checkout GH anterior, NO el
  // snapshot LIVE v76, cuya validación es el manifiesto íntegro 61/61.
  if(!live)inspeccionarWebhookMvp332(ROOT);
  if(process.argv.includes('--write-live-v76-candidate')&&!live)
   throw Error('d016_live_v76_source_required');
  if(live&&process.argv.includes('--write-candidate'))
   throw Error('d016_live_v76_wrong_candidate_output');
  const name=live?process.argv[sourceIndex+1]:ENTRY;
  if(typeof name!=='string'||!name.trim()||name.startsWith('--'))
   throw Error('d016_live_v76_source_path_missing');
  const input=readFileSync(resolve(ROOT,name),'utf8');
  if(live){
   verificarBaseWhapiV76(input);
   // --live-v76-source exige índice dentro de un snapshot de 61 módulos.
   // Una ruta arbitraria a un index.ts no garantiza imports equivalentes.
   const absolute=realpathSync(resolve(ROOT,name));
   const suffix=sep+ENTRY.split('/').join(sep);
   if(!absolute.endsWith(suffix))throw Error('d016_live_v76_snapshot_index_path_invalid');
   const snapshotRoot=absolute.slice(0,-suffix.length);
   const bundle=verificarBundleWhapiV76(snapshotRoot);
   if(bundle.files!==61||bundle.version!==76)throw Error('d016_live_v76_bundle_incomplete');
  }
  const result=generarWebhookD016(input);
  if(live){
   if(process.argv.includes('--write-live-v76-candidate')){
    writeFileSync(resolve(ROOT,LIVE_CANDIDATE),result,'utf8');
    process.stdout.write('D016_LIVE_V76_CANDIDATE_GENERATED_NO_DEPLOY\\n');
   }else process.stdout.write('D016_LIVE_V76_OVERLAY_VALIDATED_NO_WRITE\\n');
  }else if(process.argv.includes('--write-candidate')){
   // Compatibilidad CI historica: fuente GitHub de desarrollo, NO publicar en v76.
   writeFileSync(resolve(ROOT,CANDIDATE),result,'utf8');
   process.stdout.write('V2_D016_CANDIDATE_GENERATED_NO_DEPLOY\\n');
  }else process.stdout.write('V2_D016_OVERLAY_VALIDATED_NO_WRITE\\n');
 }catch(err){
  process.stderr.write(String(err?.message??'d016_overlay_invalid')+'\n');
  process.exitCode=1;
 }
}
