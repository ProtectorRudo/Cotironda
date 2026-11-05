-- MVP196: isolated PostgreSQL 17 migration smoke (transaction ROLLBACK).
-- Synthetic schema only. NEVER use against live PILOTO/production.
BEGIN;
DO $$
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
END$$;
CREATE SCHEMA IF NOT EXISTS cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
 closes_at timestamptz NOT NULL DEFAULT now(),state text DEFAULT 'prepared'
);
CREATE TABLE cotironda_piloto_privado.finalist_activation_mvp113(
 only_row boolean PRIMARY KEY DEFAULT true,
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz
);
INSERT INTO cotironda_piloto_privado.finalist_activation_mvp113
 VALUES(true,false,null);
CREATE FUNCTION cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
 RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'immutable_document';END$$;
\ir ../../piloto/mvp196_commercial_finalists_source_plan_off.sql
DO $$
DECLARE f text;
BEGIN
 FOREACH f IN ARRAY ARRAY[
 'public.cotironda_piloto_commercial_due_mvp196(integer)',
 'public.cotironda_piloto_commit_commercial_plan_mvp196(uuid,text,jsonb)',
 'public.cotironda_piloto_source_plan_sendable_mvp196(uuid)',
 'public.cotironda_piloto_commercial_queue_due_mvp196(integer)',
 'public.cotironda_piloto_tracking_source_plan_mvp196(text)'
 ] LOOP
  IF to_regprocedure(f) IS NULL THEN
   RAISE EXCEPTION 'missing_function: %',f;
  END IF;
  IF has_function_privilege('anon',f,'EXECUTE') OR
   has_function_privilege('authenticated',f,'EXECUTE') OR
   NOT has_function_privilege('service_role',f,'EXECUTE') THEN
   RAISE EXCEPTION 'rpc_acl_violation: %',f;
  END IF;
 END LOOP;
 IF NOT (SELECT relrowsecurity
  FROM pg_class WHERE oid=
   'cotironda_piloto_privado.finalist_source_plans_mvp196'::regclass) THEN
  RAISE EXCEPTION 'source_plan_rls_missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid=
    'cotironda_piloto_privado.finalist_source_plans_mvp196'::regclass
    AND tgname='finalist_source_immutable_mvp196') THEN
  RAISE EXCEPTION 'source_plan_immutable_trigger_missing';
 END IF;
 IF public.cotironda_piloto_tracking_source_plan_mvp196(null) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'no_token_must_never_unlock_contacts';END IF;
 IF public.cotironda_piloto_source_plan_sendable_mvp196(null) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'nullable_send_guard_fails_open';END IF;
 IF public.cotironda_piloto_commercial_due_mvp196(1)->>'state'<>'pilot_finalist_off'
 THEN RAISE EXCEPTION 'disabled_activation_was_ignored';END IF;
 IF public.cotironda_piloto_commercial_queue_due_mvp196(1)->>'state'<>'pilot_finalist_off'
 THEN RAISE EXCEPTION 'disabled_queue_gate_was_ignored';END IF;
 IF public.cotironda_piloto_commit_commercial_plan_mvp196(null,null,null)->>'state'<>'invalid_plan'
 THEN RAISE EXCEPTION 'null_commit_was_accepted';END IF;
END$$;

-- MVP197: NEGATIVE AND POSITIVE SOURCE-ATTESTATION TESTS against fake
-- CI tables only. This never touches a real Supabase instance.
ALTER TABLE cotironda_piloto_privado.requests ADD COLUMN buyer_key text;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text NOT NULL,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text PRIMARY KEY,request_id uuid NOT NULL,
 supplier_key text NOT NULL,source_sha256 text NOT NULL,
 received_at timestamptz NOT NULL
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid NOT NULL,supplier_key text NOT NULL,
 state text NOT NULL DEFAULT 'prepared',
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.offer_versions(
 request_id uuid NOT NULL,supplier_key text NOT NULL,
 created_at timestamptz NOT NULL
);
CREATE TABLE cotironda_piloto_privado.finalist_coverage_plans_mvp108(
 request_id uuid PRIMARY KEY, state text NOT NULL,
 candidate_count integer NOT NULL,supplier_keys text[] NOT NULL
);
CREATE TABLE cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
 request_id uuid NOT NULL
);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 token_hash text PRIMARY KEY,request_id uuid NOT NULL,
 revoked_at timestamptz,expires_at timestamptz NOT NULL
);
-- The SQL RPC below is a test-only fake source document envelope. Real
-- source integrity is covered by MVP172; this smoke verifies that 197
-- rechecks the latest source+consents even after a plan was committed.
CREATE FUNCTION public.cotironda_piloto_private_round_inputs_mvp172(
 p_request_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $f$
 SELECT pg_catalog.jsonb_build_object(
  'state',CASE WHEN EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 bad
   WHERE bad.request_id=p_request_id AND bad.source_sha256=repeat('f',64)
  ) THEN 'incomplete_evidence' ELSE 'private_inputs' END,
  'quotations',coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('doc',pg_catalog.jsonb_build_object(
    'messageHmac',q.message_hmac,
    'sourceSha256',q.source_sha256,
    'prueba',pg_catalog.jsonb_build_object('version',9,
      'revisionVigente',true,'cotizacionVigente',true)
   ))
  ),'[]'::jsonb)
 )
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 WHERE q.request_id=p_request_id
$f$;
DO $$
DECLARE
 v uuid:='57918430-95a7-4ae9-bfb8-182e987b1732'::uuid;
 h text:=repeat('a',64);sha text:=repeat('b',64);
 tok text:=repeat('c',64);j jsonb;
BEGIN
 UPDATE cotironda_piloto_privado.finalist_activation_mvp113
 SET enabled=true,activated_at=clock_timestamp()-interval '1 day'
 WHERE only_row;
 INSERT INTO cotironda_piloto_privado.participants(key,participant_role,consent_at)
 VALUES('buyer','buyer',clock_timestamp()-interval '3 days'),
  ('seller','supplier',clock_timestamp()-interval '3 days');
 INSERT INTO cotironda_piloto_privado.requests(
  id,buyer_key,state,created_at,closes_at)
 VALUES(v,'buyer','closed',clock_timestamp()-interval '4 hours',
  clock_timestamp()-interval '1 hour');
 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES(h,v,'seller',sha,clock_timestamp()-interval '2 hours');
 INSERT INTO cotironda_piloto_privado.invitations
 VALUES(v,'seller','prepared');
 INSERT INTO cotironda_piloto_privado.finalist_coverage_plans_mvp108
 VALUES(v,'one_complete_alternative',1,ARRAY['seller']);
 INSERT INTO cotironda_piloto_privado.finalist_source_plans_mvp196(
  request_id,source_hmacs,source_shas)
 VALUES(v,ARRAY[h],ARRAY[sha]);
 INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091(
  token_hash,request_id,expires_at)
 VALUES(tok,v,clock_timestamp()+interval '2 days');

 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp197_valid_v9_plan_not_sendable';END IF;
 IF public.cotironda_piloto_tracking_source_plan_mvp196(tok)
   IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp197_valid_tracking_not_sendable';END IF;
 j:=public.cotironda_piloto_commercial_queue_due_mvp196(10);
 IF j->>'state'<>'queue_candidates' OR
  jsonb_array_length(j->'requestIds')<>1
 THEN RAISE EXCEPTION 'mvp197_valid_plan_not_queue_candidate';END IF;

 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='seller';
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp197_revoked_supplier_still_sendable';END IF;
 IF jsonb_array_length(
  public.cotironda_piloto_commercial_queue_due_mvp196(10)->'requestIds')<>0
 THEN RAISE EXCEPTION 'mvp197_revoked_supplier_still_in_queue';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=null WHERE key='seller';

 UPDATE cotironda_piloto_privado.invitations
 SET state='cancelled' WHERE request_id=v AND supplier_key='seller';
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp198_cancelled_invitation_still_sendable';END IF;
 UPDATE cotironda_piloto_privado.invitations
 SET state='prepared' WHERE request_id=v AND supplier_key='seller';
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp198_reinstated_invitation_not_sendable';END IF;

 INSERT INTO cotironda_piloto_privado.offer_versions
 VALUES(v,'seller',clock_timestamp()-interval '90 minutes');
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp197_later_edit_still_sendable';END IF;
 DELETE FROM cotironda_piloto_privado.offer_versions;

 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES(repeat('d',64),v,'seller',repeat('e',64),
  clock_timestamp()-interval '70 minutes');
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp197_newer_quote_still_sendable';END IF;
 DELETE FROM cotironda_piloto_privado.supplier_media_quotes_mvp098
 WHERE message_hmac=repeat('d',64);

 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=clock_timestamp() WHERE token_hash=tok;
 IF public.cotironda_piloto_tracking_source_plan_mvp196(tok)
  IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp197_revoked_token_reveals_contacts';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer';
 IF public.cotironda_piloto_source_plan_sendable_mvp196(v) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp197_revoked_buyer_still_sendable';END IF;
 -- Empty earlier round, invalid documentary quote next, then valid v9.
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=null WHERE key='buyer';
 INSERT INTO cotironda_piloto_privado.requests(
  id,buyer_key,state,created_at,closes_at)
 VALUES
  ('57918430-95a7-4ae9-bfb8-182e987b1733','buyer','closed',
   clock_timestamp()-interval '7 hours',clock_timestamp()-interval '6 hours'),
  ('57918430-95a7-4ae9-bfb8-182e987b1734','buyer','closed',
   clock_timestamp()-interval '6 hours',clock_timestamp()-interval '5 hours'),
  ('57918430-95a7-4ae9-bfb8-182e987b1735','buyer','closed',
   clock_timestamp()-interval '5 hours',clock_timestamp()-interval '4 hours');
 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES
  (repeat('3',64),'57918430-95a7-4ae9-bfb8-182e987b1734',
   'seller',repeat('f',64),clock_timestamp()-interval '5.5 hours'),
  (repeat('4',64),'57918430-95a7-4ae9-bfb8-182e987b1735',
   'seller',repeat('5',64),clock_timestamp()-interval '4.5 hours');
 j:=public.cotironda_piloto_commercial_due_mvp196(1);
 IF j->>'state'<>'candidate_due' OR
  (j->>'skipped_unverified')::integer<>1 OR
  jsonb_array_length(j->'rounds')<>1 OR
  j->'rounds'->0->>'requestId'<>
   '57918430-95a7-4ae9-bfb8-182e987b1735'
 THEN RAISE EXCEPTION 'mvp198_earlier_empty_or_invalid_round_stalled_valid_round';END IF;
END$$;

ROLLBACK;
