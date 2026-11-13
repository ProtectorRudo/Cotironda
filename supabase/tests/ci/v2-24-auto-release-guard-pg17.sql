-- V2-24 CI EXCLUSIVAMENTE SINTÉTICA PostgreSQL 17, rollback total.
-- El cálculo real de dos días hábiles se prueba aparte en V2-05 PG17.
-- Acá v2_deadline() es un STUB inofensivo para probar la integración
-- transaccional, el gate y permisos, NUNCA una fuente real de feriados.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,
 buyer_key text,source_hmac text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 closes_at timestamptz NOT NULL,
 delivery_city text NOT NULL,
 round_days smallint NOT NULL,
 timing_mode text NOT NULL,
 v2_calendar_revision text,
 state text NOT NULL
);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,
 chat_hmac text,consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(
 request_id uuid PRIMARY KEY,status text NOT NULL
);
CREATE TABLE cotironda_piloto_privado.v2_business_policy(
 singleton boolean PRIMARY KEY,
 enabled boolean NOT NULL,activated_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.v2_business_calendar(
 locality text,year int,revision text,approved_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.mock_calls(name text);
-- Sólo STUBS en este PG17 efímero, NO SQL real de Supabase.
CREATE FUNCTION cotironda_piloto_privado.v2_deadline(timestamptz,text)
 RETURNS timestamptz LANGUAGE sql STABLE SET search_path TO ''
 AS $$ SELECT $1 + interval '48 hours' $$;
CREATE FUNCTION public.cotironda_piloto_v2_shadow_prepare_d013(
 text,text,text,text,jsonb,jsonb
) RETURNS jsonb LANGUAGE sql SET search_path TO ''
 AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.cotironda_piloto_ia_auto_release_mvp306(text,text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $m$
 BEGIN
  INSERT INTO cotironda_piloto_privado.mock_calls(name) VALUES('approved');
  RETURN jsonb_build_object('state','approved',
   'request_id','47c23e65-8985-48c4-85ca-e4a972938afb');
 END $m$;
CREATE FUNCTION public.cotironda_piloto_ia_publish_mvp222(uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $m$
 BEGIN
  INSERT INTO cotironda_piloto_privado.mock_calls(name) VALUES('published');
  RETURN jsonb_build_object('state','ready_for_delivery');
 END $m$;
\ir ../../piloto/v2_24_auto_release_calendar_guarded_candidate.sql
DO $off$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_v2_auto_release_d013(
  repeat('a',64),repeat('b',64));
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'v2_24_off_allowed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.mock_calls)<>0
 THEN RAISE EXCEPTION 'v2_24_called_under_off';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_v2_auto_release_d013(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_v2_auto_release_d013(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_v2_auto_release_d013(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_24_public_permission';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.v2_auto_release_policy'::regclass)
 THEN RAISE EXCEPTION 'v2_24_rls_not_enabled';END IF;
END $off$;
INSERT INTO cotironda_piloto_privado.v2_business_policy
 (singleton,enabled,activated_at) VALUES(true,false,null);
INSERT INTO cotironda_piloto_privado.participants
 (key,participant_role,chat_hmac,consent_at, opted_out_at)
 VALUES('buyer_ci','buyer',repeat('a',64),now(),null);
INSERT INTO cotironda_piloto_privado.requests
 (id,buyer_key,source_hmac,created_at,closes_at,
  delivery_city,round_days,timing_mode,v2_calendar_revision,state)
 VALUES('47c23e65-8985-48c4-85ca-e4a972938afb',
  'buyer_ci',repeat('b',64),now(),now()+interval '48 hours',
  'La Plata',2,'business_two_days','ci_cal_26','draft');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 (request_id,status) VALUES('47c23e65-8985-48c4-85ca-e4a972938afb','shadow');
INSERT INTO cotironda_piloto_privado.v2_business_calendar
 (locality,year,revision,approved_at)
 SELECT 'la plata',EXTRACT(YEAR FROM
  (closes_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int,
  'ci_cal_26',now()
 FROM cotironda_piloto_privado.requests;
DO $negative$
DECLARE v jsonb;
BEGIN
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET enabled=true,activated_at=now()-interval '1 hour' WHERE singleton;
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'calendar_disabled'
 THEN RAISE EXCEPTION 'v2_24_calendar_off_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.v2_business_policy
 SET enabled=true,activated_at=now() WHERE singleton;
 UPDATE cotironda_piloto_privado.requests
 SET timing_mode='legacy_calendar';
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'v2_timing_invalid'
 THEN RAISE EXCEPTION 'v2_24_legacy_calendar_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.requests
 SET timing_mode='business_two_days',round_days=2,
  closes_at=closes_at+interval '1 hour';
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'deadline_not_verified'
 THEN RAISE EXCEPTION 'v2_24_wrong_deadline_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.requests
 SET closes_at=created_at+interval '48 hours',
  v2_calendar_revision='invalid_rev';
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'calendar_revision_invalid'
 THEN RAISE EXCEPTION 'v2_24_wrong_revision_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.requests SET v2_calendar_revision='ci_cal_26';
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=now();
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'source_not_eligible'
 THEN RAISE EXCEPTION 'v2_24_revoked_buyer_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=null;
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET activated_at=now()+interval '1 minute';
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'source_not_eligible'
 THEN RAISE EXCEPTION 'v2_24_old_round_allowed: %',v;END IF;
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET activated_at=now()-interval '1 hour';
 IF (SELECT count(*) FROM cotironda_piloto_privado.mock_calls)<>0
 THEN RAISE EXCEPTION 'v2_24_publisher_called_on_blocked_round';END IF;
END $negative$;
DO $positive$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'ready_for_delivery'
 OR v->>'request_id'<>'47c23e65-8985-48c4-85ca-e4a972938afb'
 THEN RAISE EXCEPTION 'v2_24_not_published:%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.mock_calls)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.mock_calls
      WHERE name='approved')<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.mock_calls
      WHERE name='published')<>1
 THEN RAISE EXCEPTION 'v2_24_not_one_atomic_release';END IF;
 UPDATE cotironda_piloto_privado.requests SET state='prepared';
 v:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF v->>'state'<>'source_not_eligible'
 OR (SELECT count(*) FROM cotironda_piloto_privado.mock_calls)<>2
 THEN RAISE EXCEPTION 'v2_24_duplicate_release';END IF;
 RAISE NOTICE 'V2_24_AUTO_RELEASE_GUARDED_PG17_PASS';
END $positive$;
ROLLBACK;
