-- MVP313: only synthetic PG17 rows, everything rolled back by fixture.
DO $test313$
DECLARE
 rid uuid;lid uuid:=gen_random_uuid();r jsonb;approved jsonb;
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

 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.integration_flags
 SET whatsapp_outbound_enabled=true WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 SET state='leased',lease_token=lid,leased_at=clock_timestamp(),
   finished_at=NULL,whapi_message_id=NULL
 WHERE j.request_id=rid AND j.supplier_key='corralon_ailin';
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp313_synthetic_lease_missing';END IF;

 -- Simulate an *admin-vouched* channel strictly in the synthetic fixture.
 -- Never claim this test insert is evidence of real Whapi authentication.
 approved:=cotironda_piloto_privado.admin_record_permission_mvp309(
  'corralon_ailin','supplier','owner_mvp313_synthetic_source_01');
 IF approved->>'state' NOT IN ('recorded','already_recorded')
 THEN RAISE EXCEPTION 'mvp313_synthetic_attestation_missing';END IF;
 INSERT INTO cotironda_piloto_privado.admin_channels_mvp312(
  participant_key,participant_role,source_reference,channel_id,
  chat_hmac,contact_sha256,nonce_b64,ciphertext_b64,recorded_by_db_role
 ) VALUES(
  'corralon_ailin','supplier','owner_mvp313_synthetic_source_01',
  'pilotchan_313',repeat('1',64),repeat('6',64),repeat('A',16),repeat('B',64),'postgres');

 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',lid,repeat('1',64),'pilotchan_313');
 IF r->>'state'<>'ready'
  OR r->>'supplier_key'<>'corralon_ailin'
  OR r->>'source'<>'owner_statement'
  OR r->>'nonce_b64'<>repeat('A',16)
  OR r ? 'phone' OR r ? 'recipient'
 THEN RAISE EXCEPTION 'mvp313_ready_packet_invalid: %',r;END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',lid,repeat('1',64),'wrongchannel_1');
 IF r->>'state' NOT IN ('contact_unavailable','not_authorized')
 THEN RAISE EXCEPTION 'mvp313_wrong_channel_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',gen_random_uuid(),repeat('1',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_stolen_lease_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_nahuel',lid,repeat('2',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_wrong_supplier_accepted';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',lid,repeat('3',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_cross_chat_accepted';END IF;

 approved:=cotironda_piloto_privado.admin_revoke_permission_mvp309(
  'corralon_ailin','source_disputed');
 IF approved->>'state'<>'revoked'
 THEN RAISE EXCEPTION 'mvp313_revoke_failed';END IF;
 r:=public.cotironda_piloto_ia_recipient_packet_mvp313(
  rid,'corralon_ailin',lid,repeat('1',64),'pilotchan_313');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp313_revoked_phone_retrieved';END IF;
END $test313$;
