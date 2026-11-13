-- D016 P0 #838: fixture 100% SINTETICO / ROLLBACK, PG17.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
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
 request_id uuid,supplier_key text,state text,whapi_message_id text,
 finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,kind text,plaintext_sha256 text,
 received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text,request_id uuid,supplier_key text,
 kind text,source_sha256 text,status text,association text
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 kind text,content_sha256 text,state text,finished_at timestamptz,
 storage_path text,size_bytes integer
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac text,state text
);
INSERT INTO cotironda_piloto_privado.v2_original_share_policy
 VALUES(true,true,clock_timestamp()-interval '3 hours');
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','buyer_a','prepared',
 clock_timestamp()-interval '2 hours',clock_timestamp()+interval '2 hours'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','buyer_b','prepared',
 clock_timestamp()-interval '5 hours',clock_timestamp()+interval '2 hours');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','prepared',
 clock_timestamp()-interval '1 hours');
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_a','supplier',repeat('1',64),clock_timestamp()-interval '2 days',NULL),
 ('supplier_b','supplier',repeat('2',64),clock_timestamp()-interval '2 days',NULL);
\ir ../../piloto/v2_d016_original_reply_proof_CANDIDATE.sql

DO $test$
DECLARE ok boolean;status text;
BEGIN
 -- Sin reglas V2 ni aviso previo NO se reserva nada.
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=false;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
  repeat('c',64),'cotironda-originales-v2-respuesta-20261113');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'policy_off_reserve';END IF;
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=true;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','supplier_a',repeat('1',64),
  repeat('c',64),'cotironda-originales-v2-respuesta-20261113');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'old_request_reserve';END IF;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('2',64),
  repeat('c',64),'cotironda-originales-v2-respuesta-20261113');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'other_chat_reserve';END IF;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
  repeat('c',64),'cotironda-originales-v2');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'old_version_reserve';END IF;

 -- Registro previo al envio, exactamente una vez por ronda/proveedor.
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
  repeat('c',64),'cotironda-originales-v2-respuesta-20261113');
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'reserve_failed';END IF;
 ok:=public.cotironda_piloto_v2_d016_reserve_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
  repeat('c',64),'cotironda-originales-v2-respuesta-20261113');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate_reserve';END IF;

 -- API incierta no equivale a POST Whapi aceptado.
 ok:=public.cotironda_piloto_v2_d016_finish_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','wamid.DISPATCH001');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'finish_without_dispatch';END IF;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','api_accepted',
 'wamid.DISPATCH001',clock_timestamp());
 ok:=public.cotironda_piloto_v2_d016_finish_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','wamid.WRONG0001');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_dispatch_id';END IF;
 ok:=public.cotironda_piloto_v2_d016_finish_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','wamid.DISPATCH001');
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'finish_failed';END IF;
 ok:=public.cotironda_piloto_v2_d016_finish_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','wamid.DISPATCH001');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'double_finish';END IF;

 -- PDF / cualquier adjunto: se coteja SHA almacenado con el mismo proveedor.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('d',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a',repeat('1',64),'document',repeat('9',64),clock_timestamp());
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('d',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a',repeat('1',64),'document',repeat('e',64),
 'stored',clock_timestamp(),'media/'||repeat('d',64),2048);
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('d',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a','document',repeat('e',64),
 'awaiting_semantic_review','quoted_whapi_id');
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64),
  'wamid.NOT_THIS',false,true);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_quoted_message';END IF;
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64),
  'wamid.DISPATCH001',true,true);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'forwarded';END IF;
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_b',repeat('d',64),
  'wamid.DISPATCH001',false,true);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'other_supplier';END IF;
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','supplier_a',repeat('d',64),
  'wamid.DISPATCH001',false,true);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'old_request';END IF;
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64),
  'wamid.DISPATCH001',false,true);
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'verified_reply_not_recorded';END IF;
 status:=public.cotironda_piloto_v2_d016_original_evidence_status_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64));
 IF status <> 'verified_reply_not_authorization'
 THEN RAISE EXCEPTION 'source_proof_invalid:%',status;END IF;
 ok:=public.cotironda_piloto_v2_d016_observe_original_reply_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64),
  'wamid.DISPATCH001',false,true);
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate_reply';END IF;
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=clock_timestamp()
 WHERE key='supplier_a';
 IF public.cotironda_piloto_v2_d016_original_evidence_status_private(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64))
 <> 'denied' THEN RAISE EXCEPTION 'opt_out_not_enforced';END IF;
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=NULL
 WHERE key='supplier_a';

 -- Baja recibida por mismo chat (text). Prohibir lectura hasta nuevo pedido.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('f',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a',repeat('1',64),'text',repeat('f',64),clock_timestamp());
 ok:=public.cotironda_piloto_v2_d016_revoke_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('f',64));
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'revocation_failed';END IF;
 IF public.cotironda_piloto_v2_d016_original_evidence_status_private(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('d',64))
 <> 'denied' THEN RAISE EXCEPTION 'revocation_not_enforced';END IF;
 ok:=public.cotironda_piloto_v2_d016_revoke_original_notice_private(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('f',64));
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'duplicate_revocation';END IF;

 -- RLS y ACL: lectura/función de browser totalmente denegados.
 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_original_notice_ledger','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_d016_original_reply_evidence','SELECT')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_original_evidence_status_private(uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_observe_original_reply_private(uuid,text,text,text,boolean,boolean)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_original_evidence_status_private(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'acl_exposed';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.v2_d016_original_notice_ledger'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.v2_d016_original_reply_evidence'::regclass)
 THEN RAISE EXCEPTION 'rls_disabled';END IF;

 RAISE NOTICE 'D016_P0_ORIGINAL_NOTICE_EVIDENCE_PG17_PASS';
END $test$;
ROLLBACK;
