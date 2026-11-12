import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {etiquetaReferenciaPedidoV2,contieneReferenciaPedidoV2} from
 '../../supabase/functions/cotironda-piloto-whapi/referencia-pedido-v2.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_02_ref_codigo_pedido_solo_lectura.sql',
 import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');

test('V2-02: referencia visible reproduce el codigo del PDF sin contacto',()=>{
 const uuid='a1b2c3d4-1111-4111-8111-111111111111';
 assert.equal(etiquetaReferenciaPedidoV2(uuid),'Cotironda pedido: A1B2C3D4');
 for(const bad of [null,'',0,'00000000','a'.repeat(36),
 'a1b2c3d4-1111-0111-8111-111111111111']){
  assert.equal(etiquetaReferenciaPedidoV2(bad),null);
 }
});

test('V2-02: solo prefiltra un codigo marcado, no codigos sueltos o ambiguos',()=>{
 for(const ok of [
  'Cotironda pedido: A1B2C3D4',
  'COTI-A1B2C3D4',
  'Con relación a COTI A1B2C3D4 te paso presupuesto.',
  'Cotironda pedido: A1B2C3D4 y cotironda pedido: A1B2C3D4'
 ])assert.equal(contieneReferenciaPedidoV2(ok),true,ok);
 for(const bad of [
  '1234ABCD','El pedido es 1234ABCD','Cotironda pedido: 123456789',
  'COTI-1234GGGG','Cotironda pedido: 12345678 y COTI-87654321',
  'La obra de la calle 12345678','COTI 1234ABCD'.repeat(400)
 ])assert.equal(contieneReferenciaPedidoV2(bad),false,bad.slice(0,80));
});

test('V2-02: el backend exige fuente autentica, hash y despacho del mismo proveedor',()=>{
 for(const required of [
  'm.message_hmac=p_message_hmac',
  'm.chat_hmac=p_chat_hmac',
  "m.kind='text'",
  'm.request_id IS NULL',
  "m.processing_state IN('unmatched_quote','needs_review')",
  "m.plaintext_sha256=encode(sha256(convert_to(p_original_text,'UTF8')),'hex')",
  "p.participant_role='supplier'",
  'p.consent_at IS NOT NULL',
  'p.opted_out_at IS NULL',
  'job.supplier_key=v_source.participant_key',
  "job.state='api_accepted'",
  'job.finished_at<=v_source.received_at',
  "r.state='prepared'",
  "inv.state='prepared'",
  "sh.status='shadow'",
  'r.closes_at>v_source.received_at',
  'v_candidates<>1 OR v_quoted IS NULL',
  'GRANT EXECUTE ON FUNCTION',
  'TO service_role;'
 ])assert.ok(sql.includes(required),required);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/u);
 assert.doesNotMatch(sql,/^\s*(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|TRUNCATE\s+)/gimu);
});

test('V2-02: sin instalacion y flag ON no cambia rutas anteriores',()=>{
 assert.ok(edge.includes(
  "Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'"));
 assert.ok(edge.includes(
  "db.rpc('cotironda_piloto_v2_quoted_id_for_reference'"));
 assert.ok(edge.includes('p_original_text:body'));
 assert.ok(edge.includes("lookup.data?.state==='matched'"));
 assert.ok(edge.includes('supplierQuotedId=q;'));
 assert.ok(edge.includes('const refCaption='));
 assert.ok(edge.includes('caption:CAPTION_PEDIDO_COTIRONDA_MVP305+'));
 const refLookup=edge.indexOf("db.rpc('cotironda_piloto_v2_quoted_id_for_reference'");
 const originalLink=edge.indexOf("db.rpc('cotironda_piloto_ia_link_supplier_mvp225'");
 assert.ok(refLookup>0&&refLookup<originalLink);
});
