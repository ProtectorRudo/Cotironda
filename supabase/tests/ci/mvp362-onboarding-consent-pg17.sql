-- MVP362 extends EXACT M360 synthetic fixture, plus one-time onboarding.
-- Original M360 acceptance cases execute first; no Whapi, SQL pilot or SMS.
-- MVP360: PostgreSQL17 completely disposable, no network, Auth or SMS.
-- This reproduces ORIGINAL catalog contract using sources without any AI V9.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id uuid primary key,phone text,deleted_at timestamptz,banned_until timestamptz,
 is_anonymous boolean,phone_confirmed_at timestamptz);
CREATE TABLE auth.sessions(
 id uuid primary key,user_id uuid,not_after timestamptz);
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid primary key,buyer_key text,state text,created_at timestamptz,
 closes_at timestamptz,closed_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_policy_mvp178(
 singleton boolean,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participants(
 key text primary key,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text,chat_hmac text,authenticated_message_hmac text,
 contact_sha256 text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text,
 chat_hmac text,received_at timestamptz,kind text);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 kind text,mime text,state text,reserved_at timestamptz,
 finished_at timestamptz,size_bytes integer,content_sha256 text,
 storage_path text);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text,request_id uuid,supplier_key text,kind text,
 source_sha256 text,association text);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac text,supplier_key text,state text);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,created_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,whapi_message_id text,
 finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,sent_at timestamptz);
CREATE TABLE cotironda_piloto_privado.original_share_consents_mvp178(
 request_id uuid,supplier_key text,alcance text,version text,
 accepted_at timestamptz,revoked_at timestamptz,consent_message_hmac text);
CREATE TABLE cotironda_piloto_privado.offer_versions(
 request_id uuid,supplier_key text,created_at timestamptz);
-- NOTE: No supplier_evidence_mvp138 or supplier_media_quotes_mvp098
-- tables exist. The function must not touch them to pass.
ALTER TABLE cotironda_piloto_privado.whapi_inbox
 ADD COLUMN plaintext_sha256 text;
\ir ../../piloto/mvp362_originales_alta_consentimiento_off.sql
\ir ../../piloto/mvp360_originals_from_verified_source_not_parser.sql
REVOKE ALL ON FUNCTION public.cotironda_piloto_originals_private_mvp192(
 uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_originals_private_mvp192(
 uuid,uuid,uuid,uuid) TO service_role;

DO $test$
DECLARE
 now_ timestamptz:=clock_timestamp();
 rid uuid:='11111111-1111-4111-8111-111111111111';
 otherid uuid:='22222222-2222-4222-8222-222222222222';
 userid uuid:='33333333-3333-4333-8333-333333333333';
 sessid uuid:='44444444-4444-4444-8444-444444444444';
 msg text:=repeat('a',64);
 consentmsg text:=repeat('b',64);
 authmsg text:=repeat('c',64);
 sha text:=repeat('d',64);
 chatbuyer text:=repeat('e',64);
 chatsupplier text:=repeat('f',64);
 doc text;
 catalog jsonb;
 count_ integer;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)',
  'EXECUTE') OR has_function_privilege('authenticated',
  'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)',
  'EXECUTE') THEN
  RAISE EXCEPTION 'mvp360_anon_or_authenticated_can_execute_private';
 END IF;
 INSERT INTO auth.users VALUES
 (userid,'+5492211234567',null,null,false,now_-interval '2 days');
 INSERT INTO auth.sessions VALUES(sessid,userid,now_+interval '1 day');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (rid,'buyer_1','closed',now_-interval '3 days',
  now_-interval '2 hours',now_-interval '1 hour');
 INSERT INTO cotironda_piloto_privado.original_share_policy_mvp178
 VALUES(true,true,now_-interval '4 days');
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_1','buyer',chatbuyer,now_-interval '5 days',null),
 ('supplier_1','supplier',chatsupplier,now_-interval '5 days',null);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109 VALUES
 ('buyer_1',chatbuyer,authmsg,
 encode(extensions.digest('5492211234567@s.whatsapp.net','sha256'),'hex'));
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (authmsg,null,'buyer_1',chatbuyer,now_-interval '4 days','text'),
 (consentmsg,rid,'supplier_1',chatsupplier,now_-interval '2 days 22 hours','text'),
 (msg,rid,'supplier_1',chatsupplier,now_-interval '1 day','document');
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 (rid,'supplier_1','prepared',now_-interval '2 days 20 hours');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 (rid,'supplier_1','api_accepted','sent-whapi-id-001',now_-interval '2 days 18 hours');
 INSERT INTO cotironda_piloto_privado.original_share_consents_mvp178 VALUES
 (rid,'supplier_1','original_identificable_tras_cierre',
  'cotironda-originales-v1',now_-interval '2 days 22 hours',null,consentmsg);
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (msg,rid,'supplier_1',chatsupplier,'document','application/pdf','stored',
  now_-interval '1 day'+interval '1 minute',now_-interval '23 hours',
  1024,sha,'media/'||msg);
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (msg,rid,'supplier_1','document',sha,'quoted_whapi_id');

 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF catalog->>'state'<>'authorized_catalog'
 OR (catalog->>'total')::int<>1 THEN
  RAISE EXCEPTION 'mvp360_parser_free_catalog_missing %',catalog;
 END IF;
 SELECT catalog->'originals'->0->>'documentId' INTO doc;
 IF doc IS NULL THEN RAISE EXCEPTION 'mvp360_missing_opaque_id'; END IF;
 catalog:=public.cotironda_piloto_originals_private_mvp192(
  rid,userid,sessid,doc::uuid);
 IF catalog->>'state'<>'authorized_original' THEN
  RAISE EXCEPTION 'mvp360_valid_doc_not_authorized';
 END IF;
 -- Function JSON is server-only. The HTTP adapter MUST project fields
 -- to the buyer without leaking supplier keys or source metadata.

 -- Excel original is also deliverable even without an economic parser.
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 WHERE message_hmac=msg;
 catalog:=public.cotironda_piloto_originals_private_mvp192(
  rid,userid,sessid,null);
 IF catalog->>'state'<>'authorized_catalog' OR
    (catalog->>'total')::int<>1 OR
    catalog->'originals'->0->>'mime'<>
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 THEN RAISE EXCEPTION 'mvp360_excel_original_not_listed';END IF;

 -- Executables and forged storage paths never appear in a buyer catalog.
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET mime='application/x-msdownload' WHERE message_hmac=msg;
 catalog:=public.cotironda_piloto_originals_private_mvp192(
  rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0
 THEN RAISE EXCEPTION 'mvp360_dangerous_mime_opened';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET mime='application/pdf',storage_path='other/'||msg WHERE message_hmac=msg;
 catalog:=public.cotironda_piloto_originals_private_mvp192(
  rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0
 THEN RAISE EXCEPTION 'mvp360_forged_storage_path_opened';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET storage_path='media/'||msg WHERE message_hmac=msg;

 -- Wrong buyer/session never reads any originals.
 IF public.cotironda_piloto_originals_private_mvp192(
  rid,otherid,sessid,null) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp360_other_user_authorized'; END IF;
 IF public.cotironda_piloto_originals_private_mvp192(
  rid,userid,otherid,null) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp360_other_session_authorized'; END IF;

 UPDATE cotironda_piloto_privado.ai_supplier_links_mvp225
 SET association='semantic_unique_mvp291';
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_semantic_weak_link_opened';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_links_mvp225
 SET association='quoted_whapi_id';

 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 VALUES(msg,'supplier_1','ambiguous_round');
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_ambiguous_source_opened';END IF;
 DELETE FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237;

 UPDATE cotironda_piloto_privado.original_share_consents_mvp178
 SET revoked_at=now_;
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_revoked_supplier_consent_opened';END IF;
 UPDATE cotironda_piloto_privado.original_share_consents_mvp178
 SET revoked_at=null;

 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET content_sha256=repeat('0',64);
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_sha_mismatch_opened';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET content_sha256=sha;

 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=rid;
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF catalog IS NOT NULL THEN
  RAISE EXCEPTION 'mvp360_open_round_original_revealed';END IF;
 UPDATE cotironda_piloto_privado.requests SET state='closed' WHERE id=rid;

 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 (otherid,'supplier_1','api_accepted','other-sent',now_-interval '2 days');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (otherid,'buyer_1','closed',now_-interval '2 days 1 hour',
  now_-interval '2 hours',now_-interval '1 hour');
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_cross_round_overlap_opened';END IF;
 DELETE FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE request_id=otherid;
 DELETE FROM cotironda_piloto_privado.requests WHERE id=otherid;

 -- A replacement original under review invalidates the previous original.
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('9',64),rid,'supplier_1',chatsupplier,'document','application/pdf','stored',
  now_-interval '20 hours',now_-interval '19 hours',512,repeat('1',64),
  'media/'||repeat('9',64));
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('9',64),rid,'supplier_1',chatsupplier,now_-interval '19 hours','document');
 catalog:=public.cotironda_piloto_originals_private_mvp192(rid,userid,sessid,null);
 IF (catalog->>'total')::int<>0 THEN
  RAISE EXCEPTION 'mvp360_superseded_original_not_blocked';END IF;

 RAISE NOTICE 'MVP360 PASS: original without V9, identity, consent, SHA, ambiguity, overlap, supersession';
END $test$;

-- MVP362 additional cases: legacy PASS above; now one-time opt-in ALONE.
DO $test362$
DECLARE
 now_ timestamptz:=clock_timestamp();
 rid uuid:='11111111-1111-4111-8111-111111111111';
 uid uuid:='33333333-3333-4333-8333-333333333333';
 sess uuid:='44444444-4444-4444-8444-444444444444';
 consent_event text:=repeat('4',64);
 exact_sha text;
 archived jsonb;
BEGIN
 -- The earlier M360 test left a newer archival document to test replacement.
 -- Remove it to isolate consent gating.
 DELETE FROM cotironda_piloto_privado.media_archive_mvp095
 WHERE message_hmac=repeat('9',64);
 DELETE FROM cotironda_piloto_privado.whapi_inbox
 WHERE message_hmac=repeat('9',64);
 DELETE FROM cotironda_piloto_privado.original_share_consents_mvp178
 WHERE request_id=rid;

 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_absent_acceptance_opened'; END IF;
 IF has_function_privilege('anon',
  'cotironda_piloto_privado.original_effective_consent_mvp362(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'cotironda_piloto_privado.original_effective_consent_mvp362(uuid,text)','EXECUTE')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.supplier_original_optins_mvp362','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.supplier_original_revocations_mvp362','INSERT')
 THEN RAISE EXCEPTION 'mvp362_acl_exposed'; END IF;

 -- A policy with real text exists but is OFF by default, even with a
 -- genuine supplier message and audited operator attestation.
 INSERT INTO cotironda_piloto_privado.original_terms_policy_mvp362
 (terms_version,terms_body,terms_sha256,approved_at,activated_at)
 VALUES('cotironda-originales-alta-v1',repeat('BORRADOR LEGAL ',20),
 encode(extensions.digest(convert_to(repeat('BORRADOR LEGAL ',20),'UTF8'),'sha256'),'hex'),
   now_-interval '5 days',now_-interval '4 days 12 hours');
 SELECT terms_sha256 INTO exact_sha
 FROM cotironda_piloto_privado.original_terms_policy_mvp362;
 -- Provider-returned outgoing notice, separate from inbound acknowledgement.
 INSERT INTO cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 (notice_message_hmac,supplier_key,terms_version,terms_sha256,
  supplier_chat_hmac,outbound_body_sha256,delivery_state,sent_at,recorded_at)
 VALUES(repeat('6',64),'supplier_1','cotironda-originales-alta-v1',
 exact_sha,repeat('f',64),repeat('3',64),'api_accepted',
 now_-interval '4 days 6 hours',now_-interval '4 days 5 hours');
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,kind,
  plaintext_sha256)
 VALUES(consent_event,null,'supplier_1',repeat('f',64),
        now_-interval '3 days 18 hours','text',repeat('8',64));
 INSERT INTO cotironda_piloto_privado.supplier_original_optins_mvp362
 (supplier_key,terms_version,terms_sha256,notice_message_hmac,
  evidence_message_hmac,ack_plaintext_sha256,accepted_at,recorded_at,
  reviewed_by_operator,evidence_review_sha256)
 VALUES('supplier_1','cotironda-originales-alta-v1',exact_sha,
 repeat('6',64),consent_event,repeat('8',64),now_-interval '3 days 18 hours',
 now_-interval '3 days 12 hours',
 '55555555-5555-4555-8555-555555555555',repeat('7',64));
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_off_terms_policy_opened'; END IF;
 archived:=public.cotironda_piloto_originals_private_mvp192(rid,uid,sess,null);
 IF (archived->>'total')::int<>0 THEN
 RAISE EXCEPTION 'mvp362_off_terms_catalog_opened'; END IF;

 UPDATE cotironda_piloto_privado.original_terms_policy_mvp362
 SET enabled=true WHERE terms_version='cotironda-originales-alta-v1';
 IF NOT public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_valid_onboarding_not_accepted'; END IF;
 archived:=public.cotironda_piloto_originals_private_mvp192(rid,uid,sess,null);
 IF archived->>'state'<>'authorized_catalog'
 OR (archived->>'total')::int<>1 THEN
 RAISE EXCEPTION 'mvp362_onboarding_catalog_missing'; END IF;

 -- Version/accepted timestamp reaches the deterministic TypeScript gate.
 archived:=public.cotironda_piloto_originals_private_mvp192(
 rid,uid,sess,(archived->'originals'->0->>'documentId')::uuid);
 IF archived->>'state'<>'authorized_original' OR
 archived->'autorizacion'->'consentimiento'->>'version'
 <> 'cotironda-originales-alta-v1' THEN
 RAISE EXCEPTION 'mvp362_onboarding_auth_contract_wrong'; END IF;

 -- Wrong outbound evidence must NOT be enough to open originals.
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET terms_sha256=repeat('1',64);
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp364_wrong_notice_terms_sha_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET terms_sha256=exact_sha,supplier_chat_hmac=repeat('2',64);
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp364_wrong_notice_chat_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET supplier_chat_hmac=repeat('f',64),
 sent_at=now_-interval '3 days 17 hours',
 recorded_at=now_-interval '3 days 16 hours';
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp364_notice_after_ack_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET sent_at=now_-interval '5 days',recorded_at=now_-interval '4 days 23 hours';
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp364_notice_before_policy_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 SET sent_at=now_-interval '4 days 6 hours',
 recorded_at=now_-interval '4 days 5 hours';

 -- A different SHA of the terms or of the explicit affirmative message
 -- INVALIDATES enrollment; no fallback to participation.
 UPDATE cotironda_piloto_privado.supplier_original_optins_mvp362
 SET terms_sha256=repeat('1',64);
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_wrong_terms_sha_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_optins_mvp362
 SET terms_sha256=exact_sha,ack_plaintext_sha256=repeat('2',64);
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_wrong_affirmative_sha_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_optins_mvp362
 SET ack_plaintext_sha256=repeat('8',64);

 -- Audit cannot be inserted after round start to retro-authorize it.
 UPDATE cotironda_piloto_privado.supplier_original_optins_mvp362
 SET recorded_at=now_-interval '2 days 21 hours';
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_retrospective_recording_opened'; END IF;
 UPDATE cotironda_piloto_privado.supplier_original_optins_mvp362
 SET recorded_at=now_-interval '3 days 12 hours';

 -- Explicit opt-out/revocation works even after round closure:
 -- the same buyer cannot fetch the original a second time.
 INSERT INTO cotironda_piloto_privado.supplier_original_revocations_mvp362
 (supplier_key,terms_version,evidence_message_hmac,revoked_at,recorded_at,
  reviewed_by_operator)
 VALUES('supplier_1','cotironda-originales-alta-v1',repeat('5',64),
 now_-interval '1 day',now_-interval '12 hours',
 '55555555-5555-4555-8555-555555555555');
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_revoked_onboarding_opened'; END IF;
 archived:=public.cotironda_piloto_originals_private_mvp192(rid,uid,sess,null);
 IF (archived->>'total')::int<>0 THEN
 RAISE EXCEPTION 'mvp362_revoked_catalog_opened'; END IF;
 DELETE FROM cotironda_piloto_privado.supplier_original_revocations_mvp362;

 -- Legacy cancellation of THIS round cannot be circumvented by a global
 -- onboarding acceptance (supplier may withdraw permission just for it).
 INSERT INTO cotironda_piloto_privado.original_share_consents_mvp178
 VALUES(rid,'supplier_1','original_identificable_tras_cierre',
 'cotironda-originales-v1',now_-interval '2 days 22 hours',
 now_-interval '1 hour',repeat('b',64));
 IF public.cotironda_piloto_original_consent_preflight_mvp178(rid,'supplier_1')
 THEN RAISE EXCEPTION 'mvp362_specific_withdrawal_ignored'; END IF;

 RAISE NOTICE 'MVP362+364 PASS: onboarding, outbound notice linkage, version/SHA, revocation, legacy, Auth, ROLLBACK';
END $test362$;
ROLLBACK;
