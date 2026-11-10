-- MVP211 / reemplazo seguro y acotado del selector MVP172.
-- 12 cotizaciones, 30 artículos solicitados; cada original conserva 25 líneas.
-- No aplicar sin autorización de despliegue al piloto.
-- MVP172 - Selector PRIVADO de insumos para diagnostico de ronda.
-- NO crea ranking, no modifica cotizaciones, no expone datos al browser.
-- Instalar solo tras autorización de despliegue en piloto y smoke rollback.
-- SQL SECURITY DEFINER: EXECUTE service_role solamente.
create or replace function public.cotironda_piloto_private_round_inputs_mvp172(
 p_request_id uuid
) returns jsonb language plpgsql security definer
set search_path='' as $fn$
declare
 v_buyer_ok boolean:=false;
 v_request_state text;
 v_items_count integer:=0;
 v_quotes_count integer:=0;
 v_selected_count integer:=0;
 v_items jsonb:='[]'::jsonb;
 v_documents jsonb:='[]'::jsonb;
begin
 if p_request_id is null then
  return jsonb_build_object('state','not_permitted');
 end if;
 select r.state,
  buyer.participant_role='buyer'
  and buyer.consent_at is not null and buyer.opted_out_at is null
 into v_request_state,v_buyer_ok
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.participants buyer
  on buyer.key=r.buyer_key
 where r.id=p_request_id;
 if not found or v_buyer_ok is distinct from true or
  v_request_state not in ('prepared','closed') then
  return jsonb_build_object('state','not_permitted');
 end if;
 select count(*),
  coalesce(jsonb_agg(jsonb_build_object(
   'id','item_'||lpad(line_no::text,3,'0'),
   'descripcionLiteral',original_description,
   'cantidad',trim(to_char(quantity,'FM999999990.000')),
   'unidad',unit,
   'familia',family_code
  ) order by line_no),'[]'::jsonb)
 into v_items_count,v_items
 from cotironda_piloto_privado.request_lines
 where request_id=p_request_id;
 select count(*) into v_quotes_count
 from cotironda_piloto_privado.supplier_media_quotes_mvp098
 where request_id=p_request_id;
 -- All or NONE: no hidden quote, no top-N truncation, no partial security read.
 if v_items_count<1 or v_items_count>30
  or v_quotes_count<1 or v_quotes_count>12 then
  return jsonb_build_object('state','capacity_or_empty');
 end if;
 if jsonb_array_length(v_items)<>v_items_count or
  exists(select 1 from cotironda_piloto_privado.request_lines l
   where l.request_id=p_request_id and
   (l.line_no<1 or l.line_no>30 or l.quantity<=0 or
    l.unit not in ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
    or l.original_description is null
    or length(l.original_description)>500)) then
  return jsonb_build_object('state','invalid_request_items');
 end if;
 with eligible as (
  select q.message_hmac,
   jsonb_build_object(
    'doc',jsonb_build_object(
     'requestId',q.request_id,'anonId','anon_private',
     'messageHmac',q.message_hmac,'sourceSha256',q.source_sha256,
     'declaredTotalLiteral',q.declared_total_literal,
     'lineas',snapshot.lines,
     'prueba',jsonb_build_object(
      'requestId',q.request_id,'messageHmac',q.message_hmac,
      'sourceSha256',q.source_sha256,
      'version',9,'state',e.state,'reason',e.reason,
      'lineCount',q.line_count,
      'sumLineCents',e.sum_line_cents::text,
      'declaredTotalCents',e.declared_total_cents::text,
      'rankingAllowed',false,
      'revisionVigente',true,'cotizacionVigente',true
     )
    ),
    -- Exact REVIEWED text binds an internal source revision to the correct
    -- tracking offer; no raw hash, supplier name or private file goes public.
    'publicText',e.public_text,
    'fuente',jsonb_build_object(
     'requestId',q.request_id,'messageHmac',q.message_hmac,
     'sourceSha256',q.source_sha256,
     'state',sf.state,'rankingAllowed',false,
     'sourceImmutabilityPreserved',true,'lines',sf.facts->'lines'
    ),
    'economia',jsonb_build_object(
     'state',eco.state,
     'sourceSha256',eco.source_sha256,
     'rankingAllowed',false,
     'descuentos',eco.facts->'descuentos',
     'condiciones',eco.facts->'condiciones'
    )
   ) as doc
  from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  join cotironda_piloto_privado.supplier_evidence_mvp138 e
   on e.message_hmac=q.message_hmac and e.verifier_version=9
   and e.request_id=q.request_id and e.supplier_key=q.supplier_key
   and e.source_sha256=q.source_sha256
  join cotironda_piloto_privado.supplier_source_facts_mvp163 sf
   on sf.message_hmac=q.message_hmac and sf.request_id=q.request_id
   and sf.supplier_key=q.supplier_key
   and sf.source_sha256=q.source_sha256
  join cotironda_piloto_privado.supplier_economic_facts_mvp168 eco
   on eco.message_hmac=q.message_hmac and eco.request_id=q.request_id
   and eco.supplier_key=q.supplier_key
   and eco.source_sha256=q.source_sha256
  join cotironda_piloto_privado.media_archive_mvp095 media
   on media.message_hmac=q.message_hmac and media.request_id=q.request_id
   and media.participant_key=q.supplier_key
   and media.content_sha256=q.source_sha256
  join cotironda_piloto_privado.invitations inv
   on inv.request_id=q.request_id and inv.supplier_key=q.supplier_key
  join cotironda_piloto_privado.participants supplier
   on supplier.key=q.supplier_key and supplier.chat_hmac=media.chat_hmac
  join cotironda_piloto_privado.requests r on r.id=q.request_id
  cross join lateral (
   select count(*) as n,min(l.line_no) as first_line,max(l.line_no) as last_line,
    jsonb_agg(jsonb_build_object(
     'lineNo',l.line_no,'descriptionLiteral',l.description_literal,
     'quantityLiteral',l.quantity_literal,'unitLiteral',l.unit_literal,
     'unitPriceLiteral',l.unit_price_literal,'lineTotalLiteral',l.line_total_literal
    ) order by l.line_no) as lines
   from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
   where l.message_hmac=q.message_hmac
  ) snapshot
  where q.request_id=p_request_id
   and q.line_count between 1 and 25
   and snapshot.n=q.line_count and snapshot.first_line=1
   and snapshot.last_line=q.line_count
   and e.state='verified' and e.reason='covered'
   and e.public_text is not null and length(e.public_text) between 1 and 16000
   and e.sum_line_cents=e.declared_total_cents
   and e.declared_total_cents is not null
   and sf.state='source_checked' and eco.state='source_checked'
   and sf.facts->>'rankingAllowed'='false'
   and eco.facts->>'rankingAllowed'='false'
   and sf.facts->>'sourceImmutabilityPreserved'='true'
   and eco.facts->>'sourceImmutabilityPreserved'='true'
   and jsonb_typeof(sf.facts->'lines')='array'
   and jsonb_array_length(sf.facts->'lines')=q.line_count
   and jsonb_typeof(eco.facts->'descuentos'->'precios')='array'
   and jsonb_array_length(eco.facts->'descuentos'->'precios')=q.line_count
   and media.state='stored'
   and media.storage_path='media/'||q.message_hmac
   and inv.state='prepared'
   and supplier.participant_role='supplier'
   and supplier.consent_at is not null and supplier.opted_out_at is null
   and q.received_at>=r.created_at and q.received_at<=r.closes_at
   and not exists (
    select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 later
    where later.message_hmac=q.message_hmac and later.verifier_version>9
   )
 )
 select count(*),coalesce(jsonb_agg(doc order by message_hmac),'[]'::jsonb)
 into v_selected_count,v_documents from eligible;
 if v_selected_count<>v_quotes_count then
  return jsonb_build_object('state','incomplete_evidence',
   'quotesExpected',v_quotes_count,'quotesValidated',v_selected_count);
 end if;
 if length(v_documents::text)>300000 then
  return jsonb_build_object('state','capacity_or_empty');
 end if;
 return jsonb_build_object(
  'state','private_inputs','requestItems',v_items,
  'quotations',v_documents,'rankingAllowed',false,
  'contactsRevealed',false
 );
end;$fn$;

revoke all on function public.cotironda_piloto_private_round_inputs_mvp172(uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_private_round_inputs_mvp172(uuid)
 to service_role;
