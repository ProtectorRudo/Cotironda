-- MVP284: único circuito SQL sintético sobre las 21 migraciones coinstaladas MVP283.
-- No red, no datos personales, no cambios persistentes, no Whapi verdadero.
-- Se incluye dentro de BEGIN ... ROLLBACK de MVP283.
DO $e2e$
DECLARE
 rid uuid; rv jsonb; approved jsonb; dispatch jsonb; claim jsonb;
 pending_id text; v_source_hmac text:=repeat('b',64);
 reply text; quote_text text; quote_hmac text; quote_sha text;
 supplier text; sup_chat text; original_id text; kind text;
 idx int; offered jsonb; readback jsonb; finish jsonb; round_key text;
BEGIN
 SELECT request_id INTO STRICT rid
 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221
 WHERE source_hmac=v_source_hmac;
 -- No solicitud a proveedores sin aprobacion.
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true,activated_at=clock_timestamp(),expires_at=NULL WHERE only_row;
 rv:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF rv->>'state'<>'active' OR rv->>'buyer'<>'true'
 THEN RAISE EXCEPTION 'mvp284_continuous_buyer_not_active: %',rv;END IF;
 IF public.cotironda_piloto_ia_publish_mvp222(rid)->>'state'<>'buyer_review_required'
 THEN RAISE EXCEPTION 'mvp284_preapproval_dispatch_not_blocked';END IF;
 rv:=public.cotironda_piloto_ia_review_issue_mvp279(repeat('a',64),v_source_hmac);
 IF rv->>'state'<>'issued' OR rv->>'items_count'<>'3'
 OR rv->>'city'<>'La Plata'
 THEN RAISE EXCEPTION 'mvp284_incomplete_buyer_review: %',rv;END IF;
 IF (SELECT expires_at=created_at+interval '24 hours'
     FROM cotironda_piloto_privado.ai_buyer_review_mvp279
     WHERE request_id=rid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp284_review_ttl_mismatch';END IF;
 reply:='CONFIRMAR COTI '||(rv->>'code');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at
 ) VALUES(repeat('8',64),'arquitecto',repeat('a',64),'text',
   'needs_review',encode(sha256(convert_to(reply,'UTF8')),'hex'),clock_timestamp());
 IF public.cotironda_piloto_ia_review_confirm_mvp279(
    repeat('a',64),repeat('8',64),reply)->>'state'<>'not_authorized_or_expired'
 THEN RAISE EXCEPTION 'mvp284_confirmed_before_review_delivery';END IF;
 IF public.cotironda_piloto_ia_review_delivery_mvp279(
    rid,'api_accepted','review-mvp284-abc123456')->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp284_review_delivery_not_recorded';END IF;
 IF public.cotironda_piloto_ia_review_confirm_mvp279(
    repeat('9',64),repeat('8',64),reply)->>'state'='confirmed'
 THEN RAISE EXCEPTION 'mvp284_other_buyer_confirmed';END IF;
 approved:=public.cotironda_piloto_ia_review_confirm_mvp279(
    repeat('a',64),repeat('8',64),reply);
 IF approved->>'state'<>'confirmed'
 THEN RAISE EXCEPTION 'mvp284_buyer_confirmation_failed: %',approved;END IF;
 IF public.cotironda_piloto_ia_review_confirm_mvp279(
    repeat('a',64),repeat('8',64),reply)->>'state'='confirmed'
 THEN RAISE EXCEPTION 'mvp284_replay_confirmed';END IF;
 dispatch:=public.cotironda_piloto_ia_publish_mvp222(rid);
 IF dispatch->>'state'<>'ready_for_delivery'
 OR (dispatch->>'suppliers')::integer<>3
 THEN RAISE EXCEPTION 'mvp284_dispatch_not_published: %',dispatch;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
      WHERE request_id=rid)<>3
 THEN RAISE EXCEPTION 'mvp284_legacy_outbox_or_dispatch_count';END IF;
 -- Simulación sin API externa: cada lease recibe un ID sintético y
 -- un PDF filtrado por proveedor, una sola vez.
 FOR idx IN 1..3 LOOP
  claim:=public.cotironda_piloto_ia_claim_mvp222(rid);
  IF claim->>'state'<>'leased'
  THEN RAISE EXCEPTION 'mvp284_dispatch_lease_missing_%',claim;END IF;
  supplier:=claim->>'supplier_key';
  IF public.cotironda_piloto_ia_pdf_snapshot_mvp222(
    rid,supplier,(claim->>'lease_token')::uuid) IS NULL
  THEN RAISE EXCEPTION 'mvp284_pdf_missing';END IF;
  original_id:='mvp284-supplier-send-'||idx::text;
  -- Simular un Whapi 2xx sin messageId para un tercer negocio:
  -- nunca cuenta como solicitud efectivamente vinculable.
  IF supplier='electricidad_gamma' THEN
   IF public.cotironda_piloto_ia_finish_mvp222(
      rid,supplier,(claim->>'lease_token')::uuid,'api_accepted',NULL)
   THEN RAISE EXCEPTION 'mvp284_accepted_without_whapi_id';END IF;
   IF NOT public.cotironda_piloto_ia_finish_mvp222(
      rid,supplier,(claim->>'lease_token')::uuid,'uncertain',NULL)
   THEN RAISE EXCEPTION 'mvp284_uncertain_not_recorded';END IF;
  ELSE
   IF NOT public.cotironda_piloto_ia_finish_mvp222(
      rid,supplier,(claim->>'lease_token')::uuid,'api_accepted',original_id)
   THEN RAISE EXCEPTION 'mvp284_lease_not_finished';END IF;
  END IF;
  IF public.cotironda_piloto_ia_finish_mvp222(
    rid,supplier,(claim->>'lease_token')::uuid,'api_accepted',original_id)
  THEN RAISE EXCEPTION 'mvp284_duplicated_send';END IF;
 END LOOP;
 IF public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp284_unexpected_fourth_job';END IF;
 -- Dos respuestas documentales simuladas (sin IA ni tokens consumidos):
 -- Ailín cotiza obra gruesa; Nahuel, pintura; electricidad sigue sin oferta.
 FOR idx IN 1..2 LOOP
  supplier:=CASE WHEN idx=1 THEN 'corralon_ailin' ELSE 'corralon_nahuel' END;
  sup_chat:=CASE WHEN idx=1 THEN repeat('1',64) ELSE repeat('2',64) END;
  quote_hmac:=CASE WHEN idx=1 THEN repeat('c',64) ELSE repeat('d',64) END;
  quote_text:=CASE WHEN idx=1 THEN
   'Cemento CPC 50 kg, 20 bolsas, AR$ 9000 c/u. IVA no informado.'
   ELSE 'Pintura látex, 5 litros, AR$ 15000. IVA no informado.' END;
  SELECT whapi_message_id INTO STRICT original_id
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  WHERE request_id=rid AND supplier_key=supplier;
  quote_sha:=encode(sha256(convert_to(quote_text,'UTF8')),'hex');
  INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,participant_key,chat_hmac,kind,processing_state,
   plaintext_sha256,received_at,nonce_b64,ciphertext_b64
  ) VALUES(quote_hmac,supplier,sup_chat,'text','unmatched_quote',
   quote_sha,clock_timestamp(),'AAAAAAAAAAAAAAAA','placeholder_cifrado');
  rv:=public.cotironda_piloto_ia_link_supplier_mvp225(
    quote_hmac,sup_chat,original_id,quote_text);
  IF rv->>'state'<>'linked_for_semantic_review'
  THEN RAISE EXCEPTION 'mvp284_quote_not_linked_%: %',idx,rv;END IF;
  rv:=public.cotironda_piloto_ia_reserve_quote_mvp227(quote_hmac,sup_chat);
  IF rv->>'state'<>'reserved'
  THEN RAISE EXCEPTION 'mvp284_quote_reserve_failed_%: %',idx,rv;END IF;
  offered:=jsonb_build_object(
   'estado','verificada_para_comparacion','moneda','ARS',
   'iva','no_informado','flete','no_informado','pago','no_informado',
   'rubros',jsonb_build_array(jsonb_build_object(
    'rubro',CASE WHEN idx=1 THEN 'obra_gruesa' ELSE 'pintura' END,
    'solicitados',1,'respondidos',1,'cobertura','completa')),
   'precios',jsonb_build_array(jsonb_build_object(
    'pedidoId',CASE WHEN idx=1 THEN 'item_1' ELSE 'item_2' END,
    'centavos',CASE WHEN idx=1 THEN '900000' ELSE '1500000' END,
    'cantidad',CASE WHEN idx=1 THEN '20' ELSE '5' END,
    'unidad',CASE WHEN idx=1 THEN 'bag' ELSE 'l' END))
  );
  finish:=public.cotironda_piloto_ia_finish_quote_mvp227(
    quote_hmac,sup_chat,'verified',NULL,offered);
  IF finish->>'state'<>'saved_private'
  THEN RAISE EXCEPTION 'mvp284_quote_finish_failed_%: %',idx,finish;END IF;
 END LOOP;
 -- El token es sintético. La proyección pública nunca revela contactos,
 -- ni compara totales globales de presupuestos con cobertura diferente.
 INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091(
  request_id,token_hash,expires_at) VALUES(rid,repeat('f',64),
  clock_timestamp()+interval '4 days');
 readback:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('f',64));
 IF readback->>'state'<>'rubros_por_articulo'
 OR jsonb_array_length(readback->'ofertas')<>2
 OR jsonb_array_length(readback->'items')<>3
 OR readback->>'ranking_global_permitido'<>'false'
 OR readback->>'adjudicacion_automatica'<>'false'
 OR readback->>'contactos_revelados'<>'false'
 THEN RAISE EXCEPTION 'mvp284_buyer_projection_failed: %',readback;END IF;
 IF public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('a',64))->>'state'
    <>'not_found'
 THEN RAISE EXCEPTION 'mvp284_foreign_token_unlocked';END IF;
 IF readback::text ~ '(corralon_ailin|corralon_nahuel|@s.whatsapp.net|221[0-9]{7})'
 THEN RAISE EXCEPTION 'mvp284_supplier_contact_leak';END IF;
 -- Modo sin vencimiento breve: apagar nuevos pedidos NO invalida
 -- la respuesta permitida de un proveedor previamente invitado.
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=false,activated_at=NULL,expires_at=NULL WHERE only_row;
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64))->>'buyer'
    <>'false'
 THEN RAISE EXCEPTION 'mvp284_new_buyer_orders_not_disabled';END IF;
 IF public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64))->>'quote_link'
    <>'true'
 THEN RAISE EXCEPTION 'mvp284_existing_supplier_lost_continuation';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=false,activated_at=NULL WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=false,activated_at=NULL WHERE only_row;
 RAISE NOTICE 'MVP284 PASS: buyer review 3 rubros, 3 PDF, 2 quotes, buyer anonymous ranking OFF, trial continuity';
END $e2e$;
