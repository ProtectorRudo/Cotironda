import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liberarPedidoAutomaticoMvp306} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-auto-release-mvp306.ts';
import {notificarSeguimientoMvp289} from '../../supabase/functions/cotironda-piloto-whapi/buyer-tracking-confirmation-mvp289.ts';
const H='a'.repeat(64),S='b'.repeat(64);
const ID='00000000-0000-4000-8000-000000000306';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../../supabase/piloto/mvp306_auto_release_y_contactos_proveedor.sql');
const whapi=read('../../supabase/functions/cotironda-piloto-whapi/index.ts');
function setup(override={}){
 const calls=[];
 const args={
  enabled:true,webhookAutenticado:true,compradorVerificado:true,
  chatHmac:H,sourceHmac:S,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_ia_auto_release_mvp306')
    return {data:{state:'approved',request_id:ID},error:null};
   if(name==='cotironda_piloto_ia_publish_mvp222')
    return {data:{state:'ready_for_delivery'},error:null};
   throw Error('unknown RPC');
  },...override
 };
 return {calls,run:()=>liberarPedidoAutomaticoMvp306(args)};
}
test('MVP306: gate/env apagado no toca SQL',async()=>{
 const {calls,run}=setup({enabled:false});
 assert.deepEqual(await run(),{estado:'apagado',requestId:null});
 assert.equal(calls.length,0);
});
test('MVP306: origen/rol/identidad invalida no reserva ni publica',async()=>{
 for(const o of [{webhookAutenticado:false},{compradorVerificado:false},
   {chatHmac:'bad'},{sourceHmac:'bad'}, {rpc:null}]){
  const {calls,run}=setup(o);assert.equal((await run()).estado,'no_autorizado');
  assert.equal(calls.length,0);
 }
});
test('MVP306: unica liberacion por fuente original, sin WhatsApp del arquitecto',async()=>{
 const {calls,run}=setup();assert.deepEqual(await run(),{estado:'publicado',requestId:ID});
 assert.deepEqual(calls.map(c=>c.name),[
  'cotironda_piloto_ia_auto_release_mvp306','cotironda_piloto_ia_publish_mvp222'
 ]);
 assert.deepEqual(calls[0].params,{p_chat_hmac:H,p_source_hmac:S});
 assert.deepEqual(calls[1].params,{p_request:ID});
});
test('MVP306: consentimiento faltante, fuente invalida o gate OFF bloquea publicacion',async()=>{
 for(const state of ['disabled','supplier_contact_consent_missing',
  'source_or_buyer_not_authorized','historical_review','possible_private_data',
  'missing_snapshot','incomplete_lines_or_routes']){
  const {calls,run}=setup({rpc:async(name,params)=>{
   calls.push({name,params});return {data:{state},error:null};
  }});
  assert.equal((await run()).estado,'no_elegible');
  assert.equal(calls.length,1);
 }
});
test('MVP306: idempotencia de publicacion, sin nuevo mensaje',async()=>{
 const {calls,run}=setup({rpc:async(name,params)=>{
  calls.push({name,params});
  return {data:name==='cotironda_piloto_ia_auto_release_mvp306'
   ?{state:'already_approved',request_id:ID}:{state:'already_published'},error:null};
 }});
 assert.equal((await run()).estado,'publicado');assert.equal(calls.length,2);
});
test('MVP306: fallo de reserva, ID ajeno o publicacion desconocida falla cerrado',async()=>{
 for(const rpc of [
  async()=>{throw Error('unknown commit')},
  async()=>({data:null,error:'db_down'}),
  async()=>({data:{state:'approved',request_id:'wrong'},error:null}),
  async name=>({data:name==='cotironda_piloto_ia_auto_release_mvp306'
    ?{state:'approved',request_id:ID}:{state:'buyer_review_required'},error:null})
 ]){
  const {run}=setup({rpc});assert.notEqual((await run()).estado,'publicado');
 }
});
test('MVP306: texto, ciudad y formatos documentales usan la MISMA liberacion',()=>{
 assert.match(whapi,/COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED/u);
 assert.match(whapi,/liberarPedidoAutomaticoMvp306\(/u);
 assert.match(whapi,/buyerLinkRequests.push\(\{mode:'auto'/u);
 for(const source of ['previous.source_hmac','messageHash']){
  assert.match(whapi,new RegExp('emitirRevisionUnificada\\('+source.replace('.','\\.')+'\\)'));
 }
 assert.match(whapi,/prepararDocumentoBinarioCompradorMvp278/u);
 assert.match(whapi,/procesarDocumentoCompradorCentralMvp276/u);
 assert.match(whapi,/publicar:false/u);
});
test('MVP306: autoactivo NUNCA cae al viejo pedido CONFIRMAR',()=>{
 const a=whapi.indexOf("if(Deno.env.get('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')==='true')");
 const b=whapi.indexOf('const delivery=await emitirRevisionCompradorMvp279',a);
 assert.ok(a>0&&b>a);
 assert.match(whapi.slice(a,b),/return auto.estado!=='conciliacion_requerida'/u);
 assert.match(whapi.slice(a,b),/if\(!centralConfigured\|\|supplierKnown\|\|centralSupplier\|\|!allowBuyerRelease\)/u);
 assert.doesNotMatch(whapi.slice(a,b),/CONFIRMAR COTI/u);
});
test('MVP306: SQL inicia apagado, no concede contacto por mera inscripcion',()=>{
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
 assert.match(sql,/r.created_at>=gate.activated_at/u);
 assert.match(sql,/fuente_revisable_mvp280\(r.id\)/u);
 assert.match(sql,/snapshot_sha256=encode\(sha256/u);
 assert.match(sql,/proveedores_contactables_mvp306\(v.id\)/u);
 assert.match(sql,/COTI CONTACTOS SI/u);
 assert.match(sql,/approval.plaintext_sha256=/u);
 assert.match(sql,/c.revoked_at IS NULL/u);
 assert.match(sql,/binding.message_hmac IS NULL/u);
 assert.match(sql,/BEFORE UPDATE OR DELETE/u);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/gu);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_auto_release_mvp306/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_auto_release_mvp306\(text,text\)\s+TO (anon|authenticated)/u);
});
test('MVP306: controles antiguos de publish/claim/PDF conservan un validador comun',()=>{
 const old=read('../../supabase/piloto/mvp280_confirmacion_unificada_comprador.sql');
 for(const fn of ['ia_publish_mvp222','ia_ready_for_chat_mvp223',
   'ia_claim_mvp222','ia_pdf_snapshot_mvp222']){
  const at=old.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_'+fn+'(');
  assert.ok(at>=0,fn);
  const next=old.indexOf('CREATE OR REPLACE FUNCTION',at+35);
  assert.match(old.slice(at,next<0?undefined:next),/confirmada_comprador_mvp280/u);
 }
 assert.match(sql,/review.state='confirmed'/u);
 assert.match(sql,/OR EXISTS\(\s+SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306/u);
});
test('MVP306: notificacion sale al arquitecto sin pedirle confirmacion',async()=>{
 const names=[],sends=[];
 const status=await notificarSeguimientoMvp289({
  enabled:true,buyerVerified:true,mode:'auto',requestId:ID,
  chatHmac:H,eventHmac:S,recipient:'5492211234567@s.whatsapp.net',
  rpc:async(name,args)=>{
   names.push(name);
   if(name==='cotironda_piloto_issue_auto_tracking_mvp306'){
    assert.equal(args.p_event_hmac,S);
    assert.equal(args.p_request,ID);
    assert.equal(args.p_mode,undefined);
    return {data:{state:'issued',request_id:ID},error:null};
   }
   return {data:true,error:null};
  },
  send:async(to,body)=>{sends.push(body);
   assert.match(body,/Recibimos tu pedido/u);
   assert.match(body,/todos los proveedores invitados/u);
   assert.doesNotMatch(body,/CONFIRMAR COTI|nombre del arquitecto|@s.whatsapp.net/u);
   return {accepted:true,messageId:'mvp306-msg-0001'};
  }
 });
 assert.equal(status.estado,'api_aceptada');
 assert.equal(sends.length,1);
 assert.deepEqual(names,[
  'cotironda_piloto_issue_auto_tracking_mvp306',
  'cotironda_piloto_finish_tracking_mvp091',
  'cotironda_piloto_record_tracking_id_mvp119'
 ]);
});
test('MVP306: datos del comprador nunca en el roster o telefonos del proveedor',()=>{
 const contacts=read('../../supabase/piloto/mvp304_contactos_consensuados_todos_cierre.sql');
 assert.match(contacts,/p.participant_role='supplier'/u);
 assert.match(contacts,/consent_source.plaintext_sha256=/u);
 assert.match(contacts,/buyer_phone_included',false/u);
 assert.match(sql,/msg.participant_key=buyer.key/u);
 assert.match(sql,/buyer.participant_role='buyer'/u);
});

test('MVP306: todos los proveedores se revelan al cierre también para rondas sin CONFIRMAR',()=>{
 const baseline=read('../../supabase/piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql');
 const at=sql.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303(');
 assert.ok(at>0);
 const upgraded=sql.slice(at);
 assert.match(baseline,/JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 br/u);
 assert.match(upgraded,/EXISTS\(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279 br/u);
 assert.match(upgraded,/EXISTS\(\s+SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306 auto/u);
 assert.match(upgraded,/auto\.source_hmac=r\.source_hmac/u);
 assert.match(upgraded,/r\.created_at>=g\.activated_at/u);
 assert.match(upgraded,/auto\.approved_at<r\.closes_at/u);
 assert.match(upgraded,/r\.state/u);
 assert.match(upgraded,/v_request\.state<>'closed' OR v_request\.closes_at>now\(\)/u);
 assert.match(upgraded,/t\.revoked_at IS NULL/u);
 assert.match(upgraded,/t\.expires_at>now\(\)/u);
 assert.match(upgraded,/comprador|buyer/u);
 assert.doesNotMatch(upgraded,/select.*buyer\.chat_hmac.*into v_result/iu);
});