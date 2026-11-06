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
 r jsonb; buyer jsonb; supplier jsonb; stopped jsonb;
 req_a uuid:='00000000-0000-4000-8000-000000000001';
 req_b uuid:='00000000-0000-4000-8000-000000000002';
BEGIN
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_b,repeat('a',64),repeat('1',64),repeat('5',64),
  'buyer_delivery_city_verified');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp259_cross_buyer_scope_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_b,repeat('c',64),repeat('3',64),repeat('7',64),
  'supplier_quote_verified');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp259_cross_supplier_scope_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_a,repeat('a',64),repeat('1',64),repeat('8',64),
  'buyer_delivery_city_verified');
 IF r->>'state'<>'source_not_verified'
 THEN RAISE EXCEPTION 'mvp259_forged_source_sha_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_a,repeat('a',64),repeat('1',64),repeat('5',64),
  'supplier_quote_verified');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp259_buyer_faked_supplier_memory_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_a,repeat('a',64),repeat('1',64),repeat('5',64),
  'buyer_delivery_city_verified');
 IF r->>'state'<>'remembered_private'
 THEN RAISE EXCEPTION 'mvp259_cannot_remember_buyer_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_a,repeat('a',64),repeat('1',64),repeat('5',64),
  'buyer_delivery_city_verified');
 IF r->>'state'<>'already_remembered'
 THEN RAISE EXCEPTION 'mvp259_duplicate_memory_%',r;END IF;
 r:=public.cotironda_piloto_remember_commercial_mvp259(
  req_a,repeat('c',64),repeat('3',64),repeat('7',64),
  'supplier_quote_verified');
 IF r->>'state'<>'remembered_private'
 THEN RAISE EXCEPTION 'mvp259_cannot_remember_verified_quote_%',r;END IF;
 buyer:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('a',64));
 supplier:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('c',64));
 IF buyer->>'state'<>'private_commercial_context' OR
 buyer->>'role'<>'buyer' OR buyer->>'delivery_city'<>'La Plata' OR
 (buyer->>'remembered_sources')::integer<>1 OR
 buyer->>'buyer_city_source_remembered'<>'true' OR
 jsonb_array_length(buyer->'rubros')<>2 OR
 buyer->>'contains_prices'<>'false' OR
 buyer->>'contains_contacts'<>'false' OR
 supplier->>'role'<>'supplier' OR
 jsonb_array_length(supplier->'rubros')<>1 OR
 supplier->>'own_latest_verified_quote_remembered'<>'true' OR
 (supplier->>'remembered_sources')::integer<>1
 THEN RAISE EXCEPTION 'mvp259_scope_snapshot_wrong_buyer_%, supplier_%',buyer,supplier;
 END IF;
 IF (buyer::text||supplier::text) LIKE '%buyer_a%' OR
    (buyer::text||supplier::text) LIKE '%supplier_a%' OR
    (buyer::text||supplier::text) LIKE '%00000000-0000-4000%' OR
    (buyer::text||supplier::text) LIKE '%'||repeat('7',64)||'%'
 THEN RAISE EXCEPTION 'mvp259_identifier_leaked';END IF;
 r:=public.cotironda_piloto_commercial_context_mvp259(req_b,repeat('a',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp259_other_customer_visible_%',r;END IF;

 -- New revision supersedes the earlier verified source, so it must not be
 -- described as the supplier's *current* verified commercial position.
 INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('9',64),req_a,'supplier_a',repeat('9',64),'review',
  clock_timestamp());
 stopped:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('c',64));
 IF stopped->>'own_latest_verified_quote_remembered'<>'false'
 THEN RAISE EXCEPTION 'mvp259_old_quote_wrongly_current_%',stopped;END IF;

 UPDATE cotironda_piloto_privado.commercial_context_events_mvp259
 SET recorded_at=clock_timestamp()-interval '1 day',
     expires_at=clock_timestamp()-interval '1 minute'
 WHERE participant_key='buyer_a';
 stopped:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('a',64));
 IF stopped->>'buyer_city_source_remembered'<>'false' OR
 (stopped->>'remembered_sources')::integer<>0
 THEN RAISE EXCEPTION 'mvp259_expiry_not_honored_%',stopped;END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='supplier_a';
 stopped:=public.cotironda_piloto_commercial_context_mvp259(req_a,repeat('c',64));
 IF stopped->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp259_revoked_supplier_visible_%',stopped;END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_commercial_context_mvp259(uuid,text)','EXECUTE') OR
 has_function_privilege('authenticated',
  'public.cotironda_piloto_remember_commercial_mvp259(uuid,text,text,text,text)','EXECUTE') OR
 NOT has_function_privilege('service_role',
  'public.cotironda_piloto_commercial_context_mvp259(uuid,text)','EXECUTE') OR
 has_table_privilege('service_role',
  'cotironda_piloto_privado.commercial_context_events_mvp259','SELECT')
 THEN RAISE EXCEPTION 'mvp259_acl_leak';END IF;
END$checks$;
ROLLBACK;
