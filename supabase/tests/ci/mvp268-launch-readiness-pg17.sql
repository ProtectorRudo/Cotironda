-- MVP268 isolated PG17 CI: never connects to the real pilot. ROLLBACK.
BEGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobname text,active boolean,schedule text);
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.ai_central_control_mvp226(
 enabled boolean);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222(
 enabled boolean);
CREATE TABLE cotironda_piloto_privado.ai_trial_control_mvp229(
 enabled boolean);
CREATE TABLE cotironda_piloto_privado.original_share_policy_mvp178(
 enabled boolean);
CREATE TABLE cotironda_piloto_privado.requests(id uuid,state text);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(state text);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(state text);
INSERT INTO cotironda_piloto_privado.ai_central_control_mvp226 VALUES(false);
INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222 VALUES(false);
INSERT INTO cotironda_piloto_privado.ai_trial_control_mvp229 VALUES(false);
INSERT INTO cotironda_piloto_privado.original_share_policy_mvp178 VALUES(false);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('10000000-0000-4000-8000-000000000001','prepared');
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES('api_accepted');
INSERT INTO cron.job VALUES('cotironda_piloto_close_due_5min',true,'*/5 * * * *');
-- Snapshot A: safe baseline, no optional modules installed, no Auth accounts.
-- The actual pg_cron extension is absent from postgres:17-alpine;
-- the checker MUST fail closed about full schema installation and E2E.
\ir ../../piloto/mvp268_launch_readiness_readonly.sql
-- Snapshot B: an unsafe mixed system; nothing in the audit may activate it.
UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222 SET enabled=true;
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES('uncertain');
INSERT INTO cron.job VALUES('cotironda_piloto_mvp263_supervisor',true,'*/15 * * * *');
\ir ../../piloto/mvp268_launch_readiness_readonly.sql
ROLLBACK;
