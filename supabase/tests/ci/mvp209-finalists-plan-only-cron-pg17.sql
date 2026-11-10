-- MVP209 · PG17 AISLADO · 100% TEST DOUBLE · NUNCA contra PILOTO.
-- Simula net.http_post escribiendo SOLO en una tabla local de prueba.
-- Los secretos son FICTICIOS y todo termina en ROLLBACK.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
   THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
   THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
   THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA IF NOT EXISTS cotironda_piloto_privado;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE cotironda_piloto_privado.finalist_activation_mvp113(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
INSERT INTO cotironda_piloto_privado.finalist_activation_mvp113
 VALUES(true,false,null);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,created_at timestamptz,
 closes_at timestamptz,state text);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 request_id uuid);
CREATE TABLE cotironda_piloto_privado.finalist_coverage_plans_mvp108(
 request_id uuid);
CREATE TABLE cotironda_piloto_privado.finalist_source_plans_mvp196(
 request_id uuid);
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,
 decrypted_secret text);
INSERT INTO vault.decrypted_secrets
 VALUES('cotironda_piloto_finalists_plan_only_v1',repeat('f',96));
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE ret bigint;
BEGIN
 INSERT INTO cron.job(jobname,schedule,command)
 VALUES(p_name,p_schedule,p_command) RETURNING jobid INTO ret;
 RETURN ret;
END;$fn$;
-- All RPCs below are stubs used solely for signature existence checks.
CREATE FUNCTION public.cotironda_piloto_close_due_v1(integer)
 RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.cotironda_piloto_commercial_due_mvp196(integer)
 RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196(
 uuid,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;

CREATE TABLE net.test_requests(
 request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 url text,body jsonb,headers jsonb,timeout_ms integer);
CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}'::jsonb,
 params jsonb DEFAULT '{}'::jsonb,headers jsonb DEFAULT '{}'::jsonb,
 timeout_milliseconds integer DEFAULT 2000)
 RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE ret bigint;
BEGIN
 INSERT INTO net.test_requests(url,body,headers,timeout_ms)
 VALUES($1,$2,$4,$5)
 RETURNING request_id INTO ret;
 RETURN ret;
END;$fn$;

\ir ../../piloto/mvp209_finalists_plan_only_cron.sql

DO $test$
DECLARE old_id uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c901';
 new_id uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c902';
 t timestamptz:=clock_timestamp();
 r jsonb;
BEGIN
 IF (SELECT count(*) FROM cron.job
     WHERE jobname='cotironda_piloto_finalists_plan_only_5min'
       AND schedule='*/5 * * * *'
       AND command='SELECT public.cotironda_piloto_finalists_plan_tick_mvp209();')<>1
 THEN RAISE EXCEPTION 'mvp209_cron_missing_or_wrong'; END IF;
 IF has_function_privilege('anon',
    'public.cotironda_piloto_finalists_plan_tick_mvp209()','EXECUTE')
    OR has_function_privilege('authenticated',
    'public.cotironda_piloto_finalists_plan_tick_mvp209()','EXECUTE')
    OR has_function_privilege('service_role',
    'public.cotironda_piloto_finalists_plan_tick_mvp209()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp209_scheduler_exposed_publicly'; END IF;
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'idle_no_eligible_round' THEN
  RAISE EXCEPTION 'mvp209_wrong_off_result'; END IF;

 -- A previously closed legacy round must never trigger a plan call.
 INSERT INTO cotironda_piloto_privado.requests
 VALUES(old_id,t-interval '6 days',t-interval '1 day','closed');
 UPDATE cotironda_piloto_privado.finalist_activation_mvp113
 SET enabled=true,activated_at=t-interval '1 hour' WHERE only_row;
 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES(old_id);
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'idle_no_eligible_round' OR
  (SELECT count(*) FROM net.test_requests)<>0
 THEN RAISE EXCEPTION 'mvp209_old_round_leaked'; END IF;

 -- A new round with NO supplier quote must not invoke the network.
 INSERT INTO cotironda_piloto_privado.requests
 VALUES(new_id,t-interval '30 minutes',t-interval '1 minute','closed');
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'idle_no_eligible_round' THEN
  RAISE EXCEPTION 'mvp209_empty_round_triggered'; END IF;

 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 VALUES(new_id);
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'plan_only_http_queued'
    OR r->>'messages_sent'<>'false'
    OR r->>'contacts_revealed'<>'false'
    OR (SELECT count(*) FROM net.test_requests)<>1
 THEN RAISE EXCEPTION 'mvp209_plan_only_tick_not_queued: state=%, network_records=%',
    r->>'state'||'/'||coalesce(r->>'error_code','-'),(SELECT count(*) FROM net.test_requests); END IF;
 IF NOT EXISTS(
  SELECT 1 FROM net.test_requests
  WHERE url='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-finalistas'
    AND headers->>'x-cotironda-finalist-plan-secret'=repeat('f',96)
    AND NOT headers ? 'x-cotironda-finalist-worker-secret'
    AND NOT headers ? 'Authorization'
    AND body='{}'::jsonb AND timeout_ms=20000
 ) THEN RAISE EXCEPTION 'mvp209_not_dedicated_safe_plan_call'; END IF;

 UPDATE cotironda_piloto_privado.finalist_activation_mvp113
 SET enabled=false,activated_at=null WHERE only_row;
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'idle_no_eligible_round'
   OR (SELECT count(*) FROM net.test_requests)<>1
 THEN RAISE EXCEPTION 'mvp209_shutdown_must_stop_http'; END IF;
 UPDATE cotironda_piloto_privado.finalist_activation_mvp113
 SET enabled=true,activated_at=t-interval '1 hour' WHERE only_row;
 UPDATE vault.decrypted_secrets SET decrypted_secret='corrupted';
 r:=public.cotironda_piloto_finalists_plan_tick_mvp209();
 IF r->>'state'<>'plan_secret_unavailable'
   OR (SELECT count(*) FROM net.test_requests)<>1
 THEN RAISE EXCEPTION 'mvp209_missing_secret_must_stop_http'; END IF;
END$test$;
ROLLBACK;
