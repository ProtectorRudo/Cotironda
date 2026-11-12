-- MVP357 PG17 synthetic, COMPLETE ROLLBACK, no real HTTP/WhatsApp/secrets.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
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


CREATE SCHEMA net;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
CREATE TABLE cotironda_piloto_privado.mvp357_fake_net(
 call_id bigserial PRIMARY KEY,
 valid_endpoint boolean NOT NULL,
 valid_dual_auth boolean NOT NULL,
 empty_json_body boolean NOT NULL,
 no_authorization_header boolean NOT NULL
);
-- Stub only: records booleans, NEVER plaintext credentials.
CREATE FUNCTION net.http_post(
 url text, body jsonb,
 params jsonb DEFAULT '{}'::jsonb,
 headers jsonb DEFAULT '{}'::jsonb,
 timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE plpgsql
AS $net_fixture$
DECLARE xid bigint;
BEGIN
 INSERT INTO cotironda_piloto_privado.mvp357_fake_net(
  valid_endpoint,valid_dual_auth,empty_json_body,no_authorization_header
 ) VALUES (
  url='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-ai-batch',
  headers->>'apikey'=('sb_secret_'||repeat('A',32)) AND
    headers->>'x-cotironda-ai-batch-secret'=repeat('X',64),
  body='{}'::jsonb,
  NOT headers ? 'Authorization'
 ) RETURNING call_id INTO xid;
 IF timeout_milliseconds<>5000 THEN
  RAISE EXCEPTION 'mvp357_timeout_not_bounded';END IF;
 RETURN xid;
END
$net_fixture$;

\ir ../../piloto/mvp356_solo_piloto_despacho_sin_solapamientos.sql
\ir ../../piloto/mvp357_next_batch_skip_blocked.sql
\ir ../../piloto/mvp357_batch_retry_private_off.sql

DO $test357$
DECLARE
 n timestamptz:=clock_timestamp();
 r0 uuid:='11111111-1111-4111-8111-111111111111';
 r1 uuid:='22222222-2222-4222-8222-222222222222';
 r2 uuid:='33333333-3333-4333-8333-333333333333';
 v jsonb;
 msg text;
 call_count integer;
BEGIN
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_batch_retry_gate_mvp357
     WHERE only_row) IS DISTINCT FROM false
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_supplier_overlap_gate_mvp356
     WHERE only_row) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp357_gates_not_off_by_default';END IF;
 IF has_function_privilege('anon',
  'cotironda_piloto_privado.ai_batch_retry_tick_mvp357()','EXECUTE')
 OR has_function_privilege('authenticated',
  'cotironda_piloto_privado.ai_batch_retry_tick_mvp357()','EXECUTE')
 OR has_function_privilege('service_role',
  'cotironda_piloto_privado.ai_batch_retry_tick_mvp357()','EXECUTE')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.ai_batch_retry_gate_mvp357','SELECT')
 THEN RAISE EXCEPTION 'mvp357_private_acl_missing';END IF;

 INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true);
 INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222
 VALUES(true,true,n-interval '2 days');
 INSERT INTO cotironda_piloto_privado.ai_batch_gate_mvp314
 VALUES(true,true,n-interval '2 days',4,3);
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_x',repeat('a',64),'buyer',n-interval '1 day',null,'La Plata'),
 ('buyer_y',repeat('b',64),'buyer',n-interval '1 day',null,'La Plata'),
 ('supplier_a',repeat('c',64),'supplier',n-interval '1 day',null,'La Plata'),
 ('supplier_b',repeat('d',64),'supplier',n-interval '1 day',null,'La Plata');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (r0,'buyer_x','La Plata','prepared',n-interval '1 hour',n+interval '4 days',repeat('1',64)),
 (r1,'buyer_x','La Plata','prepared',n-interval '1 hour',n+interval '4 days',repeat('2',64)),
 (r2,'buyer_y','La Plata','prepared',n-interval '1 hour',n+interval '4 days',repeat('3',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 SELECT id,'shadow' FROM cotironda_piloto_privado.requests;
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT r.source_hmac,r.id,r.buyer_key,p.chat_hmac
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants p ON p.key=r.buyer_key;
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 (r0,'supplier_a','prepared'),
 (r1,'supplier_a','prepared'),
 (r2,'supplier_b','prepared');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 (request_id,supplier_key,state,created_at,finished_at,whapi_message_id)
 VALUES
 (r0,'supplier_a','api_accepted',n-interval '45 minutes',n-interval '30 minutes','whapi-accepted-001'),
 (r1,'supplier_a','pending',n-interval '40 minutes',null,null),
 (r2,'supplier_b','pending',n-interval '35 minutes',null,null);
 -- MVP356 guard enabled *in this transaction only*.
 UPDATE cotironda_piloto_privado.ai_supplier_overlap_gate_mvp356
 SET enabled=true,activated_at=n-interval '5 minutes' WHERE only_row;
 v:=public.cotironda_piloto_ia_next_batch_mvp314();
 IF v->>'state'<>'ready' OR v->>'request_id'<>r2::text THEN
  RAISE EXCEPTION 'mvp357_blocked_first_starved_unblocked_supplier';END IF;

 -- Scheduler remains OFF even when a pending eligible request exists.
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'disabled' THEN RAISE EXCEPTION 'mvp357_off_scheduler_invoked'; END IF;
 -- This flag cannot expose a token even to service_role and must stay off.
 UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 SET enabled=true,activated_at=n-interval '5 minutes' WHERE only_row;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'credentials_unavailable' THEN
  RAISE EXCEPTION 'mvp357_no_vault_secrets_should_fail_closed';END IF;

 INSERT INTO vault.decrypted_secrets VALUES
 ('cotironda_piloto_ai_batch_apikey_mvp357','sb_secret_'||repeat('A',32)),
 ('cotironda_piloto_ai_batch_private_mvp357',repeat('X',64));
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'queued' THEN RAISE EXCEPTION 'mvp357_eligible_not_queued';END IF;
 SELECT count(*) INTO call_count
 FROM cotironda_piloto_privado.mvp357_fake_net;
 IF call_count<>1 OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.mvp357_fake_net
  WHERE NOT (valid_endpoint AND valid_dual_auth AND empty_json_body
              AND no_authorization_header))
 THEN RAISE EXCEPTION 'mvp357_http_credentials_or_target_wrong';END IF;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'throttled' THEN RAISE EXCEPTION 'mvp357_duplicate_tick_not_throttled';END IF;
 SELECT count(*) INTO call_count
 FROM cotironda_piloto_privado.mvp357_fake_net;
 IF call_count<>1 THEN RAISE EXCEPTION 'mvp357_duplicate_http_queued';END IF;

 -- After the worker would finish supplier_b, NEVER retry it.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='uncertain' WHERE request_id=r2;
 UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 SET last_enqueued_at=null WHERE only_row;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'no_eligible_job' THEN RAISE EXCEPTION 'mvp357_uncertain_retried';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted' WHERE request_id=r2;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'no_eligible_job' THEN RAISE EXCEPTION 'mvp357_accepted_retried';END IF;

 -- After the rival round ends, the supplier_a pending request is selectable.
 UPDATE cotironda_piloto_privado.requests SET state='closed' WHERE id=r0;
 v:=public.cotironda_piloto_ia_next_batch_mvp314();
 IF v->>'request_id'<>r1::text THEN
  RAISE EXCEPTION 'mvp357_pending_not_released_after_close';END IF;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'queued' THEN RAISE EXCEPTION 'mvp357_released_job_not_queued';END IF;
 SELECT count(*) INTO call_count FROM cotironda_piloto_privado.mvp357_fake_net;
 IF call_count<>2 THEN RAISE EXCEPTION 'mvp357_released_job_http_count';END IF;
 -- No future tick after round has expired/closed.
 UPDATE cotironda_piloto_privado.requests SET state='closed' WHERE id=r1;
 UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 SET last_enqueued_at=null WHERE only_row;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'no_eligible_job' THEN RAISE EXCEPTION 'mvp357_closed_round_queued';END IF;

 -- Disabling can always stop scheduling even with work/credentials.
 UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 SET enabled=false WHERE only_row;
 msg:=cotironda_piloto_privado.ai_batch_retry_tick_mvp357();
 IF msg<>'disabled' THEN RAISE EXCEPTION 'mvp357_cannot_disable';END IF;

 RAISE NOTICE 'MVP357 PG17 PASS: OFF, double auth, blocked skip, uncertain/accepted, cooldown, closed and ROLLBACK';
END
$test357$;
ROLLBACK;
