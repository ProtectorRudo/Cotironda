-- COTIRONDA V2 D016 — CANDIDATO 2026 LA PLATA, SIN APROBAR.
-- NO EJECUTAR sin autorización «Publicalo» SOLO cotironda-piloto.
-- NO es migración automática. Código preparado con normas oficiales,
-- criterio B2B: solo feriados nacionales y excepciones OBLIGATORIAS PBA.
-- La administración deberá auditar feriados locales, calendario
-- completo y reglas del mercado ANTES de aprobar este registro.
-- Precisión: día no laborable NO equivale a feriado comercial obligatorio.
--
-- Fuentes oficiales verificadas 13/11/2026:
-- https://www.tfaba.gov.ar/Apartados/feriados.asp (fecha trasladada 23/11)
-- https://www.argentina.gob.ar/normativa/nacional/norma-430580/texto
-- https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224
-- https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-164-2025-421799
--
-- NO BLOQUEAR automáticamente estas fechas optativas/no laborables:
-- 2026-03-23, 2026-07-10, 2026-12-07 (turísticos opcionales para comercio)
-- 2026-11-19 (aniversario local; comercio optativo Res. 516/2026)
-- NO bloquear 2026-11-10 (feriado CABA/Córdoba, NO PBA)
-- NO bloquear 2026-11-20 (Soberanía trasladado al 23/11)
-- No confundir asuetos universitarios/administrativos con corralones.
--
-- 2027 NO INCLUIDO: debe existir calendario 2027 con SAME revision y
-- approved_at <= requests.created_at si una ronda cruza el 01/01/2027.
-- Datos históricos de 2026 no se reescriben. Nunca backdate approved_at.
-- No se envían mensajes, ni se cambian políticas V2 ni crons.
-- Ejecutar envuelto en transacción externamente tras autorización.
-- CI lo importa dentro de BEGIN/ROLLBACK para que no escriba datos reales.
DO $d016_lp_preflight$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
   AND decrypted_secret='ilggkalaafhtiysyzlmg'
 ) THEN RAISE EXCEPTION 'D016_NOT_PILOT_PROJECT';END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar
  WHERE locality='la plata' AND year=2026
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE locality='la plata' AND calendar_year=2026
 ) THEN RAISE EXCEPTION 'D016_CALENDAR_EXISTS_REVIEW_MANUALLY';END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.requests
  WHERE timing_mode='business_two_days' AND
   delivery_city ILIKE 'la plata' AND
   v2_calendar_revision='lp_v2_r1'
 ) THEN RAISE EXCEPTION 'D016_CALENDAR_REVISION_ALREADY_USED';END IF;
END $d016_lp_preflight$;

INSERT INTO cotironda_piloto_privado.v2_business_calendar(
 locality,year,revision,source_note,approved_at
) VALUES(
 'la plata',2026,'lp_v2_r1',
 'CANDIDATO NO APROBADO: feriados nacionales obligatorios + PBA 11/11/2026; TFABA 2026, DNU 1103/2026, Res. 516/2026. Días turísticos y locales optativos excluidos.',
 NULL
);

INSERT INTO cotironda_piloto_privado.v2_business_holidays(
 locality,day,calendar_year,description,evidence
) VALUES
 ('la plata', DATE '2026-01-01',2026,'Año Nuevo', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-02-16',2026,'Carnaval lunes', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-02-17',2026,'Carnaval martes', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-03-24',2026,'Día Nacional de la Memoria', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-04-02',2026,'Malvinas y Jueves Santo', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-04-03',2026,'Viernes Santo', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-05-01',2026,'Día del Trabajador', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-05-25',2026,'Revolución de Mayo', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-06-15',2026,'Gral. Martín Miguel de Güemes trasladado', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-06-20',2026,'Paso a la Inmortalidad de Manuel Belgrano', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-07-09',2026,'Día de la Independencia', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-08-17',2026,'Gral. José de San Martín', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-10-12',2026,'Diversidad Cultural', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-11-09',2026,'Visita de León XIV; feriado nacional', 'https://www.argentina.gob.ar/normativa/nacional/norma-430580/texto'),
 ('la plata', DATE '2026-11-11',2026,'Visita de León XIV; feriado Provincia de Buenos Aires', 'https://www.argentina.gob.ar/normativa/nacional/norma-430580/texto'),
 ('la plata', DATE '2026-11-23',2026,'Soberanía Nacional trasladado desde 20/11', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-12-08',2026,'Inmaculada Concepción', 'https://www.tfaba.gov.ar/Apartados/feriados.asp'),
 ('la plata', DATE '2026-12-25',2026,'Navidad', 'https://www.tfaba.gov.ar/Apartados/feriados.asp');

DO $d016_lp_verify$
DECLARE v_count integer;
BEGIN
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.v2_business_holidays
 WHERE locality='la plata' AND calendar_year=2026;
 IF v_count<>18 THEN
  RAISE EXCEPTION 'D016_LP_EXPECTED_18_DATES_GOT_%',v_count;
 END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE locality='la plata' AND day IN
   ('2026-03-23','2026-07-10','2026-11-10',
    '2026-11-19','2026-11-20','2026-12-07')
 ) THEN
  RAISE EXCEPTION 'D016_LP_OPTIONAL_OR_OTHER_ZONE_DATE_INCLUDED';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE locality='la plata' AND day='2026-11-11'
 ) OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays
  WHERE locality='la plata' AND day='2026-11-23'
 ) THEN RAISE EXCEPTION 'D016_LP_REQUIRED_HOLIDAY_MISSING';END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar
  WHERE locality='la plata' AND year=2026 AND approved_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'D016_LP_CANDIDATE_PREAPPROVED';END IF;
END $d016_lp_verify$;
-- Sigue SIN APROBAR. El APPROVED_AT sólo podrá fijarse luego de
-- una segunda decisión comercial y auditoría bajo «Publicalo» PILOTO.
