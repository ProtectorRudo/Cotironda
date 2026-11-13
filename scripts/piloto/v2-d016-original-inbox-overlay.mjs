/** D016 P0 (#838): overlay ENTRANTE sobre el candidato de salida.
 * V76 y MVP223 siguen inmutables. No despliega ni modifica index.ts.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generarWebhookOriginalD016} from './v2-d016-original-notice-overlay.mjs';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';
const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const OUT='supabase/functions/cotironda-piloto-whapi/index.v2-d016-inbox-candidate.ts';
function once(s,from,to,label){
 const i=s.indexOf(from);
 if(i<0||s.indexOf(from,i+from.length)!==-1)
  throw Error('d016_inbox_anchor_invalid:'+label);
 return s.slice(0,i)+to+s.slice(i+from.length);
}
export function generarWebhookInboxD016(original){
 let s=generarWebhookOriginalD016(original);
 const imp=" from './original-notice-dispatch-d016.ts';";
 s=once(s,imp,imp+
  "\nimport {registrarRespuestaOriginalEntranteD016}"+
  " from './original-reply-intake-d016.ts';",'import');
 const media="  const media=row.type==='text'?null:makeMediaManifest(row,row.type);";
 s=once(s,media,"  let d016MediaStored=false;\n"+media,'media-init');
 const marked=[
  "      if(completed.error||completed.data!==true)",
  "        return json(503,'media_reconciliation_required');"
 ].join('\n');
 s=once(s,marked,marked+
 "\n      if(status==='stored')d016MediaStored=true;",'media-persisted');
 const marker=" // Acknowledge a supplier ONLY after their authenticated quote was";
 const intake=[
  " // D016 P0: SQL acredita únicamente la PROCEDENCIA de la respuesta.",
  " // NO autoriza que una RPC entregue un presupuesto al comprador.",
  " if(Deno.env.get('COTIRONDA_PILOT_D016_ORIGINAL_INBOX_ENABLED')==='true'){",
  "  const rawRow=row as Record<string,unknown>;",
  "  const ctx=rawRow.context&&typeof rawRow.context==='object'&&!Array.isArray(rawRow.context)",
  "   ?rawRow.context as Record<string,unknown>:null;",
  "  const forwarded=rawRow.forwarded===true||rawRow.is_forwarded===true||",
  "   ctx?.forwarded===true;",
  "  const evidence=await registrarRespuestaOriginalEntranteD016({",
  "   enabled:true,webhookAutenticado:authenticated,",
  "   mensajePersistido:!['duplicate','unrecognized_contact'].includes(outcome(out.data)),",
  "   duplicado:outcome(out.data)==='duplicate',",
  "   proveedorVerificado:supplierKnown||centralSupplier,",
  "   messageHmac:messageHash,chatHmac:chatHash,",
  "   tipo:row.type,texto:row.type==='text'?body:null,",
  "   reconocidoComoCotizacion:row.type==='text'",
  "    ?supplierAckMode==='text_quote':d016MediaStored,",
  "   archivoGuardadoYVerificado:d016MediaStored,",
  "   quotedWhapiId:supplierQuotedId,reenviado:forwarded,",
  "   rpc:async(name,params)=>{",
  "    const answer=await db.rpc(name,params);",
  "    return {data:answer.data,error:answer.error};",
  "   }",
  "  });",
  "  if(evidence==='conciliacion_requerida')",
  "   return json(503,'d016_supplier_evidence_reconciliation_required');",
  " }",
  ""
 ].join('\n');
 s=once(s,marker,intake+marker,'inbox-hook');
 if(!s.includes('COTIRONDA_PILOT_D016_ORIGINAL_INBOX_ENABLED')||
  !s.includes("caption:d016Caption??(")||
  !s.includes("d016MediaStored=true")||
  !s.includes("COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED"))
  throw Error('d016_inbox_overlay_invalid');
 return s;
}
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  inspeccionarWebhookMvp332(ROOT);
  const original=readFileSync(resolve(ROOT,ENTRY),'utf8');
  const candidate=generarWebhookInboxD016(original);
  if(process.argv.includes('--write-candidate')){
   writeFileSync(resolve(ROOT,OUT),candidate,'utf8');
   process.stdout.write('D016_INBOX_CANDIDATE_GENERATED_NO_DEPLOY\n');
  }else process.stdout.write('D016_INBOX_CANDIDATE_VALID_NO_WRITE\n');
 }catch(e){
  process.stderr.write(String(e?.message??'d016_inbox_invalid')+'\n');
  process.exitCode=1;
 }
}
