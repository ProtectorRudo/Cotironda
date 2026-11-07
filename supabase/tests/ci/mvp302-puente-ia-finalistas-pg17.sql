-- MVP302: synthetic only, inside the cumulative MVP284 PG17 transaction.
-- No external APIs or real pilot contacts, and a single ROLLBACK afterwards.
DO $mvp302_test$
DECLARE
 rid uuid; raw jsonb; source_message text;source_sha text;
 source_count int; v_supplier text;
BEGIN
 SELECT r.id INTO STRICT rid FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 s ON s.request_id=r.id
 WHERE s.source_hmac=repeat('b',64);
 raw:=public.cotironda_piloto_ia_finalist_sources_mvp302(rid);
 IF raw->>'state'<>'not_closed_or_not_confirmed'
 THEN RAISE EXCEPTION 'mvp302_pre_close_not_blocked';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp302_rpc_acl_leak';END IF;
 -- PG17 synthetic time travel only. No real source is altered.
 UPDATE cotironda_piloto_privado.requests
 SET state='closed',closes_at=now()-interval '1 hour',
     closed_at=now()-interval '1 hour'
 WHERE id=rid;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET finished_at=now()-interval '3 hours'
 WHERE request_id=rid AND state='api_accepted';
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET received_at=now()-interval '2 hours'
 WHERE request_id=rid AND participant_key IN
  ('corralon_ailin','corralon_nahuel');
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET reason_code='source_and_math_checked'
 WHERE request_id=rid AND state='verified';
 raw:=public.cotironda_piloto_ia_finalist_sources_mvp302(rid);
 IF raw->>'state'<>'private_verified_sources' OR
    jsonb_array_length(raw->'candidates')<>2 OR
    jsonb_array_length(raw->'requested_item_ids')<>3 OR
    raw->>'automatic_award'<>'false' OR
    raw->>'contacts_revealed'<>'false' OR
    raw->>'whatsapp_sent'<>'false' OR
    raw->>'manual_award_required'<>'true'
 THEN RAISE EXCEPTION 'mvp302_private_source_bridge_failed: %',raw->>'state';END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(raw->'candidates') c
  WHERE jsonb_array_length(c->'item_ids')<>1 OR
    c->>'moneda'<>'ARS' OR c->>'source_sha256' !~ '^[0-9a-f]{64}$'
 ) THEN RAISE EXCEPTION 'mvp302_wrong_verified_candidates';END IF;
 IF raw::text ~ '(whatsapp.net|telefono|recipient_chat|ciphertext|contacto|900000|1500000)'
 THEN RAISE EXCEPTION 'mvp302_price_or_contact_leak';END IF;
 -- MVP283 creates the finalist outbox fixture, but not the legacy
 -- coverage planner table; verify both without inventing dependencies.
 IF (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110)<>0
 THEN RAISE EXCEPTION 'mvp302_outbound_or_award_side_effect';END IF;
 IF to_regclass('cotironda_piloto_privado.finalist_coverage_plans_mvp108') IS NOT NULL THEN
  DECLARE plan_count integer;
  BEGIN
   EXECUTE 'SELECT count(*) FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108'
    INTO plan_count;
   IF plan_count<>0 THEN
    RAISE EXCEPTION 'mvp302_outbound_or_award_side_effect';END IF;
  END;
 END IF;
 -- A source update AFTER verification must fail closed, not become a plan.
 SELECT message_hmac INTO source_message
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227
 WHERE request_id=rid AND state='verified' ORDER BY message_hmac LIMIT 1;
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET source_sha256=repeat('f',64) WHERE message_hmac=source_message;
 raw:=public.cotironda_piloto_ia_finalist_sources_mvp302(rid);
 IF raw->>'state'<>'private_verified_sources' OR
    jsonb_array_length(raw->'candidates')<>1
 THEN RAISE EXCEPTION 'mvp302_source_revision_mismatch_not_blocked';END IF;
 -- An opted out buyer is never eligible, even if closed and quoted.
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=now()
 WHERE key='arquitecto';
 IF public.cotironda_piloto_ia_finalist_sources_mvp302(rid)->>'state'<>
    'buyer_not_consented'
 THEN RAISE EXCEPTION 'mvp302_buyer_optout_not_guarded';END IF;
 RAISE NOTICE 'MVP302 PG17 PASS: 2 valid sources then 1 on hash mismatch, buyer optout, never award/send';
END $mvp302_test$;
