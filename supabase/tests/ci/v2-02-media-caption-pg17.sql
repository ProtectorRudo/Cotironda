-- V2-02: PG17 sintético para documento PDF/Excel sin mensaje citado.
-- Toda prueba se revierte. Ninguna red, WhatsApp, secreto ni archivo real.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants (
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY,buyer_key text,state text,
 created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations (
 request_id uuid,supplier_key text,state text,
 created_at timestamptz DEFAULT (now()-interval '3 days')
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221 (
 request_id uuid,status text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text PRIMARY KEY,participant_key text,
 chat_hmac text,kind text,request_id uuid,
 processing_state text,plaintext_sha256 text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095 (
 message_hmac text PRIMARY KEY,participant_key text,
 chat_hmac text,kind text,request_id uuid,mime text,
 media_id_sha256 text,state text,content_sha256 text,
 size_bytes integer,storage_path text,finished_at timestamptz
);

INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer','buyer',repeat('8',64),now()-interval '3 days',null),
 ('shop','supplier',repeat('1',64),now()-interval '3 days',null),
 ('other','supplier',repeat('2',64),now()-interval '3 days',null);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','buyer','prepared',now()-interval '2 days',now()+interval '2 days'),
 ('ccccdddd-2222-4222-8222-222222222222','buyer','prepared',now()-interval '2 days',now()+interval '2 days'),
 ('eeeeffff-3333-4333-8333-333333333333','buyer','prepared',now()-interval '2 days',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key,state) VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','shop','prepared'),
 ('ccccdddd-2222-4222-8222-222222222222','shop','prepared'),
 ('eeeeffff-3333-4333-8333-333333333333','other','prepared');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','shadow'),
 ('ccccdddd-2222-4222-8222-222222222222','shadow'),
 ('eeeeffff-3333-4333-8333-333333333333','shadow');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaabbbb-1111-4111-8111-111111111111','shop','api_accepted','wamid.AAAA1111',now()-interval '1 hour'),
 ('ccccdddd-2222-4222-8222-222222222222','shop','api_accepted','wamid.CCCC2222',now()-interval '1 hour'),
 ('eeeeffff-3333-4333-8333-333333333333','other','api_accepted','wamid.EEEE3333',now()-interval '1 hour');

-- Manifiesto realista: el webhook firma el JSON exacto, no la IA ni el archivo.
CREATE TEMP TABLE specimens (hmac text,chat text,shop text,kind text,manifest text,mime text,id text);
INSERT INTO specimens VALUES
 (repeat('a',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-pdf11111111','mime','application/pdf',
  'caption','Cotironda pedido: AAAABBBB',
  'state','awaiting_secure_download')::text,
 'application/pdf','doc-pdf11111111'),
 (repeat('b',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-xlsx22222222',
  'mime','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'caption','COTI-CCCCDDDD',
  'state','awaiting_secure_download')::text,
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','doc-xlsx22222222'),
 (repeat('c',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-nocap3333333','mime','application/pdf',
  'caption',null,'state','awaiting_secure_download')::text,
 'application/pdf','doc-nocap3333333'),
 (repeat('d',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-ambig4444444','mime','application/pdf',
  'caption','COTI-AAAABBBB y COTI-CCCCDDDD',
  'state','awaiting_secure_download')::text,
 'application/pdf','doc-ambig4444444'),
 (repeat('e',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-foreign55555','mime','application/pdf',
  'caption','Cotironda pedido: EEEEFFFF',
  'state','awaiting_secure_download')::text,
 'application/pdf','doc-foreign55555'),
 (repeat('f',64),repeat('2',64),'other','image',
 jsonb_build_object('version',1,'origin','whapi','kind','image',
  'media_id','img-foreign666666','mime','image/jpeg',
  'caption','Cotironda pedido: AAAABBBB',
  'state','awaiting_secure_download')::text,
 'image/jpeg','img-foreign666666'),
 (repeat('9',64),repeat('1',64),'shop','document',
 jsonb_build_object('version',1,'origin','whapi','kind','document',
  'media_id','doc-unstored7777','mime','application/pdf',
  'caption','Cotironda pedido: AAAABBBB',
  'state','awaiting_secure_download')::text,
 'application/pdf','doc-unstored7777');

INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,participant_key,chat_hmac,kind,request_id,processing_state,plaintext_sha256,received_at)
SELECT hmac,shop,chat,kind,null,'needs_review',
 encode(sha256(convert_to(manifest,'UTF8')),'hex'),now()
FROM specimens;
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 (message_hmac,participant_key,chat_hmac,kind,request_id,mime,media_id_sha256,
 state,content_sha256,size_bytes,storage_path,finished_at)
SELECT hmac,shop,chat,kind,null,mime,
 encode(sha256(convert_to(id,'UTF8')),'hex'),'stored',repeat('a',64),
 222,'media/'||hmac,now()
FROM specimens WHERE hmac<>repeat('9',64);

\ir ../../piloto/v2_02_referencia_caption_adjunto_solo_lectura.sql

DO $check$
DECLARE r jsonb; t text;
BEGIN
 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('a',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'matched' OR r->>'quoted_whapi_id'<>'wamid.AAAA1111'
 THEN RAISE EXCEPTION 'pdf_caption_two_rounds_failed_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('b',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('b',64),repeat('1',64),t);
 IF r->>'state'<>'matched' OR r->>'quoted_whapi_id'<>'wamid.CCCC2222'
 THEN RAISE EXCEPTION 'excel_caption_failed_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('c',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('c',64),repeat('1',64),t);
 IF r->>'state'<>'reference_absent'
 THEN RAISE EXCEPTION 'nocaption_linked_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('d',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('d',64),repeat('1',64),t);
 IF r->>'state'<>'reference_ambiguous'
 THEN RAISE EXCEPTION 'two_codes_linked_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('e',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('e',64),repeat('1',64),t);
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'wrong_business_request_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('f',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('f',64),repeat('2',64),t);
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'wrong_business_photo_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('9',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('9',64),repeat('1',64),t);
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'unstored_document_allowed_%',r;END IF;

 SELECT manifest INTO t FROM specimens WHERE hmac=repeat('a',64);
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('1',64),t||' alterado');
 IF r->>'state'<>'invalid_input' AND r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'sha_spoof_allowed_%',r;END IF;
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('2',64),t);
 IF r->>'state'<>'source_not_authorized'
 THEN RAISE EXCEPTION 'wrong_chat_allowed_%',r;END IF;

 UPDATE cotironda_piloto_privado.participants
 SET consent_at=now()-interval '30 minutes' WHERE key='shop';
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'late_supplier_consent_%',r;END IF;
 UPDATE cotironda_piloto_privado.participants
 SET consent_at=now()-interval '3 days' WHERE key='shop';

 UPDATE cotironda_piloto_privado.invitations
 SET created_at=now()-interval '30 minutes'
 WHERE request_id='aaaabbbb-1111-4111-8111-111111111111';
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'reference_not_linkable'
 THEN RAISE EXCEPTION 'late_invitation_%',r;END IF;
 UPDATE cotironda_piloto_privado.invitations
 SET created_at=now()-interval '3 days'
 WHERE request_id='aaaabbbb-1111-4111-8111-111111111111';

 -- Colision de prefijo: jamas elegir una de dos rondas candidatas.
 INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','buyer','prepared',now()-interval '2 days',now()+interval '2 days');
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key,state)
 VALUES ('aaaabbbb-4444-4444-8444-444444444444','shop','prepared');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','shadow');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaabbbb-4444-4444-8444-444444444444','shop','api_accepted','wamid.COLLISION',now()-interval '1 hour');
 r:=public.cotironda_piloto_v2_quoted_id_for_media_reference(repeat('a',64),repeat('1',64),t);
 IF r->>'state'<>'reference_ambiguous'
 THEN RAISE EXCEPTION 'prefix_collision_linked_%',r;END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_quoted_id_for_media_reference(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_quoted_id_for_media_reference(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_quoted_id_for_media_reference(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'rpc_acl_broken';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 WHERE request_id IS NOT NULL)
 THEN RAISE EXCEPTION 'lookup_changed_archive';END IF;
 RAISE NOTICE 'V2_02_CAPTION_MEDIA_PG17_PASS';
END $check$;
ROLLBACK;
