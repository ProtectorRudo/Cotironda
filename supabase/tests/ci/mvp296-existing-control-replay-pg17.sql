-- MVP296 synthetic PostgreSQL17 under SAME cumulative BEGIN/ROLLBACK.
-- The prior MVP295 synthetic fixture already claimed its own source; check
-- authorization does not create new leases or expose stale originals.
DO $test$
DECLARE state_ jsonb;before_ integer;central_ record;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_claim_linked_text_mvp295()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_claim_linked_text_mvp295()','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_linked_text_mvp295()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp296_acl_denied'; END IF;
 SELECT enabled,activated_at INTO central_
 FROM cotironda_piloto_privado.ai_central_control_mvp226
 WHERE only_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp296_control_missing';END IF;
 SELECT count(*) INTO before_
 FROM cotironda_piloto_privado.ai_supplier_linked_replay_mvp295;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=false,activated_at=NULL WHERE only_row;
 state_:=public.cotironda_piloto_claim_linked_text_mvp295();
 IF state_->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp296_inactive_central_allowed_claim: %',state_;END IF;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 state_:=public.cotironda_piloto_claim_linked_text_mvp295();
 IF state_->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp296_central_approved_replayed_old_source: %',state_;END IF;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=central_.enabled,activated_at=central_.activated_at
 WHERE only_row;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_linked_replay_mvp295)<>before_
 THEN RAISE EXCEPTION 'mvp296_duplicate_source_lease'; END IF;
 RAISE NOTICE 'MVP296 PASS: only existing IA Central control, 0 extra claims, protected RLS';
END $test$;
