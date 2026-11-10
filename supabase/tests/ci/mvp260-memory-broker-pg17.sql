-- MVP259 / PostgreSQL 17 isolation and expiry test. All synthetic, ROLLBACK.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,delivery_city text,
 closes_at timestamptz,source_hmac text
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,participant_key text,chat_hmac text,
 plaintext_sha256 text,kind text,request_id uuid
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_rubros_mvp221(
 request_id uuid,line_no int,rubro text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_destinos_mvp221(
 request_id uuid,line_no int,supplier_key text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,state text,reserved_at timestamptz
);
\ir ../../piloto/mvp259_commercial_memory_scoped.sql
\ir ../../piloto/mvp260_memory_broker_bridge.sql

INSERT INTO cotironda_piloto_privado.participants
 (key,chat_hmac,participant_role,consent_at) VALUES
 ('buyer_a',repeat('a',64),'buyer',clock_timestamp()-interval '1 hour'),
 ('buyer_b',repeat('b',64),'buyer',clock_timestamp()-interval '1 hour'),
 ('supplier_a',repeat('c',64),'supplier',clock_timestamp()-interval '1 hour'),
 ('supplier_b',repeat('d',64),'supplier',clock_timestamp()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','buyer_a','prepared',
  'La Plata',clock_timestamp()+interval '3 days',repeat('1',64)),
 ('00000000-0000-4000-8000-000000000002','buyer_b','prepared',
  'Berisso',clock_timestamp()+interval '3 days',repeat('2',64));
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a','prepared'),
 ('00000000-0000-4000-8000-000000000002','supplier_b','prepared');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),'buyer_a',repeat('a',64),repeat('5',64),'text',NULL),
 (repeat('2',64),'buyer_b',repeat('b',64),repeat('6',64),'text',NULL),
 (repeat('3',64),'supplier_a',repeat('c',64),repeat('7',64),'text',
  '00000000-0000-4000-8000-000000000001'),
 (repeat('4',64),'supplier_b',repeat('d',64),repeat('8',64),'text',
  '00000000-0000-4000-8000-000000000002'),
 (repeat('9',64),'supplier_a',repeat('c',64),repeat('9',64),'text',
  '00000000-0000-4000-8000-000000000001');
INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001',1,'obra_gruesa'),
 ('00000000-0000-4000-8000-000000000001',2,'pintura'),
 ('00000000-0000-4000-8000-000000000002',1,'electricidad');
INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001',1,'supplier_a'),
 ('00000000-0000-4000-8000-000000000002',1,'supplier_b');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('3',64),'00000000-0000-4000-8000-000000000001','supplier_a',
  repeat('7',64),'verified',clock_timestamp()-interval '1 minute'),
 (repeat('4',64),'00000000-0000-4000-8000-000000000002','supplier_b',
  repeat('8',64),'verified',clock_timestamp()-interval '1 minute');


DO $checks$
DECLARE
 r jsonb; other jsonb;
 req_a uuid:='00000000-0000-4000-8000-000000000001';
BEGIN
 -- Only a reserved, source-matched quote may request its own context.
 r:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'not_authorized' THEN
  RAISE EXCEPTION 'mvp260_context_without_reservation_%',r;END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET state='reserved' WHERE message_hmac=repeat('3',64);
 r:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'verified_scope' OR
    r->>'contains_prices'<>'false' OR r->>'contains_contacts'<>'false'
 OR r->>'automatic_decisions_allowed'<>'false'
 OR jsonb_array_length(r->'rubros')<>1 OR
 r->'rubros'->0->>'rubro'<>'obra_gruesa' OR
 (r->'rubros'->0->>'materiales')::integer<>1
 THEN RAISE EXCEPTION 'mvp260_scope_not_exact_%',r;END IF;
 IF r::text LIKE '%buyer_a%' OR r::text LIKE '%supplier_a%' OR
    r::text LIKE '%'||repeat('7',64)||'%'
 THEN RAISE EXCEPTION 'mvp260_leaked_personal_data';END IF;
 other:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('d',64),repeat('3',64),repeat('7',64));
 IF other->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_other_supplier_scope_%',other;END IF;
 other:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('c',64),repeat('3',64),repeat('8',64));
 IF other->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_wrong_original_sha_%',other;END IF;
 other:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('a',64),repeat('3',64),repeat('7',64));
 IF other->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_buyer_accessed_supplier_%',other;END IF;
 other:=public.cotironda_piloto_memory_sync_quote_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF other->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_synced_unverified_quote_%',other;END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET state='verified' WHERE message_hmac=repeat('3',64);
 r:=public.cotironda_piloto_memory_sync_quote_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'remembered_private'
 THEN RAISE EXCEPTION 'mvp260_sync_verified_failed_%',r;END IF;
 r:=public.cotironda_piloto_memory_sync_quote_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'already_remembered'
 THEN RAISE EXCEPTION 'mvp260_sync_replay_duplicate_%',r;END IF;
 r:=public.cotironda_piloto_memory_sync_quote_mvp260(
  repeat('c',64),repeat('3',64),repeat('8',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_sync_wrong_sha_%',r;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.commercial_context_events_mvp259
  WHERE request_id=req_a AND participant_key='supplier_a')<>1
 THEN RAISE EXCEPTION 'mvp260_duplicated_memory_pointer';END IF;
 -- A newer non-verified correction invalidates the old current fact.
 INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('9',64),req_a,'supplier_a',repeat('9',64),'review',
 clock_timestamp()+interval '1 second');
 r:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('c',64));
 IF r->>'own_latest_verified_quote_remembered'<>'false'
 THEN RAISE EXCEPTION 'mvp260_old_quote_mistaken_for_current_%',r;END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='supplier_a';
 r:=public.cotironda_piloto_memory_quote_context_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_revoked_context_not_blocked_%',r;END IF;
 r:=public.cotironda_piloto_memory_sync_quote_mvp260(
  repeat('c',64),repeat('3',64),repeat('7',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp260_revoked_sync_not_blocked_%',r;END IF;

 IF has_function_privilege('anon',
   'public.cotironda_piloto_memory_quote_context_mvp260(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_memory_sync_quote_mvp260(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_memory_quote_context_mvp260(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp260_acl_bypass';END IF;
END$checks$;
ROLLBACK;
