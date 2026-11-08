-- MVP309: PostgreSQL17 ROLLBACK. Solo participantes, mensajes y números
-- sintéticos. Nunca graba permisos en el piloto ni envía WhatsApps.
\ir ../../piloto/mvp309_declaracion_admin_autorizacion_previa.sql
DO $mvp309$
DECLARE
 chat text:=repeat('8',64);
 msg text:=encode(sha256(convert_to('mvp309 mensaje validado de proveedor sintético','UTF8')),'hex');
 digest text:=encode(sha256(convert_to('Cotización sin datos personales','UTF8')),'hex');
 result jsonb;
BEGIN
 IF has_function_privilege('anon',
  'cotironda_piloto_privado.admin_record_permission_mvp309(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'cotironda_piloto_privado.admin_record_permission_mvp309(text,text,text)','EXECUTE')
 OR has_function_privilege('service_role',
  'cotironda_piloto_privado.admin_record_permission_mvp309(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp309_operator_exposed';END IF;
 IF has_function_privilege('anon',
  'cotironda_piloto_privado.admin_revoke_permission_mvp309(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp309_operator_revocation_exposed';END IF;

 INSERT INTO cotironda_piloto_privado.participants(
  key,participant_role,delivery_city,chat_hmac,consent_at,
  opted_out_at,catalogue_confirmed_at,display_label
 ) VALUES
 ('proveedor_operador_309','supplier','La Plata',chat,clock_timestamp(),
  NULL,clock_timestamp(),'Corralón Operador'),
 ('comprador_operador_309','buyer',NULL,repeat('9',64),
  clock_timestamp(),NULL,NULL,'Comprador Operador'),
 ('proveedor_pendiente_309','supplier','La Plata',NULL,NULL,NULL,NULL,
  'Proveedor Pendiente');

 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,processing_state,
  plaintext_sha256,nonce_b64,ciphertext_b64,source_unix
 ) VALUES (msg,chat,'proveedor_operador_309','text','needs_review',
  digest,repeat('A',16),repeat('B',64),
  extract(epoch from clock_timestamp())::bigint);
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109(
  participant_key,chat_hmac,authenticated_message_hmac,
  contact_sha256,nonce_b64,ciphertext_b64
 ) VALUES('proveedor_operador_309',chat,msg,
  repeat('f',64),repeat('C',16),repeat('D',64));

 IF cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_operador_309')
 THEN RAISE EXCEPTION 'mvp309_no_prior_authorization';END IF;
 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'proveedor_operador_309','buyer','owner_chat_20261108_mvp309_role');
 IF result->>'state'<>'role_or_participant_invalid'
 THEN RAISE EXCEPTION 'mvp309_cross_role_accepted: %',result;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
  WHERE participant_key='proveedor_operador_309')<>0
 THEN RAISE EXCEPTION 'mvp309_cross_role_modified_db';END IF;
 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'proveedor_operador_309','supplier','owner_chat_20261108_mvp309_supplier');
 IF result->>'state'<>'recorded'
  OR result->>'scope'<>'supplier_business_contact_after_close'
 THEN RAISE EXCEPTION 'mvp309_supplier_not_attested: %',result;END IF;
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_operador_309')
 THEN RAISE EXCEPTION 'mvp309_admin_attestation_not_considered';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.contact_reveal_consents_mvp109
  WHERE participant_key='proveedor_operador_309')<>0
 THEN RAISE EXCEPTION 'mvp309_fabricated_whatsapp_evidence';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.enrollment_terms_proof_mvp308
  WHERE participant_key='proveedor_operador_309')<>0
 THEN RAISE EXCEPTION 'mvp309_fabricated_signed_terms';END IF;
 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'proveedor_operador_309','supplier','owner_chat_20261108_mvp309_supplier');
 IF result->>'state'<>'already_recorded'
 THEN RAISE EXCEPTION 'mvp309_repeated_attestation_not_idempotent';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
  WHERE participant_key='proveedor_operador_309')<>1
 THEN RAISE EXCEPTION 'mvp309_duplicate_attestation';END IF;

 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'comprador_operador_309','buyer','owner_chat_20261108_mvp309_buyer');
 IF result->>'state'<>'recorded'
  OR result->>'scope'<>'buyer_standard_operations'
 THEN RAISE EXCEPTION 'mvp309_buyer_not_attested';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('comprador_operador_309')
 THEN RAISE EXCEPTION 'mvp309_buyer_contact_reveal';END IF;

 -- Se puede registrar el permiso de una futura alta, pero sin número
 -- vinculado jamás permite difundir un contacto.
 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'proveedor_pendiente_309','supplier','owner_chat_20261108_mvp309_pending');
 IF result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp309_future_registration_failed';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_pendiente_309')
 THEN RAISE EXCEPTION 'mvp309_unverified_channel_contactable';END IF;

 -- Una orden de NO por WhatsApp anula la vía declarada por el dueño.
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109(
  participant_key,source_message_hmac,approved_at,revoked_at
 ) VALUES('proveedor_operador_309',msg,NULL,clock_timestamp());
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_operador_309')
 THEN RAISE EXCEPTION 'mvp309_ignored_user_revocation';END IF;
 -- El usuario da nuevo opt-in explícito (solo simulado para aislar
 -- la prueba de revocación administrativa).
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
 SET approved_at=clock_timestamp(),revoked_at=NULL
 WHERE participant_key='proveedor_operador_309';
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_operador_309')
 THEN RAISE EXCEPTION 'mvp309_revocation_not_clearable_by_new_optin';END IF;

 result:=cotironda_piloto_privado.admin_revoke_permission_mvp309(
  'proveedor_operador_309','source_disputed');
 IF result->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp309_operator_revoke_failed';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_operador_309')
 THEN RAISE EXCEPTION 'mvp309_operator_revoke_ignored';END IF;
 result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'proveedor_operador_309','supplier','owner_chat_20261108_mvp309_supplier');
 IF result->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp309_silent_regrant_after_revoke';END IF;

 -- Contrato antiguo del arquitecto no cambia.
 IF public.cotironda_piloto_finalist_contacts_mvp109(NULL)->>'state'
  <>'buyer_contact_private'
 THEN RAISE EXCEPTION 'mvp309_architect_contact_leaked';END IF;
END $mvp309$;
