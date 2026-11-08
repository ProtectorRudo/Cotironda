-- MVP312 PostgreSQL17 synthetic only. Parent transaction rolls back.
DO $mvp312$
DECLARE
 buyer jsonb;supplier jsonb;extra jsonb;check_ jsonb;result jsonb;
 buyer_key text;supplier_key text;
 buyer_hmac text:=encode(sha256(convert_to('mvp312-buyer', 'UTF8')),'hex');
 supplier_hmac text:=encode(sha256(convert_to('mvp312-supplier','UTF8')),'hex');
 buyer_sha text:=encode(sha256(convert_to('mvp312-buyer-raw', 'UTF8')),'hex');
 supplier_sha text:=encode(sha256(convert_to('mvp312-supplier-raw','UTF8')),'hex');
 before_count integer;
BEGIN
 IF has_function_privilege('anon',
 'cotironda_piloto_privado.admin_bind_channel_mvp312(text,text,text,text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
 'cotironda_piloto_privado.admin_create_and_bind_mvp312(text,text,text,text,text,text,text,text,text)','EXECUTE')
 OR has_function_privilege('service_role',
 'cotironda_piloto_privado.admin_bind_channel_mvp312(text,text,text,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp312_admin_function_exposed';END IF;
 IF (SELECT relrowsecurity FROM pg_class WHERE oid=
  'cotironda_piloto_privado.admin_channels_mvp312'::regclass) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp312_rls_disabled';END IF;

 buyer:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
  'buyer','Estudio Delta',NULL,
  'owner_chat_mvp312_buyer_source_01',
  'whapi_pilot_01',buyer_hmac,buyer_sha,repeat('A',16),repeat('B',64));
 IF buyer->>'state'<>'created_and_bound' OR buyer->>'role'<>'buyer'
  OR buyer->>'whapi_inbound_proof'<>'false'
  OR buyer->>'buyer_contact_public'<>'false'
  OR buyer->>'messages_sent'<>'false'
 THEN RAISE EXCEPTION 'mvp312_buyer_onboard: %',buyer;END IF;
 buyer_key:=buyer->>'participant_key';
 IF (SELECT count(*) FROM cotironda_piloto_privado.participants
   WHERE key=buyer_key AND participant_role='buyer'
     AND chat_hmac=buyer_hmac AND consent_at IS NOT NULL
     AND delivery_city IS NULL AND opted_out_at IS NULL)<>1
 THEN RAISE EXCEPTION 'mvp312_buyer_hmac_not_bound';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_channels_mvp312
   WHERE participant_key=buyer_key AND source_reference='owner_chat_mvp312_buyer_source_01'
    AND evidence_kind='owner_vouched_phone')<>1
 THEN RAISE EXCEPTION 'mvp312_buyer_vault_not_recorded';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox
  WHERE participant_key=buyer_key)<>0
 OR (SELECT count(*) FROM cotironda_piloto_privado.enrollment_terms_proof_mvp308
  WHERE participant_key=buyer_key)<>0
 THEN RAISE EXCEPTION 'mvp312_fake_buyer_whapi_evidence';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307(buyer_key)
 THEN RAISE EXCEPTION 'mvp312_buyer_misclassified_supplier';END IF;
 check_:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
  'buyer','Estudio Delta',NULL,
  'owner_chat_mvp312_buyer_source_01',
  'whapi_pilot_01',buyer_hmac,buyer_sha,repeat('A',16),repeat('B',64));
 IF check_->>'state'<>'already_created_and_bound'
  OR check_->>'participant_key'<>buyer_key
 THEN RAISE EXCEPTION 'mvp312_buyer_double_add: %',check_;END IF;

 supplier:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
  'supplier','Ferretería Viento','La Plata',
  'owner_chat_mvp312_supplier_source_01',
  'whapi_pilot_01',supplier_hmac,supplier_sha,repeat('C',16),repeat('D',64));
 IF supplier->>'state'<>'created_and_bound'
 THEN RAISE EXCEPTION 'mvp312_supplier_onboard: %',supplier;END IF;
 supplier_key:=supplier->>'participant_key';
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307(supplier_key)
 THEN RAISE EXCEPTION 'mvp312_owner_vouched_supplier_not_eligible';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.contact_reveal_consents_mvp109
   WHERE participant_key=supplier_key)<>0
 THEN RAISE EXCEPTION 'mvp312_fake_direct_whapi_consent';END IF;
 -- Reusing an existing number under another commercial account must
 -- roll back the NEW account and not cross-wire messages or identities.
 SELECT count(*) INTO before_count
 FROM cotironda_piloto_privado.admin_authorizations_mvp309;
 BEGIN
  extra:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
   'supplier','Ferretería Gemela','Berisso',
   'owner_chat_mvp312_supplier_other_01',
   'whapi_pilot_01',supplier_hmac,supplier_sha,repeat('E',16),repeat('F',64));
  RAISE EXCEPTION 'mvp312_duplicate_number_accepted: %',extra;
 EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309)<>before_count
 THEN RAISE EXCEPTION 'mvp312_atomic_rollback_failed';END IF;
 check_:=cotironda_piloto_privado.admin_bind_channel_mvp312(
  supplier_key,'owner_chat_mvp312_supplier_source_01',
  'whapi_pilot_01',buyer_hmac,buyer_sha,repeat('A',16),repeat('B',64));
 IF check_->>'state'<>'identity_conflict'
 THEN RAISE EXCEPTION 'mvp312_phone_reassigned: %',check_;END IF;

 check_:=cotironda_piloto_privado.admin_bind_channel_mvp312(
  'corralon_ailin','owner_chat_mvp312_supplier_source_01',
  'whapi_pilot_01',supplier_hmac,supplier_sha,repeat('C',16),repeat('D',64));
 IF check_->>'state' NOT IN ('not_authorized','already_linked_other_path')
 THEN RAISE EXCEPTION 'mvp312_legacy_supplier_overwritten: %',check_;END IF;
 IF public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('0',64))->>'state'
  NOT IN ('not_ready','not_found')
 THEN RAISE EXCEPTION 'mvp312_contact_reveal_before_close';END IF;
 IF public.cotironda_piloto_finalist_contacts_mvp109(NULL)->>'state'
  <>'buyer_contact_private'
 THEN RAISE EXCEPTION 'mvp312_buyer_legacy_disclosure';END IF;

 result:=cotironda_piloto_privado.admin_revoke_permission_mvp309(
  supplier_key,'source_disputed');
 IF result->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp312_revocation_failed';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307(supplier_key)
 THEN RAISE EXCEPTION 'mvp312_revoked_supplier_contactable';END IF;
 result:=cotironda_piloto_privado.admin_bind_channel_mvp312(
  supplier_key,'owner_chat_mvp312_supplier_source_01',
  'whapi_pilot_01',supplier_hmac,supplier_sha,repeat('C',16),repeat('D',64));
 IF result->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp312_regrant_after_revocation';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp(),consent_at=NULL WHERE key=buyer_key;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307(buyer_key)
 THEN RAISE EXCEPTION 'mvp312_buyer_optout_bad';END IF;
END $mvp312$;
