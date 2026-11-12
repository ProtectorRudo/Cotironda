-- MVP358: legacy outbound and IA share a PG17 advisory lock.
-- Disposable schema, no real jobs or phone numbers, final ROLLBACK.
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


-- Allow-* stubs simulate business-approved invitations, not a bypass
-- of the NEW cross-lane guard. Real versions are stricter than these.
CREATE FUNCTION cotironda_piloto_privado.allow_next_pilot_send_mvp091(uuid,text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION cotironda_piloto_privado.allow_document_send_mvp099(uuid,text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
\ir ../../piloto/mvp356_solo_piloto_despacho_sin_solapamientos.sql
\ir ../../piloto/mvp358_legacy_claim_same_lock_and_cross_lane.sql

DO $mvp358_test$
DECLARE
 n timestamptz:=clock_timestamp();
 r1 uuid:='11111111-1111-4111-8111-111111111111';
 r2 uuid:='22222222-2222-4222-8222-222222222222';
 r3 uuid:='33333333-3333-4333-8333-333333333333';
 r4 uuid:='44444444-4444-4444-8444-444444444444';
 a jsonb;
 b jsonb;
BEGIN
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_supplier_overlap_gate_mvp356
 WHERE only_row) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp358_guard_not_off_at_install';END IF;

 INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true);
 INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222
 VALUES(true,true,n-interval '2 days');
 INSERT INTO cotironda_piloto_privado.ai_batch_gate_mvp314
 VALUES(true,false,n-interval '2 days',20,20);
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer1',repeat('a',64),'buyer',n-interval '2 days',null,'La Plata'),
 ('buyer2',repeat('b',64),'buyer',n-interval '2 days',null,'La Plata'),
 ('supplier_a',repeat('c',64),'supplier',n-interval '2 days',null,'La Plata'),
 ('supplier_b',repeat('d',64),'supplier',n-interval '2 days',null,'La Plata');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (r1,'buyer1','La Plata','prepared',n-interval '50 minutes',n+interval '2 days',repeat('1',64)),
 (r2,'buyer2','La Plata','prepared',n-interval '45 minutes',n+interval '2 days',repeat('2',64)),
 (r3,'buyer1','La Plata','prepared',n-interval '40 minutes',n+interval '2 days',repeat('3',64)),
 (r4,'buyer1','La Plata','prepared',n-interval '30 minutes',n+interval '2 days',repeat('4',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 SELECT id,'shadow' FROM cotironda_piloto_privado.requests;
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT r.source_hmac,r.id,r.buyer_key,p.chat_hmac
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants p ON p.key=r.buyer_key;
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 (r1,'supplier_a','prepared'),(r2,'supplier_a','prepared'),
 (r3,'supplier_b','prepared'),(r4,'supplier_a','prepared');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id,supplier_key,state,created_at,finished_at,whapi_message_id)
 VALUES
 (r1,'supplier_a','api_accepted',n-interval '50 minutes',n-interval '45 minutes','ai-accepted-message'),
 (r2,'supplier_a','pending',n-interval '40 minutes',null,null),
 (r3,'supplier_b','pending',n-interval '35 minutes',null,null),
 (r4,'supplier_a','pending',n-interval '30 minutes',null,null);
 INSERT INTO cotironda_piloto_privado.whapi_outbox(
 request_id,supplier_key,state,message_body,created_at)
 VALUES
 (r1,'supplier_a','pending','synthetic',n-interval '48 minutes'),
 (r2,'supplier_a','pending','synthetic',n-interval '38 minutes'),
 (r3,'supplier_b','pending','synthetic',n-interval '33 minutes');

 -- Disabled guard MUST NOT affect existing legacy SQL.
 IF cotironda_piloto_privado.hay_despacho_solapado_mvp356(r1,'supplier_a')
 THEN RAISE EXCEPTION 'mvp358_off_flag_changed_legacy';END IF;
 -- ON inside this synthetic transaction only.
 UPDATE cotironda_piloto_privado.ai_supplier_overlap_gate_mvp356
 SET enabled=true,activated_at=n-interval '1 minute' WHERE only_row;

 IF NOT cotironda_piloto_privado.hay_despacho_solapado_mvp356(r1,'supplier_a')
 THEN RAISE EXCEPTION 'mvp358_same_round_ai_vs_legacy_not_blocked';END IF;

 -- Legacy cannot send r1 again or to supplier_a for r2.
 -- It CAN still dispatch to independent supplier_b for r3.
 a:=public.cotironda_piloto_claim_whapi_v1();
 IF a->>'state'<>'leased' OR a->>'supplier_key'<>'supplier_b'
 OR a->>'request_id'<>r3::text THEN
  RAISE EXCEPTION 'mvp358_legacy_claim_did_not_skip_collisions';END IF;

 -- Prevent second legacy attempt while the first is leased.
 b:=public.cotironda_piloto_claim_whapi_v1();
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp358_legacy_second_claim_should_be_empty';END IF;

 -- Other pipeline also sees the same-source legacy lease.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='pending',finished_at=null,whapi_message_id=null WHERE request_id=r3;
 b:=public.cotironda_piloto_ia_claim_mvp222(r3);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp358_ai_claim_ignored_same_round_legacy_lease';END IF;

 -- An accepted LEGACY send for r2 blocks the AI lane r2 (same round).
 UPDATE cotironda_piloto_privado.whapi_outbox
 SET state='api_accepted',sent_at=n WHERE request_id=r2;
 UPDATE cotironda_piloto_privado.requests SET state='closed' WHERE id=r1;
 b:=public.cotironda_piloto_ia_claim_mvp222(r2);
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp358_ai_claim_ignored_same_round_legacy_accepted';END IF;

 -- Legacy sends another round => blocked while r2's legacy is active.
 INSERT INTO cotironda_piloto_privado.whapi_outbox(
 request_id,supplier_key,state,message_body,created_at)
 VALUES(r4,'supplier_a','pending','synthetic',n-interval '10 minutes');
 b:=public.cotironda_piloto_claim_whapi_v1();
 IF b->>'state'<>'empty' THEN
  RAISE EXCEPTION 'mvp358_legacy_ignored_existing_outbox_accepted';END IF;

 -- Closing r2 makes r4 eligible; r3 leased remains independent.
 UPDATE cotironda_piloto_privado.requests SET state='closed' WHERE id=r2;
 b:=public.cotironda_piloto_claim_whapi_v1();
 IF b->>'state'<>'leased' OR b->>'request_id'<>r4::text
 THEN RAISE EXCEPTION 'mvp358_legacy_no_resume_after_close';END IF;

 RAISE NOTICE 'MVP358 PASS: guard OFF, 2 buyers, same supplier, both pipelines, same round, independent supplier, closed round';
END $mvp358_test$;
ROLLBACK;
