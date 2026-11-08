-- MVP313: only synthetic PG17 rows, all reverted by enclosing ROLLBACK.
DO $test313$
DECLARE
 rid uuid;lid uuid:=gen_random_uuid();r jsonb;added jsonb;approved jsonb;
 new_supplier text; new_chat text:=repeat('7',64);
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_is_supplier_mvp313(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp313_public_private_packet_leak';END IF;

 IF public.cotironda_piloto_is_supplier_mvp313(repeat('a',64))
 OR public.cotironda_piloto_is_supplier_mvp313(repeat('0',64))
 OR public.cotironda_piloto_is_supplier_mvp313('invalid')
 OR NOT public.cotironda_piloto_is_supplier_mvp313(repeat('1',64))
 THEN RAISE EXCEPTION 'mvp313_supplier_role_not_separated';END IF;

 SELECT j.request_id INTO rid
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests req ON req.id=j.request_id
 WHERE j.supplier_key='corralon_ailin' AND req.state='prepared'
 LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp313_original_central_round_missing';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',lid,repeat('1',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_unleased_request_granted';END IF;

 -- Create a NEW supplier using the REAL MVP312 admin enrollment function,
 -- then add one matching product to a verified synthetic central request.
 -- This is not a real supplier or real channel; no Whapi message is created.
 added:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
  'supplier','Proveedor Nuevo MVP313','La Plata',
  'owner_mvp313_new_supplier_auth_001',
  'pilotchan_313',new_chat,repeat('8',64),repeat('C',16),repeat('D',64));
 IF added->>'state'<>'created_and_bound'
 THEN RAISE EXCEPTION 'mvp313_operator_supplier_creation: %',added;END IF;
 new_supplier:=added->>'participant_key';
 INSERT INTO cotironda_piloto_privado.catalogue_lines(
  participant_key,line_no,literal_description,family_code,recognition_state)
 SELECT new_supplier,line_no,literal_description,family_code,recognition_state
 FROM cotironda_piloto_privado.catalogue_lines
 WHERE participant_key='corralon_ailin' AND line_no=1;

 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,catalogue_description,tipo,explicacion)
 SELECT request_id,new_supplier,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
 WHERE request_id=rid AND supplier_key='corralon_ailin';
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp313_no_matched_supplier_items';END IF;
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 VALUES(rid,new_supplier);
 INSERT INTO cotironda_piloto_privado.invitation_lines_mvp099(
  request_id,supplier_key,line_no)
 SELECT request_id,new_supplier,line_no
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
 WHERE request_id=rid AND supplier_key=new_supplier;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at)
 VALUES(rid,new_supplier,'leased',lid,clock_timestamp());

 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.integration_flags
 SET whatsapp_outbound_enabled=true WHERE only_row;

 -- A valid synthetic buyer approval must cover the newly added supplier
 -- route and its exact snapshot. No customer message is sent.
 INSERT INTO cotironda_piloto_privado.ai_buyer_review_mvp279(
  request_id,buyer_key,chat_hmac,source_hmac,snapshot_sha256,
  code_sha256,state,whapi_message_id,confirmed_reply_hmac,
  expires_at,sent_at,confirmed_at
 ) SELECT req.id,req.buyer_key,buyer.chat_hmac,req.source_hmac,
  encode(sha256(convert_to(
   cotironda_piloto_privado.ai_buyer_snapshot_mvp279(req.id)::text,
   'UTF8')),'hex'),
  encode(sha256(convert_to('mvp313-review-code-'||req.id,'UTF8')),'hex'),
  'confirmed','mvp313_test_msg_01234',
  encode(sha256(convert_to('mvp313-confirm-reply-'||req.id,'UTF8')),'hex'),
  clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()
 FROM cotironda_piloto_privado.requests req
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=req.buyer_key
 WHERE req.id=rid
 ON CONFLICT(request_id) DO UPDATE SET
  state='confirmed',whapi_message_id='mvp313_test_msg_01234',
  sent_at=clock_timestamp(),confirmed_at=clock_timestamp(),
  confirmed_reply_hmac=EXCLUDED.confirmed_reply_hmac,
  snapshot_sha256=EXCLUDED.snapshot_sha256;
 IF NOT cotironda_piloto_privado.confirmada_comprador_mvp280(rid)
 THEN RAISE EXCEPTION 'mvp313_fixture_buyer_not_confirmed';END IF;

 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307(new_supplier)
 THEN RAISE EXCEPTION 'mvp313_new_supplier_owner_consent_missing';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,new_supplier,lid,new_chat,'pilotchan_313');
 IF r->>'state'<>'ready' OR r->>'supplier_key'<>new_supplier
  OR r->>'source'<>'owner_statement'
  OR r->>'nonce_b64'<>repeat('C',16)
  OR r ? 'phone' OR r ? 'recipient'
 THEN RAISE EXCEPTION 'mvp313_ready_new_supplier_invalid: %, snapshot=%',
  r,public.cotironda_piloto_ia_pdf_snapshot_mvp222(rid,new_supplier,lid);END IF;

 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,new_supplier,lid,new_chat,'wrongchannel_1');
 IF r->>'state' NOT IN ('contact_unavailable','not_authorized')
 THEN RAISE EXCEPTION 'mvp313_wrong_channel_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,new_supplier,gen_random_uuid(),new_chat,'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_stolen_lease_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_nahuel',lid,repeat('2',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_wrong_supplier_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,new_supplier,lid,repeat('3',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_cross_chat_accepted';END IF;

 approved:=cotironda_piloto_privado.admin_revoke_permission_mvp309(
  new_supplier,'source_disputed');
 IF approved->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp313_revoke_failed';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,new_supplier,lid,new_chat,'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_revoked_phone_retrieved';END IF;
END $test313$;
