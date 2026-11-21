-- Cotironda D016: limpieza controlada de objetos vacíos duplicados.
-- Fixtures sintéticos: PR #846 canónico sobrevive, #847 se retira.
BEGIN;
CREATE SCHEMA cotironda_piloto_privado;
-- Objetos canónicos de #846: deben quedar INTACTOS.
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_policy(
 singleton boolean PRIMARY KEY,enabled boolean,
 terms_version text,body_sha256 text,approved_at timestamptz,
 approval_reference text);
INSERT INTO cotironda_piloto_privado.v2_d016_supplier_terms_policy
 VALUES(true,false,'cotironda-originales-v2',NULL,NULL,NULL);
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_deliveries(
 id uuid PRIMARY KEY,supplier_key text);
CREATE FUNCTION public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 text,text,text,text,timestamptz
) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 text,text
) RETURNS text LANGUAGE sql AS $$ SELECT 'denied'::text $$;
-- Objetos duplicados de #847 que se instalaron vacíos en el piloto.
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_approval(
 version text PRIMARY KEY,terms_sha256 text);
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_notices(
 id uuid PRIMARY KEY);
CREATE FUNCTION public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 text,text,text,boolean
) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 uuid,text,text
) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 text,text,text
) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;

\ir ../../piloto/v2_d016_drop_duplicate_signup_only_CANDIDATE.sql

DO $clean$
BEGIN
 IF to_regclass('cotironda_piloto_privado.v2_d016_supplier_terms_approval') IS NOT NULL
 OR to_regclass('cotironda_piloto_privado.v2_d016_supplier_terms_notices') IS NOT NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_accept_signup_terms_private(text,text,text,boolean)') IS NOT NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_confirm_signup_notice_private(uuid,text,text)') IS NOT NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_reserve_signup_terms_private(text,text,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'D016_DUPLICATE_SIGNUP_OBJECTS_NOT_REMOVED';END IF;
 IF to_regclass('cotironda_piloto_privado.v2_d016_supplier_terms_policy') IS NULL
 OR to_regclass('cotironda_piloto_privado.v2_d016_supplier_terms_deliveries') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_record_terms_delivery_private(text,text,text,text,timestamptz)') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)') IS NULL
 THEN RAISE EXCEPTION 'D016_CANONICAL_SIGNUP_OBJECT_REMOVED';END IF;
 IF (SELECT enabled FROM cotironda_piloto_privado.v2_d016_supplier_terms_policy
 WHERE singleton=true) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'D016_CANONICAL_DISABLED_POLICY_MUTATED';END IF;
 RAISE NOTICE 'D016_SINGLE_SUPPLIER_SIGNUP_CLEANUP_PG17_PASS';
END $clean$;
ROLLBACK;
