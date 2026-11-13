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
     created_at=clock_timestamp()-interval '10 minutes 1 second'
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
ROLLBACK;
