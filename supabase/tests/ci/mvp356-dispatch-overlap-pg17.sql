-- MVP356. PostgreSQL 17 isolated, synthetic ONLY, full ROLLBACK.
-- Reproduces both installed PILOT claim functions and tests the shared
-- serial guard for two overlapping requests from the same supplier.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean primary key,whatsapp_outbound_enabled boolean);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222(
 only_row boolean primary key,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_batch_gate_mvp314(
 only_row boolean primary key,enabled boolean,activated_at timestamptz,
 daily_attempt_limit integer,buyer_daily_attempt_limit integer);
CREATE TABLE cotironda_piloto_privado.ai_batch_budget_mvp314(
 day_utc date primary key,attempts_reserved integer,updated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_batch_buyer_budget_mvp314(
 day_utc date,buyer_key text,attempts_reserved integer,
 primary key(day_utc,buyer_key));
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid primary key,buyer_key text,delivery_city text,
 state text,created_at timestamptz,closes_at timestamptz,
 source_hmac text);
CREATE TABLE cotironda_piloto_privado.participants(
 key text primary key,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz,
 delivery_city text);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,
 primary key(request_id,supplier_key));
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,created_at timestamptz,
 lease_token uuid,leased_at timestamptz,
 whapi_message_id text,finished_at timestamptz,
 primary key(request_id,supplier_key));
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(
 request_id uuid primary key,status text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text primary key,request_id uuid,
 participant_key text,chat_hmac text);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,sent_at timestamptz);
CREATE FUNCTION cotironda_piloto_privado.confirmada_comprador_mvp280(uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION cotironda_piloto_privado.proveedor_contactable_mvp307(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

\ir ../../piloto/mvp356_solo_piloto_despacho_sin_solapamientos.sql

DO $mvp356_test$
DECLARE
 n timestamptz:=clock_timestamp();
 r1 uuid:='11111111-1111-4111-8111-111111111111';
 r2 uuid:='22222222-2222-4222-8222-222222222222';
 r3 uuid:='33333333-3333-4333-8333-333333333333';
 r4 uuid:='44444444-4444-4444-8444-444444444444';
 a jsonb;b jsonb;
BEGIN
 IF has_function_privilege('anon',
   'cotironda_piloto_privado.hay_despacho_solapado_mvp356(uuid,text)',
   'EXECUTE')
 OR has_function_privilege('authenticated',
   'cotironda_piloto_privado.hay_despacho_solapado_mvp356(uuid,text)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'mvp356_privilege_leak';END IF;

 INSERT INTO cotironda_piloto_privado.integration_flags
 VALUES(true,true);
 INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222
 VALUES(true,true,n-interval '2 days');
 INSERT INTO cotironda_piloto_privado.ai_batch_gate_mvp314
 VALUES(true,false,n-interval '2 days',50,50);
 INSERT INTO cotironda_piloto_privado.participants
 VALUES
 ('buyer_one',repeat('a',64),'buyer',n-interval '5 days',null,'La Plata'),
 ('buyer_two',repeat('b',64),'buyer',n-interval '5 days',null,'La Plata'),
 ('supplier_a',repeat('c',64),'supplier',n-interval '5 days',null,'La Plata'),
 ('supplier_b',repeat('d',64),'supplier',n-interval '5 days',null,'La Plata');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (r1,'buyer_one','La Plata','prepared',n-interval '1 hour',
  n+interval '5 days',repeat('1',64)),
 (r2,'buyer_two','La Plata','prepared',n-interval '1 hour',
  n+interval '5 days',repeat('2',64)),
 (r3,'buyer_one','La Plata','prepared',n-interval '1 hour',
  n+interval '5 days',repeat('3',64)),
 (r4,'buyer_two','La Plata','prepared',n-interval '1 hour',
  n+interval '5 days',repeat('4',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 SELECT id,'shadow' FROM cotironda_piloto_privado.requests;
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT r.source_hmac,r.id,r.buyer_key,p.chat_hmac
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants p ON p.key=r.buyer_key;
 INSERT INTO cotironda_piloto_privado.invitations
 VALUES(r1,'supplier_a','prepared'),(r2,'supplier_a','prepared'),
 (r3,'supplier_b','prepared'),(r4,'supplier_a','prepared');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 (request_id,supplier_key,state,created_at)
 VALUES(r1,'supplier_a','pending',n-interval '30 minutes'),
       (r2,'supplier_a','pending',n-interval '30 minutes'),
       (r3,'supplier_b','pending',n-interval '30 minutes');

 -- MVP222 fallback, two architect companies, same supplier.
 a:=public.cotironda_piloto_ia_claim_mvp222(r1);
 IF a->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_old_claim_first_not_leased';END IF;
 b:=public.cotironda_piloto_ia_claim_mvp222(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp356_old_claim_overlapping_allowed';END IF;
 IF NOT public.cotironda_piloto_ia_finish_mvp222(
   r1,'supplier_a',(a->>'lease_token')::uuid,
   'api_accepted','whapi-send-123456') THEN
  RAISE EXCEPTION 'mvp356_old_claim_finish_failed';END IF;
 b:=public.cotironda_piloto_ia_claim_mvp222(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp356_old_claim_after_http_allowed';END IF;
 -- Another supplier remains contactable, never block the whole round.
 b:=public.cotironda_piloto_ia_claim_mvp222(r3);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_unrelated_supplier_blocked';END IF;
 UPDATE cotironda_piloto_privado.requests
 SET state='closed' WHERE id=r1;
 b:=public.cotironda_piloto_ia_claim_mvp222(r2);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_after_close_should_continue';END IF;

 -- Reset synthetic data, activate MVP314 path sharing same lock.
 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=r1;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='pending',lease_token=null,leased_at=null,
 whapi_message_id=null,finished_at=null;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
 SET enabled=true WHERE only_row=true;

 a:=public.cotironda_piloto_ia_claim_mvp314(r1);
 IF a->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_batch_first_not_leased';END IF;
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp356_batch_overlapping_allowed';END IF;
 b:=public.cotironda_piloto_ia_claim_mvp314(r3);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_batch_other_supplier_blocked';END IF;
 UPDATE cotironda_piloto_privado.requests
 SET state='closed' WHERE id=r1;
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_batch_after_close_should_continue';END IF;

 -- A LEGACY Whapi accepted invitation is also a rival. Do not
 -- let old and new dispatch pipelines create ambiguous PDF replies.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='pending',lease_token=null,leased_at=null
 WHERE request_id=r2;
 INSERT INTO cotironda_piloto_privado.whapi_outbox
 VALUES(r4,'supplier_a','api_accepted','legacy-outbound-123',
 n-interval '10 minutes');
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp356_legacy_rival_not_blocked';END IF;
 UPDATE cotironda_piloto_privado.requests
 SET state='closed' WHERE id=r4;
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_legacy_close_should_unblock';END IF;

 -- UNCERTAIN can have reached the provider. Treat as busy.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='uncertain',lease_token=null WHERE request_id=r1;
 UPDATE cotironda_piloto_privado.requests
 SET state='prepared' WHERE id=r1;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='pending',lease_token=null WHERE request_id=r2;
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp356_uncertain_outbound_not_blocked';END IF;
 UPDATE cotironda_piloto_privado.requests
 SET state='closed' WHERE id=r1;
 b:=public.cotironda_piloto_ia_claim_mvp314(r2);
 IF b->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp356_uncertain_closed_should_unblock';END IF;

 RAISE NOTICE 'MVP356 PASS: legacy + batch, multiple buyers, same supplier blocked, independent supplier allowed, closed and uncertain';
END $mvp356_test$;
ROLLBACK;
