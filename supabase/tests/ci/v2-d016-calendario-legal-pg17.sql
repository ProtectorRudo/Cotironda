-- Cotironda D016 PG17: calendario legal de La Plata 2026 NO aprobado.
-- Ejecutar desde raíz por psql. BEGIN/ROLLBACK: cero escrituras persistentes.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets(
 name text PRIMARY KEY,decrypted_secret text NOT NULL
);
-- Valor no secreto: el piloto se verifica por ID dentro de la fuente.
INSERT INTO vault.decrypted_secrets VALUES(
 'cotironda_d016_pilot_project_ref','ilggkalaafhtiysyzlmg'
);
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 timing_mode text,
 delivery_city text,
 v2_calendar_revision text
);
CREATE TABLE cotironda_piloto_privado.v2_business_calendar(
 locality text NOT NULL
  CHECK(locality ~ '^[[:alpha:]][[:alpha:] .-]{2,79}$'
    AND locality=lower(btrim(locality))),
 year integer NOT NULL CHECK(year BETWEEN 2026 AND 2100),
 revision text NOT NULL CHECK(revision ~ '^[a-z0-9_-]{4,50}$'),
 source_note text NOT NULL CHECK(length(source_note) BETWEEN 8 AND 300),
 approved_at timestamptz,
 PRIMARY KEY(locality,year)
);
CREATE TABLE cotironda_piloto_privado.v2_business_holidays(
 locality text NOT NULL,
 day date NOT NULL,
 calendar_year integer NOT NULL CHECK(calendar_year BETWEEN 2026 AND 2100),
 description text NOT NULL CHECK(length(description) BETWEEN 4 AND 200),
 evidence text NOT NULL CHECK(length(evidence) BETWEEN 8 AND 300),
 PRIMARY KEY(locality,day),
 FOREIGN KEY(locality,calendar_year)
  REFERENCES cotironda_piloto_privado.v2_business_calendar(locality,year)
);
\ir ../../piloto/v2_d016_calendario_la_plata_2026_CANDIDATE.sql

DO $check$
DECLARE c record;start_day date;goal date;d date;n integer;
BEGIN
 SELECT * INTO c FROM cotironda_piloto_privado.v2_business_calendar
 WHERE locality='la plata' AND year=2026;
 IF NOT FOUND OR c.approved_at IS NOT NULL OR
  c.revision<>'lp_v2_r1'
 THEN RAISE EXCEPTION 'd016_calendar_autopublished_or_revision_wrong'; END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_business_holidays)<>18
 THEN RAISE EXCEPTION 'd016_holidays_count_wrong'; END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar
  WHERE year=2027)
 THEN RAISE EXCEPTION 'd016_unapproved_2027_invented'; END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays h
  WHERE h.day IN (
   DATE '2026-03-23',DATE '2026-07-10',DATE '2026-11-10',
   DATE '2026-11-19',DATE '2026-11-20',DATE '2026-12-07'
  )
 ) THEN RAISE EXCEPTION 'd016_optional_non_workday_as_mandatory'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE day=DATE '2026-11-11') OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE day=DATE '2026-11-23')
 THEN RAISE EXCEPTION 'd016_special_ba_or_sovereignty_missing';END IF;

 -- Casos B2B concretos, fecha local de creación -> segundo día hábil:
 -- Viernes 13: lun 16 + mar 17.
 -- Jueves 19 (optativo): vie 20 + mar 24 (lunes 23 nacional).
 -- Viernes 20: mar 24 + mie 25.
 -- Lunes 9: mar 10 + jue 12 (mié 11 feriado específico PBA).
 FOR c IN SELECT * FROM (
  VALUES
   (DATE '2026-11-13',DATE '2026-11-17'),
   (DATE '2026-11-19',DATE '2026-11-24'),
   (DATE '2026-11-20',DATE '2026-11-25'),
   (DATE '2026-11-09',DATE '2026-11-12'),
   (DATE '2026-12-24',DATE '2026-12-29')
 ) AS examples(created_day,expected_close_day)
 LOOP
  start_day:=c.created_day;goal:=c.expected_close_day;
  d:=start_day;n:=0;
  FOR counter IN 1..10 LOOP
   d:=d+1;
   IF extract(isodow from d)::integer IN (6,7) OR EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
    WHERE day=d AND locality='la plata'
   ) THEN CONTINUE;END IF;
   n:=n+1;
   EXIT WHEN n=2;
  END LOOP;
  IF d<>goal THEN
   RAISE EXCEPTION 'd016_calendar_example_mismatch: % -> %, expected %',
    start_day,d,goal;
  END IF;
 END LOOP;
 RAISE NOTICE 'V2_D016_LA_PLATA_2026_LEGAL_CALENDAR_PG17_PASS';
END $check$;
ROLLBACK;
-- No quedan tablas, calendarios ni resultados guardados fuera de la transacción.
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL AS clean_rollback;
