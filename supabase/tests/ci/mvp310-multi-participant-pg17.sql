-- MVP310, PostgreSQL17 isolated: requires existing PG17 MVP309 fixture.
-- New checks recreate the old MVP072 restrictions (NOT VALID, as the
-- upstream synthetic fixture already has additional unrelated identities).
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_key_check
 CHECK(key IN ('arquitecto','corralon_ailin','corralon_nahuel')) NOT VALID;
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_check
 CHECK((key='arquitecto' AND participant_role='buyer' AND delivery_city IS NULL)
 OR (key<>'arquitecto' AND participant_role='supplier' AND delivery_city IS NOT NULL))
 NOT VALID;
ALTER TABLE cotironda_piloto_privado.requests
 ADD CONSTRAINT requests_buyer_key_check
 CHECK(buyer_key='arquitecto') NOT VALID;

-- Migrate exactly the schema and new operator function under test.
\ir ../../piloto/mvp310_altas_multiples_admin_roles.sql

DO $mvp310$
DECLARE
 buyer jsonb; supplier jsonb;another jsonb;response jsonb; buyer_key text;
 supplier_key text; rid uuid; new_hmac text;
BEGIN
 IF has_function_privilege('anon',
  'cotironda_piloto_privado.admin_create_participant_mvp310(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'cotironda_piloto_privado.admin_create_participant_mvp310(text,text,text,text)','EXECUTE')
 OR has_function_privilege('service_role',
  'cotironda_piloto_privado.admin_create_participant_mvp310(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp310_operator_rpc_exposed';END IF;

 buyer:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'buyer','Arquitecto Alfa',NULL,'owner_chat_20261108_mvp310_buyer01');
 IF buyer->>'state'<>'created' OR buyer->>'role'<>'buyer'
  OR buyer->>'whatsapp_linked'<>'false'
  OR buyer->>'contact_disclosed'<>'false'
 THEN RAISE EXCEPTION 'mvp310_buyer_creation: %',buyer;END IF;
 buyer_key:=buyer->>'participant_key';
 IF buyer_key !~ '^buyer_[a-f0-9]{32}$'
 THEN RAISE EXCEPTION 'mvp310_generated_buyer_key_bad';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.participants
  WHERE key=buyer_key AND participant_role='buyer'
   AND chat_hmac IS NULL AND consent_at IS NULL AND delivery_city IS NULL)<>1
 THEN RAISE EXCEPTION 'mvp310_fabricated_chat_consent';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
  WHERE participant_key=buyer_key AND scope='buyer_standard_operations'
   AND statement_kind='owner_reported_prior_permission')<>1
 THEN RAISE EXCEPTION 'mvp310_missing_admin_attestation';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'buyer','Arquitecto Alfa',NULL,'owner_chat_20261108_mvp310_buyer01');
 IF response->>'state'<>'already_created'
  OR response->>'participant_key'<>buyer_key
 THEN RAISE EXCEPTION 'mvp310_retry_not_idempotent: %',response;END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'buyer','Arquitecto Beta',NULL,'owner_chat_20261108_mvp310_buyer01');
 IF response->>'state'<>'source_reference_conflict'
 THEN RAISE EXCEPTION 'mvp310_source_reused_for_different_user';END IF;

 supplier:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','Ferretería de Prueba','La Plata',
  'owner_chat_20261108_mvp310_supplier01');
 IF supplier->>'state'<>'created'
 THEN RAISE EXCEPTION 'mvp310_supplier_creation: %',supplier;END IF;
 supplier_key:=supplier->>'participant_key';
 IF supplier_key !~ '^supplier_[a-f0-9]{32}$'
 THEN RAISE EXCEPTION 'mvp310_generated_supplier_key_bad';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
  WHERE participant_key=supplier_key
   AND scope='supplier_business_contact_after_close')<>1
 THEN RAISE EXCEPTION 'mvp310_supplier_wrong_scope';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307(supplier_key)
 THEN RAISE EXCEPTION 'mvp310_supplier_without_phone_contactable';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','Ferretería de Prueba','La Plata',
  'owner_chat_20261108_mvp310_supplier01');
 IF response->>'state'<>'already_created'
 THEN RAISE EXCEPTION 'mvp310_supplier_retry';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','FERRETERÍA DE PRUEBA','La Plata',
  'owner_chat_20261108_mvp310_supplier02');
 IF response->>'state'<>'duplicate_supplier_label_city'
 THEN RAISE EXCEPTION 'mvp310_duplicate_city_label';END IF;
 another:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','Ferretería de Prueba','Berisso',
  'owner_chat_20261108_mvp310_supplier03');
 IF another->>'state'<>'created'
 THEN RAISE EXCEPTION 'mvp310_different_city_supplier_rejected';END IF;

 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','Celular 2219876543','La Plata',
  'owner_chat_20261108_mvp310_phone_leak');
 IF response->>'state'<>'invalid'
 THEN RAISE EXCEPTION 'mvp310_personal_phone_as_display_label';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'buyer','Arquitecto con ciudad','La Plata',
  'owner_chat_20261108_mvp310_wrong_city');
 IF response->>'state'<>'buyer_city_not_allowed'
 THEN RAISE EXCEPTION 'mvp310_buyer_city_rule';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'superadmin','Alguien',NULL,'owner_chat_20261108_mvp310_escalation');
 IF response->>'state'<>'invalid'
 THEN RAISE EXCEPTION 'mvp310_role_escalation';END IF;

 -- Buyer authorization alone never proves the source WhatsApp identity.
 BEGIN
  INSERT INTO cotironda_piloto_privado.requests(
   buyer_key,delivery_city,original_request,source_hmac,state
  ) VALUES(buyer_key,'La Plata','Cemento bolsa para obra - pedido de prueba',
   encode(sha256(convert_to(buyer_key||'-unlinked','UTF8')),'hex'),'draft');
  RAISE EXCEPTION 'mvp310_unlinked_buyer_was_accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;

 new_hmac:=encode(sha256(convert_to(buyer_key||'-auth','UTF8')),'hex');
 UPDATE cotironda_piloto_privado.participants
 SET chat_hmac=new_hmac,consent_at=clock_timestamp() WHERE key=buyer_key;
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state
 ) VALUES(buyer_key,'La Plata','Cemento bolsa para obra - pedido de prueba',
  encode(sha256(convert_to(buyer_key||'-verified','UTF8')),'hex'),'draft')
 RETURNING id INTO rid;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp310_second_buyer_request_not_created';END IF;
 BEGIN
  UPDATE cotironda_piloto_privado.requests
  SET buyer_key=supplier_key WHERE id=rid;
  RAISE EXCEPTION 'mvp310_supplier_impersonated_buyer';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT buyer_key FROM cotironda_piloto_privado.requests WHERE id=rid)<>buyer_key
 THEN RAISE EXCEPTION 'mvp310_buyer_request_was_transferred';END IF;

 -- Role is immutable even for a SQL UPDATE.
 BEGIN
  UPDATE cotironda_piloto_privado.participants
  SET participant_role='buyer' WHERE key=supplier_key;
  RAISE EXCEPTION 'mvp310_role_migration_was_allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;

 -- An explicit source dispute cannot be silently re-granted on retry.
 response:=cotironda_piloto_privado.admin_revoke_permission_mvp309(
  supplier_key,'source_disputed');
 IF response->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp310_admin_revoke_failed';END IF;
 response:=cotironda_piloto_privado.admin_create_participant_mvp310(
  'supplier','Ferretería de Prueba','La Plata',
  'owner_chat_20261108_mvp310_supplier01');
 IF response->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp310_revocation_ignored_by_retry';END IF;

 IF public.cotironda_piloto_finalist_contacts_mvp109(NULL)->>'state'
  <>'buyer_contact_private'
 THEN RAISE EXCEPTION 'mvp310_buyer_contact_leak';END IF;
END $mvp310$;
