/**
 * MVP335: candidato REPRODUCIBLE (no deploy) sobre el webhook v72/v73
 * con MVP333, sin modificar el manifiesto histórico ni secretos de Supabase.
 * El corte de nuevos pedidos es EXCLUSIVAMENTE el gate SQL MVP306.
 * No hay fallback al mensaje heredado CONFIRMAR COTI.
 * La autenticación firmada Whapi y el fail-closed permanecen intactos.
 */
import {createHash} from 'node:crypto';
import {prepararCandidatoMvp333} from './mvp333-connection-check-candidate.mjs';

const SOURCE_PATH='supabase/functions/cotironda-piloto-whapi/index.ts';
const ACTIVE_INDEX_SHA256='91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95';
const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');
const replaceOnce=(body,from,to)=>{
 if(body.split(from).length!==2)throw Error('mvp335_missing_or_multiple_source_anchor');
 return body.replace(from,to);
};

export function clasificarSecretoWebhookMvp335(value){
 if(typeof value!=='string'||value.length===0)return 'missing';
 if(value.length<32||value.length>256)return 'invalid_length';
 return 'valid';
}

export function prepararCandidatoMvp335({source}={}){
 const baseline=source??prepararCandidatoMvp333().source;
 if(sha256(baseline)!==ACTIVE_INDEX_SHA256)
  throw Error('mvp335_live_index_baseline_mismatch');
 const begin="  const emitirRevisionUnificada=async(sourceHmac:string):Promise<boolean>=>{\n";
 const after="  const attachmentNotice=row.type==='text'&&centralSupplier&&\n";
 const first=baseline.indexOf(begin),last=baseline.indexOf(after,first);
 if(first<0||last<=first||baseline.indexOf(begin,first+1)!==-1||
    baseline.indexOf(after,last+1)!==-1)
  throw Error('mvp335_review_block_not_unique');
 const oldReview=baseline.slice(first,last);
 if(!oldReview.includes("Deno.env.get('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')==='true'")||
    !oldReview.includes('const delivery=await emitirRevisionCompradorMvp279(')||
    !oldReview.includes('liberarPedidoAutomaticoMvp306({')||
    !oldReview.includes("buyerLinkRequests.push({mode:'auto'"))
  throw Error('mvp335_unexpected_old_review_flow');
 const newFlow=[
 "  // MVP335: el gate SQL MVP306 es la única activación operativa.",
 "  // Nunca pedir CONFIRMAR COTI ni volver a un circuito heredado.",
 "  // Un fallo de permisos, datos, cuota o el gate SQL OFF retiene el pedido.",
 "  const emitirRevisionUnificada=async(sourceHmac:string):Promise<boolean>=>{",
 "    if(!centralConfigured||supplierKnown||centralSupplier||!allowBuyerRelease)",
 "      return true; // no buyer review fallback; SQL sigue cerrando todo",
 "    const auto=await liberarPedidoAutomaticoMvp306({",
 "      enabled:true,webhookAutenticado:true,compradorVerificado:true,",
 "      chatHmac:chatHash,sourceHmac,",
 "      rpc:async(name,params)=>{",
 "        const r=await db.rpc(name,params);",
 "        return {data:r.data,error:r.error};",
 "      }",
 "    });",
 "    if(auto.estado==='publicado'&&auto.requestId){",
 "      trialDispatchChats.add(chatHash);",
 "      buyerLinkRequests.push({mode:'auto',requestId:auto.requestId,",
 "        chatHmac:chatHash,eventHmac:sourceHmac,recipient:row.chat_id});",
 "    }",
 "    // Fail-closed ante estado de ejecución incierto: no duplicar envíos.",
 "    return auto.estado!=='conciliacion_requerida';",
 "  };",
 ""
 ].join('\n');
 let result=baseline.slice(0,first)+newFlow+baseline.slice(last);
 result=replaceOnce(result,
  "import {esRespuestaConfirmacionMvp279,emitirRevisionCompradorMvp279,confirmarPedidoCompradorMvp279} from './ai-central-buyer-review-mvp279.ts';",
  "import {esRespuestaConfirmacionMvp279,confirmarPedidoCompradorMvp279} from './ai-central-buyer-review-mvp279.ts';");
 // Solo diagnóstico por categorías, SIN longitud ni valor: nunca un bypass.
 result=replaceOnce(result,
  " const webhookSecret=Deno.env.get('COTIRONDA_PILOT_WEBHOOK_SECRET')??'';\n",
  " const webhookSecret=Deno.env.get('COTIRONDA_PILOT_WEBHOOK_SECRET')??'';\n"+
  " const webhookSecretState=webhookSecret.length===0?'missing':\n"+
  "  webhookSecret.length<32||webhookSecret.length>256?'invalid_length':'valid';\n");
 result=replaceOnce(result,
  "...(webhookSecret.length<32||webhookSecret.length>256?['webhook_secret']:[]),",
  "...(webhookSecretState!=='valid'?['webhook_secret']:[]),");
 result=replaceOnce(result,
  " if(invalidSettings.length){\n  // No values, lengths, contacts, request data, tokens or HMACs in logs.\n",
  " if(invalidSettings.length){\n"+
  "  if(webhookSecretState!=='valid')\n"+
  "   console.warn('cotironda_pilot_webhook_secret_state:',webhookSecretState);\n"+
  "  // No values, lengths, contacts, request data, tokens or HMACs in logs.\n");
 if(result.includes('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')||
    result.includes('const delivery=await emitirRevisionCompradorMvp279(')||
    !result.includes("const authenticated=equalSecret(webhookHeader,sec.webhookSecret)")||
    !result.includes("if(!sec)return json(503,'pilot_not_enabled')")||
    !result.includes("if(auto.estado==='publicado'&&auto.requestId)")||
    !result.includes("COTIRONDA_PILOT_WEBHOOK_SECRET"))
  throw Error('mvp335_expected_security_invariant_missing');
 return Object.freeze({
  state:'candidate_only_not_deployed',
  project_ref:'ilggkalaafhtiysyzlmg',
  source_path:SOURCE_PATH,
  baseline_sha256:ACTIVE_INDEX_SHA256,
  candidate_sha256:sha256(result),
  file_count:61,
  database_mutated:false,
  whatsapp_messages_sent:0,
  webhook_security_bypassed:false,
  production_published:false,
  source:result
 });
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
 const {source,...summary}=prepararCandidatoMvp335();
 process.stdout.write(JSON.stringify(summary)+'\n');
}
