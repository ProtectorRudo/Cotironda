-- MVP200: REAL PostgreSQL17 executable smoke for the three ORIGINALS
-- migrations MVP178 -> MVP191 -> MVP192. Entirely synthetic + ROLLBACK.
-- Do NOT connect this file to cotironda-piloto or any actual users.
BEGIN;
DO $bootstrap$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END$bootstrap$;

CREATE SCHEMA IF NOT EXISTS cotironda_piloto_privado;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Supabase Auth stand-ins: ONLY in the disposable PG17 CI instance.
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $auth$
 SELECT COALESCE(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$auth$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$
 SELECT nullif(auth.jwt()->>'sub','')::uuid;
$auth$;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,phone text,phone_confirmed_at timestamptz,
 deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text NOT NULL,state text NOT NULL,
 created_at timestamptz NOT NULL,closes_at timestamptz NOT NULL,
 closed_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text NOT NULL,
 chat_hmac text NOT NULL,consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,participant_key text NOT NULL,
 chat_hmac text NOT NULL,request_id uuid,received_at timestamptz NOT NULL
);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text PRIMARY KEY,chat_hmac text NOT NULL,
 contact_sha256 text NOT NULL,authenticated_message_hmac text NOT NULL
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid NOT NULL,supplier_key text NOT NULL,
 state text NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text PRIMARY KEY,request_id uuid NOT NULL,
 supplier_key text NOT NULL,source_sha256 text NOT NULL,
 received_at timestamptz NOT NULL
);
CREATE TABLE cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac text NOT NULL,request_id uuid NOT NULL,
 supplier_key text NOT NULL,source_sha256 text NOT NULL,
 verifier_version integer NOT NULL,state text NOT NULL,reason text NOT NULL,
 ranking_allowed boolean NOT NULL
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,participant_key text NOT NULL,
 request_id uuid NOT NULL,state text NOT NULL,finished_at timestamptz,
 kind text NOT NULL,mime text NOT NULL,storage_path text NOT NULL,
 content_sha256 text NOT NULL,size_bytes integer NOT NULL
);
CREATE TABLE cotironda_piloto_privado.offer_versions(
 request_id uuid NOT NULL,supplier_key text NOT NULL,created_at timestamptz NOT NULL
);

-- Before installation: the SAME read-only preflight used against PILOTO
-- must report compatible dependencies and zero originals permissions.
\ir ../../piloto/mvp208_originals_preinstall_readonly.sql
\ir ../../piloto/mvp178_original_share_consent_private.sql
\ir ../../piloto/mvp191_buyer_verified_phone_identity_prospect_only.sql
\ir ../../piloto/mvp192_private_originals_catalog_and_context.sql
\ir ../../piloto/mvp201_original_download_audit_private.sql
-- After installation: policy remains OFF and no browser/anon/normal client
-- can read private tables. Results are explicitly checked below too.
\ir ../../piloto/mvp208_originals_preinstall_readonly.sql
\ir ../../piloto/mvp208_originals_postinstall_readonly.sql

DO $test$
DECLARE
 rid uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid;
 historical uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c901'::uuid;
 buyer uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c902'::uuid;
 sess uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c903'::uuid;
 ha text:=repeat('a',64); hb text:=repeat('b',64);
 bound text:=repeat('c',64); ca text:=repeat('1',64); cb text:=repeat('2',64);
 da text:=repeat('d',64); db text:=repeat('e',64);
 now_ timestamptz:=clock_timestamp();
 first_ jsonb; document_ text; second_ jsonb; result_ jsonb;
BEGIN
 IF EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.original_share_policy_mvp178
   WHERE singleton IS DISTINCT FROM true
    OR enabled IS DISTINCT FROM false
    OR activated_at IS NOT NULL
 ) OR (SELECT count(*) FROM cotironda_piloto_privado.original_share_policy_mvp178)<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.original_share_consents_mvp178)<>0
 OR (SELECT count(*) FROM cotironda_piloto_privado.original_download_audit_mvp201)<>0
 THEN RAISE EXCEPTION 'originals_new_install_not_off_or_not_empty';END IF;
 -- The postinstall inspection is a read-only report; CI also asserts its
 -- essential RLS/ACL conditions here, not merely that the SELECT compiles.
 IF has_table_privilege('anon',
      'cotironda_piloto_privado.original_share_consents_mvp178',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated',
      'cotironda_piloto_privado.original_share_policy_mvp178',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('service_role',
      'cotironda_piloto_privado.original_share_policy_mvp178',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('anon',
      'cotironda_piloto_privado.original_download_audit_mvp201',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated',
      'cotironda_piloto_privado.original_download_audit_mvp201',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('service_role',
      'cotironda_piloto_privado.original_share_consents_mvp178',
      'SELECT,INSERT,UPDATE,DELETE')
 OR has_function_privilege('anon',
      'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
      'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
      'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
 OR has_function_privilege('service_role',
      'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'originals_postinstall_unauthorized_access';END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n
     ON n.oid=c.relnamespace
     WHERE n.nspname='cotironda_piloto_privado'
       AND c.relname IN ('original_share_policy_mvp178',
         'original_share_consents_mvp178',
         'original_download_audit_mvp201')
       AND c.relrowsecurity)=3 IS NOT TRUE
 OR has_table_privilege('anon',
     'cotironda_piloto_privado.original_share_policy_mvp178',
     'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated',
     'cotironda_piloto_privado.original_share_consents_mvp178',
     'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('service_role',
     'cotironda_piloto_privado.original_download_audit_mvp201',
     'SELECT,INSERT,UPDATE,DELETE')
 OR NOT has_function_privilege('authenticated',
   'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'originals_acl_broken';END IF;

 INSERT INTO auth.users(id,phone,phone_confirmed_at)
 VALUES(buyer,'+5492215551234',now_-interval '1 day');
 INSERT INTO auth.sessions(id,user_id,not_after)
 VALUES(sess,buyer,now_+interval '2 days');
 PERFORM set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated',
  'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
  'sub',buyer::text,'session_id',sess::text,
  'exp',extract(epoch from now_+interval '2 days')::bigint::text
 )::text,true);
 INSERT INTO cotironda_piloto_privado.participants
 VALUES('buyer','buyer',repeat('9',64),now_-interval '1 day',null),
       ('seller_a','supplier',repeat('8',64),now_-interval '1 day',null),
       ('seller_b','supplier',repeat('7',64),now_-interval '1 day',null);
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES(bound,'buyer',repeat('9',64),null,now_-interval '1 day');
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
 VALUES('buyer',repeat('9',64),
  encode(extensions.digest('5492215551234@s.whatsapp.net','sha256'),'hex'),bound);

 INSERT INTO cotironda_piloto_privado.requests
 VALUES(rid,'buyer','closed',now_-interval '3 hours',
  now_-interval '1 hour',now_-interval '50 minutes'),
 (historical,'buyer','closed',now_-interval '6 hours',
  now_-interval '5 hours',now_-interval '4 hours');
 -- All originals must remain prospectively OFF by default.
 IF public.cotironda_piloto_buyer_identity_mvp191(rid)<>false OR
  public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null) IS NOT NULL
 THEN RAISE EXCEPTION 'originals_policy_enabled_by_default';END IF;
 UPDATE cotironda_piloto_privado.original_share_policy_mvp178
 SET enabled=true,activated_at=now_-interval '4 hours' WHERE singleton;
 IF public.cotironda_piloto_buyer_identity_mvp191(rid)<>true OR
  public.cotironda_piloto_buyer_identity_mvp191(historical)<>false
 THEN RAISE EXCEPTION 'prospective_verified_phone_auth_failed';END IF;

 INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES
 (ca,'seller_a',repeat('8',64),rid,now_-interval '2 hours 50 minutes'),
 (cb,'seller_b',repeat('7',64),rid,now_-interval '2 hours 50 minutes'),
 (ha,'seller_a',repeat('8',64),rid,now_-interval '1 hour 30 minutes'),
 (hb,'seller_b',repeat('7',64),rid,now_-interval '1 hour 30 minutes');
 INSERT INTO cotironda_piloto_privado.invitations
 VALUES
 (rid,'seller_a','prepared',now_-interval '2 hours 30 minutes'),
 (rid,'seller_b','prepared',now_-interval '2 hours 30 minutes');
 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES
 (ha,rid,'seller_a',da,now_-interval '1 hour 30 minutes'),
 (hb,rid,'seller_b',db,now_-interval '1 hour 30 minutes');
 INSERT INTO cotironda_piloto_privado.supplier_evidence_mvp138
 VALUES
 (ha,rid,'seller_a',da,9,'verified','covered',false),
 (hb,rid,'seller_b',db,8,'verified','covered',false);
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 VALUES
 (ha,'seller_a',rid,'stored',now_-interval '1 hour 30 minutes',
  'document','application/pdf','media/'||ha,da,1000),
 (hb,'seller_b',rid,'stored',now_-interval '1 hour 30 minutes',
  'document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'media/'||hb,db,2000);
 INSERT INTO cotironda_piloto_privado.original_share_consents_mvp178
 VALUES(rid,'seller_a',ca,'original_identificable_tras_cierre',
 'cotironda-originales-v1',now_-interval '2 hours 50 minutes',null,now_);
 -- Unverified original B must NOT sneak in via a perfectly matching SHA.
 first_:=public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null);
 IF first_->>'state'<>'authorized_catalog' OR
    (first_->>'total')::int<>1 OR
    jsonb_array_length(first_->'originals')<>1
 THEN RAISE EXCEPTION 'v8_source_or_unconsented_original_leaked';END IF;
 document_:=first_->'originals'->0->>'documentId';
 result_:=public.cotironda_piloto_originals_private_mvp192(
  rid,buyer,sess,document_::uuid);
 IF result_->>'state'<>'authorized_original' OR
  result_->'autorizacion'->'archivo'->>'sha256'<>da OR
  result_->'autorizacion'->'prueba'->>'verificada'<>'true'
 THEN RAISE EXCEPTION 'valid_original_not_authorized';END IF;

 -- Download audit is a mandatory, privately persisted permission gate.
 -- A valid verified PDF may be released; its bytes and source SHA must agree.
 IF public.cotironda_piloto_record_original_download_mvp201(
  rid,buyer,sess,document_::uuid,da,1000)<>true
 THEN RAISE EXCEPTION 'valid_audit_not_persisted';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.original_download_audit_mvp201)<>1
 THEN RAISE EXCEPTION 'audit_missing_or_duplicated';END IF;
 IF public.cotironda_piloto_record_original_download_mvp201(
  rid,buyer,sess,document_::uuid,repeat('0',64),1000)<>false
 OR public.cotironda_piloto_record_original_download_mvp201(
  rid,buyer,sess,document_::uuid,da,999)<>false
 OR public.cotironda_piloto_record_original_download_mvp201(
  rid,buyer,sess,'b9000000-1111-4111-a111-111111111111'::uuid,da,1000)<>false
 THEN RAISE EXCEPTION 'mismatched_file_was_audited';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.original_download_audit_mvp201)<>1
 THEN RAISE EXCEPTION 'audit_for_invalid_request';END IF;

 -- Supplier B: same round, genuine explicit consent and latest V9 proof.
 UPDATE cotironda_piloto_privado.supplier_evidence_mvp138
 SET verifier_version=9 WHERE message_hmac=hb;
 INSERT INTO cotironda_piloto_privado.original_share_consents_mvp178
 VALUES(rid,'seller_b',cb,'original_identificable_tras_cierre',
 'cotironda-originales-v1',now_-interval '2 hours 50 minutes',null,now_);
 second_:=public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null);
 IF (second_->>'total')::int<>2 OR
    jsonb_array_length(second_->'originals')<>2 OR
    (second_->'originals'->0->>'documentId')=
      (second_->'originals'->1->>'documentId')
 THEN RAISE EXCEPTION 'all_consenting_suppliers_not_accessible';END IF;

 -- Revoking invitation must IMMEDIATELY remove that original.
 UPDATE cotironda_piloto_privado.invitations
 SET state='cancelled' WHERE request_id=rid AND supplier_key='seller_b';
 result_:=public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null);
 IF (result_->>'total')::int<>1
 THEN RAISE EXCEPTION 'cancelled_supplier_original_still_visible';END IF;
 UPDATE cotironda_piloto_privado.invitations
 SET state='prepared' WHERE request_id=rid AND supplier_key='seller_b';

 -- Later correction invalidates prior source authorization.
 INSERT INTO cotironda_piloto_privado.offer_versions
 VALUES(rid,'seller_b',now_-interval '1 hour 20 minutes');
 result_:=public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null);
 IF (result_->>'total')::int<>1
 THEN RAISE EXCEPTION 'modified_original_still_visible';END IF;
 DELETE FROM cotironda_piloto_privado.offer_versions;
 UPDATE cotironda_piloto_privado.original_share_consents_mvp178
 SET revoked_at=now_ WHERE request_id=rid AND supplier_key='seller_b';
 result_:=public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null);
 IF (result_->>'total')::int<>1
 THEN RAISE EXCEPTION 'revoked_original_still_visible';END IF;

 UPDATE auth.users SET phone='+5492215550000' WHERE id=buyer;
 IF public.cotironda_piloto_buyer_identity_mvp191(rid)<>false OR
  public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null) IS NOT NULL
 THEN RAISE EXCEPTION 'wrong_phone_reveals_originals';END IF;
 UPDATE auth.users SET phone='+5492215551234' WHERE id=buyer;
 UPDATE auth.sessions SET not_after=now_-interval '5 minutes' WHERE id=sess;
 IF public.cotironda_piloto_buyer_identity_mvp191(rid)<>false OR
  public.cotironda_piloto_originals_private_mvp192(rid,buyer,sess,null) IS NOT NULL
 THEN RAISE EXCEPTION 'expired_session_reveals_originals';END IF;
 IF public.cotironda_piloto_record_original_download_mvp201(
  rid,buyer,sess,document_::uuid,da,1000)<>false
 THEN RAISE EXCEPTION 'revoked_session_audit_allowed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.original_download_audit_mvp201)<>1
 THEN RAISE EXCEPTION 'audit_written_after_revocation';END IF;
END$test$;
ROLLBACK;
