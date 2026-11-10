// Compose MVP306 SQL integration regression using the already-proven MVP280
// synthetic PostgreSQL17 fixture. No shared DB or real WhatsApp messages.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/mvp280-all-buyer-sources-pg17.sql';
const target=root+'supabase/tests/ci/.mvp306-generated-pg17.sql';
let sql=readFileSync(source,'utf8');
const anchor='\\ir ../../piloto/mvp280_confirmacion_unificada_comprador.sql';
if(sql.split(anchor).length!==2||!sql.trimEnd().endsWith('ROLLBACK;'))
 throw Error('MVP280 fixture changed: explicit audit required');
const extras=`
-- Only a synthetic supplier onboarding fixture; actual MVP109 consent is
-- independently tested by dedicated pg17/cryptography suites.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
 RETURNS trigger LANGUAGE plpgsql AS $immut$
BEGIN RAISE EXCEPTION 'immutable'; END $immut$;
ALTER TABLE cotironda_piloto_privado.participants ADD COLUMN display_label text;
UPDATE cotironda_piloto_privado.participants SET display_label=
 CASE WHEN key='corralon_ailin' THEN 'Corralón Ailín'
 ELSE 'Prueba de negocio' END;
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text PRIMARY KEY,chat_hmac text NOT NULL,
 authenticated_message_hmac text NOT NULL);
CREATE TABLE cotironda_piloto_privado.contact_reveal_consents_mvp109(
 participant_key text PRIMARY KEY,source_message_hmac text NOT NULL,
 approved_at timestamptz,revoked_at timestamptz);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid PRIMARY KEY,token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL,revoked_at timestamptz);
\\ir ../../piloto/mvp306_auto_release_y_contactos_proveedor.sql
`;
sql=sql.replace(anchor,anchor+String.fromCharCode(10)+extras);
const tests=`
DO $mvp306$
DECLARE
 src text:='PEDIDO DE MATERIALES'||E'\\n'||
  'Cemento CPC 50 kg 20 bolsas'||E'\\n'||'Entrega La Plata';
 h text:=repeat('ef',32); sh text; result jsonb; rid uuid;
 items jsonb:='[{"descripcion":"Cemento CPC 50 kg",
  "cantidad":"20","unidad":"bag","rubro":"obra_gruesa",
  "evidencia":"Cemento CPC 50 kg 20 bolsas"}]';
 routes jsonb:='[{"proveedor":"corralon_ailin","correspondencias":[{
  "indicePedido":0,"numeroCatalogo":1,
  "descripcionCatalogo":"Cemento CPC bolsa 50 kilos",
  "rubroCatalogo":"obra_gruesa","tipo":"alternativa_razonable",
  "explicacion":"mismo cemento de 50 kilos"}]}]';
 lease uuid;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_auto_release_mvp306(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_issue_auto_tracking_mvp306(text,text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp306_public_grant_leak'; END IF;
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306)
 THEN RAISE EXCEPTION 'mvp306_default_gate_on';END IF;
 IF public.cotironda_piloto_ia_auto_release_mvp306(repeat('a',64),h)->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp306_disabled_gate_bypassed';END IF;
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226
  SET created_at=clock_timestamp()-interval '3 days'
  WHERE buyer_key='arquitecto';
 -- El fixture ejecuta TODO dentro de un único BEGIN: now() es la hora
 -- inicial de la transacción. Simular gate activado ANTES del pedido.
 UPDATE cotironda_piloto_privado.ai_auto_release_gate_mvp306
  SET enabled=true,activated_at=transaction_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
  SET enabled=true,activated_at=coalesce(activated_at,clock_timestamp())
  WHERE only_row;
 sh:=encode(sha256(convert_to(src,'UTF8')),'hex');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(h,'arquitecto',repeat('a',64),'text','needs_review',sh,clock_timestamp());
 result:=public.cotironda_piloto_ia_reserve_buyer_mvp226(repeat('a',64),h,sh);
 IF result->>'state'<>'reserved' THEN RAISE EXCEPTION 'mvp306_reserve: %',result;END IF;
 result:=public.cotironda_piloto_ia_shadow_prepare_mvp221(
  repeat('a',64),h,src,'La Plata',items,routes);
 IF result->>'state'<>'shadow_staged'
 THEN RAISE EXCEPTION 'mvp306_staging: %',result;END IF;
 rid:=(result->>'request_id')::uuid;
 IF public.cotironda_piloto_ia_auto_release_mvp306(repeat('b',64),h)->>'state'
  <>'source_or_buyer_not_authorized'
 THEN RAISE EXCEPTION 'mvp306_foreign_buyer_allowed';END IF;
 result:=public.cotironda_piloto_ia_auto_release_mvp306(repeat('a',64),h);
 IF result->>'state'<>'supplier_contact_consent_missing'
 THEN RAISE EXCEPTION 'mvp306_implicit_contact_consent: %',result;END IF;
 -- Synthetic one-time authenticated opt-in from enrolled SUPPLIER, not buyer.
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('af',32),'corralon_ailin',repeat('1',64),'text','needs_review',
  encode(sha256(convert_to('COTI CONTACTOS SI','UTF8')),'hex'),clock_timestamp());
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
  VALUES('corralon_ailin',repeat('1',64),repeat('af',32));
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109
  VALUES('corralon_ailin',repeat('af',32),clock_timestamp(),NULL);
 result:=public.cotironda_piloto_ia_auto_release_mvp306(repeat('a',64),h);
 IF result->>'state'<>'approved' OR (result->>'request_id')::uuid<>rid
 THEN RAISE EXCEPTION 'mvp306_verified_auto_release: %',result;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279
   WHERE request_id=rid)
 THEN RAISE EXCEPTION 'mvp306_fake_buyer_confirmation';END IF;
 IF NOT cotironda_piloto_privado.confirmada_comprador_mvp280(rid)
 THEN RAISE EXCEPTION 'mvp306_approval_not_seen_by_gates';END IF;
 IF public.cotironda_piloto_ia_auto_release_mvp306(repeat('a',64),h)->>'state'
   <>'already_approved'
 THEN RAISE EXCEPTION 'mvp306_duplicate_approval';END IF;
 result:=public.cotironda_piloto_ia_publish_mvp222(rid);
 IF result->>'state'<>'ready_for_delivery'
 THEN RAISE EXCEPTION 'mvp306_auto_not_published: %',result;END IF;
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
  SET revoked_at=clock_timestamp() WHERE participant_key='corralon_ailin';
 IF cotironda_piloto_privado.confirmada_comprador_mvp280(rid)
 THEN RAISE EXCEPTION 'mvp306_revoked_supplier_still_authorized';END IF;
 IF public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp306_claim_after_supplier_revoke';END IF;
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
  SET revoked_at=NULL WHERE participant_key='corralon_ailin';
 result:=public.cotironda_piloto_ia_claim_mvp222(rid);
 IF result->>'state'<>'leased'
 THEN RAISE EXCEPTION 'mvp306_claim_after_optin: %',result;END IF;
 lease:=(result->>'lease_token')::uuid;
 IF public.cotironda_piloto_ia_pdf_snapshot_mvp222(
  rid,'corralon_ailin',lease) IS NULL
 THEN RAISE EXCEPTION 'mvp306_pdf_guard_denied';END IF;
 IF NOT public.cotironda_piloto_ia_finish_mvp222(
  rid,'corralon_ailin',lease,'api_accepted','mvp306-pdf-000001')
 THEN RAISE EXCEPTION 'mvp306_finish_failed';END IF;
 result:=public.cotironda_piloto_issue_auto_tracking_mvp306(
  repeat('a',64),h,rid,repeat('9',64));
 IF result->>'state'<>'issued'
 THEN RAISE EXCEPTION 'mvp306_auto_tracking: %',result;END IF;
 IF public.cotironda_piloto_issue_auto_tracking_mvp306(
  repeat('a',64),h,rid,repeat('8',64))->>'state'='issued'
 THEN RAISE EXCEPTION 'mvp306_duplicate_tracking';END IF;
 UPDATE cotironda_piloto_privado.request_lines
 SET original_description='Material adulterado'
 WHERE request_id=rid AND line_no=1;
 IF cotironda_piloto_privado.confirmada_comprador_mvp280(rid)
 THEN RAISE EXCEPTION 'mvp306_changed_source_still_approved';END IF;
 IF public.cotironda_piloto_ia_pdf_snapshot_mvp222(
  rid,'corralon_ailin',lease) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp306_tampered_pdf';END IF;
END $mvp306$;
`;
sql=sql.slice(0,sql.lastIndexOf('ROLLBACK;'))+tests+String.fromCharCode(10)+'ROLLBACK;'+String.fromCharCode(10);
if(!sql.includes('END $mvp306$;')||!sql.trimEnd().endsWith('ROLLBACK;'))
 throw Error('fixture generation failed');
writeFileSync(target,sql,'utf8');
console.log('MVP306 synthetic PostgreSQL17 fixture generated (rollback only).');
