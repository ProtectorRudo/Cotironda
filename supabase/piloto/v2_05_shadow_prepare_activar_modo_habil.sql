-- V2-22: prepare the two-business-day clock ONLY in the V2-21 PRIVATE RPC.
-- Candidate only. NEVER alter cotironda_piloto_ia_shadow_prepare_mvp221.
-- Order: V2-21 isolated clone; V2-05 calendar tables/triggers (policy OFF);
-- this patch to isolated V2 RPC; verified calendar; finally separately
-- authorized activation. No rows, messages, or policy enabled here.
-- Refuse to continue if either original or V2 source drifted.
DO $v2mode$
DECLARE
 v_original regprocedure;
 v_v2 regprocedure;
 v_legacy text;
 v_prev text;
 v_new text;
 v_old text:=$insert_old$
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft')
 RETURNING id INTO v_request;$insert_old$;
 v_new_insert text:=$insert_new$
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,timing_mode)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft',
  CASE WHEN EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_business_policy policy
   WHERE policy.singleton=true AND policy.enabled=true
    AND policy.activated_at IS NOT NULL
  ) THEN 'business_two_days' ELSE 'legacy_calendar' END)
 RETURNING id INTO v_request;$insert_new$;
BEGIN
 v_original:=to_regprocedure(
  'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)');
 v_v2:=to_regprocedure(
  'public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)');
 IF v_original IS NULL OR v_v2 IS NULL
 THEN RAISE EXCEPTION 'V2-22 isolated or historical RPC missing';END IF;
 v_legacy:=pg_get_functiondef(v_original);
 IF encode(extensions.digest(convert_to(v_legacy,'UTF8'),'sha256'),'hex')
   <>'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'V2-22 historical M221 has drifted';END IF;
 IF to_regclass('cotironda_piloto_privado.v2_business_policy') IS NULL
 OR to_regprocedure('cotironda_piloto_privado.v2_deadline(timestamptz,text)') IS NULL
 THEN RAISE EXCEPTION 'V2 calendar migration missing';END IF;
 SELECT pg_get_functiondef(v_v2) INTO v_prev;
 IF encode(extensions.digest(convert_to(v_prev,'UTF8'),'sha256'),'hex')<>
   'a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02'
 THEN RAISE EXCEPTION 'V2-22 isolated D013 source differs from pinned baseline';END IF;
 IF length(v_prev)-length(replace(v_prev,v_old,''))<>length(v_old)
 THEN RAISE EXCEPTION 'V2 mode insertion no longer unique';END IF;
 IF position('c.literal_description=v_original_catalogue' IN v_prev)=0
 OR position('c.participant_key=v_supplier' IN v_prev)=0
 OR position('lower(btrim(p.delivery_city))=lower(btrim(p_city))' IN v_prev)=0
 OR position('v_match->>''rubroCatalogo'' NOT IN' IN v_prev)=0
 OR position('SECURITY DEFINER' IN v_prev)=0
 OR position('SET search_path TO ''''' IN v_prev)=0
 THEN RAISE EXCEPTION 'V2-22 catalogue, zone or definer guard missing'; END IF;
 v_new:=replace(v_prev,v_old,v_new_insert);
 IF v_new=v_prev OR position(v_old IN v_new)>0
 THEN RAISE EXCEPTION 'V2-22 no insertion modified'; END IF;
 EXECUTE v_new;
 IF encode(extensions.digest(
   convert_to(pg_get_functiondef(v_original),'UTF8'),'sha256'),'hex')
   <>'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'V2-22 historical M221 modified'; END IF;
 IF position('timing_mode)' IN pg_get_functiondef(v_v2))=0
 OR position('v2_business_policy policy' IN pg_get_functiondef(v_v2))=0
 THEN RAISE EXCEPTION 'V2-22 mode not present in isolated RPC';END IF;
 IF NOT has_function_privilege('service_role',v_v2,'EXECUTE')
 OR has_function_privilege('anon',v_v2,'EXECUTE')
 OR has_function_privilege('authenticated',v_v2,'EXECUTE')
 THEN RAISE EXCEPTION 'V2-22 private RPC ACL changed';END IF;
END $v2mode$;
-- V2 calendar policy remains OFF. The historical M221 workflow is unchanged.
-- Until the annual city calendar is approved and V2 policy activated, new
-- V2 rounds use the legacy mode; do not equate CI with PILOT live activity.
