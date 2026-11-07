-- MVP285 CANDIDATE 1/3, SOLO ENSAYO TRANSACCIONAL. NO EJECUTAR SIN ROLLBACK.
-- INICIO mvp245_media_quote_ia_central_verified.sql
-- MVP246 hardening: SOLO archivos con publicación anónima privada
-- ya autorizada por documento original, dos lecturas e importes conciliados.
-- MVP245: proyecto Cotironda. Integración controlada de archivos con IA Central.
-- No activación de WhatsApp. Un file nunca reemplaza el texto original.
-- La migración extiende FINISH existente (MVP227) sin quitar sus guardas
-- de texto y agrega reserva exclusivamente para archivos corroborados.
--
-- AUTHZ: funciones SECURITY DEFINER con EXECUTE solamente service_role.
-- Si hay foto/imagen sin prueba binaria independiente, denegar por MIME.
--
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_media_mvp245(
 p_message_hmac text,p_chat_hmac text,
 p_source_sha256 text,p_line_count integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp245$
DECLARE v_source record; v_count int;v_rows int;v_items jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
  OR p_line_count NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Source and supplier must be bound by the *original* accepted Whapi
 -- invitation, even if the trial has since expired. A non-quoted supplier
 -- with two possible rounds cannot reach this link.
 SELECT l.request_id,l.supplier_key,l.source_sha256
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac
  AND m.chat_hmac=p_chat_hmac AND m.participant_key=l.supplier_key
  AND m.request_id=l.request_id AND m.kind=l.kind
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=l.message_hmac AND a.chat_hmac=p_chat_hmac
  AND a.participant_key=l.supplier_key AND a.request_id=l.request_id
  AND a.state='stored' AND a.content_sha256=l.source_sha256
 JOIN cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  ON q.message_hmac=a.message_hmac AND q.request_id=l.request_id
  AND q.supplier_key=l.supplier_key
  AND q.source_sha256=a.content_sha256
  AND q.state='awaiting_fidelity_check'
  AND q.line_count=p_line_count
 JOIN cotironda_piloto_privado.supplier_source_checks_mvp106 sc
  ON sc.message_hmac=a.message_hmac
  AND sc.source_sha256=a.content_sha256
  AND sc.state='source_text_covered' AND sc.reason='covered'
  AND sc.model_line_count=p_line_count
 -- El publicador anterior verificó el binario, las dos lecturas,
 -- todas las líneas y las cifras y preservó una copia ANÓNIMA.
 -- Sin esa prueba no alcanza con un "source_text_covered" aislado.
 JOIN cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  ON dual.message_hmac=a.message_hmac
  AND dual.source_sha256=a.content_sha256
  AND dual.state='model_readings_match' AND dual.line_count=p_line_count
 JOIN cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  ON amounts.message_hmac=a.message_hmac
  AND amounts.source_sha256=a.content_sha256
  AND amounts.state='balanced' AND amounts.line_count=p_line_count
 JOIN cotironda_piloto_privado.anonymous_supplier_docs_mvp107 published
  ON published.message_hmac=a.message_hmac
  AND published.request_id=l.request_id
  AND published.supplier_key=l.supplier_key
  AND published.source_sha256=a.content_sha256
  AND published.line_count=p_line_count
 JOIN cotironda_piloto_privado.participants p
  ON p.key=l.supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.requests r
  ON r.id=l.request_id AND r.state='prepared'
  AND m.received_at>=r.created_at AND m.received_at<=r.closes_at
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
  AND d.state='api_accepted' AND d.finished_at<=m.received_at
 WHERE l.message_hmac=p_message_hmac
  AND l.kind='document' AND l.status='awaiting_semantic_review'
  AND a.content_sha256=p_source_sha256
  AND a.mime IN(
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND jsonb_typeof(a.proposal)='object'
  AND a.proposal->>'kind'='supplier_quote'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines')=p_line_count
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
 WHERE rev.supplier_key=v_source.supplier_key
  AND rev.reserved_at>clock_timestamp()-interval '24 hours';
 IF v_count>=12 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'id','item_'||l.line_no,'descripcion',l.original_description,
   'cantidad',l.quantity::text,'unidad',l.unit,'rubro',rub.rubro
  ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
 JOIN cotironda_piloto_privado.request_lines l
  ON l.request_id=map.request_id AND l.line_no=map.line_no
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE map.request_id=v_source.request_id
  AND map.supplier_key=v_source.supplier_key;
 IF v_items IS NULL OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','request_lines_inconsistent');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227(
  message_hmac,request_id,supplier_key,source_sha256)
 VALUES(p_message_hmac,v_source.request_id,v_source.supplier_key,
  v_source.source_sha256) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 -- Source bytes/identities never returned.
 RETURN jsonb_build_object('state','reserved',
  'source_sha256',v_source.source_sha256,'items',v_items);
END
$mvp245$;

-- SAME finish RPC as MVP227: text guard intact; new document branch
-- only when the same binary archive+source check+supplier+ronda agree.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_quote_mvp227(
 p_message_hmac text,p_chat_hmac text,p_state text,
 p_reason text,p_summary jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_review record;v_rows int;v_price jsonb;v_rubro jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('verified','review')
 OR (p_reason IS NOT NULL AND p_reason !~ '^[a-z_]{3,64}$')
 OR (p_summary IS NOT NULL AND
    (jsonb_typeof(p_summary)<>'object' OR length(p_summary::text)>30000))
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT a.message_hmac,a.request_id,a.supplier_key,a.source_sha256
 INTO v_review FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=a.message_hmac
  AND link.request_id=a.request_id AND link.supplier_key=a.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
  AND m.chat_hmac=p_chat_hmac AND m.request_id=a.request_id
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 media
  ON media.message_hmac=a.message_hmac
  AND media.chat_hmac=m.chat_hmac AND media.participant_key=a.supplier_key
  AND media.request_id=a.request_id AND media.state='stored'
  AND media.content_sha256=a.source_sha256
 LEFT JOIN cotironda_piloto_privado.supplier_source_checks_mvp106 checksrc
  ON checksrc.message_hmac=a.message_hmac
  AND checksrc.source_sha256=a.source_sha256
  AND checksrc.state='source_text_covered' AND checksrc.reason='covered'
 LEFT JOIN cotironda_piloto_privado.supplier_media_quotes_mvp098 quote
  ON quote.message_hmac=a.message_hmac
  AND quote.request_id=a.request_id
  AND quote.supplier_key=a.supplier_key
  AND quote.source_sha256=a.source_sha256
 LEFT JOIN cotironda_piloto_privado.anonymous_supplier_docs_mvp107 published
  ON published.message_hmac=a.message_hmac
  AND published.request_id=a.request_id
  AND published.supplier_key=a.supplier_key
  AND published.source_sha256=a.source_sha256
 JOIN cotironda_piloto_privado.participants p ON p.key=a.supplier_key
  AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 WHERE a.message_hmac=p_message_hmac AND a.state='reserved'
 AND (
  (link.kind='text' AND m.kind='text'
   AND m.plaintext_sha256=a.source_sha256)
  OR
  (link.kind='document' AND m.kind='document'
   AND media.mime IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv')
   AND checksrc.message_hmac IS NOT NULL
   AND quote.state='awaiting_fidelity_check'
   AND published.message_hmac IS NOT NULL
   AND published.line_count=quote.line_count
   AND checksrc.model_line_count=quote.line_count
   AND jsonb_typeof(media.proposal)='object'
   AND media.proposal->>'kind'='supplier_quote'
   AND jsonb_typeof(media.proposal->'lines')='array'
   AND jsonb_array_length(media.proposal->'lines')=quote.line_count)
 )
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','already_finalized_or_ineligible');END IF;
 IF p_state='verified' AND (
   p_summary IS NULL OR p_summary->>'estado'<>'verificada_para_comparacion'
   OR p_summary->>'moneda' NOT IN('ARS','USD')
   OR p_summary->>'iva' NOT IN('incluido_explicito','sin_iva_explicito','no_informado')
   OR p_summary->>'flete' NOT IN('incluido_explicito','excluido_explicito','a_convenir','no_informado')
   OR p_summary->>'pago' NOT IN('contado','transferencia','credito','no_informado')
   OR jsonb_typeof(p_summary->'rubros')<>'array'
   OR jsonb_typeof(p_summary->'precios')<>'array'
   OR jsonb_array_length(p_summary->'rubros') NOT BETWEEN 1 AND 7
   OR jsonb_array_length(p_summary->'precios')>25
  ) THEN RETURN jsonb_build_object('state','summary_not_verified');END IF;
 IF p_summary IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
    coalesce(p_summary->'precios','[]'::jsonb)) pr
    WHERE jsonb_typeof(pr)<>'object'
     OR pr->>'pedidoId' !~ '^item_[1-9][0-9]{0,2}$'
     OR pr->>'centavos' !~ '^[0-9]{1,17}$'
     OR NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
      WHERE map.request_id=v_review.request_id
       AND map.supplier_key=v_review.supplier_key
       AND 'item_'||map.line_no=pr->>'pedidoId'
     ))
  THEN RETURN jsonb_build_object('state','price_without_request_source');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
    coalesce(p_summary->'rubros','[]'::jsonb)) rb
    WHERE jsonb_typeof(rb)<>'object'
     OR rb->>'rubro' NOT IN
      ('obra_gruesa','pintura','electricidad','construccion_seca',
       'sanitarios','ferreteria','otros')
     OR rb->>'solicitados' !~ '^[0-9]{1,3}$'
     OR rb->>'respondidos' !~ '^[0-9]{1,3}$'
     OR rb->>'cobertura' NOT IN('completa','parcial','sin_cobertura')
    )
  THEN RETURN jsonb_build_object('state','invalid_rubro_summary');END IF;
 END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET state=p_state,reason_code=p_reason,summary=p_summary,finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac AND state='reserved';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'saved_private' ELSE 'already_finalized' END);
END
$fn$;


REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_media_mvp245(text,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_media_mvp245(text,text,text,integer)
 TO service_role;

-- FIN mvp245_media_quote_ia_central_verified.sql

-- INICIO mvp248_publicador_documental_multirubro_privado.sql
-- MVP248 PILOTO ONLY / do not deploy without explicit user authorization.
-- Exact MVP135 publisher preserved (ownership, SHA, dual-read, balanced
-- totals, anonymous mirror, same buyer/supplier, time/consent, anti-PII).
-- Change ONLY the conservative initial vocabulary gate, expanding to
-- the product families of the pilot's seven rubros.
-- Unknown names still remain private for human review, never discarded.
--
-- The helper deliberately does NOT accept arbitrary vendor headings:
-- identities and non-material categories require safety review before
-- posting anonymous buyer documents.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(
 p_descripcion text
) RETURNS boolean
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $safe$
 SELECT p_descripcion IS NOT NULL
  AND length(btrim(p_descripcion)) BETWEEN 2 AND 180
  AND p_descripcion ~* '^([0-9]{1,4}[[:space:]]+((bolsas?|bolsones?|unidades?|latas?|envases?|packs?|cajas?|metros?|mts?|litros?|kg|m2|m3)[[:space:]]+(de[[:space:]]+)?)?)?(cemento|arena|piedras?|ladrillos?|bloques?|hormig[oó]n|mortero|mezcla|cal|hierros?|varillas?|mallas?|alambres?|clavos?|membranas?|impermeabilizantes?|hidr[oó]fugos?|ceresita|ligantes?|pinturas?|l[aá]tex|esmaltes?|fijadores?|selladores?|rodillos?|pinceles?|diluyentes?|enduido|enduidos|cables?|conductores?|disyuntores?|t[eé]rmicas?|t[eé]rmicos?|interruptores?|tomacorrientes?|tomas?|enchufes?|llaves?|cajas?|ca[nñ]os?|tubos?|codos?|uniones?|conectores?|conductos?|canaletas?|fusibles?|contactores?|placas?|durlock|yeso|masilla|cintas?|perfiles?|montantes?|soleras?|aislantes?|lana|tornillos?|tarugos?|arandelas?|tuercas?|bulones?|baches?|grifer[ií]a|sanitarios?|inodoros?|bidets?|bachas?|piletas?|lavatorios?|sifones?|v[aá]lvulas?|tanques?|bombas?|mangueras?|flexibles?|pvc|ppr|siliconas?|pegamentos?|adhesivos?|selladores?|pallets?|bolsones?|bols[oó]n|big[[:space:]-]?bag|fletes?|env[ií]os?|transporte|descuentos?|bonificaci[oó]n|bonificaciones|recargos?|iva|impuestos?|envases?|embalajes?)([[:space:]:,.(/-]|$)'
  AND p_descripcion !~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|celular|direcci[oó]n|domicilio|contacto|raz[oó]n[[:space:]]+social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,}|(^|[^[:alpha:]])(s[.]?r[.]?l[.]?|s[.]?a[.]?s?|sociedad|empresa|proveedor)([[:space:][:punct:]]|$)|corral[oó]n|pinturer[ií]a)'
  AND p_descripcion !~ '[\r\n\t]'
$safe$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 TO service_role;

-- Same strict source verifier / publisher as MVP135; ALL upstream
-- gates and anti-contact checks preserved. No new outbound transport.
create or replace function public.cotironda_piloto_publish_source_text_mvp107(
 p_message_hmac text
) returns jsonb language plpgsql security definer
set search_path='' as $fn$
declare q_ record;raw_text text;v_text text;note_ text;bad integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;

 select q.message_hmac,q.request_id,q.supplier_key,q.source_sha256,
  q.line_count,q.declared_total_literal
 into q_ from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.participant_key=q.supplier_key and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_source_checks_mvp106 s
  on s.message_hmac=q.message_hmac and s.source_sha256=q.source_sha256
  and s.model_line_count=q.line_count and s.state='source_text_covered'
  and s.reason='covered'
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  on dual.message_hmac=q.message_hmac
   and dual.source_sha256=q.source_sha256
   and dual.state='model_readings_match'
 join cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  on amounts.message_hmac=q.message_hmac
   and amounts.source_sha256=q.source_sha256
   and amounts.state='balanced'
 join cotironda_piloto_privado.requests r
  on r.id=q.request_id and r.state='prepared' and r.closes_at>clock_timestamp()
 join cotironda_piloto_privado.participants supplier
  on supplier.key=q.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.participants buyer
  on buyer.key=r.buyer_key
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.state='stored' and m.review_state='suggested_only'
  and m.mime in ('text/plain','text/csv','application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  and m.proposal->>'kind'='supplier_quote'
  and m.proposal->'unanswered'='[]'::jsonb
  and r.delivery_city='La Plata'
  and supplier.key in ('corralon_ailin','corralon_nahuel')
  and supplier.participant_role='supplier'
  and supplier.consent_at is not null and supplier.opted_out_at is null
  and buyer.participant_role='buyer' and buyer.consent_at is not null
  and buyer.opted_out_at is null and buyer.key='arquitecto'
  and i.state='prepared'
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107
   where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_published');end if;

 -- The publication is composed exclusively from the complete SOURCE-COVERED
 -- ordered line mirror. A model-supplied note not anchored to a source line
 -- would have failed independent source coverage earlier.
 select count(*) into bad
 from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
 where l.message_hmac=p_message_hmac
 and (
   l.ambiguity_literal is not null
   or length(btrim(l.description_literal))<2
   or NOT cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(l.description_literal)
   or l.description_literal ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|direcci[oó]n|domicilio|contacto|raz[oó]n social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,})'
   or coalesce(l.quantity_literal,'') ~ '[\r\n\t]'
   or coalesce(l.unit_literal,'') ~ '[\r\n\t]'
   or coalesce(l.unit_price_literal,'') ~ '[\r\n\t]'
   or coalesce(l.line_total_literal,'') ~ '[\r\n\t]'
   or l.description_literal ~ '[\r\n\t]'
 );
 if bad<>0 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 if (select count(*) from
  cotironda_piloto_privado.supplier_quote_lines_mvp101
  where message_hmac=p_message_hmac)<>q_.line_count
 then return jsonb_build_object('state','missing_source_lines');end if;

 select string_agg(
  l.line_no||'. '||l.description_literal||
   case when l.quantity_literal is null then ''
    else E'\nCantidad: '||l.quantity_literal end||
   case when l.unit_literal is null then ''
    else E' '||l.unit_literal end||
   case when l.unit_price_literal is null then ''
    else E'\nPrecio unitario informado (ver aclaraciones): '||l.unit_price_literal end||
   case when l.line_total_literal is null then ''
    else E'\nImporte: '||l.line_total_literal end,
  E'\n\n' order by l.line_no)
 into raw_text
 from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
 where l.message_hmac=p_message_hmac;
 -- A clarification belongs to the supplier quote; do not hide payment,
 -- list price, freight or return conditions. It is NOT a new line item.
 -- Only the existing source-covered, twice-checked and arithmetic gates
 -- may reach this projection. The displayed note is subject to the same
 -- anti-contact guard as every other line and remains anonymous.
 select nullif(m.proposal->>'requested_delivery_note','') into note_
 from cotironda_piloto_privado.media_archive_mvp095 m
 where m.message_hmac=p_message_hmac and m.content_sha256=q_.source_sha256;
 if note_ is not null and (
   length(note_)>4096 or note_ ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 v_text:='COTIRONDA · Presupuesto anónimo'||E'\n\n'||
  raw_text||E'\n\nTOTAL DECLARADO: '||q_.declared_total_literal||
  case when note_ is null then '' else
   E'\n\nACLARACIONES DEL PROVEEDOR\n'||note_ end;
 if length(v_text)>12000 or
    q_.declared_total_literal is null or
    q_.declared_total_literal !~ '^[-]?[$][[:space:]]*[0-9][0-9.,]*$' or
    v_text ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|direcci[oó]n|domicilio|contacto|[0-9]{8,})'
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 insert into cotironda_piloto_privado.anonymous_supplier_docs_mvp107(
  message_hmac,request_id,supplier_key,source_sha256,line_count,public_text)
 values(p_message_hmac,q_.request_id,q_.supplier_key,q_.source_sha256,
  q_.line_count,v_text);
 return jsonb_build_object('state','published_anonymous',
  'lines',q_.line_count,'ranking_allowed',false,
  'contact_revealed',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_publish_source_text_mvp107(text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_publish_source_text_mvp107(text)
 to service_role;

-- FIN mvp248_publicador_documental_multirubro_privado.sql

-- INICIO mvp250_marcas_materiales_seguras_publicador.sql
-- MVP250: conocidas marcas comerciales de materiales, no nombres de proveedores.
-- Solo permite una marca de material delante de un rubro conocido;
-- el guard anti-PII y todas las verificaciones del MVP248 permanecen activos.
-- Desconocidos -> revisión privada, no exposición por coincidencia de IA.
-- Reaplicar este helper después de la migración MVP248, PILOTO únicamente.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(
 p_descripcion text
) RETURNS boolean
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $safe$
 SELECT p_descripcion IS NOT NULL
  AND length(btrim(p_descripcion)) BETWEEN 2 AND 180
  AND p_descripcion ~* '^([0-9]{1,4}[[:space:]]+((bolsas?|bolsones?|unidades?|latas?|envases?|packs?|cajas?|metros?|mts?|litros?|kg|m2|m3)[[:space:]]+(de[[:space:]]+)?)?)?(?:(?:sinteplast|avellaneda|alba|tersuave|weber|sika|knauf|durlock|klaukol|loma[[:space:]-]?negra|sherwin[[:space:]-]?williams|petrilac|tigre|fv|ferrum|peisa|genrod|schneider|cambre|kalop|prysmian|acindar|mapei|barbieri|aislantes[[:space:]-]?isover)[[:space:]]+)?(cemento|arena|piedras?|ladrillos?|bloques?|hormig[oó]n|mortero|mezcla|cal|hierros?|varillas?|mallas?|alambres?|clavos?|membranas?|impermeabilizantes?|hidr[oó]fugos?|ceresita|ligantes?|pinturas?|l[aá]tex|esmaltes?|fijadores?|sellador(?:es)?|rodillos?|pincel(?:es)?|diluyentes?|enduido|enduidos|cables?|conductor(?:es)?|disyuntor(?:es)?|t[eé]rmicas?|t[eé]rmicos?|interruptor(?:es)?|tomacorrientes?|tomas?|enchufes?|llaves?|cajas?|ca[nñ]os?|tubos?|codos?|uniones?|conectores?|conductos?|canaletas?|fusibles?|contactor(?:es)?|placas?|durlock|yeso|masilla|cintas?|perfiles?|montantes?|soleras?|aislantes?|lana|tornillos?|tarugos?|arandelas?|tuercas?|bulones?|baches?|grifer[ií]a|sanitarios?|inodoros?|bidets?|bachas?|piletas?|lavatorios?|sifones?|v[aá]lvulas?|tanques?|bombas?|mangueras?|flexibles?|pvc|ppr|siliconas?|pegamentos?|adhesivos?|sellador(?:es)?|pallets?|bolsones?|bols[oó]n|big[[:space:]-]?bag|fletes?|env[ií]os?|transporte|descuentos?|bonificaci[oó]n|bonificaciones|recargos?|iva|impuestos?|envases?|embalajes?)([[:space:]:,.(/-]|$)'
  AND p_descripcion !~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|celular|direcci[oó]n|domicilio|contacto|raz[oó]n[[:space:]]+social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,}|(^|[^[:alpha:]])(s[.]?r[.]?l[.]?|s[.]?a[.]?s?|sociedad|empresa|proveedor)([[:space:][:punct:]]|$)|corral[oó]n|pinturer[ií]a)'
  AND p_descripcion !~ '[\r\n\t]'
$safe$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 TO service_role;


-- FIN mvp250_marcas_materiales_seguras_publicador.sql

-- INICIO mvp253_visual_ocr_policy_provenance.sql
-- MVP253: SQL-only OCR authorization, quota and immutable-source provenance.
-- PILOTO schema, but NOT deployed by this PR. No remote OCR or publication.
-- Every row stays PRIVATE; only service_role may execute the two RPCs.
DO $gate$
BEGIN
 IF to_regclass('cotironda_piloto_privado.participants') IS NULL
 OR to_regclass('cotironda_piloto_privado.media_archive_mvp095') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_media_quotes_mvp098') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_reading_checks_mvp102') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_amount_checks_mvp103') IS NULL
 THEN RAISE EXCEPTION 'mvp253_wrong_database' USING errcode='42501';
 END IF;
END $gate$;

-- Operational setting: disabled, ZERO pages and ZERO spend by default.
-- Managed only by authorized database operator (never buyer/provider).
CREATE TABLE cotironda_piloto_privado.visual_ocr_control_mvp253(
 only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
 enabled boolean NOT NULL DEFAULT false,
 monthly_page_limit integer NOT NULL DEFAULT 0
  CHECK(monthly_page_limit BETWEEN 0 AND 50000),
 supplier_monthly_page_limit integer NOT NULL DEFAULT 0
  CHECK(supplier_monthly_page_limit BETWEEN 0 AND 10000),
 monthly_cost_micro_usd_limit bigint NOT NULL DEFAULT 0
  CHECK(monthly_cost_micro_usd_limit BETWEEN 0 AND 1000000000),
 reserved_cost_micro_usd_per_page integer NOT NULL DEFAULT 1500
  CHECK(reserved_cost_micro_usd_per_page BETWEEN 1500 AND 100000),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO cotironda_piloto_privado.visual_ocr_control_mvp253(only_row)
 VALUES(true);
ALTER TABLE cotironda_piloto_privado.visual_ocr_control_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_control_mvp253
 FROM public,anon,authenticated,service_role;

-- Consent EXPLICITLY to send a participant's data to external Vision OCR.
-- General Cotironda/WhatsApp consent is never sufficient.
-- Grant manually after evidence of an actual, scoped external-processing opt-in.
CREATE TABLE cotironda_piloto_privado.visual_ocr_consent_mvp253(
 participant_key text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.participants(key),
 provider text NOT NULL DEFAULT 'google_cloud_vision'
  CHECK(provider='google_cloud_vision'),
 proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[a-f0-9]{64}$'),
 granted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at>granted_at),
 CHECK (revoked_at IS NULL OR revoked_at>=granted_at)
);
ALTER TABLE cotironda_piloto_privado.visual_ocr_consent_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_consent_mvp253
 FROM public,anon,authenticated,service_role;

-- One immutable reservation per ORIGINAL WhatsApp HMAC/SHA.
-- Reserve the WORST-CASE page count for PDFs (5); a call can never be retried
-- automatically, even when Google timed out and may have billed.
CREATE TABLE cotironda_piloto_privado.visual_ocr_attempt_mvp253(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 mime text NOT NULL CHECK(mime IN(
  'application/pdf','image/jpeg','image/png','image/webp')),
 provider text NOT NULL DEFAULT 'google_cloud_vision'
  CHECK(provider='google_cloud_vision'),
 reservation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reserved_pages smallint NOT NULL CHECK(reserved_pages BETWEEN 1 AND 5),
 reserved_cost_micro_usd bigint NOT NULL CHECK(reserved_cost_micro_usd>=1500),
 state text NOT NULL DEFAULT 'reserved'
  CHECK(state IN('reserved','covered_private','needs_review')),
 finished_at timestamptz,
 reason text CHECK(reason ~ '^[a-z][a-z0-9_]{2,63}$'),
 pages_seen smallint CHECK(pages_seen BETWEEN 0 AND 5),
 min_confidence_milli smallint CHECK(min_confidence_milli BETWEEN 0 AND 1000),
 ocr_text_sha256 text CHECK(ocr_text_sha256 ~ '^[a-f0-9]{64}$'),
 CHECK((state='reserved')=(finished_at IS NULL)),
 CHECK(state <> 'covered_private' OR (
  pages_seen IS NOT NULL AND pages_seen>=1 AND
  min_confidence_milli>=900 AND ocr_text_sha256 IS NOT NULL AND
  reason='ocr_text_lines_covered'
 )),
 CHECK(pages_seen IS NULL OR pages_seen<=reserved_pages)
);
ALTER TABLE cotironda_piloto_privado.visual_ocr_attempt_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_attempt_mvp253
 FROM public,anon,authenticated,service_role;
CREATE INDEX visual_ocr_attempt_month_mvp253
 ON cotironda_piloto_privado.visual_ocr_attempt_mvp253(reserved_at,supplier_key);

-- This function is the mandatory third gate after the two disabled-by-default
-- environment flags. No customer-facing function can grant authorization.
CREATE FUNCTION public.cotironda_piloto_visual_ocr_permission_mvp252(
 p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 policy_ record;
 target_ record;
 prior_ record;
 cost_ bigint;
 units_ integer;
 used_pages_ bigint;
 used_cost_ bigint;
 supplier_pages_ bigint;
 month_start_ timestamptz;
 token_ uuid;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- Serialize all quota reservations and avoid races across suppliers.
 SELECT * INTO policy_
 FROM cotironda_piloto_privado.visual_ocr_control_mvp253
 WHERE only_row=true FOR UPDATE;
 IF NOT FOUND OR policy_.enabled IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF policy_.monthly_page_limit=0 OR policy_.supplier_monthly_page_limit=0
 OR policy_.monthly_cost_micro_usd_limit=0
 THEN RETURN jsonb_build_object('state','quota_disabled');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;

 SELECT q.request_id,q.supplier_key,r.buyer_key,m.mime,m.content_sha256
 INTO target_
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 JOIN cotironda_piloto_privado.media_archive_mvp095 m
  ON m.message_hmac=q.message_hmac
   AND m.request_id=q.request_id AND m.participant_key=q.supplier_key
   AND m.content_sha256=q.source_sha256
 JOIN cotironda_piloto_privado.requests r
  ON r.id=q.request_id AND r.state='prepared'
  AND r.closes_at>clock_timestamp()
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=q.request_id AND inv.supplier_key=q.supplier_key
  AND inv.state='prepared'
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=q.supplier_key AND supplier.chat_hmac=m.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  ON dual.message_hmac=q.message_hmac
  AND dual.source_sha256=q.source_sha256
  AND dual.state='model_readings_match'
 JOIN cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  ON amounts.message_hmac=q.message_hmac
  AND amounts.source_sha256=q.source_sha256
  AND amounts.state='balanced'
 WHERE q.message_hmac=p_message_hmac
 AND q.state='awaiting_fidelity_check'
 AND q.source_sha256=p_source_sha256
 AND q.line_count BETWEEN 1 AND 25
 AND m.state='stored' AND m.review_state='suggested_only'
 AND m.size_bytes BETWEEN 12 AND 3145728
 AND m.mime IN('application/pdf','image/jpeg','image/png','image/webp')
 AND m.proposal->>'kind'='supplier_quote'
 AND m.proposal->'unanswered'='[]'::jsonb
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=supplier.key
  AND c.provider='google_cloud_vision'
  AND c.granted_at<=clock_timestamp()
  AND c.expires_at>clock_timestamp()
  AND c.revoked_at IS NULL
 )
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=buyer.key
  AND c.provider='google_cloud_vision'
  AND c.granted_at<=clock_timestamp()
  AND c.expires_at>clock_timestamp()
  AND c.revoked_at IS NULL
 );
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 units_:=CASE WHEN target_.mime='application/pdf' THEN 5 ELSE 1 END;
 cost_:=units_::bigint*policy_.reserved_cost_micro_usd_per_page;
 month_start_:=date_trunc('month',clock_timestamp(),'UTC');
 SELECT COALESCE(SUM(reserved_pages),0),
        COALESCE(SUM(reserved_cost_micro_usd),0)
 INTO used_pages_,used_cost_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE reserved_at>=month_start_ AND
  reserved_at<month_start_+interval '1 month';
 SELECT COALESCE(SUM(reserved_pages),0) INTO supplier_pages_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE reserved_at>=month_start_
 AND reserved_at<month_start_+interval '1 month'
 AND supplier_key=target_.supplier_key;
 IF used_pages_+units_>policy_.monthly_page_limit
 OR supplier_pages_+units_>policy_.supplier_monthly_page_limit
 OR used_cost_+cost_>policy_.monthly_cost_micro_usd_limit
 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;

 INSERT INTO cotironda_piloto_privado.visual_ocr_attempt_mvp253(
  message_hmac,request_id,supplier_key,buyer_key,
  source_sha256,mime,reserved_pages,reserved_cost_micro_usd)
 VALUES(p_message_hmac,target_.request_id,target_.supplier_key,
  target_.buyer_key,p_source_sha256,target_.mime,units_,cost_)
 RETURNING reservation_token INTO token_;
 RETURN jsonb_build_object(
  'state','approved_for_private_processing',
  'source_sha256',p_source_sha256,
  'reservation_token',token_,
  'reserved_pages',units_);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)
 TO service_role;

-- Durable result, no raw OCR text, prices, file URLs, keys or personal data.
-- Never modifies the MVP106 / MVP107 publication gates.
CREATE FUNCTION public.cotironda_piloto_visual_ocr_finish_mvp253(
 p_message_hmac text,p_source_sha256 text,p_reservation_token uuid,
 p_state text,p_reason text,p_pages integer,
 p_min_confidence_milli integer,p_ocr_text_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 attempt_ record;
 permitted_ boolean;
 final_state_ text;
 final_reason_ text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_reservation_token IS NULL
 OR p_state NOT IN('covered_private','needs_review')
 OR p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{2,63}$'
 OR p_pages IS NULL OR p_pages NOT BETWEEN 0 AND 5
 OR (p_min_confidence_milli IS NOT NULL AND
     p_min_confidence_milli NOT BETWEEN 0 AND 1000)
 OR (p_ocr_text_sha256 IS NOT NULL AND
     p_ocr_text_sha256 !~ '^[a-f0-9]{64}$')
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 SELECT * INTO attempt_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE message_hmac=p_message_hmac FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF attempt_.source_sha256<>p_source_sha256
 OR attempt_.reservation_token<>p_reservation_token
 OR p_pages>attempt_.reserved_pages
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF attempt_.state<>'reserved'
 THEN RETURN jsonb_build_object('state','already_finalized');END IF;
 IF p_state='covered_private' AND (
  p_pages<1 OR p_reason<>'ocr_text_lines_covered'
  OR p_ocr_text_sha256 IS NULL OR
  p_min_confidence_milli IS NULL OR
  p_min_confidence_milli<900)
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- A revocation between booking and receipt never creates a covered status.
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=attempt_.supplier_key
   AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 ) AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=attempt_.buyer_key
   AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 ) INTO permitted_;
 final_state_:=CASE WHEN permitted_ THEN p_state ELSE 'needs_review' END;
 final_reason_:=CASE WHEN permitted_ THEN p_reason ELSE 'consent_revoked' END;
 UPDATE cotironda_piloto_privado.visual_ocr_attempt_mvp253
 SET state=final_state_,reason=final_reason_,pages_seen=p_pages,
  min_confidence_milli=CASE WHEN final_state_='covered_private'
   THEN p_min_confidence_milli ELSE NULL END,
  ocr_text_sha256=CASE WHEN final_state_='covered_private'
   THEN p_ocr_text_sha256 ELSE NULL END,
  finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac;
 RETURN jsonb_build_object('state','saved_private',
  'result',final_state_,'publication_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_visual_ocr_finish_mvp253(
 text,text,uuid,text,text,integer,integer,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_visual_ocr_finish_mvp253(
 text,text,uuid,text,text,integer,integer,text)
 TO service_role;

-- FIN mvp253_visual_ocr_policy_provenance.sql

-- INICIO mvp256_document_retry_policy_safe.sql
-- MVP256 · Etapa 5: sólo errores TRANSITORIOS reintentan documentos.
-- No toca Whapi OUTBOUND, no envía notificaciones, no autoriza presupuesto.
-- Migración de reemplazo posterior a MVP127, MVP128 y MVP131.
-- Dejar nota de que problemas permanentes van a revisión, no a relecturas pagas.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(
 p_reason_code text
) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
 SET search_path='' AS $func$
 SELECT coalesce(p_reason_code IN (
  'legacy_unclassified',
  'api_rate_limited',
  'api_server_error',
  'api_unavailable',
  'api_timeout',
  'response_incomplete'
 ),false)
$func$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(text)
 TO service_role;

-- 1. Fallas permanentes: next_retry_at NULL. Reintentos permitidos: 3, 9 min,
--    cap de tres intentos y sin segundo intento tras el tercero.
create or replace function public.cotironda_piloto_note_document_failure_mvp127(
 p_message_hmac text,p_reason_code text,p_phase text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_reason_code not in (
   'ai_disabled','quota_blocked','api_credentials_missing','api_unauthorized',
   'api_rate_limited','api_rejected','api_server_error','api_unavailable',
   'api_timeout','response_incomplete','response_invalid',
   'response_too_large','schema_rejected','draft_persistence_failed',
   'source_review_required','internal_error')
  or p_phase not in ('initial','primary','corroboration','storage','validation','review','retry')
 then return false;end if;
 if not exists(
  select 1 from cotironda_piloto_privado.media_archive_mvp095 a
  join cotironda_piloto_privado.participants p
   on p.key=a.participant_key and p.chat_hmac=a.chat_hmac
  where a.message_hmac=p_message_hmac and a.state='stored'
   and a.ai_reserved_at is not null
   and p.consent_at is not null and p.opted_out_at is null
 ) then return false;end if;
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
   message_hmac,state,reason_code,phase,attempt_count,
   first_failure_at,last_attempt_at,next_retry_at)
 values(p_message_hmac,'failed',p_reason_code,p_phase,1,
  clock_timestamp(),clock_timestamp(),case when public.cotironda_piloto_retryable_document_error_mvp256(p_reason_code) then clock_timestamp()+interval '3 minutes' else null end)
 on conflict(message_hmac) do update
 set state='failed',reason_code=excluded.reason_code,phase=excluded.phase,
  first_failure_at=coalesce(cotironda_piloto_privado.document_ai_diagnostics_mvp127.first_failure_at,clock_timestamp()),
  attempt_count=least(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count+1),
  last_attempt_at=clock_timestamp(),
  next_retry_at=case
   when not public.cotironda_piloto_retryable_document_error_mvp256(excluded.reason_code) then null
   when cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count>=2 then null
   else clock_timestamp()+make_interval(mins=>3*
     power(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count)::integer)
   end,
  updated_at=clock_timestamp();
 get diagnostics n=row_count;
 return n=1;
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 TO service_role;
-- 2. Reserva de original: exige causa transitoria y vuelve a verificar identidad.
create or replace function public.cotironda_piloto_reserve_document_retry_mvp127(
 p_message_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare a record; diag record;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 select m.message_hmac,m.kind,m.mime,m.content_sha256,m.size_bytes,
        m.request_id,p.participant_role
 into a
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.proposal is null and m.review_state='review_required'
  and m.ai_reserved_at is not null and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 8 and 3145728
  and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv')
  and p.consent_at is not null and p.opted_out_at is null
  and (p.participant_role='buyer' or
   p.participant_role='supplier' and m.request_id is not null and
   exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=m.request_id and i.supplier_key=m.participant_key
    and r.state='prepared' and r.closes_at>clock_timestamp()))
 for update of m;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 select * into diag from cotironda_piloto_privado.document_ai_diagnostics_mvp127
 where message_hmac=p_message_hmac and state='failed'
  and attempt_count<3 and next_retry_at <=clock_timestamp()
  and public.cotironda_piloto_retryable_document_error_mvp256(reason_code)
 for update;
 if not found then return jsonb_build_object('state','not_due');end if;
 update cotironda_piloto_privado.document_ai_diagnostics_mvp127
 set state='pending',phase='retry',next_retry_at=null,updated_at=clock_timestamp()
 where message_hmac=p_message_hmac and state='failed'
   and attempt_count<3 and next_retry_at<=clock_timestamp()
   and public.cotironda_piloto_retryable_document_error_mvp256(reason_code);
 if not found then return jsonb_build_object('state','already_reserved');end if;
 return jsonb_build_object('state','reserved','kind',a.kind,
  'mime',a.mime,'source_sha256',a.content_sha256,
  'size_bytes',a.size_bytes,'supplier_quote',a.participant_role='supplier');
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_document_retry_mvp127(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_document_retry_mvp127(text)
 TO service_role;
-- 3. Descubrimiento con token de trigger verificado: sin causas permanentes.
create or replace function public.cotironda_piloto_next_document_retry_mvp128(
 p_trigger_chat_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare job record; n int;
begin
 if p_trigger_chat_hmac is null or p_trigger_chat_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 if not exists(
   select 1 from cotironda_piloto_privado.participants p
   where p.chat_hmac=p_trigger_chat_hmac
   and p.consent_at is not null and p.opted_out_at is null
   and p.participant_role in ('buyer','supplier')
 ) then return jsonb_build_object('state','no_authorized_trigger');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled');end if;
 -- Do not silently multiply OpenAI calls when many messages arrive.
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
     where ai_reserved_at >= clock_timestamp()-interval '24 hours')
  + (select count(*) from cotironda_piloto_privado.document_ai_diagnostics_mvp127
     where last_attempt_at >= clock_timestamp()-interval '24 hours')
  >= (select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097
      where only_row)
 then return jsonb_build_object('state','quota');end if;
 select m.message_hmac,m.ai_reserved_at into job
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants owner
  on owner.key=m.participant_key and owner.chat_hmac=m.chat_hmac
 left join cotironda_piloto_privado.document_ai_diagnostics_mvp127 d
  on d.message_hmac=m.message_hmac
 where m.state='stored' and m.review_state='review_required'
 and m.proposal is null
 and m.content_sha256 ~ '^[a-f0-9]{64}$'
 and m.ai_reserved_at < clock_timestamp()-interval '3 minutes'
 and m.size_bytes between 8 and 8388608
 and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.ms-excel',
  'text/plain','text/csv')
 and owner.consent_at is not null and owner.opted_out_at is null
 and (
  owner.participant_role='buyer'
  or owner.participant_role='supplier' and m.request_id is not null
  and exists(select 1 from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.request_id=m.request_id and i.supplier_key=m.participant_key
   and i.state='prepared' and r.state='prepared'
   and r.closes_at>clock_timestamp())
 )
 and (d.message_hmac is null
  or d.state='failed' and d.attempt_count<3
   and d.next_retry_at<=clock_timestamp()
   and public.cotironda_piloto_retryable_document_error_mvp256(d.reason_code)
  or d.state='pending' and d.attempt_count<3
   and d.updated_at<clock_timestamp()-interval '8 minutes')
 order by m.ai_reserved_at,m.message_hmac
 limit 1
 for update of m skip locked;
 if not found then return jsonb_build_object('state','none');end if;
 -- Old files have no diagnostics because v37 swallowed failures; a generic
 -- LEGACY classification states explicitly that the precise cause is unknown.
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
  message_hmac,state,reason_code,phase,attempt_count,first_failure_at,
  last_attempt_at,next_retry_at)
 values(job.message_hmac,'failed','legacy_unclassified','initial',1,
   job.ai_reserved_at,job.ai_reserved_at,clock_timestamp()-interval '1 second')
 on conflict(message_hmac) do update
 set state='failed',reason_code='api_timeout',phase='retry',
  attempt_count=least(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count+1),
  next_retry_at=clock_timestamp()-interval '1 second',
  updated_at=clock_timestamp()
 where cotironda_piloto_privado.document_ai_diagnostics_mvp127.state='pending'
 and cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count<3
 and cotironda_piloto_privado.document_ai_diagnostics_mvp127.updated_at<
  clock_timestamp()-interval '8 minutes';
 get diagnostics n=row_count;
 -- Subsequent RPC reserves atomically and rechecks all eligibility and timing.
 return jsonb_build_object('state','candidate','message_hmac',job.message_hmac);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_next_document_retry_mvp128(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_next_document_retry_mvp128(text)
 TO service_role;
-- 4. Worker programado: mismo filtro, no acumular trabajo no recuperable.
create or replace function public.cotironda_piloto_system_document_trigger_mvp131()
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_chat text;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled'); end if;
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
     where ai_reserved_at >= clock_timestamp()-interval '24 hours')
  + (select count(*) from cotironda_piloto_privado.document_ai_diagnostics_mvp127
     where last_attempt_at >= clock_timestamp()-interval '24 hours')
  >= (select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097
     where only_row)
 then return jsonb_build_object('state','quota');end if;
 select p.chat_hmac into v_chat
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 left join cotironda_piloto_privado.document_ai_diagnostics_mvp127 d
  on d.message_hmac=m.message_hmac
 where m.state='stored' and m.review_state='review_required'
  and m.proposal is null
  and m.storage_path='media/'||m.message_hmac
  and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.ai_reserved_at < clock_timestamp()-interval '3 minutes'
  and m.size_bytes between 8 and 8388608
  and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'text/plain','text/csv')
  and p.participant_role in ('buyer','supplier')
  and p.consent_at is not null and p.opted_out_at is null
  and (p.participant_role='buyer' or
   p.participant_role='supplier' and m.request_id is not null and
   exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=m.request_id and i.supplier_key=m.participant_key
     and i.state='prepared' and r.state='prepared'
     and r.closes_at>clock_timestamp()))
  and (d.message_hmac is null
   or d.state='failed' and d.attempt_count<3 and d.next_retry_at<=clock_timestamp()
      and public.cotironda_piloto_retryable_document_error_mvp256(d.reason_code)
   or d.state='pending' and d.attempt_count<3
      and d.updated_at<clock_timestamp()-interval '8 minutes')
 order by m.ai_reserved_at,m.message_hmac limit 1;
 if v_chat is null then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate','trigger_chat_hmac',v_chat);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_system_document_trigger_mvp131()
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_system_document_trigger_mvp131()
 TO service_role;

-- FIN mvp256_document_retry_policy_safe.sql

-- INICIO mvp257_whapi_uncertain_evidence.sql
-- MVP257 / Etapa 5. PASSIVE, authenticated Whapi status reconciliation ONLY.
-- No resends, no checkout, no automatic change to ANY outbound ledger.
-- Status without a known Whapi message ID is NEVER treated as proof.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.whapi_outbox') IS NULL OR
 to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
 to_regclass('cotironda_piloto_privado.delivery_receipts_mvp119') IS NULL
 THEN RAISE EXCEPTION 'mvp257_wrong_schema' USING errcode='42501';
 END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257(
 message_id_sha256 text PRIMARY KEY CHECK(message_id_sha256 ~ '^[a-f0-9]{64}$'),
 source_kind text NOT NULL CHECK(source_kind IN (
  'supplier_request','ai_supplier_request','buyer_tracking','supplier_ack','finalist'
 )),
 request_id uuid,
 recipient_key text NOT NULL,
 state text NOT NULL CHECK(state IN(
  'pending','sent','failed','deleted','delivered','read','played')),
 status_code integer NOT NULL CHECK(status_code BETWEEN 0 AND 6),
 event_unix bigint NOT NULL CHECK(event_unix>0),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 FROM public,anon,authenticated,service_role;

-- Authorized status events (validated signature/channel in Edge), NOT a
-- generic "check by phone" or a command to requeue a WhatsApp send.
CREATE FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 p_whapi_message_id text,p_status text,p_status_code integer,
 p_recipient_chat_hmac text,p_event_unix bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 matches_ integer;kind_ text;request_ uuid;recipient_ text;
 evidence_ record;digest_ text;old_rank_ integer;new_rank_ integer;inserted_ integer;
BEGIN
 IF p_whapi_message_id IS NULL OR
 p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$' OR
 p_recipient_chat_hmac IS NULL OR
 p_recipient_chat_hmac !~ '^[a-f0-9]{64}$' OR
 p_status NOT IN('failed','pending','sent','delivered','read','played','deleted') OR
 p_status_code IS DISTINCT FROM (CASE p_status
  WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 WHEN 'sent' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5
  WHEN 'deleted' THEN 6 ELSE -1 END) OR
 p_event_unix IS NULL OR
 p_event_unix<extract(epoch from clock_timestamp()-interval '7 days')::bigint OR
 p_event_unix>extract(epoch from clock_timestamp()+interval '5 minutes')::bigint
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Reject reused IDs even when only one recipient hash matches. A reused
 -- ID across companies or outbox types is ambiguous, never proof.
 IF (
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.buyer_tracking_mvp091
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.supplier_ack_mvp104
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110
   WHERE whapi_message_id=p_whapi_message_id)
 )<>1 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 -- Each opaque Whapi message ID must correspond to EXACTLY one existing
 -- uncertain entry AND recipient. Source membership is never inferred.
 SELECT count(*),max(x.source_kind),max(x.request_id::text)::uuid,
  max(x.recipient_key)
 INTO matches_,kind_,request_,recipient_
 FROM (
   SELECT 'supplier_request'::text source_kind,o.request_id,o.supplier_key recipient_key
   FROM cotironda_piloto_privado.whapi_outbox o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'ai_supplier_request',o.request_id,o.supplier_key
   FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'buyer_tracking',t.request_id,r.buyer_key
   FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
   JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
   WHERE t.send_state='uncertain' AND t.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'supplier_ack',m.request_id,m.participant_key
   FROM cotironda_piloto_privado.supplier_ack_mvp104 a
   JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
   WHERE a.state='uncertain' AND a.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'finalist',o.request_id,o.recipient_key
   FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
 ) x JOIN cotironda_piloto_privado.participants p
 ON p.key=x.recipient_key AND p.chat_hmac=p_recipient_chat_hmac;
 IF matches_<>1 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 digest_:=encode(extensions.digest(p_whapi_message_id,'sha256'),'hex');
 new_rank_:=CASE p_status
  WHEN 'pending' THEN 0 WHEN 'sent' THEN 1
  WHEN 'failed' THEN 2 WHEN 'deleted' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5 END;
 INSERT INTO cotironda_piloto_privado.uncertain_whapi_receipts_mvp257(
  message_id_sha256,source_kind,request_id,recipient_key,
  state,status_code,event_unix)
 VALUES(digest_,kind_,request_,recipient_,p_status,p_status_code,p_event_unix)
 ON CONFLICT(message_id_sha256) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 IF inserted_=1 THEN RETURN jsonb_build_object('state','observed_uncertain');END IF;
 SELECT * INTO evidence_
 FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 WHERE message_id_sha256=digest_ FOR UPDATE;
 IF NOT FOUND OR evidence_.source_kind IS DISTINCT FROM kind_
 OR evidence_.request_id IS DISTINCT FROM request_
 OR evidence_.recipient_key IS DISTINCT FROM recipient_
 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 old_rank_:=CASE evidence_.state
  WHEN 'pending' THEN 0 WHEN 'sent' THEN 1
  WHEN 'failed' THEN 2 WHEN 'deleted' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5 END;
 IF new_rank_<=old_rank_
 THEN RETURN jsonb_build_object('state','unchanged');END IF;
 UPDATE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 SET state=p_status,status_code=p_status_code,
     event_unix=p_event_unix,last_seen_at=clock_timestamp()
 WHERE message_id_sha256=digest_;
 RETURN jsonb_build_object('state','advanced');
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 text,text,integer,text,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 text,text,integer,text,bigint) TO service_role;

-- Aggregate-only operator signal, zero identifiers; no requeue operation.
CREATE FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 WITH all_jobs AS (
  SELECT 'supplier_request'::text source_kind, state,
   whapi_message_id,leased_at AS at_
  FROM cotironda_piloto_privado.whapi_outbox
  UNION ALL SELECT 'ai_supplier_request',state,whapi_message_id,leased_at
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  UNION ALL SELECT 'buyer_tracking',send_state,whapi_message_id,send_attempted_at
  FROM cotironda_piloto_privado.buyer_tracking_mvp091
  UNION ALL SELECT 'supplier_ack',state,whapi_message_id,reserved_at
  FROM cotironda_piloto_privado.supplier_ack_mvp104
  UNION ALL SELECT 'finalist',state,whapi_message_id,leased_at
  FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110
 ), counts AS (
  SELECT count(*) FILTER(WHERE state='uncertain') AS uncertain,
   count(*) FILTER(WHERE state='uncertain' AND whapi_message_id IS NULL)
    AS without_id,
   count(*) FILTER(WHERE state='uncertain' AND whapi_message_id IS NOT NULL)
    AS with_id,
   count(*) FILTER(WHERE state='leased' AND at_<clock_timestamp()-interval '15 minutes')
    AS stalled_leases
  FROM all_jobs
 )
 SELECT jsonb_build_object(
  'state','private_uncertain_summary',
  'uncertain',counts.uncertain,
  'without_whapi_id',counts.without_id,
  'with_whapi_id',counts.with_id,
  'stalled_leases',counts.stalled_leases,
  'observed_with_authenticated_status',
   (SELECT count(*) FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257),
  'automatic_resend_allowed',false
 ) FROM counts
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
 TO service_role;

-- FIN mvp257_whapi_uncertain_evidence.sql

-- INICIO mvp258_uncertain_noid_triage.sql
-- MVP258 / IA Central 5. Manual triage for Whapi uncertainty WITHOUT message ID.
-- Passive only. No network, no retry, no changes to any outbound table.
DO $preflight$
BEGIN
 IF to_regclass('cotironda_piloto_privado.whapi_outbox') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
    to_regclass('cotironda_piloto_privado.buyer_tracking_mvp091') IS NULL OR
    to_regclass('cotironda_piloto_privado.supplier_ack_mvp104') IS NULL OR
    to_regclass('cotironda_piloto_privado.finalist_whapi_outbox_mvp110') IS NULL
 THEN RAISE EXCEPTION 'mvp258_wrong_schema' USING errcode='42501';END IF;
END $preflight$;

CREATE TABLE cotironda_piloto_privado.uncertain_triage_cases_mvp258(
 case_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 source_fingerprint text NOT NULL UNIQUE
   CHECK(source_fingerprint~'^[a-f0-9]{64}$'),
 source_kind text NOT NULL CHECK(source_kind IN(
  'supplier_request','ai_supplier_request','buyer_tracking','supplier_ack','finalist')),
 reason text NOT NULL CHECK(reason IN(
  'uncertain_without_id','stale_lease_unverified')),
 request_id uuid,
 recipient_key text,
 source_message_hmac text CHECK(source_message_hmac IS NULL OR
   source_message_hmac~'^[a-f0-9]{64}$'),
 source_at timestamptz,
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(source_message_hmac IS NULL OR source_kind='supplier_ack')
);
ALTER TABLE cotironda_piloto_privado.uncertain_triage_cases_mvp258
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_triage_cases_mvp258
 FROM public,anon,authenticated,service_role;

-- Operator review notes never claim delivery. Only a SHA256 digest of the
-- operator's independently retained evidence, no text or contact details.
CREATE TABLE cotironda_piloto_privado.uncertain_review_notes_mvp258(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES
  cotironda_piloto_privado.uncertain_triage_cases_mvp258(case_id),
 note_code text NOT NULL CHECK(note_code IN (
  'awaiting_provider_evidence','manual_investigation_incomplete',
  'operator_escalation_required')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(case_id,note_code,evidence_sha256)
);
ALTER TABLE cotironda_piloto_privado.uncertain_review_notes_mvp258
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_review_notes_mvp258
 FROM public,anon,authenticated,service_role;

-- Fair scan: previously unseen cases are oldest; scan updates last_seen,
-- meaning the next invocation can progress through the full backlog.
CREATE FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE scanned_ integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 WITH source_rows AS (
  SELECT 'supplier_request'::text kind,
   o.request_id,o.supplier_key recipient,NULL::text message_hmac,
   o.state,o.whapi_message_id,o.leased_at AS source_at,
   o.request_id::text||':'||o.supplier_key AS key_
  FROM cotironda_piloto_privado.whapi_outbox o
  UNION ALL
  SELECT 'ai_supplier_request',o.request_id,o.supplier_key,NULL::text,
   o.state,o.whapi_message_id,o.leased_at,
   o.request_id::text||':'||o.supplier_key
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 o
  UNION ALL
  SELECT 'buyer_tracking',t.request_id,r.buyer_key,NULL::text,
   t.send_state,t.whapi_message_id,t.send_attempted_at,
   t.request_id::text
  FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
  JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
  UNION ALL
  SELECT 'supplier_ack',m.request_id,m.participant_key,a.message_hmac,
   a.state,a.whapi_message_id,a.reserved_at,
   a.message_hmac
  FROM cotironda_piloto_privado.supplier_ack_mvp104 a
  JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
  UNION ALL
  SELECT 'finalist',o.request_id,o.recipient_key,NULL::text,
   o.state,o.whapi_message_id,o.leased_at,
   o.request_id::text||':'||o.recipient_key
  FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
 ), eligible AS (
  SELECT source_rows.*,
   CASE WHEN state='uncertain' THEN 'uncertain_without_id'
    ELSE 'stale_lease_unverified' END AS reason_,
   encode(extensions.digest(kind||':'||key_,'sha256'),'hex') AS fingerprint_
  FROM source_rows
  WHERE key_ IS NOT NULL AND whapi_message_id IS NULL AND (
   state='uncertain' OR
   (state='leased' AND source_at<clock_timestamp()-interval '15 minutes'))
 ), chosen AS (
  SELECT e.* FROM eligible e
  LEFT JOIN cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
   ON c.source_fingerprint=e.fingerprint_
  ORDER BY c.last_seen_at NULLS FIRST,e.source_at NULLS LAST,e.fingerprint_
  LIMIT p_limit
 ), written AS (
  INSERT INTO cotironda_piloto_privado.uncertain_triage_cases_mvp258(
   source_fingerprint,source_kind,reason,request_id,
   recipient_key,source_message_hmac,source_at)
  SELECT fingerprint_,kind,reason_,request_id,recipient,message_hmac,source_at
  FROM chosen
  ON CONFLICT(source_fingerprint) DO UPDATE
   SET last_seen_at=clock_timestamp(),
       reason=excluded.reason,
       source_at=excluded.source_at
  RETURNING case_id
 )
 SELECT count(*) INTO scanned_ FROM written;
 RETURN jsonb_build_object('state','triage_scanned_private',
  'scanned',scanned_,'messages_sent',0,'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(integer)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(integer)
 TO service_role;

-- Read-only operator queue: never returns request ID, contact, token or HMAC.
CREATE FUNCTION public.cotironda_piloto_list_uncertain_mvp258(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'case_id',c.case_id,'source_kind',c.source_kind,'reason',c.reason,
  'first_seen_at',c.first_seen_at,'last_seen_at',c.last_seen_at,
  'review_notes',coalesce(n.count_,0)
 ) ORDER BY c.first_seen_at,c.case_id),'[]'::jsonb)
 INTO v
 FROM (
  SELECT * FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
  ORDER BY first_seen_at,case_id LIMIT p_limit
 ) c
 LEFT JOIN LATERAL(
  SELECT count(*) AS count_ FROM cotironda_piloto_privado.uncertain_review_notes_mvp258 n
  WHERE n.case_id=c.case_id
 ) n ON true;
 RETURN jsonb_build_object('state','operator_review_only','cases',v,
  'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_list_uncertain_mvp258(integer)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_list_uncertain_mvp258(integer)
 TO service_role;

-- A manual operator can only leave an immutable "not resolved" evidence
-- note; no "delivered" or "failed therefore retry" action exists.
CREATE FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 p_case_id uuid,p_note_code text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE inserted_ integer;
BEGIN
 IF p_case_id IS NULL OR p_note_code NOT IN(
  'awaiting_provider_evidence','manual_investigation_incomplete',
  'operator_escalation_required') OR
  p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 INSERT INTO cotironda_piloto_privado.uncertain_review_notes_mvp258(
  case_id,note_code,evidence_sha256)
 SELECT c.case_id,p_note_code,p_evidence_sha256
 FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
 WHERE c.case_id=p_case_id
 ON CONFLICT(case_id,note_code,evidence_sha256) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN inserted_=1 THEN 'review_noted'
  ELSE 'no_change' END,'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 uuid,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 uuid,text,text) TO service_role;

-- FIN mvp258_uncertain_noid_triage.sql