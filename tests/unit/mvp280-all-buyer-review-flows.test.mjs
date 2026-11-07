import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 componerRevisionCompradorMvp279,esRespuestaConfirmacionMvp279
} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-review-mvp279.ts';
const whapi=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp280_confirmacion_unificada_comprador.sql',import.meta.url),'utf8');
const match=(t,r)=>assert.match(t,r);

test('MVP280: source text AI Central can stage only; never auto-publishes',()=>{
 const at=whapi.indexOf('const result=await procesarCompradorCentralMvp226({');
 assert.ok(at>0);
 // Bound this check to the complete central-buyer branch: MVP286 adds a
 // bounded failure notice before the original signed review sender.
 const end=whapi.indexOf('  // Aclaración breve',at);
 assert.ok(end>at);
 const area=whapi.slice(at,end);
 match(area,/habilitado:true,publicar:false/u);
 match(area,/buyer_review_bypassed_by_text_broker/u);
 match(area,/emitirRevisionUnificada\(messageHash\)/u);
 assert.doesNotMatch(area,/trialDispatchChats.add\(chatHash\)/u);
});
test('MVP280: delivery-city clarification keeps original buyer source and awaits review',()=>{
 const at=whapi.indexOf('const resumed=await continuarZonaCentralMvp233({');
 assert.ok(at>0);
 const area=whapi.slice(at,at+1730);
 match(area,/sourceHmac:previous.source_hmac/u);
 match(area,/model,publicar:false/u);
 match(area,/buyer_review_bypassed_by_zone_continuation/u);
 match(area,/emitirRevisionUnificada\(previous.source_hmac\)/u);
 assert.doesNotMatch(area,/trialDispatchChats.add\(chatHash\)/u);
});
test('MVP280: TXT/CSV buyer files are staged and reviewed, never auto-published',()=>{
 const at=whapi.indexOf('const processed=await procesarDocumentoCompradorCentralMvp276({');
 assert.ok(at>0);
 const area=whapi.slice(at,at+1650);
 match(area,/publicar:false/u);
 match(area,/buyer_review_bypassed_by_document_broker/u);
 match(area,/emitirRevisionUnificada\(messageHash\)/u);
 assert.doesNotMatch(area,/trialDispatchChats.add\(chatHash\)/u);
});
test('MVP280: binary PDF/DOCX/XLSX use the SAME private buyer review sender',()=>{
 const at=whapi.indexOf('const mediaPlan=await prepararDocumentoBinarioCompradorMvp278({');
 assert.ok(at>0);
 const area=whapi.slice(at,at+1050);
 match(area,/emitirRevisionUnificada\(messageHash\)/u);
 assert.doesNotMatch(area,/trialDispatchChats.add\(chatHash\)/u);
});
test('MVP280: signed buyer confirmation is intercepted before ANY LLM',()=>{
 const intercept=whapi.indexOf('if(buyerReviewCommand){');
 const preflight=whapi.indexOf("if(row.type==='text'&&!webLinkCode&&!centralBuyerText&&");
 const plan=whapi.indexOf('procesarCompradorCentralMvp226({',intercept);
 assert.ok(preflight>0&&preflight<intercept&&intercept<plan);
 match(whapi.slice(preflight,preflight+240),/!buyerReviewCommand/u);
 // The independent SQL operator gate and environment vetoes are resolved
 // BEFORE intercepting the confirmation command. No model can bypass them.
 const gate=whapi.indexOf('cotironda_piloto_ia_review_launch_mvp285');
 assert.ok(gate>0&&gate<intercept);
 match(whapi.slice(gate,intercept),/reviewGate\.confirm===true/u);
 match(whapi.slice(gate,intercept),/reviewGate\.release===true/u);
 match(whapi,/COTIRONDA_PILOT_BUYER_REVIEW_CONFIRM_ENABLED/u);
 match(whapi,/COTIRONDA_PILOT_BUYER_REVIEW_RELEASE_ENABLED/u);
 match(whapi.slice(intercept,plan),/allowBuyerConfirmation/u);
 match(whapi.slice(intercept,plan),/allowBuyerRelease/u);
 assert.ok(!esRespuestaConfirmacionMvp279('OK'));
 assert.ok(esRespuestaConfirmacionMvp279('CONFIRMAR COTI 0123456789ABCDEF'));
});
test('MVP280: legacy document auto-invite blocked when review REQUIRED flag is ON',()=>{
 const at=whapi.indexOf('const plan=await db.rpc('+
  "'cotironda_piloto_plan_document_mvp098'");
 assert.ok(at>0);
 // MVP285 also blocks legacy fallback when IA Central is active, even
 // if the explicit REQUIRE_REVIEW env switch is absent.
 const preceding=whapi.slice(at-750,at);
 match(preceding,/COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED/u);
 match(preceding,/else if\(centralConfigured\|\|/u);
 match(whapi,/COTIRONDA_PILOT_BUYER_REVIEW_SEND_ENABLED/u);
 assert.doesNotMatch(whapi,/COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PUBLISH_ENABLED/u);
});
test('MVP280: native SQL source checks cover three authentically archived kinds',()=>{
 match(sql,/msg.kind='text'/u);
 match(sql,/msg.plaintext_sha256=/u);
 match(sql,/cotironda_piloto_privado.fuente_original_documental_mvp276/u);
 match(sql,/cotironda_piloto_privado.fuente_binaria_comprador_mvp278/u);
 match(sql,/JOIN storage.objects o/u);
 match(sql,/sourceKind',m.kind/u);
 match(sql,/fuente_revisable_mvp280\(r.id\)/u);
 assert.doesNotMatch(sql,/m.kind='text' OR TRUE/u);
});
test('MVP280: all four SQL dispatch gates require a confirmed version',()=>{
 const names=[
  ['cotironda_piloto_ia_publish_mvp222','RETURN jsonb_build_object'],
  ['cotironda_piloto_ia_ready_for_chat_mvp223','FROM cotironda_piloto_privado.requests'],
  ['cotironda_piloto_ia_claim_mvp222','SELECT d.request_id'],
  ['cotironda_piloto_ia_pdf_snapshot_mvp222','SELECT jsonb_build_object']
 ];
 for(const [name] of names){
  const at=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(at>0,name);
  const next=sql.indexOf('CREATE OR REPLACE FUNCTION',at+35);
  const section=sql.slice(at,next<0?undefined:next);
  assert.match(section,/confirmada_comprador_mvp280/u,name);
 }
 assert.doesNotMatch(sql,/NOT EXISTS\(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e WHERE e.message_hmac=r.source_hmac/u);
});
test('MVP280: mixed materials always appear in full, not as a total price',()=>{
 const sample={state:'issued',request_id:'00000000-0000-4000-8000-000000000001',
 code:'0123456789ABCDEF',city:'La Plata',note:null,items_count:3,
 items:[
  {lineNo:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bag',rubro:'obra_gruesa'},
  {lineNo:2,description:'Pintura látex 20L',quantity:'5',unit:'unit',rubro:'pintura'},
  {lineNo:3,description:'Cable 2,5 mm²',quantity:'30',unit:'m',rubro:'electricidad'}
 ]};
 const text=componerRevisionCompradorMvp279(sample);
 assert.ok(text&&text.length<3300);
 assert.match(text,/20 bolsas — Cemento CPC 50 kg/u);
 assert.match(text,/5 unidades — Pintura látex 20L/u);
 assert.match(text,/30 m — Cable 2,5 mm²/u);
 assert.ok(!text.includes('TOTAL'));
 assert.equal(componerRevisionCompradorMvp279({...sample,items_count:2}),null);
});
