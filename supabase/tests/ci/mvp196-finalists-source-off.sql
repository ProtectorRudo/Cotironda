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
 'public.cotironda_piloto_commercial_queue_due_mvp196(integer)'
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
 IF public.cotironda_piloto_source_plan_sendable_mvp196(null) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'nullable_send_guard_fails_open';END IF;
 IF public.cotironda_piloto_commercial_due_mvp196(1)->>'state'<>'pilot_finalist_off'
 THEN RAISE EXCEPTION 'disabled_activation_was_ignored';END IF;
 IF public.cotironda_piloto_commercial_queue_due_mvp196(1)->>'state'<>'pilot_finalist_off'
 THEN RAISE EXCEPTION 'disabled_queue_gate_was_ignored';END IF;
 IF public.cotironda_piloto_commit_commercial_plan_mvp196(null,null,null)->>'state'<>'invalid_plan'
 THEN RAISE EXCEPTION 'null_commit_was_accepted';END IF;
END$$;
ROLLBACK;
