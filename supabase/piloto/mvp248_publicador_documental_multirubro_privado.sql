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
