-- MVP354: prueba REAL en PostgreSQL 17 aislado, con rollback final.
-- Crea tablas ficticias, NO toca el Supabase PILOTO y no envía WhatsApps.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA cotironda_piloto_privado;

CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid,buyer_key text,state text,created_at timestamptz,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participants(
 key text,participant_role text,consent_at timestamptz,
 opted_out_at timestamptz,chat_hmac text);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 request_id uuid,participant_key text,chat_hmac text,state text,
 finished_at timestamptz,reserved_at timestamptz,
 message_hmac text,storage_path text,content_sha256 text,
 size_bytes integer,mime text);

\ir ../../piloto/mvp354_document_receipts_private.sql

DO $test$
DECLARE
 r1 uuid:='11111111-1111-4111-8111-111111111111';
 r2 uuid:='22222222-2222-4222-8222-222222222222';
 tok text:=repeat('a',64);
 v jsonb;
 n timestamptz:=clock_timestamp();
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_document_receipts_mvp354(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_document_receipts_mvp354(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_document_receipts_mvp354(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp354_rpc_not_private'; END IF;

 -- Comprador autentificado via token del tracking; 2 proveedores consentidos.
 INSERT INTO cotironda_piloto_privado.participants VALUES
  ('buyer','buyer',n-interval '30 days',null,'buyer-hmac'),
  ('supplier_a','supplier',n-interval '30 days',null,'chat_a'),
  ('supplier_b','supplier',n-interval '30 days',null,'chat_b');
 INSERT INTO cotironda_piloto_privado.requests VALUES
  (r1,'buyer','prepared',n-interval '1 day',n+interval '1 day');
 INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091 VALUES
  (r1,tok,null,n+interval '2 days');
 INSERT INTO cotironda_piloto_privado.invitations VALUES
  (r1,'supplier_a','prepared'),(r1,'supplier_b','prepared');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
  (r1,'supplier_a','api_accepted','id-a',n-interval '1 hour'),
  (r1,'supplier_b','api_accepted','id-b',n-interval '1 hour');

 v:=public.cotironda_piloto_document_receipts_mvp354(repeat('0',64));
 IF v->>'state'<>'not_found' OR jsonb_object_length(v)<>1
 THEN RAISE EXCEPTION 'mvp354_invalid_token_not_closed';END IF;
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'state'<>'recepcion_documental_anonima_mvp354'
 OR v->>'invitados'<>'2' OR v->>'archivos_recibidos'<>'0'
 OR v->>'pendientes'<>'2' OR jsonb_object_length(v)<>8
 THEN RAISE EXCEPTION 'mvp354_no_files_status_invalid';END IF;

 -- PDF auténtico del proveedor A: no hace falta extraer ni UN precio.
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (r1,'supplier_a','chat_a','stored',n-interval '29 minutes',
  n-interval '30 minutes',repeat('b',64),'media/'||repeat('b',64),
  repeat('c',64),1024,'application/pdf');
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'archivos_recibidos'<>'1' OR v->>'pendientes'<>'1'
 OR v->>'precios_validados'<>'false' OR
 v->>'originales_disponibles'<>'false' OR
 v->>'identidades_reveladas'<>'false'
 THEN RAISE EXCEPTION 'mvp354_stored_pdf_not_counted_safely';END IF;

 -- Doble adjunto / reintento del mismo proveedor NO duplica el contador.
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (r1,'supplier_a','chat_a','stored',n-interval '28 minutes',
  n-interval '29 minutes',repeat('d',64),'media/'||repeat('d',64),
  repeat('e',64),2048,'application/pdf');
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'archivos_recibidos'<>'1'
 THEN RAISE EXCEPTION 'mvp354_duplicate_counted_as_supplier';END IF;

 -- Excel del proveedor B suma segundo proveedor sin interpretación económica.
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (r1,'supplier_b','chat_b','stored',n-interval '27 minutes',
  n-interval '28 minutes',repeat('f',64),'media/'||repeat('f',64),
  repeat('1',64),4100,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'archivos_recibidos'<>'2' OR v->>'pendientes'<>'0'
 THEN RAISE EXCEPTION 'mvp354_second_supplier_not_counted';END IF;

 -- Alteración de SHA/ruta o persona incorrecta no cuenta.
 UPDATE cotironda_piloto_privado.media_archive_mvp095
  SET storage_path='media/archivo-forjado'
  WHERE participant_key='supplier_b';
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'archivos_recibidos'<>'1'
 THEN RAISE EXCEPTION 'mvp354_forged_path_counted';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095
  SET storage_path='media/'||message_hmac
  WHERE participant_key='supplier_b';

 -- Dos rondas solapadas con despacho al mismo proveedor bloquean
 -- el documento A, aunque el archivo tenga request_id de la primera.
 INSERT INTO cotironda_piloto_privado.requests VALUES
  (r2,'buyer','prepared',n-interval '2 hours',n+interval '2 hours');
 INSERT INTO cotironda_piloto_privado.invitations VALUES
  (r2,'supplier_a','prepared');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
  (r2,'supplier_a','api_accepted','id-overlap',n-interval '40 minutes');
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'archivos_recibidos'<>'1'
 THEN RAISE EXCEPTION 'mvp354_ambiguous_round_was_counted';END IF;

 -- La revocación o vencimiento del enlace elimina incluso el contador.
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
  SET revoked_at=clock_timestamp() WHERE request_id=r1;
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'state'<>'not_found' THEN
  RAISE EXCEPTION 'mvp354_revoked_token_count_leaked';END IF;
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
  SET revoked_at=null,expires_at=n-interval '1 minute' WHERE request_id=r1;
 v:=public.cotironda_piloto_document_receipts_mvp354(tok);
 IF v->>'state'<>'not_found' THEN
  RAISE EXCEPTION 'mvp354_expired_token_count_leaked';END IF;

 RAISE NOTICE 'MVP354 PG17 PASS: 2 proveedores, PDF+XLSX, duplicados, fraude, solapamiento, expiracion y ACL';
END $test$;

ROLLBACK;
