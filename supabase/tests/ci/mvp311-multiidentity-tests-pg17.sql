-- MVP311, PostgreSQL 17 isolated: executed AFTER frozen RPC baseline and
-- MVP311 migration. Test new buyer + multiple suppliers, and fail-closed.
DO $mvp311$
DECLARE
 b_hmac text:=encode(sha256(convert_to('mvp311-second-buyer','UTF8')),'hex');
 s_hmac text:=encode(sha256(convert_to('mvp311-extra-supplier','UTF8')),'hex');
 b2_hmac text:=encode(sha256(convert_to('mvp311-second-supplier','UTF8')),'hex');
 family text:='mvp311_hardware';
 rid uuid; roster jsonb; bad int; n int;
BEGIN
 -- Exact 14 modern RPC definitions remain SECURITY DEFINER, service only,
 -- empty search_path and contain no legacy participant keys.
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns
  ON ns.oid=p.pronamespace
 WHERE ns.nspname='public'
  AND p.proname IN(
   'cotironda_piloto_autolink_unquoted_media_mvp155',
   'cotironda_piloto_curated_families_mvp152',
   'cotironda_piloto_ia_claim_zone_mvp233',
   'cotironda_piloto_ia_link_supplier_mvp225',
   'cotironda_piloto_ia_reserve_review_notice_mvp286',
   'cotironda_piloto_ia_review_launch_mvp285',
   'cotironda_piloto_ia_trial_flags_mvp229',
   'cotironda_piloto_link_quoted_media_mvp151',
   'cotironda_piloto_link_quoted_text_mvp151',
   'cotironda_piloto_prepare_document_mvp099',
   'cotironda_piloto_publish_source_text_mvp107',
   'cotironda_piloto_record_delivery_mvp119',
   'cotironda_piloto_reserve_ai_mvp094',
   'cotironda_piloto_reserve_reply_mvp094'
  );
 IF n<>14 THEN RAISE EXCEPTION 'mvp311_active_rpc_count: %',n;END IF;
 SELECT count(*) INTO bad FROM pg_proc p
 JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND
 p.proname IN(
   'cotironda_piloto_autolink_unquoted_media_mvp155',
   'cotironda_piloto_curated_families_mvp152',
   'cotironda_piloto_ia_claim_zone_mvp233',
   'cotironda_piloto_ia_link_supplier_mvp225',
   'cotironda_piloto_ia_reserve_review_notice_mvp286',
   'cotironda_piloto_ia_review_launch_mvp285',
   'cotironda_piloto_ia_trial_flags_mvp229',
   'cotironda_piloto_link_quoted_media_mvp151',
   'cotironda_piloto_link_quoted_text_mvp151',
   'cotironda_piloto_prepare_document_mvp099',
   'cotironda_piloto_publish_source_text_mvp107',
   'cotironda_piloto_record_delivery_mvp119',
   'cotironda_piloto_reserve_ai_mvp094',
   'cotironda_piloto_reserve_reply_mvp094'
 )
 AND (
  pg_get_functiondef(p.oid) ~ '''(arquitecto|corralon_ailin|corralon_nahuel)'''
  OR p.prosecdef IS DISTINCT FROM true
  OR NOT 'search_path=' = ANY(p.proconfig)
  OR has_function_privilege('anon',p.oid,'EXECUTE')
  OR has_function_privilege('authenticated',p.oid,'EXECUTE')
  OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 );
 IF bad<>0 THEN RAISE EXCEPTION 'mvp311_security_or_hardcodes: %',bad;END IF;

 -- Separate verified buyers can open separate rounds, but cannot claim
 -- each other's requests. Identity is chat HMAC, not label or role alone.
 INSERT INTO cotironda_piloto_privado.participants(
  key,participant_role,delivery_city,chat_hmac,consent_at,
  opted_out_at,catalogue_confirmed_at,display_label
 ) VALUES
 ('buyer_extra_311','buyer',NULL,b_hmac,clock_timestamp(),NULL,NULL,'Estudio segundo'),
 ('supplier_extra_311','supplier','La Plata',s_hmac,clock_timestamp(),NULL,
  clock_timestamp(),'Ferretería nueva'),
 ('supplier_berisso_311','supplier','Berisso',b2_hmac,clock_timestamp(),NULL,
  clock_timestamp(),'Ferretería Berisso');
 INSERT INTO cotironda_piloto_privado.catalogue_lines(
  participant_key,line_no,literal_description,family_code,recognition_state
 ) VALUES
 ('supplier_extra_311',1,'Tornillo zincado M6',family,'curated_family'),
 ('supplier_berisso_311',1,'Tarugo metálico', 'mvp311_berisso','curated_family');

 roster:=public.cotironda_piloto_curated_families_mvp152(b_hmac,'La Plata');
 IF jsonb_typeof(roster)<>'array'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(roster) val
    WHERE val=family)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(roster) val
    WHERE val='mvp311_berisso')
 THEN RAISE EXCEPTION 'mvp311_new_buyer_supplier_catalogue: %',roster;END IF;
 roster:=public.cotironda_piloto_curated_families_mvp152(b_hmac,'Berisso');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(roster) val
    WHERE val='mvp311_berisso')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(roster) val
    WHERE val=family)
 THEN RAISE EXCEPTION 'mvp311_city_crossover: %',roster;END IF;
 IF public.cotironda_piloto_curated_families_mvp152(s_hmac,'La Plata')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'mvp311_supplier_impersonates_buyer_catalogue';END IF;
 IF public.cotironda_piloto_curated_families_mvp152(repeat('0',64),'La Plata')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'mvp311_unrecognized_chat_catalogue';END IF;

 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state
 ) VALUES('buyer_extra_311','La Plata','20 unidades de tornillos M6 zincados',
  encode(sha256(convert_to('mvp311_buyer2_request','UTF8')),'hex'),'draft')
 RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp311_multiple_buyer_request_denied';END IF;
 -- MVP310 did not guard against an update to ANOTHER valid buyer.
 BEGIN
  UPDATE cotironda_piloto_privado.requests SET buyer_key='arquitecto'
  WHERE id=rid;
  RAISE EXCEPTION 'mvp311_round_reassigned_to_different_buyer';
 EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT r.buyer_key FROM cotironda_piloto_privado.requests r
  WHERE r.id=rid)<>'buyer_extra_311'
 THEN RAISE EXCEPTION 'mvp311_buyer_owner_modified';END IF;

 -- No buyer phones from deprecated finalist route even with two buyers.
 IF public.cotironda_piloto_finalist_contacts_mvp109(NULL)->>'state'
  <>'buyer_contact_private'
 THEN RAISE EXCEPTION 'mvp311_legacy_bidirectional_contact';END IF;

 -- Wrong IDs must fail early in former legacy RPCs, before any side effects.
 IF public.cotironda_piloto_reserve_ai_mvp094('wrong',repeat('f',64))
 THEN RAISE EXCEPTION 'mvp311_ai_preflight_bypass';END IF;
 IF public.cotironda_piloto_ia_link_supplier_mvp225('wrong',s_hmac)
   ->>'state'<>'invalid_input'
 THEN RAISE EXCEPTION 'mvp311_supplier_preflight_bypass';END IF;
END $mvp311$;
