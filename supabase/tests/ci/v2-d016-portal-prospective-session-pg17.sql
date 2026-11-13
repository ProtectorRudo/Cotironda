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
 id uuid PRIMARY KEY,buyer_key text,state text,
 created_at timestamptz NOT NULL DEFAULT (now()-interval '1 day')
);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text,chat_hmac text,contact_sha256 text,
 authenticated_message_hmac text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 received_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE cotironda_piloto_privado.v2_original_share_policy(
 singleton boolean PRIMARY KEY,enabled boolean,activated_at timestamptz
);
INSERT INTO cotironda_piloto_privado.v2_original_share_policy VALUES
 (true,true,now()-interval '2 days');
CREATE TABLE cotironda_piloto_privado.v2_business_policy(
 singleton boolean PRIMARY KEY,enabled boolean,activated_at timestamptz
);
INSERT INTO cotironda_piloto_privado.v2_business_policy
 VALUES(true,true,clock_timestamp()-interval '2 days');
\ir ../../piloto/v2_d016_whatsapp_link_tickets_CANDIDATE.sql
\ir ../../piloto/v2_d016_portal_prospective_session_guard_CANDIDATE.sql

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

DO $check_whapi$
DECLARE v jsonb;
BEGIN
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key
 ) VALUES (repeat('a',64),repeat('1',64),'buyer_a'),
 (repeat('b',64),repeat('1',64),'buyer_a'),
 (repeat('c',64),repeat('1',64),'buyer_a'),
 (repeat('d',64),repeat('1',64),'buyer_a');
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=false;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('a',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('4',64));
 IF v->>'state'<>'denied' THEN RAISE EXCEPTION 'policy_off';END IF;
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=true;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('2',64),repeat('a',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('4',64));
 IF v->>'state'<>'denied' THEN RAISE EXCEPTION 'supplier_link';END IF;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('a',64),
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','auto',repeat('4',64));
 IF v->>'state'<>'denied' THEN RAISE EXCEPTION 'wrong_round';END IF;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('a',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('4',64));
 IF v->>'state'<>'issued'
 OR v->>'request_id'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 THEN RAISE EXCEPTION 'issue_failed:%',v;END IF;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('a',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('5',64));
 IF v->>'state'<>'duplicate' THEN RAISE EXCEPTION 'double_issue';END IF;
 IF public.cotironda_piloto_v2_d016_finish_whapi_link_private(
  repeat('4',64),'api_accepted','wamid.FAKE000001') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'finish_failed';END IF;
 IF public.cotironda_piloto_v2_d016_finish_whapi_link_private(
  repeat('4',64),'api_accepted','wamid.FAKE000001') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'double_finish';END IF;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('b',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('6',64));
 IF v->>'state'<>'rate_limited' THEN
  RAISE EXCEPTION 'rate_60_seconds:%',v;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_whapi_link_deliveries
 SET created_at=clock_timestamp()-interval '2 minutes'
 WHERE event_hmac=repeat('a',64);
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('b',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','auto',repeat('6',64));
 IF v->>'state'<>'issued' THEN RAISE EXCEPTION 'new_event_failed:%',v;END IF;
 IF public.cotironda_piloto_v2_d016_finish_whapi_link_private(
  repeat('6',64),'uncertain',NULL) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'uncertain_not_recorded';END IF;
 IF public.cotironda_piloto_v2_d016_finish_whapi_link_private(
  repeat('6',64),'api_accepted','wamid.FAKE000002') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'uncertain_resend';END IF;
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('c',64),NULL,'recovery',repeat('7',64));
 IF v->>'state'<>'denied' THEN RAISE EXCEPTION 'ambiguous_recovery';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer_a';
 v:=public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
  repeat('1',64),repeat('d',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','confirmed',repeat('8',64));
 IF v->>'state'<>'denied' THEN RAISE EXCEPTION 'revoked_buyer';END IF;
 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_whapi_link_deliveries','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_d016_whapi_link_deliveries','SELECT')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_prepare_whapi_link_private(text,text,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_finish_whapi_link_private(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_prepare_whapi_link_private(text,text,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'link_acl_exposed';END IF;
 RAISE NOTICE 'V2_D016_WHAPI_DELIVERY_PG17_PASS';
END $check_whapi$;

-- D016 P0: prueba prospectiva del gate de acceso privado. Todas las
-- autorizaciones del navegador dependen del comienzo real de V2.
DO $prospective$
DECLARE
 old_r uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 new_r uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 tok text:='2f'||repeat('a',62);
 tok2 text:='3f'||repeat('c',62);
 cookie text:='2e'||repeat('b',62);
 got jsonb;
BEGIN
 -- Acceso positivo sólo cuando política está encendida y fecha válida.
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
 tok,'buyer_a',old_r,repeat('1',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'prospective_positive_ticket';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(tok,cookie)
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'prospective_positive_claim';END IF;
 got:=public.cotironda_piloto_v2_d016_session_context_private(cookie,old_r);
 IF got->>'state'<>'authorized_buyer_whatsapp_session'
 THEN RAISE EXCEPTION 'prospective_positive_session';END IF;

 -- OFF revoca acceso existente y bloquea todos los tipos de canje.
 UPDATE cotironda_piloto_privado.v2_business_policy SET enabled=false;
 got:=public.cotironda_piloto_v2_d016_session_context_private(cookie,old_r);
 IF got IS NOT NULL THEN RAISE EXCEPTION 'policy_off_live_session';END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
 tok2,'buyer_a',old_r,repeat('1',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'policy_off_issue';END IF;
 IF public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
 repeat('1',64),repeat('a',64),old_r,'auto',tok2)->>'state'
 IS DISTINCT FROM 'denied'
 THEN RAISE EXCEPTION 'policy_off_prepare';END IF;
 -- Existing ticket from previous session must not be reissued after OFF.
 IF public.cotironda_piloto_v2_d016_claim_ticket_private(tok)
 IS NOT NULL THEN RAISE EXCEPTION 'policy_off_claim_ticket';END IF;

 -- Política activada DESPUÉS del pedido histórico: no recuperar rondas.
 UPDATE cotironda_piloto_privado.v2_business_policy
 SET enabled=true,activated_at=clock_timestamp()-interval '2 hours';
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
 tok2,'buyer_a',old_r,repeat('1',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'historical_issue';END IF;
 got:=public.cotironda_piloto_v2_d016_session_context_private(cookie,old_r);
 IF got IS NOT NULL THEN RAISE EXCEPTION 'historical_session';END IF;
 IF public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
 repeat('1',64),repeat('a',64),old_r,'auto',tok2)->>'state'
 IS DISTINCT FROM 'denied'
 THEN RAISE EXCEPTION 'historical_prepare';END IF;

 -- Nueva ronda prospectiva con el mismo comprador: autorizada, sesión
 -- de la nueva ronda jamás sirve para ver una anterior.
 INSERT INTO cotironda_piloto_privado.requests VALUES
 (new_r,'buyer_a','prepared',clock_timestamp()-interval '30 minutes');
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
 tok2,'buyer_a',new_r,repeat('1',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'new_round_issue';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(
 tok2,'4f'||repeat('d',62)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'new_round_claim';END IF;
 got:=public.cotironda_piloto_v2_d016_session_context_private(
 '4f'||repeat('d',62),new_r);
 IF got->>'requestId'<>new_r::text
 THEN RAISE EXCEPTION 'new_round_auth_missing';END IF;
 got:=public.cotironda_piloto_v2_d016_session_context_private(
 '4f'||repeat('d',62),old_r);
 IF got IS NOT NULL THEN RAISE EXCEPTION 'cross_round_legacy';END IF;

 -- Si aún no se ha activado una fecha, nada autoriza.
 UPDATE cotironda_piloto_privado.v2_business_policy SET activated_at=NULL;
 got:=public.cotironda_piloto_v2_d016_session_context_private(
 '4f'||repeat('d',62),new_r);
 IF got IS NOT NULL THEN RAISE EXCEPTION 'null_activation_session';END IF;

 -- Ni anon ni authenticated ejecutan estas funciones privilegiadas.
 IF has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_issue_ticket_private(text,text,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_claim_session_private(text,text)','EXECUTE')
 OR has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_session_context_private(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'prospective_acl';END IF;
 RAISE NOTICE 'D016_PORTAL_PROSPECTIVE_GUARD_PG17_PASS';
END $prospective$;

ROLLBACK;
