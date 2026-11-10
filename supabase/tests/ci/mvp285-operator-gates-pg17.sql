-- MVP285: independent pilot-operator approval, rollback with 21 migrations.
-- This fixture is included inside the transaction of MVP284.
DO $mvp285$
DECLARE info jsonb;
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_review_launch_mvp285(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_review_launch_mvp285(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp285_public_access_to_operator_gate'; END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_review_launch_mvp285)<>1
 OR EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_review_launch_mvp285
  WHERE enabled)
 THEN RAISE EXCEPTION 'mvp285_operator_gate_not_default_off'; END IF;
 info:=public.cotironda_piloto_ia_review_launch_mvp285(repeat('a',64));
 IF info->>'state'<>'inactive' OR info->>'send'<>'false'
 THEN RAISE EXCEPTION 'mvp285_buyer_approved_without_activation';END IF;
 -- Operator gate alone is insufficient without central/dispatch/trial.
 UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 IF public.cotironda_piloto_ia_review_launch_mvp285(repeat('a',64))
    ->>'release'<>'false'
 THEN RAISE EXCEPTION 'mvp285_operator_gate_bypassed_sql_flags';END IF;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true,activated_at=clock_timestamp(),expires_at=NULL WHERE only_row;
 info:=public.cotironda_piloto_ia_review_launch_mvp285(repeat('a',64));
 IF info->>'state'<>'active' OR info->>'send'<>'true'
 OR info->>'confirm'<>'true' OR info->>'release'<>'true'
 THEN RAISE EXCEPTION 'mvp285_operator_activation_failed: %',info;END IF;
 IF public.cotironda_piloto_ia_review_launch_mvp285(repeat('1',64))
    ->>'send'<>'false'
 OR public.cotironda_piloto_ia_review_launch_mvp285(repeat('f',64))
    ->>'send'<>'false'
 THEN RAISE EXCEPTION 'mvp285_supplier_or_unknown_allowed';END IF;
 -- A revoked participant cannot receive new reviews.
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='arquitecto';
 IF public.cotironda_piloto_ia_review_launch_mvp285(repeat('a',64))
    ->>'release'<>'false'
 THEN RAISE EXCEPTION 'mvp285_revoked_buyer_allowed';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key='arquitecto';
 UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
 SET enabled=false,activated_at=NULL WHERE only_row;
 IF public.cotironda_piloto_ia_review_launch_mvp285(repeat('a',64))
    ->>'send'<>'false'
 THEN RAISE EXCEPTION 'mvp285_shutdown_ignored';END IF;
 RAISE NOTICE 'MVP285 operator gate PASS: OFF default, strict consent, operator+central+dispatch+trial, replay disabled';
END $mvp285$;
