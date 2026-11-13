-- PostgreSQL17 self-contained synthetic. Everything rolled back.
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
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE cotironda_piloto_privado.whapi_inbox(message_hmac text PRIMARY KEY);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_city text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 round_days smallint NOT NULL DEFAULT 4,
 closes_at timestamptz NOT NULL DEFAULT now()+interval '4 days',
 state text NOT NULL DEFAULT 'draft',
 closed_at timestamptz,
 CONSTRAINT requests_round_days_check CHECK(round_days BETWEEN 3 AND 7),
 CONSTRAINT requests_exact_duration_check CHECK(
  EXTRACT(epoch FROM closes_at-created_at)=(round_days*86400)::numeric)
);
INSERT INTO cotironda_piloto_privado.requests(
 delivery_city,created_at,round_days,closes_at,state)
 VALUES('La Plata','2026-11-02T12:00:00Z',4,
 '2026-11-06T12:00:00Z','closed');

-- Install exact baseline function in this disposable PG17 transaction.
\ir ../fixtures/v2-d013-shadow-prepare-baseline.sql
-- V2-21 MUST fork to its own RPC without modifying historical M221.
\ir ../../piloto/v2_21_d013_ruteo_v2_rpc_aislado_candidate.sql
DO $isolation$
DECLARE
 v_old regprocedure:='public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure;
 v_new regprocedure:='public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)'::regprocedure;
 v_src text;
BEGIN
 IF encode(extensions.digest(convert_to(pg_get_functiondef(v_old),'UTF8'),'sha256'),'hex')
 <> 'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'v2_21_historical_function_modified';END IF;
 v_src:=pg_get_functiondef(v_new);
 IF position('v_match->>''rubroCatalogo'' NOT IN' IN v_src)=0
 OR position('v_match->>''rubroCatalogo'' IS DISTINCT FROM' IN v_src)>0
 OR position('c.literal_description=v_original_catalogue' IN v_src)=0
 OR position('c.participant_key=v_supplier' IN v_src)=0
 OR position('lower(btrim(p.delivery_city))=lower(btrim(p_city))' IN v_src)=0
 THEN RAISE EXCEPTION 'v2_21_clone_contract_invalid';END IF;
 IF has_function_privilege('anon',v_new,'EXECUTE')
 OR has_function_privilege('authenticated',v_new,'EXECUTE')
 OR NOT has_function_privilege('service_role',v_new,'EXECUTE')
 THEN RAISE EXCEPTION 'v2_21_clone_acl_failed';END IF;
 RAISE NOTICE 'V2_21_LEGACY_UNCHANGED_V2_CLONE_PRIVATE_PASS';
END $isolation$;
-- V2-22: the calendar MUST patch the isolated V2 RPC ONLY.
-- The earlier in-place D013 patch is NEVER run even in this CI smoke.
\ir ../../piloto/v2_05_plazo_dos_dias_habiles_candidate.sql
\ir ../../piloto/v2_05_shadow_prepare_activar_modo_habil.sql
DO $combined$
DECLARE
 v_historical regprocedure:='public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure;
 v_v2 regprocedure:='public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)'::regprocedure;
 v_old text;v_new text;
BEGIN
 v_old:=pg_get_functiondef(v_historical);
 v_new:=pg_get_functiondef(v_v2);
 IF encode(extensions.digest(convert_to(v_old,'UTF8'),'sha256'),'hex')
 <>'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 OR position('v_match->>''rubroCatalogo'' IS DISTINCT FROM' IN v_old)=0
 OR position('v2_business_policy policy' IN v_old)>0
 OR position('timing_mode)' IN v_old)>0
 THEN RAISE EXCEPTION 'V2_22_LEGACY_MUTATED';END IF;
 IF position('v2_business_policy policy' IN v_new)=0
 OR position('v_match->>''rubroCatalogo'' NOT IN' IN v_new)=0
 OR position('timing_mode)' IN v_new)=0
 OR position('c.literal_description=v_original_catalogue' IN v_new)=0
 OR position('c.participant_key=v_supplier' IN v_new)=0
 OR position('lower(btrim(p.delivery_city))=lower(btrim(p_city))' IN v_new)=0
 THEN RAISE EXCEPTION 'V2_22_COMBINED_CLOCK_AND_CATALOG_INVALID';END IF;
 IF has_function_privilege('anon',v_v2,'EXECUTE')
 OR has_function_privilege('authenticated',v_v2,'EXECUTE')
 OR NOT has_function_privilege('service_role',v_v2,'EXECUTE')
 THEN RAISE EXCEPTION 'V2_22_ACL_NOT_PRIVATE';END IF;
 RAISE NOTICE 'V2_22_CALENDAR_D013_COMPOSED_IN_V2_RPC_ONLY_PASS';
END $combined$;

DO $check$
DECLARE v_count int;
BEGIN
 SELECT count(*) INTO v_count FROM cotironda_piloto_privado.requests
 WHERE timing_mode='legacy_calendar'
 AND round_days=4
 AND closes_at='2026-11-06T12:00:00Z';
 IF v_count<>1 THEN RAISE EXCEPTION 'legacy altered'; END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE enabled=true) THEN RAISE EXCEPTION 'policy enabled by default'; END IF;

 BEGIN
 INSERT INTO cotironda_piloto_privado.requests(delivery_city,timing_mode)
 VALUES('La Plata','business_two_days');
 RAISE EXCEPTION 'POLICY_OFF_DID_NOT_BLOCK';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='POLICY_OFF_DID_NOT_BLOCK'
   THEN RAISE; END IF;
 END;
 -- No holidays/coverage => NULL; NEVER assume none.
 IF cotironda_piloto_privado.v2_deadline(
  '2026-11-12T12:00:00Z','la plata') IS NOT NULL
 THEN RAISE EXCEPTION 'unknown_holidays_must_block';END IF;
END $check$;
INSERT INTO cotironda_piloto_privado.v2_business_calendar(
 locality,year,revision,source_note,approved_at) VALUES
 ('la plata',2026,'verif_2026','Fixture sintetica anual NO real',clock_timestamp()),
 ('la plata',2027,'verif_2027','Fixture sintetica anual NO real',clock_timestamp());
INSERT INTO cotironda_piloto_privado.v2_business_holidays(
 locality,day,calendar_year,description,evidence) VALUES
 ('la plata','2026-11-16',2026,'Feriado ficticio caso de prueba','Fixture sintética'),
 ('la plata','2026-11-23',2026,'Día de la Soberanía Nacional','BCRA listado oficial 2026'),
 ('la plata','2026-12-08',2026,'Inmaculada Concepción','BCRA listado oficial 2026'),
 ('la plata','2026-12-25',2026,'Navidad','BCRA listado oficial 2026'),
 ('la plata','2027-01-01',2027,'Año nuevo caso de prueba','Fixture sintética');

DO $cases$
DECLARE
 expected timestamptz;
 changed timestamptz;
 inserted uuid;
 original timestamptz;
BEGIN
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-11-12T12:00:00Z','La Plata');
 IF expected IS DISTINCT FROM '2026-11-17T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'thu+two business days holiday %',expected;END IF;
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-11-13T14:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2026-11-18T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'fri weekend holiday %',expected;END IF;
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-12-30T13:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2027-01-04T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'year roll holiday %',expected;END IF;
 IF cotironda_piloto_privado.v2_deadline(
  '2026-11-12T12:00:00Z','berisso') IS NOT NULL
 THEN RAISE EXCEPTION 'unapproved city allowed';END IF;
 -- Nov 19 is local optativo for COMMERCE and NOT an automatic holiday.
 -- Nov 23 is a mandatory national holiday.
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-11-18T12:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2026-11-20T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'optativo_local_not_automatically_blocked %',expected; END IF;
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-11-20T12:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2026-11-25T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'national_nov23_not_skipped %',expected; END IF;
 -- Dec 7 is a day NON-working for tourism (optional in business policy),
 -- Dec 8 is a mandatory holiday. Do not silently mark Dec 7 mandatory.
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-12-04T12:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2026-12-09T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'tourism_optional_vs_dec8_national %',expected; END IF;


 UPDATE cotironda_piloto_privado.v2_business_policy
 SET enabled=true,activated_at=now() WHERE singleton=true;
 INSERT INTO cotironda_piloto_privado.requests(delivery_city,timing_mode)
 VALUES('La Plata','business_two_days')
 RETURNING id,closes_at INTO inserted,changed;
 expected:=cotironda_piloto_privado.v2_deadline(now(),'la plata');
 IF changed IS DISTINCT FROM expected
 OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.requests
  WHERE id=inserted AND timing_mode='business_two_days'
   AND round_days=2 AND v2_calendar_revision IS NOT NULL
 )
 THEN RAISE EXCEPTION 'v2 insert wrong deadline';END IF;
 BEGIN
  UPDATE cotironda_piloto_privado.requests
  SET timing_mode='legacy_calendar' WHERE id=inserted;
  RAISE EXCEPTION 'V2_MODE_IMMUTABILITY_BROKEN';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='V2_MODE_IMMUTABILITY_BROKEN' THEN RAISE;END IF;
 END;

 BEGIN
  INSERT INTO cotironda_piloto_privado.v2_business_holidays(
   locality,day,calendar_year,description,evidence)
  VALUES('la plata','2026-12-25',2027,'Wrong year intentionally','Fixture synthetic');
  RAISE EXCEPTION 'YEAR_SPOOF_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='YEAR_SPOOF_ALLOWED' THEN RAISE;END IF;
 END;
 RAISE NOTICE 'V2_TWO_BUSINESS_DAYS_PG17_PASS';
END $cases$;
ROLLBACK;
