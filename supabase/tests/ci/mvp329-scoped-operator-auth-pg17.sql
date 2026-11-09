-- MVP329 PG17 fixtures ONLY, rollback after every test. PostgREST JWT
-- signature verification lives outside SQL; this uses claims MOCK context.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END
$roles$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean NOT NULL DEFAULT false);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $jwt$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$jwt$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $uid$
 SELECT CASE WHEN (auth.jwt()->>'sub') ~*
 '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 THEN (auth.jwt()->>'sub')::uuid ELSE NULL::uuid END
$uid$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated;

CREATE SCHEMA cotironda_piloto_privado;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref uuid PRIMARY KEY,auth_user_id uuid UNIQUE REFERENCES auth.users(id),
 active boolean,role text,revoked_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text, state text,created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id uuid);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(request_id uuid,supplier_key text,state text,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,source_sha256 text,
 kind text,status text,association text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,kind text,plaintext_sha256 text,nonce_b64 text,
 ciphertext_b64 text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,source_sha256 text,state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.request_lines(
 request_id uuid,line_no smallint,original_description text,quantity numeric,unit text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_destinos_mvp221(request_id uuid,supplier_key text,line_no smallint);
CREATE TABLE cotironda_piloto_privado.ai_shadow_rubros_mvp221(request_id uuid,line_no smallint,rubro text);

-- Install EXACT production MVP267 Auth/session verifier in the fixture:
CREATE FUNCTION cotironda_piloto_privado.operator_session_mvp267()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT o.operator_ref
 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
 JOIN auth.users u ON u.id=o.auth_user_id
 JOIN auth.sessions sess ON sess.user_id=u.id
 WHERE o.active=true AND o.revoked_at IS NULL
  AND o.role='incident_manager'
  AND u.id=auth.uid()
  AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
  AND u.is_anonymous IS FALSE
  AND (auth.jwt()->>'iss')=
    'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1'
  AND (auth.jwt()->>'role')='authenticated'
  AND (auth.jwt()->>'aal')='aal2'
  AND (auth.jwt()->>'sub')=u.id::text
  AND (auth.jwt()->>'session_id')~*
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  AND sess.id=CASE
    WHEN (auth.jwt()->>'session_id')~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid
    ELSE NULL::uuid END
  AND (sess.not_after IS NULL OR sess.not_after>clock_timestamp())
  AND (auth.jwt()->>'exp')~'^[0-9]{9,11}$'
  AND CASE WHEN (auth.jwt()->>'exp')~'^[0-9]{9,11}$'
    THEN (auth.jwt()->>'exp')::bigint>
      extract(epoch FROM clock_timestamp())::bigint
    ELSE false END
 LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.operator_session_mvp267()
 FROM PUBLIC,anon,authenticated,service_role;

\ir ../../piloto/mvp328_lectura_cifrada_y_auditoria_interna.sql
\ir ../../piloto/mvp329_operador_conciliacion_tickets_scope.sql

INSERT INTO auth.users VALUES
 ('10000000-0000-4000-8000-000000000001',NULL,NULL,false),
 ('10000000-0000-4000-8000-000000000002',NULL,NULL,false),
 ('10000000-0000-4000-8000-000000000003',NULL,NULL,true);
INSERT INTO auth.sessions VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',NULL),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',NULL),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',NULL);
INSERT INTO cotironda_piloto_privado.supervisor_operators_mvp265 VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,'incident_manager',NULL),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true,'incident_manager',NULL),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',true,'incident_manager',NULL);
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a','buyer',repeat('f',64),now(),NULL),
 ('buyer_b','buyer',repeat('e',64),now(),NULL),
 ('supplier_a','supplier',repeat('c',64),now(),NULL),
 ('supplier_b','supplier',repeat('9',64),now(),NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('11111111-1111-4111-8111-111111111111','buyer_a','prepared',now()-interval '3 days',now()+interval '2 days'),
 ('22222222-2222-4222-8222-222222222222','buyer_b','prepared',now()-interval '3 days',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('11111111-1111-4111-8111-111111111111','supplier_a','api_accepted',now()-interval '2 days'),
 ('22222222-2222-4222-8222-222222222222','supplier_b','api_accepted',now()-interval '2 days');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('c',64),
 'text',repeat('d',64),'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',now()-interval '1 hour'),
 (repeat('b',64),'22222222-2222-4222-8222-222222222222','supplier_b',repeat('9',64),
 'text',repeat('8',64),'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',now()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('d',64),
 'text','awaiting_semantic_review','semantic_unique_mvp291'),
 (repeat('b',64),'22222222-2222-4222-8222-222222222222','supplier_b',repeat('8',64),
 'text','awaiting_semantic_review','semantic_unique_mvp291');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('d',64),
 'review',now()-interval '30 minutes'),
 (repeat('b',64),'22222222-2222-4222-8222-222222222222','supplier_b',repeat('8',64),
 'review',now()-interval '30 minutes');
INSERT INTO cotironda_piloto_privado.request_lines VALUES
 ('11111111-1111-4111-8111-111111111111',1,'Cemento CPC',20,'bag'),
 ('22222222-2222-4222-8222-222222222222',1,'Pintura blanco',5,'l');
INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221 VALUES
 ('11111111-1111-4111-8111-111111111111','supplier_a',1),
 ('22222222-2222-4222-8222-222222222222','supplier_b',1);
INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221 VALUES
 ('11111111-1111-4111-8111-111111111111',1,'obra_gruesa'),
 ('22222222-2222-4222-8222-222222222222',1,'pintura');
-- Explicit DBA-administered assignment scoped to company buyer_a ONLY.
INSERT INTO cotironda_piloto_privado.operator_reconciliation_grants_mvp329
 (operator_ref,request_id,buyer_key,active,expires_at) VALUES
 ('30000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','buyer_a',true,now()+interval '2 days');
-- Operator 2 receives an INVALID mismatched-company grant for buyer_b
-- request in order to test the company/buyer_key predicate.
INSERT INTO cotironda_piloto_privado.operator_reconciliation_grants_mvp329
 (operator_ref,request_id,buyer_key,active,expires_at) VALUES
 ('30000000-0000-4000-8000-000000000002',
  '22222222-2222-4222-8222-222222222222','buyer_a',true,now()+interval '2 days');

CREATE TEMP TABLE issued_tokens(ticket text NOT NULL);
GRANT INSERT,SELECT,TRUNCATE ON issued_tokens TO authenticated,service_role;

-- Real Auth session/MFA conditions are checked by production MVP267 code.
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
INSERT INTO issued_tokens(ticket)
 SELECT public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'ticket';
DO $valid_issue$
DECLARE secret text;
BEGIN
 SELECT ticket INTO secret FROM issued_tokens LIMIT 1;
 IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'mvp329_signed_mfa_issue_denied';END IF;
 IF public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '22222222-2222-4222-8222-222222222222',repeat('b',64),repeat('9',64))->>'state'
 <>'not_authorized'
 THEN RAISE EXCEPTION 'mvp329_cross_company_issue';END IF;
 IF public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('0',64))->>'state'
 <>'not_authorized'
 THEN RAISE EXCEPTION 'mvp329_wrong_supplier_chat';END IF;
 IF has_table_privilege('authenticated',
  'cotironda_piloto_privado.operator_reconciliation_grants_mvp329','INSERT') OR
 has_table_privilege('authenticated',
  'cotironda_piloto_privado.operator_reconciliation_tickets_mvp329','SELECT') OR
 has_function_privilege('authenticated',
  'public.cotironda_piloto_claim_reconciliation_mvp329(text,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp329_bad_client_acl';END IF;
END $valid_issue$;
RESET ROLE;

SET ROLE service_role;
DO $consume$
DECLARE token text;a jsonb;b jsonb;
BEGIN
 SELECT ticket INTO token FROM issued_tokens LIMIT 1;
 a:=public.cotironda_piloto_claim_reconciliation_mvp329(
 token,'11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64));
 IF a->>'state'<>'claimed_internal' OR
 a->>'actor_subject_sha256' !~ '^[a-f0-9]{64}$' OR
 (SELECT count(*) FROM jsonb_object_keys(a))<>5
 THEN RAISE EXCEPTION 'mvp329_claim_invalid_%',a;END IF;
 b:=public.cotironda_piloto_claim_reconciliation_mvp329(
 token,'11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64));
 IF b->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp329_ticket_replay_accepted';END IF;
 IF has_function_privilege('service_role',
  'public.cotironda_piloto_operator_issue_reconciliation_mvp329(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp329_service_role_can_forge_issue';END IF;
END $consume$;
RESET ROLE;
-- AAL1 client cannot issue even if a matching grant exists.
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal1',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
DO $aal1$
BEGIN
 IF public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'state'
 <>'not_authorized' THEN RAISE EXCEPTION 'mvp329_mfa_bypass';END IF;
END $aal1$;
RESET ROLE;

-- Revoke the grant AFTER a ticket was issued -> claim denied.
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
TRUNCATE issued_tokens;
INSERT INTO issued_tokens(ticket)
 SELECT public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'ticket';
RESET ROLE;
UPDATE cotironda_piloto_privado.operator_reconciliation_grants_mvp329 SET revoked_at=clock_timestamp()
 WHERE operator_ref='30000000-0000-4000-8000-000000000001';
SET ROLE service_role;
DO $revoked_claim$
DECLARE token text;
BEGIN
 SELECT ticket INTO token FROM issued_tokens LIMIT 1;
 IF public.cotironda_piloto_claim_reconciliation_mvp329(
 token,'11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'state'
 <>'not_authorized' THEN RAISE EXCEPTION 'mvp329_grant_revocation_failed';END IF;
END $revoked_claim$;
RESET ROLE;
UPDATE cotironda_piloto_privado.operator_reconciliation_grants_mvp329 SET revoked_at=NULL
 WHERE operator_ref='30000000-0000-4000-8000-000000000001';

-- Deleted live session after issue: claim must fail. No silent fallback.
SET ROLE authenticated;
TRUNCATE issued_tokens;
INSERT INTO issued_tokens(ticket)
 SELECT public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 '11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'ticket';
RESET ROLE;
DELETE FROM auth.sessions WHERE id='20000000-0000-4000-8000-000000000001';
SET ROLE service_role;
DO $session_revoked$
DECLARE token text;
BEGIN
 SELECT ticket INTO token FROM issued_tokens LIMIT 1;
 IF public.cotironda_piloto_claim_reconciliation_mvp329(
 token,'11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('c',64))->>'state'
 <>'not_authorized' THEN RAISE EXCEPTION 'mvp329_revoked_session_claim';END IF;
END $session_revoked$;
RESET ROLE;

-- No supplier identity or original source was exposed in browser ticket.
ROLLBACK;
