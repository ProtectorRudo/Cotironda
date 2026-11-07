-- MVP303: regresión PG17 sintética sobre MVP284 y MISMA transacción ROLLBACK.
-- Tres proveedores invitados (dos cotizaron, tercero no confirmado).
-- Ningún contacto/número, ningún WhatsApp, ninguna adjudicación.
DO $mvp303_test$
DECLARE
 rid uuid; v jsonb; verified_labels text[];
BEGIN
 SELECT request_id INTO STRICT rid
 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221
 WHERE source_hmac=repeat('b',64);
 -- Sin activación prospectiva no aparecen nombres, ni aun con bearer válido.
 v:=public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64));
 IF v->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp303_activation_off_leaked';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_all_suppliers_closed_mvp303(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_all_suppliers_closed_mvp303(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_all_suppliers_closed_mvp303(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp303_acl_invalid';END IF;
 UPDATE cotironda_piloto_privado.all_supplier_reveal_activation_mvp303
 SET enabled=true,activated_at=(
  SELECT created_at-interval '1 second'
  FROM cotironda_piloto_privado.requests WHERE id=rid
 ) WHERE only_row;
 v:=public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64));
 IF v->>'state'<>'not_ready'
 THEN RAISE EXCEPTION 'mvp303_before_deadline_leaked';END IF;
 IF public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('a',64))->>'state'
   <>'not_found'
 THEN RAISE EXCEPTION 'mvp303_foreign_token_leaked';END IF;
 -- Esta mutación es SOLO dentro de PG17 con rollback.
 UPDATE cotironda_piloto_privado.requests
 SET state='closed',closes_at=now()-interval '1 hour',
  closed_at=now()-interval '1 hour'
 WHERE id=rid;
 v:=public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64));
 IF v->>'state'<>'proveedores_revelados_al_cierre' OR
   (v->>'cantidad')::integer<>3 OR
   (v->>'invitados')::integer<>3 OR
   v->>'solo_post_cierre'<>'true' OR
   v->>'identidades_reveladas'<>'true' OR
   v->>'telefonos_revelados'<>'false' OR
   v->>'adjudicacion_automatica'<>'false' OR
   v->>'mensajes_enviados'<>'false'
 THEN RAISE EXCEPTION 'mvp303_closed_did_not_reveal_three';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(v->'proveedores') x
    WHERE x->>'estado'='presupuesto_verificado')<>2
 THEN RAISE EXCEPTION 'mvp303_two_valid_quotes_not_found';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(v->'proveedores') x
    WHERE x->>'estado'='envio_no_confirmado' AND x->>'oferta' IS NULL)<>1
 THEN RAISE EXCEPTION 'mvp303_pending_supplier_not_shown';END IF;
 IF (SELECT count(DISTINCT x->>'oferta')
     FROM jsonb_array_elements(v->'proveedores') x
     WHERE x->>'oferta' IS NOT NULL)<>2
 THEN RAISE EXCEPTION 'mvp303_quotations_not_unique';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'proveedores') x
  WHERE x->>'nombre' IS NULL OR x ? 'supplier_key' OR
     x ? 'whatsapp' OR x ? 'telefono' OR x ? 'chat_hmac')
 THEN RAISE EXCEPTION 'mvp303_identity_or_phone_leak';END IF;
 IF (v::text ~ '(whatsapp.net|[0-9]{10,}|source_sha256|ciphertext_b64|message_hmac)')
 THEN RAISE EXCEPTION 'mvp303_private_source_exposure';END IF;
 -- La vista comercial sigue anónima: el nuevo RPC no cambia sus etiquetas.
 IF (SELECT count(*) FROM jsonb_array_elements(
   public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('f',64))->'ofertas') o
   WHERE o ? 'supplier_key' OR o ? 'nombre')<>0
 THEN RAISE EXCEPTION 'mvp303_modified_anonymous_offer_view';END IF;
 -- Retiro de consentimiento: no se divulga un proveedor retirado.
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=now() WHERE key='corralon_ailin';
 v:=public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64));
 IF (v->>'cantidad')::integer<>2 OR (v->>'invitados')::integer<>3
 THEN RAISE EXCEPTION 'mvp303_supplier_optout_not_obeyed';END IF;
 -- El token revocado jamás permite ver nombres.
 UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=now() WHERE request_id=rid;
 IF public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64))
    ->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp303_token_revocation_ignored';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110)<>0
 THEN RAISE EXCEPTION 'mvp303_unexpected_notification';END IF;
 RAISE NOTICE 'MVP303 PG17 OK: all 3 at closure, 2 verified, 1 not delivered; no preclose leak, optout and token revoke respected';
END $mvp303_test$;
