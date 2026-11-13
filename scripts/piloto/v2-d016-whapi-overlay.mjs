/** D016: generar candidato Whapi V2 SIN EDITAR index.ts (MVP332 inmutable).
 * Primero incorpora el overlay validado V2-02, luego D016 exclusivamente
 * detrás de feature flag. La copia generada jamás se versiona ni despliega.
 *
 * node scripts/piloto/v2-d016-whapi-overlay.mjs --write-candidate
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generarWebhookV202} from './v2-02-whapi-overlay.mjs';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';

const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const CANDIDATE='supabase/functions/cotironda-piloto-whapi/index.v2-d016-candidate.ts';
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
 out=one(out,imp,imp+"\nimport {notificarAccesoWhatsappD016} from './buyer-whatsapp-entry-d016.ts';",'import');
 const start=` for(const notice of buyerLinkRequests){
  if(!sec.outbound||Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')==='false')continue;
  const result=await notificarSeguimientoMvp289({`;
 const overlay=` for(const notice of buyerLinkRequests){
  if(!sec.outbound||Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')==='false')continue;
  // D016 sustituye MVP289 para este evento: jamás DOS WhatsApps.
  if(Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')==='true'){
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
 if(!out.includes('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')||
  !out.includes('buyer_d016_link_reconciliation_required'))
  throw Error('d016_overlay_incomplete');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  inspeccionarWebhookMvp332(ROOT);
  const input=readFileSync(resolve(ROOT,ENTRY),'utf8');
  const result=generarWebhookD016(input);
  if(process.argv.includes('--write-candidate')){
   writeFileSync(resolve(ROOT,CANDIDATE),result,'utf8');
   process.stdout.write('V2_D016_CANDIDATE_GENERATED_NO_DEPLOY\n');
  }else process.stdout.write('V2_D016_OVERLAY_VALIDATED_NO_WRITE\n');
 }catch(err){
  process.stderr.write(String(err?.message??'d016_overlay_invalid')+'\n');
  process.exitCode=1;
 }
}
