-- MVP361 CI PostgreSQL17, fictional identities only, BEGIN/ROLLBACK.
-- Never runs Auth Admin, sends SMS, reads real phone numbers or calls Whapi.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE auth.users (
 id uuid primary key,
 phone text
);
CREATE TABLE cotironda_piloto_privado.participants (
 key text primary key,
 participant_role text,
 chat_hmac text,
 consent_at timestamptz,
 opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109 (
 participant_key text,
 chat_hmac text,
 contact_sha256 text,
 bound_at timestamptz,
 authenticated_message_hmac text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text,
 participant_key text,
 chat_hmac text,
 received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid primary key,
 buyer_key text,
 state text
);
\ir ../../piloto/mvp361_buyer_auth_bootstrap_check_only.sql

DO $mvp361_test$
DECLARE
 h text:=encode(extensions.digest(
 convert_to('15550123456@s.whatsapp.net','UTF8'),'sha256'),'hex');
 chat text:=repeat('c',64);
 msg text:=repeat('m',64);
 round_id uuid:='11111111-1111-4111-8111-111111111111';
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp361_auth_preflight_acl_exposure'; END IF;

 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_no_buyer_was_authorized'; END IF;
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(
   'nota-que-no-es-sha')
 THEN RAISE EXCEPTION 'mvp361_invalid_hash_accepted'; END IF;

 INSERT INTO cotironda_piloto_privado.participants
 VALUES ('buyer_1','buyer',chat,clock_timestamp()-interval '2 days',null);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
 VALUES ('buyer_1',chat,h,clock_timestamp()-interval '1 day',msg);
 INSERT INTO cotironda_piloto_privado.requests
 VALUES (round_id,'buyer_1','prepared');
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_no_verified_inbox_authorized'; END IF;
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES (msg,'buyer_1',chat,clock_timestamp()-interval '2 hours');
 IF NOT public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_verified_buyer_not_eligible'; END IF;

 -- Wrong WhatsApp proof does not count.
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET chat_hmac=repeat('x',64);
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_wrong_whapi_chat_authorized'; END IF;
 UPDATE cotironda_piloto_privado.whapi_inbox SET chat_hmac=chat;

 -- Supplier cannot claim same phone / chat as buyer.
 INSERT INTO cotironda_piloto_privado.participants
 VALUES ('supplier_2','supplier',repeat('s',64),
   clock_timestamp()-interval '2 days',null);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
 VALUES ('supplier_2',repeat('s',64),h,clock_timestamp()-interval '1 day',repeat('z',64));
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_duplicate_active_identity_allowed'; END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='supplier_2';
 IF NOT public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_revoked_duplicate_still_blocked'; END IF;

 -- Operator must not create the same Supabase Auth phone twice.
 INSERT INTO auth.users VALUES (
 '33333333-3333-4333-8333-333333333333','+15550123456');
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_existing_auth_phone_allowed'; END IF;
 DELETE FROM auth.users;

 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer_1';
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_opted_out_buyer_allowed'; END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=null,consent_at=null WHERE key='buyer_1';
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_buyer_without_participation_consent_allowed'; END IF;
 UPDATE cotironda_piloto_privado.participants
 SET consent_at=clock_timestamp()-interval '2 days' WHERE key='buyer_1';

 DELETE FROM cotironda_piloto_privado.requests;
 IF public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(h)
 THEN RAISE EXCEPTION 'mvp361_orphan_buyer_allowed'; END IF;

 RAISE NOTICE 'MVP361 PASS: verified buyer, unique phone, no Auth duplicate, no SMS, no SQL writes outside fixture';
END $mvp361_test$;
ROLLBACK;
