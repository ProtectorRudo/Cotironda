import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generarWebhookV202} from '../../scripts/piloto/v2-02-whapi-overlay.mjs';
import {contieneReferenciaPedidoV2} from
 '../../supabase/functions/cotironda-piloto-whapi/referencia-pedido-v2.ts';
import {makeMediaManifest} from
 '../../supabase/functions/cotironda-piloto-whapi/media-intake.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_02_referencia_caption_adjunto_solo_lectura.sql',
 import.meta.url),'utf8');
const old=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');
const candidate=generarWebhookV202(old);

test('V2-02 caption: PDF y Excel usan el MANIFIESTO, sin alterar bytes',()=>{
 const formats=[
  ['application/pdf','Presupuesto.pdf'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Planilla.xlsx']
 ];
 for(const [mime,file_name] of formats){
  const doc=makeMediaManifest({document:{
   id:'doc-file123456789',mime_type:mime,file_size:1244,
   file_name,caption:'Cotironda pedido: AAAABBBB'
  }},'document');
  assert.equal(doc?.state,'awaiting_secure_download');
  assert.equal(doc?.mime,mime);
  assert.equal(doc?.caption,'Cotironda pedido: AAAABBBB');
  assert.equal(contieneReferenciaPedidoV2(doc?.caption),true);
  assert.equal(contieneReferenciaPedidoV2(JSON.stringify(doc)),true);
 }
 const noCaption=makeMediaManifest({document:{
  id:'doc-file999999999',mime_type:'application/pdf',file_size:400
 }},'document');
 assert.equal(noCaption?.caption,null);
 assert.equal(contieneReferenciaPedidoV2(noCaption?.caption),false);
 const ambiguous=makeMediaManifest({document:{
  id:'doc-file888888888',mime_type:'application/pdf',file_size:300,
  caption:'COTI-AAAABBBB y COTI-CCCCDDDD'
 }},'document');
 assert.equal(contieneReferenciaPedidoV2(ambiguous?.caption),false);
});

test('V2-02 caption: no lectura de nombre, fecha, monto ni archivo para deducir ronda',()=>{
 for(const required of [
  "m.kind IN ('document','image')",
  "m.request_id IS NULL AND a.request_id IS NULL",
  "m.plaintext_sha256=encode(sha256(convert_to(p_original_manifest,'UTF8')),'hex')",
  "a.state='stored'",
  "a.content_sha256 ~ '^[a-f0-9]{64}$'",
  "a.storage_path='media/'||m.message_hmac",
  "a.media_id_sha256=encode(sha256(convert_to(v_manifest->>'media_id','UTF8')),'hex')",
  "a.mime=v_manifest->>'mime'",
  "v_manifest->>'origin'='whapi'",
  "v_manifest->>'kind'=m.kind",
  "v_caption:=v_manifest->>'caption'",
  "job.supplier_key=v_source.participant_key",
  "job.state='api_accepted'",
  "v_source.supplier_consent_at<=job.finished_at",
  "buyer.consent_at<=job.finished_at",
  "inv.created_at<=job.finished_at",
  "v_candidates<>1 OR v_quoted IS NULL",
  "TO service_role;"
 ])assert.ok(sql.includes(required),required);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/u);
 assert.doesNotMatch(sql,/^\s*(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|TRUNCATE\s+)/gimu);
 assert.ok(!sql.includes('filename'));
});

test('V2-02 caption: overlay solo tras guardar SHA, reutiliza MVP225, flag OFF',()=>{
 assert.ok(!old.includes('cotironda_piloto_v2_quoted_id_for_media_reference'));
 assert.ok(candidate.includes("db.rpc('cotironda_piloto_v2_quoted_id_for_media_reference'"));
 assert.ok(candidate.includes("Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'"));
 assert.ok(candidate.includes('contieneReferenciaPedidoV2(media?.caption)'));
 assert.ok(candidate.includes('p_original_manifest:body'));
 assert.ok(candidate.includes("found.data?.state==='matched'"));
 assert.ok(candidate.includes('supplierQuotedId=quoteId'));
 const stored=candidate.indexOf("db.rpc('cotironda_piloto_finish_media_mvp095'");
 const ref=candidate.indexOf("db.rpc('cotironda_piloto_v2_quoted_id_for_media_reference'");
 const preamble=candidate.indexOf("db.rpc('cotironda_piloto_ia_attach_supplier_media_mvp238'");
 const bind=candidate.indexOf("db.rpc('cotironda_piloto_ia_link_supplier_mvp225'",preamble);
 assert.ok(stored>=0&&ref>stored&&preamble>ref&&bind>preamble);
 assert.equal(candidate.split("db.rpc('cotironda_piloto_v2_quoted_id_for_media_reference'").length,2);
 assert.throws(()=>generarWebhookV202(candidate),/overlay_base_unexpected/u);
});
