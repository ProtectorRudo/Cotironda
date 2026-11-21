-- D016 — PostgreSQL 17, consentimiento del RESPONSABLE una sola vez,
-- siempre mismo comprador / posterior / sin revocación. 100% SINTÉTICO.
-- Sin datos PILOTO. Reutiliza exclusivamente candidato de PR #853.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,created_at timestamptz,state text);
CREATE TABLE cotironda_piloto_privado.v2_supplier_original_consents(
 supplier_key text,consent_message_hmac text,version text,
 revoked_at timestamptz,accepted_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_original_optout_events(
 supplier_key text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,participant_key text,chat_hmac text,kind text,
 received_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_business_policy(
 singleton boolean,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_d016_owner_original_attestations(
 supplier_key text,request_id uuid,attested_by text,evidence_kind text,
 declaration_sha256 text,revoked_at timestamptz,consent_scope text,
 recorded_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_d016_original_notice_revocations(
 supplier_key text,request_id uuid,revoked_at timestamptz);
\i supabase/piloto/v2_d016_reuse_owner_consent_same_buyer_CANDIDATE.sql
-- Fechas y clientes sintéticos: pruebas de alcance sin datos comerciales.
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('s_one',repeat('a',64),'supplier','2026-11-01 10:00Z',NULL),
 ('s_two',repeat('b',64),'supplier','2026-11-01 10:00Z',NULL),
 ('s_other',repeat('c',64),'supplier','2026-11-01 10:00Z',NULL),
 ('s_direct',repeat('d',64),'supplier','2026-11-01 10:00Z',NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','buyer_one','2026-11-15 13:00Z','cancelled'),
 ('00000000-0000-4000-8000-000000000002','buyer_one','2026-11-16 14:00Z','draft'),
 ('00000000-0000-4000-8000-000000000003','buyer_two','2026-11-16 14:00Z','draft'),
 ('00000000-0000-4000-8000-000000000004','buyer_one','2026-11-15 11:00Z','closed');
INSERT INTO cotironda_piloto_privado.v2_d016_owner_original_attestations VALUES
 ('s_one','00000000-0000-4000-8000-000000000001',
  'responsable_cotironda','declaracion_responsable_en_conversacion',
  repeat('f',64),NULL,'comprador_original_identificado_y_analisis_v2',
  '2026-11-15 19:10Z'),
 ('s_two','00000000-0000-4000-8000-000000000001',
  'responsable_cotironda','declaracion_responsable_en_conversacion',
  repeat('e',64),NULL,'comprador_original_identificado_y_analisis_v2',
  '2026-11-15 19:10Z'),
 ('s_other','00000000-0000-4000-8000-000000000001',
  'responsable_cotironda','declaracion_responsable_en_conversacion',
  repeat('c',64),NULL,'comprador_original_identificado_y_analisis_v2',
  '2026-11-15 19:10Z');
INSERT INTO cotironda_piloto_privado.v2_business_policy
VALUES(true,true,'2026-11-01 00:00Z');
-- Rama independiente: consentimiento directo por mensaje ORIGINAL verificado.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('9',64),'s_direct',repeat('d',64),'text','2026-11-15 19:12Z');
INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents VALUES
 ('s_direct',repeat('9',64),'cotironda-originales-v2',NULL,'2026-11-15 19:12Z');
DO $pg17$
DECLARE r_old uuid:='00000000-0000-4000-8000-000000000001';
r_new uuid:='00000000-0000-4000-8000-000000000002';
r_foreign uuid:='00000000-0000-4000-8000-000000000003';
r_prior uuid:='00000000-0000-4000-8000-000000000004';
invitation timestamptz:='2026-11-16 15:00Z';
BEGIN
 IF (SELECT count(*) FROM cotironda_piloto_privado.participants s
 WHERE s.key IN('s_one','s_two')
 AND cotironda_piloto_privado.v2_d016_effective_original_consent_private(
    s.key,r_new,s.chat_hmac,invitation) IS NOT NULL)<>2
 THEN RAISE EXCEPTION 'reuso_mismo_comprador_falla'; END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one',r_foreign,repeat('a',64),invitation) IS NOT NULL
 THEN RAISE EXCEPTION 'fuga_a_otro_comprador';END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one',r_prior,repeat('a',64),invitation) IS NOT NULL
 THEN RAISE EXCEPTION 'reuso_retroactivo';END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one',r_new,repeat('0',64),invitation) IS NOT NULL
 THEN RAISE EXCEPTION 'chat_incorrecto';END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one',r_new,repeat('a',64),'2026-11-15 18:00Z') IS NOT NULL
 THEN RAISE EXCEPTION 'reuso_antes_de_constancia';END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_direct',r_new,repeat('d',64),invitation) IS NULL
 THEN RAISE EXCEPTION 'rama_whatsapp_original_regresion';END IF;
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one',r_old,repeat('a',64),invitation) IS NULL
 THEN RAISE EXCEPTION 'rama_ronda_original_regresion';END IF;
END $pg17$;
-- Todas las variantes de revocación son fail-closed.
UPDATE cotironda_piloto_privado.v2_d016_owner_original_attestations
SET revoked_at='2026-11-16 14:10Z' WHERE supplier_key='s_one';
DO $pg17$ BEGIN
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one','00000000-0000-4000-8000-000000000002',repeat('a',64),'2026-11-16 15:00Z') IS NOT NULL
 THEN RAISE EXCEPTION 'constancia_revocada_aceptada';END IF;
END $pg17$;
UPDATE cotironda_piloto_privado.v2_d016_owner_original_attestations
SET revoked_at=NULL WHERE supplier_key='s_one';
INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_revocations
VALUES ('s_one','00000000-0000-4000-8000-000000000001','2026-11-16 14:20Z');
DO $pg17$ BEGIN
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one','00000000-0000-4000-8000-000000000002',repeat('a',64),'2026-11-16 15:00Z') IS NOT NULL
 THEN RAISE EXCEPTION 'aviso_revocado_aceptado';END IF;
END $pg17$;
DELETE FROM cotironda_piloto_privado.v2_d016_original_notice_revocations;
INSERT INTO cotironda_piloto_privado.v2_d016_supplier_original_optout_events
VALUES ('s_one');
DO $pg17$ BEGIN
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one','00000000-0000-4000-8000-000000000002',repeat('a',64),'2026-11-16 15:00Z') IS NOT NULL
 THEN RAISE EXCEPTION 'optout_global_aceptado';END IF;
END $pg17$;
DELETE FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events;
UPDATE cotironda_piloto_privado.v2_d016_owner_original_attestations
SET declaration_sha256='invalid' WHERE supplier_key='s_one';
DO $pg17$ BEGIN
 IF cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 's_one','00000000-0000-4000-8000-000000000002',repeat('a',64),'2026-11-16 15:00Z') IS NOT NULL
 THEN RAISE EXCEPTION 'hash_invalido_aceptado';END IF;
END $pg17$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL AS rollback_ok;
