-- D016 P0 lease-binding PostgreSQL 17; fixture SIN datos reales.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,
 created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.v2_original_share_policy(
 singleton boolean PRIMARY KEY,enabled boolean,activated_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,created_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,lease_token uuid,
 leased_at timestamptz,whapi_message_id text,finished_at timestamptz
);
\ir ../../piloto/v2_d016_original_reply_proof_CANDIDATE.sql
\ir ../../piloto/v2_d016_original_notice_lease_guard_CANDIDATE.sql

DO $test$
DECLARE v uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 lease uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 badlease uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 ok boolean;
BEGIN
 INSERT INTO cotironda_piloto_privado.v2_original_share_policy
 VALUES (true,true,clock_timestamp()-interval '3 hours');
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (v,'buyer_a','prepared',clock_timestamp()-interval '2 hours',
 clock_timestamp()+interval '2 hours');
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_a','supplier',repeat('1',64),clock_timestamp()-interval '7 days',NULL);
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 (v,'supplier_a','prepared',clock_timestamp()-interval '1 hour');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 (v,'supplier_a','pending',lease,clock_timestamp()-interval '1 minute',NULL,NULL);

 IF has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_reserve_original_notice_private(uuid,text,text,text,text)',
 'EXECUTE')
 THEN RAISE EXCEPTION 'old_reserve_rpc_still_authorized';END IF;
 IF NOT has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)',
 'EXECUTE')
 THEN RAISE EXCEPTION 'new_reserve_rpc_not_authorized';END IF;
 IF has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)',
 'EXECUTE') OR has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)',
 'EXECUTE') THEN RAISE EXCEPTION 'rpc_public_exposure';END IF;

 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('1',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',lease);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'pending_without_lease_granted';END IF;

 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 SET state='leased'
 WHERE request_id=v AND supplier_key='supplier_a';
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('1',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',badlease);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_lease_granted';END IF;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('2',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',lease);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_chat_granted';END IF;
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=false;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('1',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',lease);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'policy_off_granted';END IF;
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=true;

 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('1',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',lease);
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'valid_lease_denied';END IF;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 v,'supplier_a',repeat('1',64),repeat('d',64),
 'cotironda-originales-v2-respuesta-20261113',lease);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate_granted';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_notice_ledger)<>1
 THEN RAISE EXCEPTION 'multiple_notices';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class
 WHERE oid='cotironda_piloto_privado.v2_d016_original_notice_ledger'::regclass)
 THEN RAISE EXCEPTION 'rls_missing';END IF;
 RAISE NOTICE 'D016_P0_LEASE_GUARD_PG17_PASS';
END $test$;
ROLLBACK;
