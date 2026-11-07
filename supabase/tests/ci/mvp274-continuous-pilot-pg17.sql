-- MVP274: REAL PG17 synthetic rehearsal, no external I/O and full ROLLBACK.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.ai_trial_control_mvp229(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 expires_at timestamptz,
 CONSTRAINT ai_trial_control_mvp229_check CHECK(
  (enabled=false AND activated_at IS NULL AND expires_at IS NULL)
  OR (enabled=true AND activated_at IS NOT NULL AND expires_at IS NOT NULL
      AND expires_at>activated_at
      AND expires_at<=activated_at+interval '4 hours'))
);
INSERT INTO cotironda_piloto_privado.ai_trial_control_mvp229(only_row) VALUES(true);
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229 ENABLE ROW LEVEL SECURITY;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,whatsapp_inbound_enabled boolean,
 whatsapp_outbound_enabled boolean);
CREATE TABLE cotironda_piloto_privado.ai_central_control_mvp226(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,source_hmac text,state text,
 created_at timestamptz,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(
 request_id uuid PRIMARY KEY,source_hmac text);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,whapi_message_id text,
 finished_at timestamptz);
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('arquitecto','buyer',repeat('a',64),now(),null),
 ('corralon_ailin','supplier',repeat('1',64),now(),null),
 ('corralon_nahuel','supplier',repeat('2',64),now(),null),
 ('extra_buyer','buyer',repeat('3',64),now(),null),
 ('revocado','supplier',repeat('4',64),now(),now());
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true,true);
INSERT INTO cotironda_piloto_privado.ai_central_control_mvp226 VALUES(true,true,now());
INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222 VALUES(true,true,now());
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001',repeat('f',64),
 'prepared',now()-interval '1 hour',now()+interval '1 day');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001',repeat('f',64));
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('00000000-0000-4000-8000-000000000001','corralon_ailin',
 'api_accepted','whapi-fake-message',now()-interval '30 minutes');
-- Historical production-compatible RPC (allows already-delivered responses).
\ir ../../piloto/mvp230_continuidad_presupuestos_sin_nuevos_envios.sql
DO $check$ BEGIN
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'buyer' <> 'false'
 THEN RAISE EXCEPTION 'mvp274_originally_off'; END IF;
END $check$;
-- Proposed schema migration must NOT activate the feature.
\ir ../../piloto/mvp274_continuous_pilot_optional_off.sql
DO $check$ BEGIN
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'buyer' <> 'false'
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_trial_control_mvp229 WHERE only_row)
 THEN RAISE EXCEPTION 'mvp274_unexpected_activation'; END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp274_acl_broken'; END IF;
END $check$;
-- LEGACY bounded windows still work, max four hours.
UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true, activated_at=now(),expires_at=now()+interval '1 hour';
DO $check$ BEGIN
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'buyer'<>'true'
 THEN RAISE EXCEPTION 'mvp274_timed_trial_rejected';END IF;
END $check$;
SAVEPOINT four_hours;
DO $check$ BEGIN
 BEGIN
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET expires_at=activated_at+interval '5 hours';
 RAISE EXCEPTION 'mvp274_five_hours_allowed';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $check$;
ROLLBACK TO four_hours;
-- PROSPECTIVE OPEN-ENDED PILOT MODE: only after operator explicitly enables it.
UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true,activated_at=now()-interval '6 days',expires_at=null;
DO $check$
DECLARE buyer jsonb;supplier jsonb;
BEGIN
 buyer:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 supplier:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64));
 IF buyer->>'state'<>'active' OR buyer->>'buyer'<>'true'
 OR buyer->>'dispatch'<>'true'
 OR supplier->>'quote_link'<>'true'
 OR supplier->>'quote_analysis'<>'true'
 THEN RAISE EXCEPTION 'mvp274_continuous_mode_invalid'; END IF;
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('3',64))->>'buyer'<>'false'
 OR public.cotironda_piloto_ia_trial_flags_mvp229(repeat('4',64))->>'quote_link'<>'false'
 OR public.cotironda_piloto_ia_trial_flags_mvp229(repeat('f',64))->>'buyer'<>'false'
 THEN RAISE EXCEPTION 'mvp274_allowlist_broken'; END IF;
END $check$;
-- Revoking dispatch gate immediately disables new dispatch, not prior quote.
UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222 SET enabled=false;
DO $check$ BEGIN
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'dispatch'<>'false'
 OR public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64))->>'quote_link'<>'true'
 THEN RAISE EXCEPTION 'mvp274_dispatch_kills_inflight_quotation';END IF;
END $check$;
UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222 SET enabled=true;
-- Switch OFF stops new rounds, retains only justified preexisting supplier replies.
UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=false,activated_at=null,expires_at=null;
DO $check$ BEGIN
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'buyer'<>'false'
 OR public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64))->>'quote_link'<>'true'
 THEN RAISE EXCEPTION 'mvp274_stop_or_continuation_broken';END IF;
END $check$;
-- Reversible only after explicitly disabling mode; preserve old constraints.
\ir ../../piloto/mvp274_rollback_continuous_pilot_off_manual.sql
DO $check$ BEGIN
 IF (SELECT count(*) FROM pg_constraint
   WHERE conrelid='cotironda_piloto_privado.ai_trial_control_mvp229'::regclass
     AND conname='ai_trial_control_mvp229_check')<>1
 THEN RAISE EXCEPTION 'mvp274_rollback_check_missing';END IF;
END $check$;
ROLLBACK;
