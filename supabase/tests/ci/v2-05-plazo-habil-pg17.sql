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
 ('la plata','2026-11-09',2026,'Visita papal feriado nacional','DNU 1103/2026 articulo 2, BO 28-09-2026'),
 ('la plata','2026-11-11',2026,'Visita papal feriado Provincia de Buenos Aires','DNU 1103/2026 articulo 4, BO 28-09-2026'),
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
 -- Feriados extraordinarios VERIFICADOS en DNU 1103/2026:
 -- 9 noviembre nacional, 11 noviembre SOLO provincia Buenos Aires.
 -- El martes 10 fue feriado en Córdoba/CABA, NO en La Plata.
 expected:=cotironda_piloto_privado.v2_deadline(
  '2026-11-06T12:00:00Z','la plata');
 IF expected IS DISTINCT FROM '2026-11-12T21:00:00Z'::timestamptz
 THEN RAISE EXCEPTION 'province_special_nov11_not_skipped %',expected;END IF;
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

-- INTEGRACIÓN V2: usar la RPC V2-21 CLONADA y el cálculo REAL V2-05
-- (solo datos sintéticos de feriados), luego instalar V2-24 y liberar
-- UNA ronda. MVP306/MVP222 son stubs SQL para aislar el tramo externo.
-- Esto comprueba compatibilidad de migraciones, no WhatsApp E2E.
ALTER TABLE cotironda_piloto_privado.requests
 ADD COLUMN buyer_key text,ADD COLUMN source_hmac text;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(
 request_id uuid PRIMARY KEY,status text NOT NULL
);
CREATE TABLE cotironda_piloto_privado.pilot_e2e_rehearsal_calls(
 name text NOT NULL,request_id uuid NOT NULL
);
INSERT INTO cotironda_piloto_privado.participants
 (key,participant_role,chat_hmac,consent_at,opted_out_at)
 VALUES('buyer_ci','buyer',repeat('a',64),clock_timestamp(),null);
UPDATE cotironda_piloto_privado.requests
 SET buyer_key='buyer_ci',source_hmac=repeat('b',64)
 WHERE timing_mode='business_two_days';
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 SELECT id,'shadow' FROM cotironda_piloto_privado.requests
 WHERE timing_mode='business_two_days';
CREATE FUNCTION public.cotironda_piloto_ia_auto_release_mvp306(
 p_chat_hmac text,p_source_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mock306$
DECLARE rid uuid;
BEGIN
 SELECT r.id INTO rid
 FROM cotironda_piloto_privado.requests r
 WHERE r.source_hmac=p_source_hmac AND r.buyer_key='buyer_ci'
  AND p_chat_hmac=repeat('a',64) AND r.state='draft';
 IF rid IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 INSERT INTO cotironda_piloto_privado.pilot_e2e_rehearsal_calls(name,request_id)
 VALUES('approved',rid);
 RETURN jsonb_build_object('state','approved','request_id',rid);
END $mock306$;
CREATE FUNCTION public.cotironda_piloto_ia_publish_mvp222(p_request uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mock222$
BEGIN
 INSERT INTO cotironda_piloto_privado.pilot_e2e_rehearsal_calls(name,request_id)
 VALUES('published',p_request);
 UPDATE cotironda_piloto_privado.requests SET state='prepared'
 WHERE id=p_request AND state='draft';
 RETURN jsonb_build_object('state','ready_for_delivery');
END $mock222$;
\ir ../../piloto/v2_24_auto_release_calendar_guarded_candidate.sql
DO $combined_release$
DECLARE r record; response jsonb; legacy_id uuid;
BEGIN
 SELECT * INTO r FROM cotironda_piloto_privado.requests
 WHERE timing_mode='business_two_days';
 IF r.id IS NULL OR r.round_days<>2
  OR r.v2_calendar_revision IS NULL
  OR r.closes_at IS DISTINCT FROM
     cotironda_piloto_privado.v2_deadline(r.created_at,r.delivery_city)
 THEN RAISE EXCEPTION 'PILOT_E2E_REAL_CALENDAR_PREPARE_FAIL';END IF;
 -- La política V2-24 debe instalarse OFF, aunque la V2-05 esté ON.
 response:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF response->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'PILOT_E2E_RELEASE_NOT_OFF';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.pilot_e2e_rehearsal_calls)<>0
 THEN RAISE EXCEPTION 'PILOT_E2E_EXTERNAL_CALL_BEFORE_ACTIVATION';END IF;
 -- Ronda anterior NUNCA se autoriza aunque se active el gate V2.
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET enabled=true,activated_at=clock_timestamp()-interval '2 hours'
 WHERE singleton;
 SELECT id INTO legacy_id FROM cotironda_piloto_privado.requests
 WHERE timing_mode='legacy_calendar';
 IF legacy_id IS NULL THEN RAISE EXCEPTION 'PILOT_E2E_LEGACY_MISSING';END IF;
 response:=public.cotironda_piloto_v2_auto_release_d013(
  repeat('a',64),repeat('c',64));
 IF response->>'state'<>'source_not_eligible'
 THEN RAISE EXCEPTION 'PILOT_E2E_LEGACY_RELEASE_ALLOWED';END IF;
 response:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF response->>'state'<>'ready_for_delivery'
 OR response->>'request_id' IS DISTINCT FROM r.id::text
 THEN RAISE EXCEPTION 'PILOT_E2E_REAL_CALENDAR_RELEASE_FAIL: %',response;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.pilot_e2e_rehearsal_calls
      WHERE request_id=r.id)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.pilot_e2e_rehearsal_calls
      WHERE name='approved')<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.pilot_e2e_rehearsal_calls
      WHERE name='published')<>1
 THEN RAISE EXCEPTION 'PILOT_E2E_NOT_SINGLE_RELEASE';END IF;
 response:=public.cotironda_piloto_v2_auto_release_d013(repeat('a',64),repeat('b',64));
 IF response->>'state'<>'source_not_eligible'
 OR (SELECT count(*) FROM cotironda_piloto_privado.pilot_e2e_rehearsal_calls)<>2
 THEN RAISE EXCEPTION 'PILOT_E2E_DUPLICATE_RELEASE';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests
  WHERE id=legacy_id AND state<>'closed')
 THEN RAISE EXCEPTION 'PILOT_E2E_HISTORICAL_MODIFIED';END IF;
 RAISE NOTICE 'PILOT_E2E_REAL_CALENDAR_AND_RELEASE_PG17_PASS';
END $combined_release$;
ROLLBACK;
