-- MVP264 / PG17: two companies, measured + unknown, budgets, no billing invention.
BEGIN;
DO $roles$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
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
\ir ../../piloto/mvp264_openai_usage_meters.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a',repeat('a',64),'buyer',clock_timestamp(),NULL),
 ('buyer_b',repeat('b',64),'buyer',clock_timestamp(),NULL),
 ('supplier_a',repeat('c',64),'supplier',clock_timestamp(),NULL),
 ('supplier_b',repeat('d',64),'supplier',clock_timestamp(),NULL);
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),'buyer_a',repeat('a',64)),
 (repeat('2',64),'buyer_b',repeat('b',64)),
 (repeat('3',64),'supplier_a',repeat('c',64)),
 (repeat('4',64),'supplier_b',repeat('d',64));
INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226 VALUES
 (repeat('1',64),'buyer_a',repeat('a',64),'reserved'),
 (repeat('2',64),'buyer_b',repeat('b',64),'reserved');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('3',64),'supplier_a','reserved'),
 (repeat('4',64),'supplier_b','reserved');

DO $cases$
DECLARE a jsonb;b jsonb;v jsonb;
BEGIN
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('b',64),1,'gpt-6-luna');
 IF a->>'state'<>'not_authorized' THEN
 RAISE EXCEPTION 'mvp264_cross_company_preflight_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('3',64),repeat('c',64),3,'gpt-6-luna');
 IF a->>'state'<>'not_authorized' THEN
 RAISE EXCEPTION 'mvp264_supplier_exceeds_two_calls_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),1,'unapproved-model');
 IF a->>'state'<>'invalid' THEN
 RAISE EXCEPTION 'mvp264_invalid_model_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),1,'gpt-6-luna');
 IF a->>'state'<>'reserved' THEN
 RAISE EXCEPTION 'mvp264_first_buyer_reserve_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),1,'gpt-6-luna');
 IF a->>'state'<>'already_reserved' THEN
 RAISE EXCEPTION 'mvp264_double_reserve_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),2,'gpt-6-luna');
 IF a->>'state'<>'usage_unknown_blocked' THEN
 RAISE EXCEPTION 'mvp264_call_before_usage_finalized_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),1,'observed',NULL,
  100,20,121,repeat('f',64));
 IF a->>'state'<>'invalid' THEN
 RAISE EXCEPTION 'mvp264_forged_total_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),1,'observed',NULL,
  100,20,120,repeat('f',64));
 IF a->>'state'<>'recorded' THEN
 RAISE EXCEPTION 'mvp264_observed_usage_not_saved_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),1,'observed',NULL,
  100,20,120,repeat('f',64));
 IF a->>'state'<>'not_reserved' THEN
 RAISE EXCEPTION 'mvp264_double_finalization_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),2,'gpt-6-luna');
 IF a->>'state'<>'reserved' THEN
 RAISE EXCEPTION 'mvp264_valid_second_call_blocked_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('1',64),repeat('a',64),2,'unmetered','network_uncertain',
  NULL,NULL,NULL,NULL);
 IF a->>'state'<>'recorded' THEN
 RAISE EXCEPTION 'mvp264_network_uncertainty_not_saved_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('1',64),repeat('a',64),3,'gpt-6-luna');
 IF a->>'state'<>'usage_unknown_blocked' THEN
 RAISE EXCEPTION 'mvp264_spent_unknown_as_free_%',a;END IF;
 -- A different company can continue even when A has unknown usage.
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('2',64),repeat('b',64),1,'gpt-6-luna');
 IF a->>'state'<>'reserved' THEN
 RAISE EXCEPTION 'mvp264_budget_crossed_companies_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('2',64),repeat('b',64),1,'observed',NULL,
  200000,0,200000,repeat('e',64));
 IF a->>'state'<>'recorded' THEN
 RAISE EXCEPTION 'mvp264_large_valid_usage_not_saved_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('2',64),repeat('b',64),2,'gpt-6-luna');
 IF a->>'state'<>'budget_exceeded' THEN
 RAISE EXCEPTION 'mvp264_token_budget_broken_%',a;END IF;
 -- Supplier has a separate allocation and only two semantic reads.
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('3',64),repeat('c',64),1,'gpt-6-luna');
 IF a->>'state'<>'reserved' THEN
 RAISE EXCEPTION 'mvp264_supplier_not_reserved_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_finish_mvp264(
  repeat('3',64),repeat('c',64),1,'unmetered','usage_missing',
  NULL,NULL,NULL,NULL);
 IF a->>'state'<>'recorded' THEN
 RAISE EXCEPTION 'mvp264_missing_usage_not_recorded_%',a;END IF;
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('3',64),repeat('c',64),2,'gpt-6-luna');
 IF a->>'state'<>'usage_unknown_blocked' THEN
 RAISE EXCEPTION 'mvp264_missing_usage_did_not_block_%',a;END IF;
 v:=public.cotironda_piloto_ai_usage_summary_mvp264(24);
 IF v->>'state'<>'private_openai_usage'
 OR v->>'pricing_verified'<>'false'
 OR v->>'unknown_usage_is_zero'<>'false'
 OR jsonb_typeof(v->'monetary_cost')<>'null'
 OR jsonb_array_length(v->'roles')<>2
 THEN RAISE EXCEPTION 'mvp264_money_was_invented_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_usage_calls_mvp264)<>4
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_usage_calls_mvp264
     WHERE state='unmetered')<>2
 THEN RAISE EXCEPTION 'mvp264_usage_ledger_wrong_count';END IF;
 IF v::text LIKE '%'||repeat('f',64)||'%'
 OR v::text LIKE '%buyer_a%' OR v::text LIKE '%supplier_a%'
 THEN RAISE EXCEPTION 'mvp264_usage_pii_leak';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='supplier_b';
 a:=public.cotironda_piloto_ai_usage_reserve_mvp264(
  repeat('4',64),repeat('d',64),1,'gpt-6-luna');
 IF a->>'state'<>'not_authorized' THEN
 RAISE EXCEPTION 'mvp264_optout_unprotected_%',a;END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ai_usage_reserve_mvp264(text,text,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ai_usage_finish_mvp264(text,text,integer,text,text,integer,integer,integer,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.ai_usage_calls_mvp264','SELECT')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ai_usage_summary_mvp264(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp264_acl_bypass';END IF;
END$cases$;
ROLLBACK;
