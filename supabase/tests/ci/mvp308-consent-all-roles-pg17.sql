-- MVP308 · PostgreSQL 17 sintético. Incluido dentro de BEGIN/ROLLBACK
-- por scripts/piloto/mvp308-generar-fixture-pg17.mjs.
\ir ../../piloto/mvp308_autorizacion_unica_todos_roles_y_privacidad.sql

DO $mvp308$
DECLARE
 buyer_code text:=repeat('c',32);supplier_code text:=repeat('d',32);
 buyer_chat text:=repeat('6',64);supplier_chat text:=repeat('7',64);
 buyer_msg text:=encode(sha256(convert_to('mvp308:unico:buyer','UTF8')),'hex');
 supplier_msg text:=encode(sha256(convert_to('mvp308:unico:supplier','UTF8')),'hex');
 phrase text;digest text;result jsonb;pid text;
BEGIN
 IF (SELECT count(*) FROM cotironda_piloto_privado.enrollment_policies_mvp308)<>2
 THEN RAISE EXCEPTION 'mvp308_missing_role_policies';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_enroll_terms_mvp308(text,text,text,text,text,text,text,bigint,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_enroll_terms_mvp308(text,text,text,text,text,text,text,bigint,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp308_public_rpc_leak';END IF;
 IF cotironda_piloto_privado.terminos_aceptados_mvp308('arquitecto')
 THEN RAISE EXCEPTION 'mvp308_historical_buyer_falsely_accepted';END IF;

 -- BUYER: sólo una aceptación; contacto cifrado para responder, no revelar.
 INSERT INTO cotironda_piloto_privado.participants(
  key,participant_role,delivery_city,chat_hmac,consent_at,
  opted_out_at,catalogue_confirmed_at,display_label
 ) VALUES('comprador_nuevo_308','buyer',NULL,NULL,NULL,NULL,NULL,
  'Comprador de pruebas');
 INSERT INTO cotironda_piloto_privado.enrollment_codes(
  participant_key,code_hash,created_at,expires_at)
 VALUES('comprador_nuevo_308',
  encode(sha256(convert_to(buyer_code,'UTF8')),'hex'),
  clock_timestamp(),clock_timestamp()+interval '1 hour');

 phrase:='COTI ALTA '||buyer_code||' ACEPTO';
 digest:=encode(sha256(convert_to(phrase,'UTF8')),'hex');
 result:=public.cotironda_piloto_enroll_terms_mvp308(
  'supplier',buyer_code,buyer_chat,buyer_msg,repeat('A',16),
  repeat('B',64),encode(sha256(convert_to(
    'COTI ALTA '||buyer_code||' CONTACTOS SI','UTF8')),'hex'),
  extract(epoch from clock_timestamp())::bigint,
  repeat('e',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'code_or_role_not_valid'
 THEN RAISE EXCEPTION 'mvp308_buyer_code_as_supplier: %',result;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants
  WHERE key='comprador_nuevo_308' AND chat_hmac IS NOT NULL)
 THEN RAISE EXCEPTION 'mvp308_role_confusion_mutated_identity';END IF;
 result:=public.cotironda_piloto_enroll_terms_mvp308(
  'buyer',buyer_code,buyer_chat,buyer_msg,repeat('A',16),
  repeat('B',64),digest,extract(epoch from clock_timestamp())::bigint,
  repeat('e',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'enrolled_with_terms'
 THEN RAISE EXCEPTION 'mvp308_buyer_one_step_signup: %',result;END IF;
 IF NOT cotironda_piloto_privado.terminos_aceptados_mvp308('comprador_nuevo_308')
 THEN RAISE EXCEPTION 'mvp308_buyer_terms_not_saved';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.contact_reveal_consents_mvp109
  WHERE participant_key='comprador_nuevo_308')
 THEN RAISE EXCEPTION 'mvp308_buyer_contact_permission_leak';END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109
  WHERE participant_key='comprador_nuevo_308' AND chat_hmac=buyer_chat)
 THEN RAISE EXCEPTION 'mvp308_buyer_encrypted_channel_missing';END IF;
 result:=public.cotironda_piloto_enroll_terms_mvp308(
  'buyer',buyer_code,buyer_chat,buyer_msg,repeat('A',16),
  repeat('B',64),digest,extract(epoch from clock_timestamp())::bigint,
  repeat('e',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'already_enrolled'
 THEN RAISE EXCEPTION 'mvp308_buyer_duplicate_accepted: %',result;END IF;

 -- SUPPLIER: el mismo mensaje de alta cubre términos y contacto comercial.
 INSERT INTO cotironda_piloto_privado.participants(
  key,participant_role,delivery_city,chat_hmac,consent_at,
  opted_out_at,catalogue_confirmed_at,display_label
 ) VALUES('proveedor_nuevo_308','supplier','La Plata',NULL,NULL,NULL,NULL,
  'Proveedor Prueba Sur');
 INSERT INTO cotironda_piloto_privado.enrollment_codes(
  participant_key,code_hash,created_at,expires_at)
 VALUES('proveedor_nuevo_308',
  encode(sha256(convert_to(supplier_code,'UTF8')),'hex'),
  clock_timestamp(),clock_timestamp()+interval '1 hour');
 phrase:='COTI ALTA '||supplier_code||' CONTACTOS SI';
 digest:=encode(sha256(convert_to(phrase,'UTF8')),'hex');
 result:=public.cotironda_piloto_enroll_terms_mvp308(
  'supplier',supplier_code,supplier_chat,supplier_msg,repeat('A',16),
  repeat('B',64),digest,extract(epoch from clock_timestamp())::bigint,
  repeat('f',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'enrolled_with_terms'
 THEN RAISE EXCEPTION 'mvp308_supplier_one_step_signup: %',result;END IF;
 IF NOT cotironda_piloto_privado.terminos_aceptados_mvp308('proveedor_nuevo_308')
 THEN RAISE EXCEPTION 'mvp308_supplier_terms_not_saved';END IF;
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_nuevo_308')
 THEN RAISE EXCEPTION 'mvp308_supplier_contact_not_consented';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.enrollment_terms_proof_mvp308
  WHERE participant_key='proveedor_nuevo_308')<>1
 THEN RAISE EXCEPTION 'mvp308_supplier_terms_duplicate';END IF;
 IF (SELECT policy_sha256 FROM cotironda_piloto_privado.enrollment_terms_proof_mvp308
  WHERE participant_key='proveedor_nuevo_308') IS DISTINCT FROM
  (SELECT encode(sha256(convert_to(policy_text,'UTF8')),'hex')
   FROM cotironda_piloto_privado.enrollment_policies_mvp308
   WHERE role='supplier' AND version=1)
 THEN RAISE EXCEPTION 'mvp308_policy_hash_changed';END IF;
 result:=public.cotironda_piloto_enroll_terms_mvp308(
  'supplier',supplier_code,supplier_chat,supplier_msg,repeat('A',16),
  repeat('B',64),digest,extract(epoch from clock_timestamp())::bigint,
  repeat('f',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'already_enrolled'
 THEN RAISE EXCEPTION 'mvp308_supplier_duplicate_accepted: %',result;END IF;
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
 SET revoked_at=clock_timestamp() WHERE participant_key='proveedor_nuevo_308';
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('proveedor_nuevo_308')
 THEN RAISE EXCEPTION 'mvp308_revoked_supplier_contact_still_visible';END IF;

 -- El corredor antiguo de finalistas JAMÁS comunica el número del comprador.
 IF public.cotironda_piloto_finalist_contacts_mvp109(NULL)->>'state'
  <>'buyer_contact_private'
 THEN RAISE EXCEPTION 'mvp308_legacy_buyer_disclosure_open';END IF;
 IF public.cotironda_piloto_queue_finalists_mvp110(NULL)->>'state'
  <>'replaced_by_all_supplier_reveal'
 THEN RAISE EXCEPTION 'mvp308_legacy_queue_open';END IF;
 IF public.cotironda_piloto_authorize_finalist_whapi_mvp110(
  NULL,NULL,NULL)->>'state'<>'replaced_by_all_supplier_reveal'
 THEN RAISE EXCEPTION 'mvp308_legacy_whapi_authorization_open';END IF;
END $mvp308$;
