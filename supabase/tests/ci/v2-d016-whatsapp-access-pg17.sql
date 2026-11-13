-- D016: PostgreSQL 17 sintético, sin datos personales ni persistencia.
-- Todas las tablas, RPC y cambios se revierten al terminar.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text
);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text,chat_hmac text,contact_sha256 text,
 authenticated_message_hmac text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text
);
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a','buyer',repeat('1',64),now()-interval '1 day',null),
 ('supplier_a','supplier',repeat('2',64),now()-interval '1 day',null);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','buyer_a','prepared'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','buyer_a','prepared');
INSERT INTO cotironda_piloto_privado.participant_channels_mvp109 VALUES
 ('buyer_a',repeat('1',64),repeat('9',64),repeat('3',64));
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('3',64),repeat('1',64),'buyer_a');

\ir ../../piloto/v2_d016_whatsapp_link_tickets_CANDIDATE.sql

DO $check$
DECLARE r jsonb; one text:=repeat('a',64);
BEGIN
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  one,'supplier_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('2',64))
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'supplier_login_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  one,'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('2',64))
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_chat_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  one,'buyer_a','cccccccc-cccc-4ccc-8ccc-cccccccccccc',repeat('1',64))
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_round_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  'bad','buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('1',64))
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'bad_hmac_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  one,'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('1',64))
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'verified_buyer_rejected';END IF;
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('c',64))
 IS NOT NULL THEN RAISE EXCEPTION 'unknown_hmac_claimed';END IF;
 r:=public.cotironda_piloto_v2_d016_claim_ticket_private(one);
 IF r->>'state'<>'CLAIMED_AWAITING_AUTH'
  OR r->>'buyerKey'<>'buyer_a'
  OR r->>'requestId'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 THEN RAISE EXCEPTION 'atomic_claim_failed';END IF;
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(one) IS NOT NULL
 THEN RAISE EXCEPTION 'replayed_hmac_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('b',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ticket_two_not_issued';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('d',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ticket_rotation_failed';END IF;
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('b',64))
 IS NOT NULL THEN RAISE EXCEPTION 'rotated_ticket_accepted';END IF;
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('d',64))
 IS NULL THEN RAISE EXCEPTION 'new_ticket_not_claimed';END IF;

 -- Vencimiento de un solo token.
 PERFORM public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('e',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64));
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets
 SET expires_at=clock_timestamp()-interval '1 second',
     created_at=clock_timestamp()-interval '9 minutes'
 WHERE ticket_hmac=repeat('e',64);
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('e',64))
 IS NOT NULL THEN RAISE EXCEPTION 'expired_ticket_accepted';END IF;

 -- Revocación del comprador invalida el enlace ya emitido.
 PERFORM public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('f',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64));
 UPDATE cotironda_piloto_privado.participants
  SET opted_out_at=clock_timestamp() WHERE key='buyer_a';
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('f',64))
 IS NOT NULL THEN RAISE EXCEPTION 'optout_claim_accepted';END IF;
 UPDATE cotironda_piloto_privado.participants
  SET opted_out_at=NULL WHERE key='buyer_a';

 -- Dos compradores activos con la MISMA huella: nunca permitir canje.
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_b','buyer',repeat('4',64),now(),null);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109 VALUES
 ('buyer_b',repeat('4',64),repeat('9',64),repeat('5',64));
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('0',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ambiguous_identity_issued';END IF;
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(repeat('f',64))
 IS NOT NULL THEN RAISE EXCEPTION 'ambiguous_identity_claimed';END IF;

 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_access_tickets','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_d016_access_tickets','SELECT')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_issue_ticket_private(text,text,uuid,text)',
  'EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_claim_ticket_private(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_claim_ticket_private(text)','EXECUTE')
 THEN RAISE EXCEPTION 'ticket_acl_exposed';END IF;
 RAISE NOTICE 'V2_D016_PG17_ROLLBACK_PASS';
END $check$;
-- D016 sesión web propia: NO necesita auth.users/email/SMS ni nuevos JWT.
DO $private_session$
DECLARE got jsonb;before_count int;
BEGIN
 DELETE FROM cotironda_piloto_privado.participant_channels_mvp109
 WHERE participant_key='buyer_b';
 DELETE FROM cotironda_piloto_privado.participants WHERE key='buyer_b';
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('7',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'session_ticket_not_issued';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(
  repeat('7',64),repeat('8',64)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'atomic_session_not_created';END IF;
 got:=public.cotironda_piloto_v2_d016_session_context_private(
  repeat('8',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF got->>'state'<>'authorized_buyer_whatsapp_session'
 OR got->>'buyerKey'<>'buyer_a' THEN
  RAISE EXCEPTION 'session_context_missing';END IF;
 IF public.cotironda_piloto_v2_d016_session_context_private(
  repeat('8',64),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS NOT NULL
 THEN RAISE EXCEPTION 'session_cross_round';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(
  repeat('7',64),repeat('a',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ticket_replayed_for_second_session';END IF;
 SELECT count(*) INTO before_count
 FROM cotironda_piloto_privado.v2_d016_browser_sessions;
 IF before_count<>1 THEN RAISE EXCEPTION 'unexpected_session_count';END IF;

 -- INSERT conflict must undo ticket claim so a retry can work.
 PERFORM public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('9',64),'buyer_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('1',64));
 IF public.cotironda_piloto_v2_d016_claim_session_private(
  repeat('9',64),repeat('8',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'duplicate_session_cookie_allowed';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(
  repeat('9',64),repeat('a',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'duplicate_rollback_consumed_ticket';END IF;

 -- Baja del comprador: sesión existente deja de autorizar al instante.
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer_a';
 IF public.cotironda_piloto_v2_d016_session_context_private(
  repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 IS NOT NULL THEN RAISE EXCEPTION 'optout_session_alive';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key='buyer_a';

 -- Logout obligatorio contra la misma huella de cookie.
 IF public.cotironda_piloto_v2_d016_logout_private(repeat('a',64))
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'logout_not_revoked';END IF;
 IF public.cotironda_piloto_v2_d016_session_context_private(
  repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 IS NOT NULL THEN RAISE EXCEPTION 'logout_still_authorized';END IF;
 IF public.cotironda_piloto_v2_d016_logout_private(repeat('a',64))
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'logout_replayed';END IF;

 -- Vencimiento de sesión: no basta con presentar cookie guardada.
 UPDATE cotironda_piloto_privado.v2_d016_browser_sessions
 SET expires_at=clock_timestamp()-interval '1 second',
     created_at=clock_timestamp()-interval '3 hours'
 WHERE sesion_hmac=repeat('8',64);
 IF public.cotironda_piloto_v2_d016_session_context_private(
  repeat('8',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 IS NOT NULL THEN RAISE EXCEPTION 'expired_session_alive';END IF;
 IF public.cotironda_piloto_v2_d016_session_context_private(
  repeat('f',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 IS NOT NULL THEN RAISE EXCEPTION 'unknown_cookie_authorized';END IF;

 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_browser_sessions','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_d016_browser_sessions','SELECT')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_claim_session_private(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_session_context_private(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_session_context_private(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'web_session_acl_exposed';END IF;
 RAISE NOTICE 'V2_D016_BROWSER_SESSION_PG17_PASS';
END $private_session$;
ROLLBACK;
