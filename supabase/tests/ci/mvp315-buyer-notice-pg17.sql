-- MVP315: synthetic evidence only; parent fixture wraps in BEGIN/ROLLBACK.
DO $test315$
DECLARE rid uuid;buyer record;v jsonb;source text;new_token text:=repeat('d',64);
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_next_buyer_notice_mvp315(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_ia_buyer_packet_mvp315(uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_ia_buyer_packet_mvp315(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp315_rpc_visibility_invalid';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE
   oid='cotironda_piloto_privado.ai_buyer_notice_budget_mvp315'::regclass)
 THEN RAISE EXCEPTION 'mvp315_budget_no_rls';END IF;
 SELECT r.id,r.source_hmac,r.buyer_key,b.chat_hmac INTO buyer
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id LIMIT 1;
 rid:=buyer.id;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp315_synthetic_round_missing';END IF;
 IF public.cotironda_piloto_ia_next_buyer_notice_mvp315('pilotchan_313')->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp315_default_gate_not_off';END IF;
 UPDATE cotironda_piloto_privado.ai_buyer_notice_gate_mvp315
 SET enabled=true,activated_at=clock_timestamp()-interval '10 days',
    daily_notice_limit=1 WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_auto_release_gate_mvp306
 SET enabled=true,activated_at=clock_timestamp()-interval '10 days'
 WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
 SET enabled=true,activated_at=clock_timestamp()-interval '10 days'
 WHERE only_row;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306
  WHERE request_id=rid)
 THEN
  INSERT INTO cotironda_piloto_privado.ai_buyer_auto_release_mvp306(
   request_id,buyer_key,chat_hmac,source_hmac,snapshot_sha256)
  VALUES(rid,buyer.buyer_key,buyer.chat_hmac,buyer.source_hmac,
   encode(sha256(convert_to(
    cotironda_piloto_privado.ai_buyer_snapshot_mvp279(rid)::text,'UTF8')),'hex'));
 END IF;
 -- Synthetic trusted channel; source is a previously seeded signed inbox,
 -- not a real buyer. Never do this against the pilot.
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109
  WHERE participant_key=buyer.buyer_key)
 THEN
  INSERT INTO cotironda_piloto_privado.participant_channels_mvp109(
   participant_key,chat_hmac,contact_sha256,nonce_b64,ciphertext_b64,
   authenticated_message_hmac)
  VALUES(buyer.buyer_key,buyer.chat_hmac,
   encode(sha256(convert_to('mvp315_synthetic_buyer_phone','UTF8')),'hex'),
   repeat('E',16),repeat('F',64),buyer.source_hmac);
 END IF;
 -- At least one job is leased/uncertain after MVP314 fixture. Never
 -- announce that all suppliers were reached while any job is unresolved.
 IF public.cotironda_piloto_ia_buyer_packet_mvp315(rid,'pilotchan_313')->>'state'
   <>'not_ready'
 THEN RAISE EXCEPTION 'mvp315_notice_sent_with_unfinished_jobs';END IF;
 -- Finish all synthetic messages with made-up IDs (only in ROLLBACK).
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted',
     lease_token=coalesce(lease_token,gen_random_uuid()),
     leased_at=coalesce(leased_at,clock_timestamp()),
     finished_at=coalesce(finished_at,clock_timestamp()),
     whapi_message_id='mvp315-test-'||supplier_key
 WHERE request_id=rid;
 IF NOT cotironda_piloto_privado.confirmada_comprador_mvp280(rid)
 THEN RAISE EXCEPTION 'mvp315_buyer_proof_invalid';END IF;
 v:=public.cotironda_piloto_ia_next_buyer_notice_mvp315('pilotchan_313');
 IF v->>'state'<>'ready' OR v->>'request_id'<>rid::text
   OR v->>'chat_hmac'<>buyer.chat_hmac
   OR v ? 'phone' OR v ? 'recipient' OR v ? 'buyer_key'
 THEN RAISE EXCEPTION 'mvp315_packet_not_safe_or_missing: %',v;END IF;
 IF public.cotironda_piloto_ia_buyer_packet_mvp315(
    rid,'wrongchannel_315')->>'state'='ready'
 THEN RAISE EXCEPTION 'mvp315_wrong_channel_allowed';END IF;
 v:=public.cotironda_piloto_ia_issue_buyer_notice_mvp315(
   rid,buyer.chat_hmac,buyer.source_hmac,new_token,'pilotchan_313');
 IF v->>'state'<>'issued'
 THEN RAISE EXCEPTION 'mvp315_tracking_issue_failed: %',v;END IF;
 IF public.cotironda_piloto_ia_authorize_buyer_notice_mvp315(
   rid,buyer.chat_hmac,new_token,'pilotchan_313') IS NOT TRUE
 THEN RAISE EXCEPTION 'mvp315_authorization_after_issue_missing';END IF;
 IF (SELECT attempts_reserved FROM
  cotironda_piloto_privado.ai_buyer_notice_budget_mvp315
  WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date)<>1
 THEN RAISE EXCEPTION 'mvp315_budget_missed';END IF;
 IF public.cotironda_piloto_ia_next_buyer_notice_mvp315('pilotchan_313')->>'state'
  <>'budget_exhausted'
 THEN RAISE EXCEPTION 'mvp315_daily_cap_bypassed';END IF;
 IF public.cotironda_piloto_ia_issue_buyer_notice_mvp315(
   rid,buyer.chat_hmac,buyer.source_hmac,repeat('e',64),'pilotchan_313'
 )->>'state'<>'budget_exhausted'
 THEN RAISE EXCEPTION 'mvp315_duplicate_token_allowed';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key=buyer.buyer_key;
 IF public.cotironda_piloto_ia_authorize_buyer_notice_mvp315(
   rid,buyer.chat_hmac,new_token,'pilotchan_313') IS NOT FALSE
 THEN RAISE EXCEPTION 'mvp315_revoked_buyer_contact_used';END IF;
END $test315$;
