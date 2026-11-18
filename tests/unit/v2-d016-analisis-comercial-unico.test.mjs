import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {analizarOriginalTextoConIAV2}
 from '../../src/server/v2-04-analisis-individual.ts';

const read=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const pub=read('supabase/piloto/v2_d016_comercial_completo_por_proveedor_CANDIDATE.sql');
const worker=read('supabase/piloto/v2_d016_worker_semantic_analisis_CANDIDATE.sql');
const roll=read('supabase/piloto/v2_d016_worker_semantic_analisis_ROLLBACK_ONLY.sql');
const front=read('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');

test('original privado sigue siendo fuente para importes y condiciones, no una IA secundaria',()=>{
 for(const required of [
  "a.content_sha256=q.source_sha256",
  "assigned.supplier_key=v_source->>'supplierKey'",
  "'termsLiteral'",
  "'lineTotal',offered.line_total_literal",
  "'unitPrice',offered.unit_price_literal",
  'q.state IN',
  'v2_d016_responders_private',
  'v2_d016_original_source_private',
  'commercial_source_drift',
  'commercial_postcheck_failed'
 ])assert.ok(pub.includes(required),required);
 assert.doesNotMatch(pub,/CREATE\s+TABLE|GRANT\s+EXECUTE\s+ON|net\.http|whapi\.cloud/iu);
});
test('worker analiza un PDF semántico real solo con identidad y resolución acreditadas',()=>{
 for(const required of [
  "link.association='semantic_unique_mvp291'",
  'decision.source_sha256=link.source_sha256',
  "decision.state='linked'",
  'u.resolved_request_id=link.request_id',
  "u.state='ambiguous_round'",
  "bad.state='media_context_conflict'",
  "link.association IS DISTINCT FROM 'semantic_unique_mvp291'",
  'v2_business_calendar',
  'participant_channels_mvp109',
  'source_msg.request_id=link.request_id',
  'a.content_sha256=link.source_sha256',
  'v2_worker_anchors_not_unique',
  'v2_worker_postcheck_failed'
 ])assert.ok(worker.includes(required),required);
 assert.doesNotMatch(worker,/INSERT INTO|UPDATE\s+cotironda_piloto_privado|DELETE FROM|DROP FUNCTION/iu);
});
test('8 hallazgos usan el mismo SHA, cuota, lease, comprador y firma de autor',()=>{
 for(const text of [pub,worker])assert.ok(text.includes('NOT BETWEEN 2 AND 8'));
 for(const text of [
  'job_token=p_job_token','v2_d016_worker_source_private',
  'has_function_privilege','source_sha256'
 ])assert.ok(worker.includes(text),text);
 for(const text of [
  'commercial_rollback_drift','analysis_rollback_drift'
 ])assert.ok(read('supabase/piloto/v2_d016_comercial_completo_por_proveedor_ROLLBACK_ONLY.sql').includes(text),text);
 assert.ok(roll.includes('rollback_live_drift'));
 assert.ok(roll.includes('finish_rollback_drift'));
});
test('el portal refleja los 3 artículos de Ailín sin confundirlos con 5 del comprador',()=>{
 for(const text of [
  'q.resumen.articulosCotizados',
  'q.resumen.articulosEnviados',
  'q.resumen.detalleCotizado',
  'q.resumen.descuento',
  'conditions.flete','conditions.pago',
  'PDF original',
  'Descargar original'
 ])assert.ok(front.includes(text),text);
 assert.doesNotMatch(front,/ganador autom[aá]tico|adjudicado a/iu);
});
test('IA V2 conserva evidencia literal de la fuente; 8 puntos no son 8 lecturas',async()=>{
 const source='Condición de pago: Contado Efectivo. Flete a convenir. IVA no informado.'+
  ' Cemento CPC 50 kg, arena fina, piedra partida. Total de la oferta $25.000,00.';
 const hash=createHash('sha256').update(source,'utf8').digest('hex');
 let requests=0;
 const points=[
  ['forma_pago','Condición de pago: Contado Efectivo.','La oferta indica pago contado en efectivo.'],
  ['flete','Flete a convenir.','El flete queda a convenir.'],
  ['iva','IVA no informado.','El IVA no está informado en esa condición.'],
  ['material','Cemento CPC 50 kg','El cemento figura como CPC de 50 kg.'],
  ['material','arena fina','La oferta menciona arena fina.'],
  ['material','piedra partida','Se menciona piedra partida.'],
  ['precio','Total de la oferta $25.000,00.','El documento declara un total de $25.000,00.'],
  ['aclaracion','Flete a convenir.','La condición de flete requiere acordarse.']
 ].map(([categoria,evidencia,observacion])=>({categoria,evidencia,observacion}));
 const out=await analizarOriginalTextoConIAV2({
  fuente:{documentoId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   sha256:hash,tipo:'texto_extraido_de_original',
   originalAutenticado:true,proveedorAutenticado:true,
   consentimientoOriginalVerificado:false,compradorAutorizado:false,
   procesamientoInternoPrivado:true,fuente:source},
  apiKey:'sk-'+'X'.repeat(28),model:'gpt-6-luna',
  fetchImpl:async()=>{requests++;
   return new Response(JSON.stringify({status:'completed',output:[{
    type:'message',role:'assistant',content:[{
     type:'output_text',text:JSON.stringify({puntos:points})}]}]}),{status:200})
  }
 });
 assert.equal(requests,1);
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.puntos.length,8);
 assert.equal(out.whatsappEnviado,false);
});
