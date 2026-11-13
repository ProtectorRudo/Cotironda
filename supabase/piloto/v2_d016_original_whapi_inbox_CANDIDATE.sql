-- Cotironda V2 / D016 / #838: asociar entrada autenticada de Whapi al
-- ledger privado. CANDIDATO SIN ACTIVAR. No abre descargas ni crea consent.
-- Fuentes: whapi_inbox, ai_supplier_links, notice_ledger, media_archive.
-- Las RPC son EXCLUSIVAS service_role, no llamadas desde navegador.
CREATE FUNCTION public.cotironda_piloto_v2_d016_record_reply_event_private(
 p_message_hmac text,p_chat_hmac text,p_quoted_whapi_id text,
 p_is_forwarded boolean,p_is_quote boolean
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO '' AS $fn$
DECLARE v record; n integer:=0; v_request uuid; v_supplier text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_is_forwarded IS DISTINCT FROM false
 OR p_is_quote IS DISTINCT FROM true
 OR (p_quoted_whapi_id IS NOT NULL
     AND p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$')
 THEN RETURN 'denied';END IF;

 -- IdWhapi citado debe ser el del pedido; en ronda unica, NULL y no
 -- puede coexistir ninguna otra ronda vigente del mismo proveedor.
 -- El SQL original vuelve a validar SHA, media, plazos y bajas.
 FOR v IN
 SELECT DISTINCT link.request_id,link.supplier_key
 FROM cotironda_piloto_privado.whapi_inbox src
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=src.message_hmac
  AND link.request_id=src.request_id
  AND link.supplier_key=src.participant_key
  AND link.kind=src.kind
  AND link.status='awaiting_semantic_review'
  AND link.association IN ('quoted_whapi_id','single_active_round')
 JOIN cotironda_piloto_privado.v2_d016_original_notice_ledger notice
  ON notice.request_id=link.request_id
  AND notice.supplier_key=link.supplier_key
  AND notice.chat_hmac=src.chat_hmac
  AND notice.state='api_accepted'
  AND notice.api_accepted_at IS NOT NULL
  AND src.received_at>notice.api_accepted_at
  AND (
   (link.association='quoted_whapi_id'
    AND p_quoted_whapi_id=notice.whapi_message_id)
   OR
   (link.association='single_active_round'
    AND p_quoted_whapi_id IS NULL)
  )
 WHERE src.message_hmac=p_message_hmac
  AND src.chat_hmac=p_chat_hmac
  AND src.received_at<=clock_timestamp()
 LOOP
  n:=n+1;
  IF n>1 THEN RETURN 'denied';END IF;
  v_request:=v.request_id;v_supplier:=v.supplier_key;
 END LOOP;
 IF n<>1 THEN RETURN 'denied';END IF;
 IF public.cotironda_piloto_v2_d016_observe_original_reply_private(
     v_request,v_supplier,p_message_hmac,p_quoted_whapi_id,
     false,true
 ) THEN RETURN 'verified_reply_not_authorization';END IF;
 RETURN 'denied';
END
$fn$;

-- Baja inequívoca: el texto exacto (variantes de mayúscula y punto) se
-- corrobora CON SHA-256 real de whapi_inbox, no con booleano del caller.
-- Revoca para TODAS las rondas del proveedor con aviso previamente
-- reservado: ante dudas preferimos no exponer un original.
CREATE FUNCTION public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 p_message_hmac text,p_chat_hmac text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO '' AS $fn$
DECLARE v_count integer:=0;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN 0;END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_revocations
 (request_id,supplier_key,message_hmac,revoked_at)
 SELECT notice.request_id,notice.supplier_key,src.message_hmac,src.received_at
 FROM cotironda_piloto_privado.whapi_inbox src
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=src.participant_key AND supplier.chat_hmac=src.chat_hmac
  AND supplier.participant_role='supplier'
 JOIN cotironda_piloto_privado.v2_d016_original_notice_ledger notice
  ON notice.supplier_key=supplier.key AND notice.chat_hmac=src.chat_hmac
  AND notice.reserved_at<=src.received_at
 WHERE src.message_hmac=p_message_hmac AND src.chat_hmac=p_chat_hmac
  AND src.kind='text' AND src.received_at<=clock_timestamp()
  AND src.plaintext_sha256 IN (
   SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(msg,'UTF8')),'hex')
   FROM pg_catalog.unnest(ARRAY[
    'NO COMPARTIR','No compartir','no compartir',
    'NO COMPARTIR.','No compartir.','no compartir.'
   ]::text[]) AS msg
  )
 ON CONFLICT (request_id,supplier_key) DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count;
END
$fn$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)
 TO service_role;
