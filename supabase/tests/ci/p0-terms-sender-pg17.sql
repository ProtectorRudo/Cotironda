-- Synthetic sender-to-DB protocol, PG17. No Supabase pilot mutation,
-- no actual Whapi requests, no actual MFA user. Must END IN ROLLBACK.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid primary key,buyer_key text,state text,created_at timestamptz,
 closes_at timestamptz,closed_at timestamptz);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,created_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participants(
 key text primary key,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_policy_mvp178(
 singleton boolean,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_consents_mvp178(
 request_id uuid,supplier_key text,alcance text,version text,accepted_at timestamptz,
 revoked_at timestamptz,consent_message_hmac text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 received_at timestamptz,kind text,plaintext_sha256 text);
-- Stub for CI ONLY. Does NOT emulate or certify Auth MFA.
CREATE FUNCTION cotironda_piloto_privado.operator_session_mvp267()
 RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('cotironda.ci_operator',true),'')::uuid;
$fn$;
\ir ../../piloto/mvp362_originales_alta_consentimiento_off.sql
\ir ../../piloto/p0_whapi_terms_sender_atomic_off.sql

DO $acl$
BEGIN
 IF has_table_privilege('anon',
 'cotironda_piloto_privado.supplier_terms_send_jobs_p0','SELECT')
 OR has_table_privilege('authenticated',
 'cotironda_piloto_privado.supplier_terms_send_jobs_p0','INSERT')
 OR has_table_privilege('service_role',
 'cotironda_piloto_privado.supplier_terms_send_jobs_p0','INSERT')
 OR has_function_privilege('anon',
 'cotironda_piloto_privado.terms_claim_p0()','EXECUTE')
 OR has_function_privilege('authenticated',
 'cotironda_piloto_privado.terms_finish_p0(uuid,uuid,text,text,text,text,text,text)',
 'EXECUTE')
 OR has_function_privilege('service_role',
 'cotironda_piloto_privado.terms_begin_p0(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'p0_api_roles_have_sender_privileges';END IF;
 IF has_function_privilege('anon',
 'public.cotironda_piloto_terms_enqueue_auth_p0(text,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
 'public.cotironda_piloto_terms_enqueue_auth_p0(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'p0_wrong_mfa_enqueue_acl';END IF;
END $acl$;

DO $seed$
DECLARE t text:= 'cotironda-originales-alta-v1';
 body_ text:='cotironda-originales-alta-v1. Condiciones versionadas de prueba: '||
 repeat('La descarga del archivo original completo se limita al comprador autenticado de rondas futuras cerradas. ',3);
 sha_ text;out_ jsonb;
BEGIN
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('supplier_1','whapi_pilot_ci')
   ->>'state')<>'not_authorized'
 THEN RAISE EXCEPTION 'p0_mfa_operator_absent_but_queue_allowed';END IF;
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_1','supplier',repeat('a',64),now()-interval '1 day',null),
 ('supplier_2','supplier',repeat('b',64),now()-interval '1 day',null),
 ('buyer_1','buyer',repeat('c',64),now()-interval '1 day',null);
 sha_:=encode(extensions.digest(convert_to(body_,'UTF8'),'sha256'),'hex');
 INSERT INTO cotironda_piloto_privado.original_terms_policy_mvp362
 (terms_version,terms_body,terms_sha256,approved_at,activated_at,enabled)
 VALUES(t,body_,sha_,now()-interval '2 hours',now()-interval '1 hour',true);
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('supplier_1','whapi_pilot_ci')
   ->>'state')<>'not_authorized'
 THEN RAISE EXCEPTION 'p0_mfa_operator_missing_after_policy';END IF;
 PERFORM set_config('cotironda.ci_operator',
   '55555555-5555-4555-8555-555555555555',true);
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('buyer_1','whapi_pilot_ci')
   ->>'state')<>'supplier_not_allowed'
 THEN RAISE EXCEPTION 'p0_buyer_should_not_receive_supplier_terms';END IF;
 out_:=public.cotironda_piloto_terms_enqueue_auth_p0('supplier_1','whapi_pilot_ci');
 IF out_->>'state'<>'queued'
 THEN RAISE EXCEPTION 'p0_valid_queue_denied';END IF;
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('supplier_1','whapi_pilot_ci')
  ->>'state')<>'already_queued'
 THEN RAISE EXCEPTION 'p0_queue_duplicate';END IF;
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('supplier_2','whapi_pilot_ci')
  ->>'state')<>'queued'
 THEN RAISE EXCEPTION 'p0_second_supplier_queue_denied';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0)<>2
 THEN RAISE EXCEPTION 'p0_queue_count_invalid';END IF;
END $seed$;

SET ROLE cotironda_pilot_terms_sender_p0;
DO $worker$
DECLARE c jsonb; c2 jsonb; got jsonb; fin jsonb;
 job uuid;lease uuid;state_ boolean;
BEGIN
 c:=cotironda_piloto_privado.terms_claim_p0();
 IF c IS NULL OR c->>'state'<>'leased' OR c->>'supplierKey'<>'supplier_1'
  OR c->>'channel'<>'whapi_pilot_ci' OR c->>'chatHmac'<>repeat('a',64)
 THEN RAISE EXCEPTION 'p0_first_claim_missing_or_cross_chat';END IF;
 job:=(c->>'jobId')::uuid;lease:=(c->>'leaseToken')::uuid;
 IF (cotironda_piloto_privado.terms_begin_p0(
   job,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'state')<>'cancelled'
 THEN RAISE EXCEPTION 'p0_wrong_lease_began';END IF;
 got:=cotironda_piloto_privado.terms_begin_p0(job,lease);
 IF got->>'state'<>'in_flight' THEN RAISE EXCEPTION 'p0_begin_failed';END IF;
 IF (cotironda_piloto_privado.terms_begin_p0(job,lease)->>'state')<>'cancelled'
 THEN RAISE EXCEPTION 'p0_duplicate_begin';END IF;
 IF cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('f',64))
 THEN RAISE EXCEPTION 'p0_changed_chat_authorized';END IF;
 IF NOT cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('a',64))
 THEN RAISE EXCEPTION 'p0_valid_authorize_denied';END IF;
 fin:=cotironda_piloto_privado.terms_finish_p0(job,lease,
 'supplier_1','cotironda-originales-alta-v1',c->>'termsSha256',
 'api_accepted',null,c->>'termsSha256');
 IF fin->>'state'<>'rejected'
 THEN RAISE EXCEPTION 'p0_missing_whapi_ack_accepted';END IF;
 fin:=cotironda_piloto_privado.terms_finish_p0(job,lease,
 'supplier_1','cotironda-originales-alta-v1',c->>'termsSha256',
 'api_accepted',repeat('d',64),c->>'termsSha256');
 IF fin->>'state'<>'api_accepted'
 THEN RAISE EXCEPTION 'p0_atomic_finish_denied';END IF;
 IF (cotironda_piloto_privado.terms_finish_p0(job,lease,
 'supplier_1','cotironda-originales-alta-v1',c->>'termsSha256',
 'api_accepted',repeat('d',64),c->>'termsSha256')->>'state')<>'rejected'
 THEN RAISE EXCEPTION 'p0_duplicate_ack_saved';END IF;

 c2:=cotironda_piloto_privado.terms_claim_p0();
 IF c2 IS NULL OR c2->>'supplierKey'<>'supplier_2'
 THEN RAISE EXCEPTION 'p0_second_claim_denied';END IF;
 job:=(c2->>'jobId')::uuid;lease:=(c2->>'leaseToken')::uuid;
 IF (cotironda_piloto_privado.terms_begin_p0(job,lease)->>'state')<>'in_flight'
 THEN RAISE EXCEPTION 'p0_second_begin_denied';END IF;
 IF (cotironda_piloto_privado.terms_finish_p0(job,lease,
 'supplier_2','cotironda-originales-alta-v1',c2->>'termsSha256',
 'uncertain',repeat('e',64),c2->>'termsSha256')->>'state')<>'rejected'
 THEN RAISE EXCEPTION 'p0_uncertain_must_not_contain_ack';END IF;
 IF (cotironda_piloto_privado.terms_finish_p0(job,lease,
 'supplier_2','cotironda-originales-alta-v1',c2->>'termsSha256',
 'uncertain',null,c2->>'termsSha256')->>'state')<>'uncertain'
 THEN RAISE EXCEPTION 'p0_uncertain_not_recorded';END IF;
 IF cotironda_piloto_privado.terms_claim_p0() IS NOT NULL
 THEN RAISE EXCEPTION 'p0_uncertain_auto_requeued';END IF;
END $worker$;
RESET ROLE;

DO $assert$
BEGIN
 IF (SELECT count(*) FROM
   cotironda_piloto_privado.supplier_original_terms_notices_mvp364)<>1
 THEN RAISE EXCEPTION 'p0_whapi_ack_ledger_count_wrong';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.supplier_original_terms_notices_mvp364
  WHERE supplier_key='supplier_1' AND notice_message_hmac=repeat('d',64)
    AND delivery_state='api_accepted' AND terms_sha256=outbound_body_sha256
 ) THEN RAISE EXCEPTION 'p0_ack_ledger_wrong';END IF;
 IF (SELECT count(*) FROM
   cotironda_piloto_privado.supplier_terms_send_jobs_p0
   WHERE state='uncertain')<>1
 THEN RAISE EXCEPTION 'p0_uncertain_state_count_wrong';END IF;
 IF (public.cotironda_piloto_terms_enqueue_auth_p0('supplier_2',
   'whapi_pilot_ci')->>'state')<>'already_queued'
 THEN RAISE EXCEPTION 'p0_uncertain_reenqueue_allowed';END IF;
 RAISE NOTICE 'P0 SENDER PASS: isolated role, Auth MFA stub, begin, atomic ACK, uncertain, no resend, ROLLBACK';
END $assert$;
ROLLBACK;
