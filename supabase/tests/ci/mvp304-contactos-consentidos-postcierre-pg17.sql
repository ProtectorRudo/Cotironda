-- MVP304: PostgreSQL17 synthetic only. Runs AFTER MVP303 synthetic round,
-- in the SAME TRANSACTION and final ROLLBACK. The encrypted blobs below
-- are DUMMY values: cryptographic decrypt tested separately with WebCrypto.
DO $mvp304_test$
DECLARE rid uuid; result jsonb; opt_hash text;
BEGIN
 SELECT request_id INTO STRICT rid FROM
 cotironda_piloto_privado.ai_shadow_requests_mvp221
 WHERE source_hmac=repeat('b',64);
 -- MVP303's test revoked the bearer and opted out a supplier.
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=NULL WHERE request_id=rid;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key='corralon_ailin';
 result:=public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64));
 IF result->>'state'<>'private_consented_contacts' OR
    result->>'count'<>'0'
 THEN RAISE EXCEPTION 'mvp304_consent_is_not_automatic';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_all_supplier_contacts_mvp304(text)','EXECUTE')
  OR has_function_privilege('authenticated',
   'public.cotironda_piloto_all_supplier_contacts_mvp304(text)','EXECUTE')
  OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_all_supplier_contacts_mvp304(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp304_public_grant';END IF;
 -- Two real-style WhatsApp opt-in messages (SYNTHETIC, no sending).
 opt_hash:=encode(sha256(convert_to('COTI CONTACTOS SI','UTF8')),'hex');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,participant_key,chat_hmac,kind,processing_state,
   plaintext_sha256,received_at)
 VALUES
  (repeat('e',64),'corralon_ailin',repeat('1',64),'text',
   'needs_review',opt_hash,now()-interval '2 minutes'),
  (repeat('f',64),'corralon_nahuel',repeat('2',64),'text',
   'needs_review',opt_hash,now()-interval '2 minutes');
 INSERT INTO cotironda_piloto_privado.participant_channels_mvp109(
   participant_key,chat_hmac,contact_sha256,nonce_b64,
   ciphertext_b64,authenticated_message_hmac)
 VALUES
  ('corralon_ailin',repeat('1',64),repeat('6',64),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',repeat('e',64)),
  ('corralon_nahuel',repeat('2',64),repeat('7',64),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',repeat('f',64));
 -- First seller explicitly opted in; second seller name-only.
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109(
   participant_key,approved_at,revoked_at,source_message_hmac)
 VALUES('corralon_ailin',clock_timestamp(),NULL,repeat('e',64));
 result:=public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64));
 IF result->>'count'<>'1' OR
   jsonb_array_length(result->'contacts_encrypted')<>1 OR
   result->>'buyer_phone_included'<>'false' OR
   result->>'messages_sent'<>'false' OR
   result->>'automatic_award'<>'false' OR
   result::text LIKE '%arquitecto%'
 THEN RAISE EXCEPTION 'mvp304_partial_optin_not_respected';END IF;
 IF (result->'contacts_encrypted'->0->>'supplier_key')<>'corralon_ailin'
 THEN RAISE EXCEPTION 'mvp304_wrong_approved_seller';END IF;
 -- No winner restriction. More consented sellers => more visible numbers.
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109(
   participant_key,approved_at,revoked_at,source_message_hmac)
 VALUES('corralon_nahuel',clock_timestamp(),NULL,repeat('f',64));
 result:=public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64));
 IF result->>'count'<>'2'
 THEN RAISE EXCEPTION 'mvp304_two_optins_not_visible';END IF;
 -- Revoking one specific consent hides only that phone.
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
 SET revoked_at=clock_timestamp() WHERE participant_key='corralon_ailin';
 result:=public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64));
 IF result->>'count'<>'1' OR
  (result->'contacts_encrypted'->0->>'supplier_key')<>'corralon_nahuel'
 THEN RAISE EXCEPTION 'mvp304_revocation_not_respected';END IF;
 -- Revoke bearer: cannot retrieve old contacts even after closure.
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=clock_timestamp() WHERE request_id=rid;
 IF public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64))
    ->>'state'<>'not_ready'
 THEN RAISE EXCEPTION 'mvp304_revoked_buyer_bearer';END IF;
 -- Request before activation of MVP303 => never eligible.
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=NULL WHERE request_id=rid;
 UPDATE cotironda_piloto_privado.all_supplier_reveal_activation_mvp303
 SET enabled=false,activated_at=NULL WHERE only_row;
 IF public.cotironda_piloto_all_supplier_contacts_mvp304(repeat('f',64))
    ->>'state'<>'not_ready'
 THEN RAISE EXCEPTION 'mvp304_activation_off';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110)<>0
 THEN RAISE EXCEPTION 'mvp304_sent_whatsapp';END IF;
 RAISE NOTICE 'MVP304 PG17 PASS: 0/1/2 consented phones, revoked consent/bearer/gate blocked, buyer contact never included';
END $mvp304_test$;
