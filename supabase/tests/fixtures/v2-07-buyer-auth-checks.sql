-- Synthetic PG17 fixture: buyer's real channel evidence, no PII logged.
DO $v2_buyer_auth$
DECLARE v_sha text;
BEGIN
 v_sha:=encode(extensions.digest(convert_to(
  '5491123456789@s.whatsapp.net','UTF8'),'sha256'),'hex');
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a',v_sha) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'valid_whapi_buyer_not_verified';END IF;
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'supplier_a',v_sha) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'supplier_could_bootstrap_buyer_auth';END IF;
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a',repeat('0',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'wrong_phone_accepted';END IF;
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a','invalid') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'invalid_hash_accepted';END IF;
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a;',v_sha) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'buyer_key_injected';END IF;
 UPDATE cotironda_piloto_privado.participants
  SET opted_out_at=clock_timestamp() WHERE key='buyer_a';
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a',v_sha) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'opted_out_buyer_verified';END IF;
 UPDATE cotironda_piloto_privado.participants
  SET opted_out_at=NULL,consent_at=NULL WHERE key='buyer_a';
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a',v_sha) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'no_consent_buyer_verified';END IF;
 UPDATE cotironda_piloto_privado.participants
  SET consent_at=clock_timestamp()-interval '7 days' WHERE key='buyer_a';
 -- Same contact SHA at a second active buyer is ambiguous and blocked.
 INSERT INTO cotironda_piloto_privado.participants(
  key,display_label,chat_hmac,participant_role,consent_at,opted_out_at)
 VALUES('buyer_b','Otro estudio',repeat('5',64),'buyer',now(),null);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109(
  participant_key,chat_hmac,contact_sha256,authenticated_message_hmac)
 VALUES('buyer_b',repeat('5',64),v_sha,repeat('6',64));
 IF public.cotironda_piloto_v2_bootstrap_buyer_check_private(
  'buyer_a',v_sha) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'duplicate_buyer_phone_verified';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_bootstrap_buyer_check_private(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_bootstrap_buyer_check_private(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_bootstrap_buyer_check_private(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'bootstrap_private_rpc_acl_wrong';END IF;
 RAISE NOTICE 'V2_07_BUYER_BOOTSTRAP_VERIFIER_PG17_PASS';
END $v2_buyer_auth$;
