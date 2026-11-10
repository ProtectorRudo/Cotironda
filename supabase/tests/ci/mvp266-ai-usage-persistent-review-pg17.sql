-- MVP266: synthetic PostgreSQL 17 test, no real actors/AI/payments. ROLLBACK.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,participant_key text,chat_hmac text
);
CREATE TABLE cotironda_piloto_privado.ai_central_attempts_mvp226(
 message_hmac text PRIMARY KEY,buyer_key text,chat_hmac text,state text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,supplier_key text,state text
);
CREATE TABLE cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref uuid PRIMARY KEY,active boolean,revoked_at timestamptz,role text
);
\ir ../../piloto/mvp264_openai_usage_meters.sql
\ir ../../piloto/mvp266_openai_unknown_persistent_review.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a',repeat('a',64),'buyer',clock_timestamp(),NULL),
 ('buyer_b',repeat('b',64),'buyer',clock_timestamp(),NULL);
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),'buyer_a',repeat('a',64)),
 (repeat('2',64),'buyer_b',repeat('b',64));
INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226 VALUES
 (repeat('1',64),'buyer_a',repeat('a',64),'reserved'),
 (repeat('2',64),'buyer_b',repeat('b',64),'reserved');
INSERT INTO cotironda_piloto_privado.supervisor_operators_mvp265 VALUES
 ('00000000-0000-4000-8000-000000000010',true,NULL,'incident_manager'),
 ('00000000-0000-4000-8000-000000000011',false,NULL,'incident_manager');

DO $cases$
DECLARE v jsonb;ep uuid:='00000000-0000-4000-8000-000000000010';
BEGIN
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),1,'gpt-6-luna');
 IF v->>'state'<>'reserved' THEN RAISE EXCEPTION 'reserve_a_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),1,'unmetered','network_uncertain',
  NULL,NULL,NULL,NULL);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'unknown_a_%',v;END IF;
 -- Original MVP264 let this unknown expire after 24 hours: the regression.
 UPDATE cotironda_piloto_privado.ai_usage_calls_mvp264
 SET started_at=clock_timestamp()-interval '48 hours'
 WHERE message_hmac=repeat('1',64) AND call_no=1;
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),2,'gpt-6-luna');
 IF v->>'state'<>'usage_unknown_blocked' THEN
  RAISE EXCEPTION 'unknown_expired_into_free_calls_%',v;END IF;
 -- Another company must stay available.
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('2',64),repeat('b',64),1,'gpt-6-luna');
 IF v->>'state'<>'reserved' THEN RAISE EXCEPTION 'cross_buyer_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),1,'00000000-0000-4000-8000-000000000011',
  'financial_exposure_accepted',repeat('e',64));
 IF v->>'state'<>'operator_not_authorized' THEN
  RAISE EXCEPTION 'inactive_operator_review_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),1,ep,'financial_exposure_accepted','bad_hash');
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'unfounded_review_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),1,ep,'financial_exposure_accepted',repeat('e',64));
 IF v->>'state'<>'reviewed_private'
 OR v->>'usage_observed'<>'false'
 OR v->>'monetary_cost_verified'<>'false'
 OR v->>'unknown_usage_is_zero'<>'false'
 THEN RAISE EXCEPTION 'invented_money_in_review_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),1,ep,'financial_exposure_accepted',repeat('f',64));
 IF v->>'state'<>'already_reviewed' THEN
  RAISE EXCEPTION 'review_not_immutable_%',v;END IF;
 IF (SELECT state FROM cotironda_piloto_privado.ai_usage_calls_mvp264
  WHERE message_hmac=repeat('1',64) AND call_no=1)<>'unmetered'
 THEN RAISE EXCEPTION 'review_falsified_consumption';END IF;
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),2,'gpt-6-luna');
 IF v->>'state'<>'reserved' THEN
  RAISE EXCEPTION 'review_could_not_release_%',v;END IF;
 -- In-flight calls cannot be waived while they may still be running.
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),2,ep,'provider_usage_reviewed',repeat('f',64));
 IF v->>'state'<>'still_in_flight'
 THEN RAISE EXCEPTION 'premature_release_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),3,'gpt-6-luna');
 IF v->>'state'<>'usage_unknown_blocked'
 THEN RAISE EXCEPTION 'stale_reserved_did_not_block_%',v;END IF;
 UPDATE cotironda_piloto_privado.ai_usage_calls_mvp264
 SET started_at=clock_timestamp()-interval '40 minutes'
 WHERE message_hmac=repeat('1',64) AND call_no=2;
 v:=public.cotironda_piloto_ai_usage_manual_review_mvp266(
  repeat('1',64),2,ep,'provider_usage_reviewed',repeat('f',64));
 IF v->>'state'<>'reviewed_private'
 THEN RAISE EXCEPTION 'old_reserved_review_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),3,'gpt-6-luna');
 IF v->>'state'<>'reserved' THEN RAISE EXCEPTION 'release_2_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),3,'observed',NULL,
  200000,0,200000,repeat('a',64));
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'usage_3_%',v;END IF;
 v:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),4,'gpt-6-luna');
 IF v->>'state'<>'budget_exceeded' THEN
  RAISE EXCEPTION 'review_bypassed_daily_quota_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_usage_reviews_mvp266)<>2
 OR has_function_privilege('anon',
  'public.cotironda_piloto_ai_usage_manual_review_mvp266(text,integer,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ai_usage_manual_review_mvp266(text,integer,uuid,text,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.ai_usage_reviews_mvp266','SELECT')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ai_usage_manual_review_mvp266(text,integer,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'review_acl_or_rows_wrong';END IF;
END $cases$;
ROLLBACK;
