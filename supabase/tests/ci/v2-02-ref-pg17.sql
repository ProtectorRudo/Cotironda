-- V2-02 PostgreSQL 17: escenario sintético, rollback total, sin red.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;

CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants (
 key text PRIMARY KEY, participant_role text, chat_hmac text,
 consent_at timestamptz, opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY, buyer_key text, state text,
 created_at timestamptz, closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations (
 request_id uuid, supplier_key text, state text,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221 (
 request_id uuid PRIMARY KEY, status text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
 request_id uuid,supplier_key text,state text,whapi_message_id text,
 finished_at timestamptz,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text PRIMARY KEY,participant_key text,chat_hmac text,
 kind text, request_id uuid, processing_state text,
 plaintext_sha256 text,received_at timestamptz
);

INSERT INTO cotironda_piloto_privado.participants
 (key,participant_role,chat_hmac,consent_at,opted_out_at) VALUES
 ('buyer_a','buyer',repeat('8',64),now()-interval '3 days',null),
 ('supplier_a','supplier',repeat('1',64),now()-interval '3 days',null),
 ('supplier_b','supplier',repeat('2',64),now()-interval '3 days',null),
 ('supplier_revoked','supplier',repeat('3',64),now()-interval '3 days',now()-interval '1 day');
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','buyer_a','prepared',now()-interval '2 days',now()+interval '2 days'),
 ('ccccdddd-2222-4222-8222-222222222222','buyer_a','prepared',now()-interval '2 days',now()+interval '2 days'),
 ('eeeeffff-3333-4333-8333-333333333333','buyer_a','prepared',now()-interval '2 days',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','supplier_a','prepared'),
 ('ccccdddd-2222-4222-8222-222222222222','supplier_a','prepared'),
 ('eeeeffff-3333-4333-8333-333333333333','supplier_b','prepared');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','shadow'),
 ('ccccdddd-2222-4222-8222-222222222222','shadow'),
 ('eeeeffff-3333-4333-8333-333333333333','shadow');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','supplier_a','api_accepted','wamid.REF_AAAA1111',now()-interval '1 hour'),
 ('ccccdddd-2222-4222-8222-222222222222','supplier_a','api_accepted','wamid.REF_CCCC2222',now()-interval '1 hour'),
 ('eeeeffff-3333-4333-8333-333333333333','supplier_b','api_accepted','wamid.REF_EEEE3333',now()-interval '1 hour');

INSERT INTO cotironda_piloto_privado.whapi_inbox
(message_hmac,participant_key,chat_hmac,kind,request_id,processing_state,plaintext_sha256,received_at)
VALUES
(repeat('a',64),'supplier_a',repeat('1',64),'text',null,'needs_review',
 encode(sha256(convert_to(E'Cotironda pedido: AAAABBBB\nCotizo 20 bolsas de cemento','UTF8')),'hex'),now()),
(repeat('b',64),'supplier_a',repeat('1',64),'text',null,'needs_review',
 encode(sha256(convert_to('COTI-AAAABBBB y COTI-CCCCDDDD','UTF8')),'hex'),now()),
(repeat('c',64),'buyer_a',repeat('8',64),'text',null,'needs_review',
 encode(sha256(convert_to('Cotironda pedido: AAAABBBB','UTF8')),'hex'),now()),
(repeat('d',64),'supplier_a',repeat('1',64),'text',null,'needs_review',
 encode(sha256(convert_to('Cotironda pedido: EEEEFFFF','UTF8')),'hex'),now()),
(repeat('e',64),'supplier_revoked',repeat('3',64),'text',null,'needs_review',
 encode(sha256(convert_to('Cotironda pedido: AAAABBBB','UTF8')),'hex'),now());

\ir ../../piloto/v2_02_ref_codigo_pedido_solo_lectura.sql

DO $tests$
DECLARE r jsonb; t text;
BEGIN
 t:=E'Cotironda pedido: AAAABBBB\nCotizo 20 bolsas de cemento';
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'matched' OR r->>'quoted_whapi_id'<>'wamid.REF_AAAA1111'
 THEN RAISE EXCEPTION 'two_active_rounds_reference_not_linked_%',r; END IF;

 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('a',64),repeat('1',64),t||' alterado');
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'sha_spoof_allowed_%',r; END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('a',64),repeat('2',64),t);
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'wrong_supplier_allowed_%',r; END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('b',64),repeat('1',64),
 'COTI-AAAABBBB y COTI-CCCCDDDD');
 IF r->>'state'<>'reference_ambiguous'
 THEN RAISE EXCEPTION 'ambiguous_references_allowed_%',r; END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('c',64),repeat('8',64),
 'Cotironda pedido: AAAABBBB');
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'buyer_spoof_allowed_%',r; END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('d',64),repeat('1',64),
 'Cotironda pedido: EEEEFFFF');
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'foreign_supplier_reference_allowed_%',r; END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('e',64),repeat('3',64),
 'Cotironda pedido: AAAABBBB');
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'revoked_supplier_allowed_%',r; END IF;

 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='leased' WHERE request_id='aaaabbbb-1111-4111-8111-111111111111';
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'not_accepted_dispatch_allowed_%',r; END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted' WHERE request_id='aaaabbbb-1111-4111-8111-111111111111';

 INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','buyer_a','prepared',
 now()-interval '2 days',now()+interval '2 days');
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','supplier_a','prepared');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','shadow');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','supplier_a',
 'api_accepted','wamid.REF_COLLISION',now()-interval '1 hour');
 r:=public.cotironda_piloto_v2_quoted_id_for_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'reference_ambiguous'
 THEN RAISE EXCEPTION 'prefix_collision_allowed_%',r; END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_quoted_id_for_reference(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_quoted_id_for_reference(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_quoted_id_for_reference(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'unexpected_rpc_acl'; END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox WHERE request_id IS NOT NULL)<>0
 THEN RAISE EXCEPTION 'read_only_lookup_mutated_inbox';END IF;
 RAISE NOTICE 'V2_02_REFERENCE_PG17_PASS';
END $tests$;
ROLLBACK;
