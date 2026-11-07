-- MVP288: PG17 rollback, one buyer, immutable correction source, two versions,
-- no WhatsApp sends, no dispatch and no stored personal data.
DO $test$
DECLARE
 src1 text:='Necesito cotizar 20 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.';
 src2 text; src3 text; rid1 uuid;rid2 uuid;rid3 uuid;
 review1 jsonb;review2 jsonb;failed jsonb;
 oldcode text;oldreply text;
BEGIN
 IF has_function_privilege('anon','public.cotironda_piloto_ia_review_issue_mvp279(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_review_issue_mvp279(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp288_review_public_acl';END IF;
 IF has_table_privilege('anon','cotironda_piloto_privado.ai_review_replacements_mvp288','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.ai_review_replacements_mvp288','INSERT')
 THEN RAISE EXCEPTION 'mvp288_correction_table_exposed';END IF;
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
  SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
  SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
  SET enabled=true,activated_at=clock_timestamp(),expires_at=NULL WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
  SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('6',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to(src1,'UTF8')),'hex'),clock_timestamp());
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,created_at)
 VALUES('arquitecto','La Plata',src1,repeat('6',64),'draft',clock_timestamp())
 RETURNING id INTO rid1;
 UPDATE cotironda_piloto_privado.whapi_inbox SET request_id=rid1
 WHERE message_hmac=repeat('6',64);
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit)
 VALUES(rid1,1,'bolsas de cemento CPC de 50 kg',20,'bag'),
       (rid1,2,'bolsones de arena',3,'bag');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(rid1,repeat('6',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 VALUES(rid1,1,'obra_gruesa','20 bolsas de cemento CPC de 50 kg'),
       (rid1,2,'obra_gruesa','3 bolsones de arena');
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 VALUES(rid1,'corralon_ailin',1,1,'Cemento CPC bolsa 50 kilos',
        'producto_declarado','Cemento del catálogo'),
       (rid1,'corralon_ailin',2,1,'Cemento CPC bolsa 50 kilos',
        'alternativa_razonable','Solo fixture del catálogo');
 review1:=public.cotironda_piloto_ia_review_issue_mvp279(
  repeat('a',64),repeat('6',64));
 IF review1->>'state'<>'issued' OR
   review1->'items'->0->>'description'<>'bolsas de cemento CPC de 50 kg'
 THEN RAISE EXCEPTION 'mvp288_source_fidelity_broken: %',review1;END IF;
 oldcode:=review1->>'code';
 IF public.cotironda_piloto_ia_review_delivery_mvp279(
   rid1,'api_accepted','mvp288-buyer-review-old1')->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp288_old_review_not_accepted';END IF;

 src2:='CORREGIR COTI '||oldcode||
  ': Necesito cotizar 25 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.';
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('7',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to(src2,'UTF8')),'hex'),clock_timestamp());
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,created_at)
 VALUES('arquitecto','La Plata',src2,repeat('7',64),'draft',
  clock_timestamp()+interval '1 milliseconds')
 RETURNING id INTO rid2;
 UPDATE cotironda_piloto_privado.whapi_inbox SET request_id=rid2
 WHERE message_hmac=repeat('7',64);
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit)
 VALUES(rid2,1,'bolsas de cemento CPC de 50 kg',25,'bag'),
       (rid2,2,'bolsones de arena',3,'bag');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(rid2,repeat('7',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 VALUES(rid2,1,'obra_gruesa','25 bolsas de cemento CPC de 50 kg'),
       (rid2,2,'obra_gruesa','3 bolsones de arena');
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 VALUES(rid2,'corralon_ailin',1,1,'Cemento CPC bolsa 50 kilos',
        'producto_declarado','Cemento del catálogo'),
       (rid2,'corralon_ailin',2,1,'Cemento CPC bolsa 50 kilos',
        'alternativa_razonable','Solo fixture del catálogo');
 review2:=public.cotironda_piloto_ia_review_issue_mvp279(
  repeat('a',64),repeat('7',64));
 IF review2->>'state'<>'issued'
  OR (review2->'items'->0->>'quantity')::numeric<>25
  OR (SELECT count(*) FROM
    cotironda_piloto_privado.ai_review_replacements_mvp288 l
    WHERE l.old_request_id=rid1 AND l.new_request_id=rid2
      AND l.buyer_key='arquitecto')<>1
  OR (SELECT expires_at<=clock_timestamp() FROM
    cotironda_piloto_privado.ai_buyer_review_mvp279
    WHERE request_id=rid1) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp288_old_approval_not_revoked: %',review2;END IF;
 oldreply:='CONFIRMAR COTI '||oldcode;
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('5',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to(oldreply,'UTF8')),'hex'),clock_timestamp());
 IF public.cotironda_piloto_ia_review_confirm_mvp279(
  repeat('a',64),repeat('5',64),oldreply)->>'state'='confirmed'
 THEN RAISE EXCEPTION 'mvp288_old_confirmation_bypassed';END IF;
 IF public.cotironda_piloto_ia_publish_mvp222(rid1)->>'state'='ready_for_delivery'
 THEN RAISE EXCEPTION 'mvp288_old_request_was_dispatched';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE request_id IN (rid1,rid2))<>0
 THEN RAISE EXCEPTION 'mvp288_supplier_jobs_before_approval';END IF;
 IF public.cotironda_piloto_ia_review_issue_mvp279(
  repeat('a',64),repeat('7',64))->>'state'<>'already_issued'
 THEN RAISE EXCEPTION 'mvp288_review_issued_twice';END IF;

 -- Authenticated but unknown correction code cannot close another request.
 src3:='CORREGIR COTI FFFFFFFFFFFFFFFF: Necesito cotizar 5 bolsas de cemento. Entrega en La Plata.';
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('0',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to(src3,'UTF8')),'hex'),clock_timestamp());
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,created_at)
 VALUES('arquitecto','La Plata',src3,repeat('0',64),'draft',
  clock_timestamp()+interval '2 milliseconds')
 RETURNING id INTO rid3;
 UPDATE cotironda_piloto_privado.whapi_inbox SET request_id=rid3
 WHERE message_hmac=repeat('0',64);
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit)
 VALUES(rid3,1,'bolsas de cemento',5,'bag');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(rid3,repeat('0',64));
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 VALUES(rid3,1,'obra_gruesa','5 bolsas de cemento');
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 VALUES(rid3,'corralon_ailin',1,1,'Cemento CPC bolsa 50 kilos',
        'alternativa_razonable','Solo fixture');
 failed:=public.cotironda_piloto_ia_review_issue_mvp279(
  repeat('a',64),repeat('0',64));
 IF failed->>'state'<>'correction_target_not_active'
 THEN RAISE EXCEPTION 'mvp288_unknown_correction_not_rejected: %',failed;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_review_replacements_mvp288)<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_buyer_review_mvp279
    WHERE request_id=rid3)<>0
 THEN RAISE EXCEPTION 'mvp288_bad_correction_changed_other_review';END IF;
 RAISE NOTICE 'MVP288 PASS: 50kg and bolsones, full correction version, original code revoked, foreign code denied, zero WhatsApp';
END $test$;
