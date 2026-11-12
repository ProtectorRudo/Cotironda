-- Cotironda V2-02 · resolución SIN escritura por código visible de solicitud.
-- Sólo es una pista acreditada para recuperar el ID del WhatsApp SALIENTE.
-- La vinculación definitiva sigue en cotironda_piloto_ia_link_supplier_mvp225:
-- verifica nuevamente mensaje citado, emisor, fuente, ronda, invitación y hash.
-- No instala nada hasta PUBLICAR expresamente la migración en PILOTO.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_quoted_id_for_reference(
 p_message_hmac text,
 p_chat_hmac text,
 p_original_text text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_source record;
 v_code text;
 v_codes integer;
 v_candidates integer;
 v_quoted text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_original_text IS NULL
 OR length(p_original_text) NOT BETWEEN 1 AND 3000
 OR p_original_text ~ '[[:cntrl:]]'
 THEN RETURN jsonb_build_object('state','invalid_input'); END IF;

 -- ÚNICAMENTE un texto original efectivamente registrado por el webhook,
 -- de proveedor permitido. Ni un LLM ni el comprador pueden inventar el código.
 SELECT m.participant_key,m.received_at
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants p
 ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac
 AND m.chat_hmac=p_chat_hmac
 AND m.kind='text' AND m.request_id IS NULL
 AND m.processing_state IN('unmatched_quote','needs_review')
 AND m.plaintext_sha256=encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
 AND p.participant_role='supplier'
 AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state','source_not_authorized');
 END IF;

 -- La referencia figura ya en el PDF histórico como los PRIMEROS 8
 -- caracteres del UUID. El caption V2 la repite sin pedir al proveedor
 -- que escriba, edite o confirme nada.
 -- Se exige marcador comercial explícito, no un número suelto.
 SELECT count(*),min(ref) INTO v_codes,v_code
 FROM (
  SELECT DISTINCT captures[2] AS ref
  FROM regexp_matches(
   upper(p_original_text),
   '(COTIRONDA[[:space:]]+PEDIDO|COTI)[[:space:]:#-]*([A-F0-9]{8})([^A-F0-9]|$)',
   'g'
  ) AS m(captures)
 ) refs;
 IF v_codes=0 THEN RETURN jsonb_build_object('state','reference_absent'); END IF;
 IF v_codes<>1 THEN RETURN jsonb_build_object('state','reference_ambiguous'); END IF;

 -- No elegir por antigüedad ni por materiales similares: la única prueba
 -- es un despacho real aceptado, enviado a ESTE proveedor con esa referencia.
 -- La función de vinculación posterior revalida este Whapi ID.
 SELECT count(*),min(job.whapi_message_id)
 INTO v_candidates,v_quoted
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
 JOIN cotironda_piloto_privado.requests r ON r.id=job.request_id
 JOIN cotironda_piloto_privado.invitations inv
 ON inv.request_id=r.id AND inv.supplier_key=job.supplier_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
 ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer
 ON buyer.key=r.buyer_key
 WHERE job.supplier_key=v_source.participant_key
 AND job.state='api_accepted'
 AND job.whapi_message_id ~ '^[A-Za-z0-9._:-]{8,160}$'
 AND job.finished_at IS NOT NULL
 AND job.finished_at<=v_source.received_at
 AND r.created_at<=v_source.received_at
 AND r.closes_at>v_source.received_at
 AND r.state='prepared' AND inv.state='prepared'
 AND sh.status='shadow'
 AND buyer.participant_role='buyer'
 AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 AND upper(substr(r.id::text,1,8))=v_code;

 IF v_candidates<>1 OR v_quoted IS NULL THEN
  RETURN jsonb_build_object('state',
   CASE WHEN v_candidates>1 THEN 'reference_ambiguous'
   ELSE 'reference_not_linkable' END);
 END IF;
 RETURN jsonb_build_object('state','matched','quoted_whapi_id',v_quoted);
END;
$v2$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_quoted_id_for_reference(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_quoted_id_for_reference(text,text,text)
 TO service_role;
