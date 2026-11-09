-- MVP328: ephemeral PG17. No real data, no external connections, ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY, participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id uuid);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,kind text,status text,association text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,kind text,plaintext_sha256 text,nonce_b64 text,
 ciphertext_b64 text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.request_lines(
 request_id uuid,line_no smallint,original_description text,
 quantity numeric,unit text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_destinos_mvp221(
 request_id uuid,supplier_key text,line_no smallint
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_rubros_mvp221(
 request_id uuid,line_no smallint,rubro text
);
\ir ../../piloto/mvp328_lectura_cifrada_y_auditoria_interna.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
('buyer_a','buyer',repeat('f',64),now(),NULL),
('buyer_b','buyer',repeat('e',64),now(),NULL),
('supplier_a','supplier',repeat('c',64),now(),NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
('11111111-1111-4111-8111-111111111111','buyer_a','prepared',now()-interval '3 days',now()+interval '2 days'),
('22222222-2222-4222-8222-222222222222','buyer_b','prepared',now()-interval '3 days',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
('11111111-1111-4111-8111-111111111111','supplier_a','api_accepted',now()-interval '2 days');
INSERT INTO cotironda_piloto_privado.request_lines VALUES
('11111111-1111-4111-8111-111111111111',1,'Cemento CPC 50 kg',20,'bag');
INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221 VALUES
('11111111-1111-4111-8111-111111111111','supplier_a',1);
INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221 VALUES
('11111111-1111-4111-8111-111111111111',1,'obra_gruesa');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('c',64),
 'text',repeat('d',64),'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',now()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('d',64),
 'text','awaiting_semantic_review','semantic_unique_mvp291');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('d',64),
 'review',now()-interval '30 minutes');
DO $test$
DECLARE r jsonb;z jsonb;found integer; v boolean;
BEGIN
 r:=public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64));
 IF r->>'state'<>'eligible_encrypted'
 OR r->>'source_sha256'<>repeat('d',64)
 OR r->>'latest_message_hmac'<>repeat('a',64)
 OR r->>'nonce'<>'AAAAAAAAAAAAAAAA'
 OR r->>'ciphertext'<>'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
 OR jsonb_array_length(r->'items')<>1
 OR r->'items'->0->>'id'<>'item_1'
 THEN RAISE EXCEPTION 'mvp328_valid_envelope_wrong';END IF;
 IF r::text ~* 'supplier_a|buyer_a|phone|contact|Cemento(?!\\b)'
 THEN RAISE EXCEPTION 'mvp328_internal_envelope_unexpected_contact';END IF;
 IF public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  '22222222-2222-4222-8222-222222222222',repeat('a',64),repeat('c',64))->>'state'<>'not_found'
 OR public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('0',64))->>'state'<>'not_found'
 OR public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  '11111111-1111-4111-8111-111111111111',repeat('f',64),repeat('c',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp328_cross_scope_read';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_record_reconciliation_attempt_mvp328(uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_record_reconciliation_attempt_mvp328(uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.ai_reconciliation_attempts_mvp328','INSERT')
 THEN RAISE EXCEPTION 'mvp328_public_permissions';END IF;
 z:=public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('d',64),
 repeat('1',64),repeat('2',64),repeat('3',64),
 'candidate_only','[]'::jsonb);
 IF z->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp328_audit_not_recorded_%',z;END IF;
 z:=public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('d',64),
 repeat('1',64),repeat('2',64),repeat('3',64),
 'candidate_only','[]'::jsonb);
 IF z->>'state'<>'already_recorded'
 THEN RAISE EXCEPTION 'mvp328_idempotency_missing';END IF;
 z:=public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('d',64),
 repeat('1',64),repeat('4',64),repeat('3',64),
 'candidate_only','[]'::jsonb);
 IF z->>'state'<>'idempotency_conflict'
 THEN RAISE EXCEPTION 'mvp328_idempotency_collision_unhandled';END IF;
 z:=public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('d',64),
 repeat('5',64),repeat('6',64),repeat('3',64),
 'approved','[]'::jsonb);
 IF z->>'state'<>'invalid' THEN RAISE EXCEPTION 'mvp328_approved_must_be_impossible';END IF;
 SELECT count(*) INTO found FROM cotironda_piloto_privado.ai_reconciliation_attempts_mvp328;
 IF found<>1 THEN RAISE EXCEPTION 'mvp328_audit_count_wrong';END IF;

 v:=false;
 BEGIN
  UPDATE cotironda_piloto_privado.ai_reconciliation_attempts_mvp328
  SET result_state='requires_evidence';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM='mvp328_append_only' THEN v:=true;ELSE RAISE;END IF;
 END;
 IF NOT v THEN RAISE EXCEPTION 'mvp328_update_should_be_immutable';END IF;
 v:=false;
 BEGIN
  DELETE FROM cotironda_piloto_privado.ai_reconciliation_attempts_mvp328;
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM='mvp328_append_only' THEN v:=true;ELSE RAISE;END IF;
 END;
 IF NOT v THEN RAISE EXCEPTION 'mvp328_delete_should_be_immutable';END IF;
 v:=false;
 BEGIN
  TRUNCATE cotironda_piloto_privado.ai_reconciliation_attempts_mvp328;
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM='mvp328_append_only' THEN v:=true;ELSE RAISE;END IF;
 END;
 IF NOT v THEN RAISE EXCEPTION 'mvp328_truncate_should_be_immutable';END IF;
END $test$;

-- Later linked document shadows old text, even when it has no review.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
(repeat('b',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('c',64),
 'document',repeat('e',64),'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',now()-interval '5 minutes');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
(repeat('b',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('e',64),
 'document','awaiting_semantic_review','semantic_unique_mvp291');
DO $supersession$
DECLARE z jsonb;
BEGIN
 z:=public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64));
 IF z->>'state'<>'not_found' THEN RAISE EXCEPTION 'mvp328_new_document_did_not_shadow_old_text';END IF;
 z:=public.cotironda_piloto_record_reconciliation_attempt_mvp328(
  '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('d',64),
  repeat('7',64),repeat('8',64),repeat('3',64),'candidate_only','[]'::jsonb);
 IF z->>'state'<>'not_eligible'
 THEN RAISE EXCEPTION 'mvp328_stale_new_attempt_recorded';END IF;
END $supersession$;
ROLLBACK;
