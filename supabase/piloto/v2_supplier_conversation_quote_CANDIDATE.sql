-- CANDIDATO OFF. Reutiliza asociación, reserva y validación MVP225/227.
-- Cada fragmento sigue siendo un original independiente. La interpretación se ancla
-- a una fuente real y se acompaña de un manifiesto de todas las fuentes.
ALTER TABLE cotironda_piloto_privado.v2_supplier_conversations
 ADD COLUMN quote_request_id uuid REFERENCES cotironda_piloto_privado.requests(id),
 ADD COLUMN quote_anchor_hmac text REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 ADD COLUMN quote_context_sha256 text CHECK(quote_context_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT v2_supplier_group_quote_fields CHECK((quote_request_id IS NULL AND quote_anchor_hmac IS NULL AND quote_context_sha256 IS NULL) OR (quote_request_id IS NOT NULL AND quote_anchor_hmac IS NOT NULL AND quote_context_sha256 IS NOT NULL));
-- Importes de presentación: se extraen exclusivamente de los fragmentos
-- auténticos ya verificados en la misma transacción. No se usa texto de IA.
ALTER TABLE cotironda_piloto_privado.v2_supplier_conversations
 ADD COLUMN quote_amount_display jsonb;
CREATE FUNCTION cotironda_piloto_privado.v2_group_declared_amount(p_source text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path TO '' AS $fn$
DECLARE line text;parts text[];amount text;label text;total text;subtotal text;bad_total boolean:=false;bad_subtotal boolean:=false;foreign_seen boolean;local_seen boolean;
BEGIN
 IF length(p_source)>4000 THEN RETURN NULL;END IF;
 foreign_seen:=p_source ~* '(USD|US\$|U\$S|d[oó]lares)';
 local_seen:=p_source ~* '(ARS|AR\$|pesos)';
 IF foreign_seen AND (local_seen OR regexp_replace(p_source,'(?:US\$|U\$S)','','gi') ~ '\$') THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 FOR line IN SELECT btrim(v) FROM regexp_split_to_table(p_source,E'\\r?\\n|;') a(v) LOOP
  IF line !~* '^(total([[:space:]]+(general|final|a[[:space:]]+pagar|presupuesto|cotizaci[oó]n))?|importe[[:space:]]+total|monto[[:space:]]+total|subtotal)([[:space:]:=$]|$)' THEN CONTINUE;END IF;
  label:=CASE WHEN line ~* '^subtotal' THEN 'subtotal' ELSE 'total' END;
  parts:=regexp_match(line,'^(?:total(?:[[:space:]]+(?:general|final|a[[:space:]]+pagar|presupuesto|cotizaci[oó]n))?|importe[[:space:]]+total|monto[[:space:]]+total|subtotal)[[:space:]]*[:=]?[[:space:]]*((?:(?:ARS|AR\$|USD|US\$|U\$S|\$)[[:space:]]*)?(?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{1,12})(?:,[0-9]{1,2})?)[[:space:]]*$','i');
  IF parts IS NULL THEN
   IF label='total' THEN bad_total:=true;ELSE bad_subtotal:=true;END IF;
   CONTINUE;
  END IF;
  amount:=parts[1];
  IF foreign_seen AND amount !~* '^(USD|US\$|U\$S)' THEN
   IF label='total' THEN bad_total:=true;ELSE bad_subtotal:=true;END IF;
   CONTINUE;
  END IF;
  IF label='total' THEN
   IF total IS NOT NULL AND total<>amount THEN bad_total:=true;END IF;
   total:=amount;
  ELSE
   IF subtotal IS NOT NULL AND subtotal<>amount THEN bad_subtotal:=true;END IF;
   subtotal:=amount;
  END IF;
 END LOOP;
 IF bad_total THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 IF total IS NOT NULL THEN RETURN jsonb_build_object('state','declared','kind','total','literal',total);END IF;
 IF bad_subtotal THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 IF subtotal IS NOT NULL THEN RETURN jsonb_build_object('state','declared','kind','subtotal','literal',subtotal);END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_group_declared_amount(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION cotironda_piloto_privado.v2_group_display_amount(p_source text,p_summary jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $fn$
DECLARE declared jsonb;n int;distinct_n int;responded int;sum_cents numeric;
BEGIN
 declared:=cotironda_piloto_privado.v2_group_declared_amount(p_source);
 IF declared IS NOT NULL THEN RETURN declared;END IF;
 IF p_summary->'group_sum_eligible' IS DISTINCT FROM 'true'::jsonb
 OR coalesce(p_summary->>'moneda','') NOT IN ('ARS','USD','no_informada')
 OR jsonb_typeof(p_summary->'precios') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_summary->'rubros') IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 IF jsonb_array_length(p_summary->'precios') NOT BETWEEN 1 AND 25
 OR jsonb_array_length(p_summary->'rubros') NOT BETWEEN 1 AND 7 THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_summary->'precios') a(v)
 WHERE coalesce(v->>'centavos','') !~ '^[0-9]{1,15}$' OR coalesce(v->>'pedidoId','') !~ '^item_[1-9][0-9]{0,2}$')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_summary->'rubros') a(v)
 WHERE coalesce(v->>'respondidos','') !~ '^[0-9]{1,3}$') THEN RETURN NULL;END IF;
 SELECT count(*),count(DISTINCT v->>'pedidoId'),sum((v->>'centavos')::numeric) INTO n,distinct_n,sum_cents FROM jsonb_array_elements(p_summary->'precios') a(v);
 SELECT sum((v->>'respondidos')::int) INTO responded FROM jsonb_array_elements(p_summary->'rubros') a(v);
 IF n<>distinct_n OR n<>responded OR sum_cents>99999999999999 OR sum_cents<0 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state','calculated','centavos',sum_cents::text,'moneda',p_summary->>'moneda');
END $fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_group_display_amount(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_group_quote_context(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_fragments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record;s record;cnt int;rid uuid;items jsonb;anchor text;combined text;
BEGIN
 IF NOT public.cotironda_piloto_v2_supplier_conversation_enabled() THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF p_fragments IS NULL OR jsonb_typeof(p_fragments)<>'array' OR jsonb_array_length(p_fragments) NOT BETWEEN 1 AND 60 OR length(p_fragments::text)>60000 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT key,consent_at INTO s FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_supplier_conversations WHERE id=p_id AND supplier_key=s.key AND chat_hmac=p_chat_hmac AND state='processing' AND revision=p_revision AND lease=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','stale');END IF;
 PERFORM 1 FROM cotironda_piloto_privado.whapi_inbox m JOIN cotironda_piloto_privado.v2_supplier_conversation_sources f USING(message_hmac) WHERE f.conversation_id=p_id ORDER BY m.message_hmac FOR UPDATE OF m;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_conversation_sources WHERE conversation_id=p_id)<>jsonb_array_length(p_fragments)
 OR EXISTS(WITH ordered AS (SELECT f.*,row_number() OVER(ORDER BY received_at,message_hmac) pos FROM cotironda_piloto_privado.v2_supplier_conversation_sources f WHERE conversation_id=p_id)
 SELECT 1 FROM ordered f LEFT JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac)
 LEFT JOIN jsonb_array_elements(p_fragments) WITH ORDINALITY a(v,pos) ON a.pos=f.pos
 WHERE m.message_hmac IS NULL OR m.chat_hmac IS DISTINCT FROM p_chat_hmac OR m.participant_key IS DISTINCT FROM s.key OR m.kind IS DISTINCT FROM 'text' OR m.plaintext_sha256 IS DISTINCT FROM f.source_sha256 OR m.received_at<s.consent_at OR m.received_at<clock_timestamp()-interval '10 minutes' OR m.request_id IS NOT NULL OR m.supplier_text_intent IS NOT NULL OR m.processing_state NOT IN ('needs_review','unmatched_quote')
 OR a.v->>'message_hmac' IS DISTINCT FROM f.message_hmac OR jsonb_typeof(a.v->'text') IS DISTINCT FROM 'string' OR length(a.v->>'text') NOT BETWEEN 1 AND 3000 OR encode(sha256(convert_to(a.v->>'text','UTF8')),'hex') IS DISTINCT FROM f.source_sha256)
 THEN RETURN jsonb_build_object('state','source_changed');END IF;
 SELECT string_agg(v->>'text',E'\n\n' ORDER BY pos) INTO combined FROM jsonb_array_elements(p_fragments) WITH ORDINALITY a(v,pos);
 IF length(combined) NOT BETWEEN 5 AND 4000 THEN RETURN jsonb_build_object('state','source_length');END IF;
 -- Una ronda acreditada para TODOS los fragmentos, no la ronda más reciente.
 SELECT count(*),(array_agg(r.id))[1] INTO cnt,rid
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id AND i.supplier_key=j.supplier_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id AND sh.status='shadow'
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key AND b.participant_role='buyer' AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
 WHERE j.supplier_key=s.key AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL AND j.finished_at IS NOT NULL
 AND r.state='prepared' AND i.state='prepared' AND r.closes_at>clock_timestamp()
 AND (g.reference_key='' OR j.whapi_message_id=g.reference_key)
 AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f WHERE f.conversation_id=p_id AND (f.received_at<j.finished_at OR f.received_at<r.created_at OR f.received_at>=r.closes_at));
 IF cnt<>1 THEN RETURN jsonb_build_object('state',CASE WHEN cnt>1 THEN 'ambiguous_round' ELSE 'not_matched' END);END IF;
 -- No descartar alternativas LEGACY que el asociador original también considera.
 IF g.reference_key='' AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.invitations i JOIN cotironda_piloto_privado.requests r ON r.id=i.request_id JOIN cotironda_piloto_privado.whapi_outbox o ON o.request_id=r.id AND o.supplier_key=i.supplier_key
 WHERE i.supplier_key=s.key AND r.id<>rid AND i.state='prepared' AND r.state='prepared' AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f WHERE f.conversation_id=p_id AND r.created_at<=f.received_at AND r.closes_at>f.received_at AND o.sent_at<=f.received_at))
 THEN RETURN jsonb_build_object('state','ambiguous_round');END IF;
 SELECT jsonb_agg(jsonb_build_object('id','item_'||l.line_no,'descripcion',l.original_description,'cantidad',l.quantity::text,'unidad',l.unit,'rubro',rub.rubro) ORDER BY l.line_no) INTO items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map JOIN cotironda_piloto_privado.request_lines l ON l.request_id=map.request_id AND l.line_no=map.line_no JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub ON rub.request_id=l.request_id AND rub.line_no=l.line_no WHERE map.request_id=rid AND map.supplier_key=s.key;
 IF items IS NULL OR jsonb_array_length(items) NOT BETWEEN 1 AND 25 THEN RETURN jsonb_build_object('state','request_lines_inconsistent');END IF;
 SELECT message_hmac INTO anchor FROM cotironda_piloto_privado.v2_supplier_conversation_sources WHERE conversation_id=p_id ORDER BY received_at DESC,message_hmac DESC LIMIT 1;
 RETURN jsonb_build_object('state','context','request_id',rid,'anchor',anchor,'context_sha256',encode(sha256(convert_to(combined,'UTF8')),'hex'),'items',items);
END $fn$;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_group_quote_finish(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_fragments jsonb,p_request_id uuid,p_context_sha256 text,p_state text,p_reason text,p_summary jsonb,p_fields text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE c jsonb;g record;fragment jsonb;r jsonb;reply jsonb;anchor text;source_sha text;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('verified','review') OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,64}$' OR p_fields IS NULL OR cardinality(p_fields)>9 THEN RETURN jsonb_build_object('state','invalid');END IF;
 c:=public.cotironda_piloto_v2_supplier_group_quote_context(p_chat_hmac,p_id,p_revision,p_lease,p_fragments);
 IF c->>'state'<>'context' THEN RETURN c;END IF;
 IF c->>'request_id' IS DISTINCT FROM p_request_id::text OR c->>'context_sha256' IS DISTINCT FROM p_context_sha256 THEN RETURN jsonb_build_object('state','context_changed');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_supplier_conversations WHERE id=p_id;
 anchor:=c->>'anchor';
 SELECT f.source_sha256 INTO source_sha FROM cotironda_piloto_privado.v2_supplier_conversation_sources f WHERE f.message_hmac=anchor AND f.conversation_id=p_id;
 -- Si alguna asociación o el validador fallan, rollback de TODAS las fuentes,
 -- de la reserva económica y de la pregunta. Sin estados comerciales parciales.
 BEGIN
  IF cardinality(p_fields)>0 THEN
   reply:=public.cotironda_piloto_v2_supplier_question(anchor,p_chat_hmac,source_sha,nullif(g.reference_key,''),p_fields,'quote');
   IF reply->>'state' NOT IN ('reply_reserved','recorded') THEN RAISE EXCEPTION 'group_question_failed';END IF;
  END IF;
  FOR fragment IN SELECT v FROM jsonb_array_elements(p_fragments) a(v) LOOP
   r:=public.cotironda_piloto_supplier_text_intent_v2(fragment->>'message_hmac',p_chat_hmac,encode(sha256(convert_to(fragment->>'text','UTF8')),'hex'),'quote');
   IF r->>'state' IS DISTINCT FROM 'quote' THEN RAISE EXCEPTION 'group_classify_failed';END IF;
   r:=public.cotironda_piloto_ia_link_supplier_mvp225(fragment->>'message_hmac',p_chat_hmac,nullif(g.reference_key,''),fragment->>'text');
   IF r->>'state' IS DISTINCT FROM 'linked_for_semantic_review' OR r->>'request_id' IS DISTINCT FROM p_request_id::text THEN RAISE EXCEPTION 'group_link_failed';END IF;
  END LOOP;
  r:=public.cotironda_piloto_ia_reserve_quote_mvp227(anchor,p_chat_hmac);
  IF r->>'state' IS DISTINCT FROM 'reserved' OR r->'items' IS DISTINCT FROM c->'items' THEN RAISE EXCEPTION 'group_reserve_failed';END IF;
  r:=public.cotironda_piloto_ia_finish_quote_mvp227(anchor,p_chat_hmac,p_state,p_reason,p_summary);
  IF r->>'state' IS DISTINCT FROM 'saved_private' THEN RAISE EXCEPTION 'group_summary_failed';END IF;
  UPDATE cotironda_piloto_privado.v2_supplier_conversations SET state='done',lease=NULL,lease_until=NULL,quote_request_id=p_request_id,quote_anchor_hmac=anchor,quote_context_sha256=p_context_sha256,quote_amount_display=cotironda_piloto_privado.v2_group_display_amount((SELECT string_agg(v->>'text',E'\n\n' ORDER BY pos) FROM jsonb_array_elements(p_fragments) WITH ORDINALITY a(v,pos)),p_summary) WHERE id=p_id;
 EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('state','group_not_saved');
 END;
 RETURN jsonb_build_object('state','saved_private','message_hmac',anchor,'reply',reply,'request_id',p_request_id);
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_supplier_group_quote_context(text,uuid,bigint,uuid,jsonb),public.cotironda_piloto_v2_supplier_group_quote_finish(text,uuid,bigint,uuid,jsonb,uuid,text,text,text,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_supplier_group_quote_context(text,uuid,bigint,uuid,jsonb),public.cotironda_piloto_v2_supplier_group_quote_finish(text,uuid,bigint,uuid,jsonb,uuid,text,text,text,jsonb,text[]) TO service_role;
