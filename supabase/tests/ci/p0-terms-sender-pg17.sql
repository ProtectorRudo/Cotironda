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
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text,chat_hmac text,authenticated_message_hmac text,
 contact_sha256 text,nonce_b64 text,ciphertext_b64 text,bound_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_policy_mvp178(
 singleton boolean,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_consents_mvp178(
 request_id uuid,supplier_key text,alcance text,version text,accepted_at timestamptz,
 revoked_at timestamptz,consent_message_hmac text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 received_at timestamptz,kind text,plaintext_sha256 text,
 nonce_b64 text,ciphertext_b64 text);
-- Stub for CI ONLY. Does NOT emulate or certify Auth MFA.
CREATE FUNCTION cotironda_piloto_privado.operator_session_mvp267()
 RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('cotironda.ci_operator',true),'')::uuid;
$fn$;
\ir ../../piloto/mvp362_originales_alta_consentimiento_off.sql
\ir ../../piloto/p0_whapi_terms_sender_atomic_off.sql
\ir ../../piloto/p0_whapi_terms_review_mfa_off.sql

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
 OR has_function_privilege('anon',
 'cotironda_piloto_privado.terms_recipient_packet_p0(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
 'cotironda_piloto_privado.terms_recipient_packet_p0(uuid,uuid)','EXECUTE')
 OR has_function_privilege('service_role',
 'cotironda_piloto_privado.terms_recipient_packet_p0(uuid,uuid)','EXECUTE')
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
 -- Source is existing encrypted MVP109, never a phone stored in sender jobs.
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
 (participant_key,chat_hmac,authenticated_message_hmac,contact_sha256,
  nonce_b64,ciphertext_b64,bound_at)
 VALUES
 ('supplier_1',repeat('a',64),repeat('e',64),repeat('c',64),
  'AQIDBAUGBwgJCgsM',repeat('Z',40),now()-interval '1 hour'),
 ('supplier_2',repeat('b',64),repeat('f',64),repeat('d',64),
  'AQIDBAUGBwgJCgsM',repeat('Y',40),now()-interval '1 hour');
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

-- Synthetic privileged concurrent mutation only inside this ROLLBACK.
-- Verifies that authorization sees contact revocation after BEGIN.
CREATE FUNCTION public.ci_change_supplier_contact_p0(p_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $ci$
 UPDATE cotironda_piloto_privado.participant_channels_mvp109
 SET authenticated_message_hmac=p_hash WHERE participant_key='supplier_1';
$ci$;
REVOKE ALL ON FUNCTION public.ci_change_supplier_contact_p0(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ci_change_supplier_contact_p0(text)
 TO cotironda_pilot_terms_sender_p0;

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
 -- Only the verified exact leased supplier may read ciphertext.
 IF cotironda_piloto_privado.terms_recipient_packet_p0(job,
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') IS NOT NULL
 THEN RAISE EXCEPTION 'p0_wrong_lease_read_contact';END IF;
 got:=cotironda_piloto_privado.terms_recipient_packet_p0(job,lease);
 IF got IS NULL OR got->>'state'<>'ready'
  OR got->>'supplierKey'<>'supplier_1'
  OR got->>'contactSha256'<>repeat('c',64)
  OR got->>'nonceB64'<>'AQIDBAUGBwgJCgsM'
  OR got->>'chatHmac'<>repeat('a',64)
 THEN RAISE EXCEPTION 'p0_recipient_packet_cross_supplier';END IF;
 got:=cotironda_piloto_privado.terms_begin_p0(job,lease);
 IF got->>'state'<>'in_flight' THEN RAISE EXCEPTION 'p0_begin_failed';END IF;
 IF cotironda_piloto_privado.terms_recipient_packet_p0(job,lease) IS NOT NULL
 THEN RAISE EXCEPTION 'p0_contact_readable_after_begin';END IF;
 IF (cotironda_piloto_privado.terms_begin_p0(job,lease)->>'state')<>'cancelled'
 THEN RAISE EXCEPTION 'p0_duplicate_begin';END IF;
 IF cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('f',64))
 THEN RAISE EXCEPTION 'p0_changed_chat_authorized';END IF;
 IF NOT cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('a',64))
 THEN RAISE EXCEPTION 'p0_valid_authorize_denied';END IF;
 PERFORM public.ci_change_supplier_contact_p0(NULL);
 IF cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('a',64))
 THEN RAISE EXCEPTION 'p0_revoked_contact_allowed_before_http';END IF;
 PERFORM public.ci_change_supplier_contact_p0(repeat('e',64));
 IF NOT cotironda_piloto_privado.terms_authorize_p0(job,lease,repeat('a',64))
 THEN RAISE EXCEPTION 'p0_restored_contact_not_authorized';END IF;
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

-- P0 review tests: Whapi ciphertext is synthetic. In production this is AES,
-- and the separate Node tests verify the exact webhook AAD and plaintext SHA.
-- Data is ephemeral; all operations and even the mock operator are ROLLED BACK.
DO $review_acls$
BEGIN
 IF has_table_privilege('anon',
   'cotironda_piloto_privado.supplier_original_reviews_p0','SELECT')
 OR has_table_privilege('authenticated',
   'cotironda_piloto_privado.supplier_original_reviews_p0','INSERT')
 OR has_table_privilege('service_role',
   'cotironda_piloto_privado.supplier_original_reviews_p0','INSERT')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_terms_review_packet_auth_p0(text)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_terms_review_decide_auth_p0(text,text,text,text,boolean)',
   'EXECUTE')
 OR has_function_privilege('service_role',
   'public.cotironda_piloto_terms_review_decide_auth_p0(text,text,text,text,boolean)',
   'EXECUTE')
 OR NOT has_function_privilege('authenticated',
   'public.cotironda_piloto_terms_review_packet_auth_p0(text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
   'public.cotironda_piloto_terms_review_decide_auth_p0(text,text,text,text,boolean)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'p0_review_acl_exposes_consent';END IF;
END $review_acls$;

DO $review_fixture$
DECLARE
 now_ timestamptz:=clock_timestamp();
 plain_ text:='Confirmo que autorizo expresamente compartir originales de rondas futuras.';
 no_ text:='No, no autorizo compartir mis originales.';
 h text; result_ jsonb;
BEGIN
 -- The synthetic sender previously generated one valid API ACK for supplier1.
 -- Put notice before the inbound event; never assert delivery/read status.
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET sent_at=now_-interval '30 minutes',
     recorded_at=now_-interval '29 minutes'
 WHERE supplier_key='supplier_1' AND notice_message_hmac=repeat('d',64);
 h:=encode(extensions.digest(convert_to(plain_,'UTF8'),'sha256'),'hex');
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,kind,
  plaintext_sha256,nonce_b64,ciphertext_b64)
 VALUES
 (repeat('4',64),NULL,'supplier_1',repeat('a',64),
  now_-interval '10 minutes','text',h,'AQIDBAUGBwgJCgsM',repeat('A',80)),
 (repeat('5',64),NULL,'supplier_1',repeat('a',64),
  now_-interval '45 minutes','text',h,'AQIDBAUGBwgJCgsM',repeat('B',80)),
 (repeat('6',64),NULL,'supplier_1',repeat('b',64),
  now_-interval '9 minutes','text',h,'AQIDBAUGBwgJCgsM',repeat('C',80)),
 (repeat('7',64),NULL,'supplier_2',repeat('b',64),
  now_-interval '8 minutes','text',h,'AQIDBAUGBwgJCgsM',repeat('D',80)),
 (repeat('8',64),NULL,'supplier_1',repeat('a',64),
  now_-interval '7 minutes','document',h,'AQIDBAUGBwgJCgsM',repeat('E',80)),
 (repeat('9',64),NULL,'supplier_1',repeat('a',64),
  now_-interval '6 minutes','text',encode(extensions.digest(
     convert_to(no_,'UTF8'),'sha256'),'hex'),
  'AQIDBAUGBwgJCgsM',repeat('F',80));

 PERFORM set_config('cotironda.ci_operator','',true);
 result_:=public.cotironda_piloto_terms_review_packet_auth_p0(repeat('4',64));
 IF result_->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'p0_mfa_no_operator_packet_visible';END IF;
 result_:=public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),plain_,'explicit_accept',true);
 IF result_->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'p0_mfa_no_operator_accepts';END IF;
 PERFORM set_config('cotironda.ci_operator',
  '55555555-5555-4555-8555-555555555555',true);

 FOREACH h IN ARRAY ARRAY[repeat('5',64),repeat('6',64),
                         repeat('7',64),repeat('8',64)] LOOP
  result_:=public.cotironda_piloto_terms_review_packet_auth_p0(h);
  IF result_->>'state'<>'unavailable'
  THEN RAISE EXCEPTION 'p0_invalid_supplier_or_old_message_candidate %',h;END IF;
 END LOOP;

 result_:=public.cotironda_piloto_terms_review_packet_auth_p0(repeat('4',64));
 IF result_->>'state'<>'ready' OR result_->>'supplierKey'<>'supplier_1'
  OR result_->>'noticeMessageHmac'<>repeat('d',64)
  OR result_->>'chatHmac'<>repeat('a',64)
  OR result_->>'plaintextSha256'<>
    encode(extensions.digest(convert_to(plain_,'UTF8'),'sha256'),'hex')
  OR result_->>'nonceB64'<>'AQIDBAUGBwgJCgsM'
 THEN RAISE EXCEPTION 'p0_mfa_valid_review_packet_unavailable';END IF;

 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('e',64),plain_,'explicit_accept',true)->>'state')
  <>'unavailable'
 THEN RAISE EXCEPTION 'p0_wrong_notice_accepted';END IF;
 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),'invented text','explicit_accept',true)->>'state')
  <>'mismatch'
 THEN RAISE EXCEPTION 'p0_wrong_plaintext_accepted';END IF;
 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),plain_,'explicit_accept',false)->>'state')
  <>'invalid'
 THEN RAISE EXCEPTION 'p0_no_human_attestation_accepted';END IF;
 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),plain_,'automatic_accept',true)->>'state')
  <>'invalid'
 THEN RAISE EXCEPTION 'p0_automatic_decision_accepted';END IF;

 result_:=public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),plain_,'explicit_accept',true);
 IF result_->>'state'<>'recorded' OR result_->>'decision'<>'explicit_accept'
 THEN RAISE EXCEPTION 'p0_valid_explicit_review_denied';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supplier_original_optins_mvp362
    WHERE evidence_message_hmac=repeat('4',64))<>1
 THEN RAISE EXCEPTION 'p0_review_not_atomic_with_optin';END IF;
 IF NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.supplier_original_reviews_p0 r
  JOIN cotironda_piloto_privado.supplier_original_optins_mvp362 o
    ON o.evidence_message_hmac=r.evidence_message_hmac
  WHERE r.evidence_message_hmac=repeat('4',64)
    AND r.review_sha256=o.evidence_review_sha256
    AND r.reviewed_by_operator=o.reviewed_by_operator
    AND r.decision='explicit_accept'
 ) THEN RAISE EXCEPTION 'p0_review_actor_or_digest_unlinked';END IF;
 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('4',64),repeat('d',64),plain_,'explicit_accept',true)->>'state')
  <>'unavailable'
 THEN RAISE EXCEPTION 'p0_review_replayed';END IF;

 IF (public.cotironda_piloto_terms_review_decide_auth_p0(
  repeat('9',64),repeat('d',64),no_,'not_explicit',true)->>'state')
  <>'recorded'
 THEN RAISE EXCEPTION 'p0_explicit_rejection_not_recorded';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supplier_original_optins_mvp362
  WHERE evidence_message_hmac=repeat('9',64))
 THEN RAISE EXCEPTION 'p0_rejection_created_consent';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supplier_original_reviews_p0)<>2
 THEN RAISE EXCEPTION 'p0_decisions_wrong_count';END IF;

 -- Revocation after optin MUST prevent an old notice from legitimizing a
 -- later response. Reacceptance requires an independently sent new notice.
 INSERT INTO cotironda_piloto_privado.supplier_original_revocations_mvp362
 (supplier_key,terms_version,evidence_message_hmac,optin_message_hmac,
  revoked_at,recorded_at,reviewed_by_operator)
 VALUES('supplier_1','cotironda-originales-alta-v1',repeat('3',64),
  repeat('4',64),clock_timestamp(),clock_timestamp(),
  '55555555-5555-4555-8555-555555555555');
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,kind,
  plaintext_sha256,nonce_b64,ciphertext_b64)
 VALUES(repeat('2',64),NULL,'supplier_1',repeat('a',64),clock_timestamp(),
  'text',encode(extensions.digest(convert_to(plain_,'UTF8'),'sha256'),'hex'),
  'AQIDBAUGBwgJCgsM',repeat('G',80));
 IF (public.cotironda_piloto_terms_review_packet_auth_p0(repeat('2',64))
    ->>'state')<>'unavailable'
 THEN RAISE EXCEPTION 'p0_old_notice_reused_after_revocation';END IF;
 RAISE NOTICE 'P0 MFA REVIEW PASS: operator stub, plaintext SHA, notice, replay, refusal, cross-chat, revocation, ROLLBACK';
END $review_fixture$;

ROLLBACK;
