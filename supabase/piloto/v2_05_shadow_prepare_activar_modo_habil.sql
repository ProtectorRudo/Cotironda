-- V2 creation: use the 2-business-day clock ONLY after policy ON.
-- Deployment order: D013 pinned RPC migration, V2 calendar tables/triggers,
-- verified calendar+consent; then this code patch; then enable policy.
-- No activation performed by this script. Fail closed if source changed.
DO $v2mode$
DECLARE
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
 IF to_regclass('cotironda_piloto_privado.v2_business_policy') IS NULL
 OR to_regprocedure('cotironda_piloto_privado.v2_deadline(timestamptz,text)') IS NULL
 THEN RAISE EXCEPTION 'V2 calendar migration missing';END IF;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure
 ) INTO v_prev;
 IF encode(extensions.digest(convert_to(v_prev,'UTF8'),'sha256'),'hex')<>
   'a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02'
 THEN RAISE EXCEPTION 'V2 mode source differs from D013 pinned baseline';END IF;
 IF length(v_prev)-length(replace(v_prev,v_old,''))<>length(v_old)
 THEN RAISE EXCEPTION 'V2 mode insertion no longer unique';END IF;
 IF position('c.literal_description=v_original_catalogue' IN v_prev)=0
 OR position('rubroCatalogo' IN v_prev)=0
 THEN RAISE EXCEPTION 'V2 catalogue evidence missing'; END IF;
 v_new:=replace(v_prev,v_old,v_new_insert);
 IF v_new=v_prev THEN RAISE EXCEPTION 'V2 mode no insertion modified'; END IF;
 EXECUTE v_new;
END $v2mode$;
-- Flag remains OFF, so preexisting pilot workflow continues using legacy
-- until the approved calendar + rollout is explicitly activated.
