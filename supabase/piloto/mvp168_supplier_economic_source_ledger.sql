-- MVP168 — SOLO PILOTO, INSTALACION MANUAL AUTORIZADA PENDIENTE.
-- Fuente v9 inmutable: ledger ECONOMICO privado, separado de ofertas y portal.
-- No cambia ranking, finalistas, contactos, WhatsApp ni documentos anteriores.
create table if not exists cotironda_piloto_privado.supplier_economic_facts_mvp168(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac)
  on delete restrict,
 request_id uuid not null references cotironda_piloto_privado.requests(id)
  on delete restrict,
 supplier_key text not null references cotironda_piloto_privado.participants(key)
  on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('source_checked','unreadable')),
 facts jsonb not null check(jsonb_typeof(facts)='object'
  and length(facts::text)<=12000
  and facts->>'rankingAllowed'='false'
  and facts->>'sourceImmutabilityPreserved'='true'),
 checked_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.supplier_economic_facts_mvp168
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_economic_facts_mvp168
 from public,anon,authenticated,service_role;
drop trigger if exists supplier_economic_immutable_mvp168
 on cotironda_piloto_privado.supplier_economic_facts_mvp168;
create trigger supplier_economic_immutable_mvp168 before update or delete
 on cotironda_piloto_privado.supplier_economic_facts_mvp168
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- SELECTOR privado; la prueba v9 se conserva y cualquier versión posterior
-- invalida esta selección. No reutilizar evidencia de corrección antigua.
create or replace function public.cotironda_piloto_next_economic_facts_mvp168()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare job record;
begin
 select q.message_hmac,q.source_sha256,m.mime,m.size_bytes,
 jsonb_build_object(
  'requestId',q.request_id,'anonId','anon_private',
  'messageHmac',q.message_hmac,'sourceSha256',q.source_sha256,
  'declaredTotalLiteral',q.declared_total_literal,
  'lineas',snap.lineas,
  'prueba',jsonb_build_object(
   'requestId',q.request_id,'messageHmac',q.message_hmac,
   'sourceSha256',q.source_sha256,'version',9,
   'state',e.state,'reason',e.reason,'lineCount',q.line_count,
   'sumLineCents',e.sum_line_cents::text,
   'declaredTotalCents',e.declared_total_cents::text,
   'rankingAllowed',false,'revisionVigente',true,
   'cotizacionVigente',true
  )
 ) as doc
 into job
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.participant_key=q.supplier_key and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_evidence_mvp138 e
  on e.message_hmac=q.message_hmac and e.verifier_version=9
  and e.request_id=q.request_id and e.supplier_key=q.supplier_key
  and e.source_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_source_facts_mvp163 sf
  on sf.message_hmac=q.message_hmac and sf.request_id=q.request_id
  and sf.source_sha256=q.source_sha256 and sf.state='source_checked'
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.participants supplier
  on supplier.key=q.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.requests r on r.id=q.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 cross join lateral(
  select count(*) as n,min(l.line_no) as first_no,max(l.line_no) as last_no,
   jsonb_agg(jsonb_build_object(
    'lineNo',l.line_no,'descriptionLiteral',l.description_literal,
    'quantityLiteral',l.quantity_literal,'unitLiteral',l.unit_literal,
    'unitPriceLiteral',l.unit_price_literal,
    'lineTotalLiteral',l.line_total_literal
   ) order by l.line_no) as lineas
  from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
  where l.message_hmac=q.message_hmac
 ) snap
 where q.line_count between 1 and 25 and snap.n=q.line_count
 and snap.first_no=1 and snap.last_no=q.line_count
 and e.state='verified' and e.reason='covered'
 and e.sum_line_cents is not null and e.declared_total_cents is not null
 and e.sum_line_cents=e.declared_total_cents
 and q.received_at>=r.created_at and q.received_at<=r.closes_at
 and q.source_sha256 ~ '^[a-f0-9]{64}$'
 and m.state='stored' and m.review_state='suggested_only'
 and m.storage_path='media/'||q.message_hmac
 and m.size_bytes between 120 and 8388608
 and m.mime in ('application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/csv')
 and m.proposal->>'kind'='supplier_quote'
 and supplier.participant_role='supplier'
 and supplier.consent_at is not null and supplier.opted_out_at is null
 and buyer.participant_role='buyer'
 and buyer.consent_at is not null and buyer.opted_out_at is null
 and r.state in ('prepared','closed') and i.state='prepared'
 and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 newer
  where newer.message_hmac=q.message_hmac and newer.verifier_version>9)
 and not exists(select 1 from cotironda_piloto_privado.supplier_economic_facts_mvp168 f
  where f.message_hmac=q.message_hmac)
 order by q.received_at,q.message_hmac limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate',
  'message_hmac',job.message_hmac,
  'source_sha256',job.source_sha256,'mime',job.mime,
  'size_bytes',job.size_bytes,'doc',job.doc);
end;$fn$;

-- Verifica enumeraciones, forma del payload, líneas y localizadores:
-- jamás se persisten textos originales, PII, links o tasas inferidas.
create or replace function public.cotironda_piloto_record_economic_facts_mvp168(
 p_message_hmac text,p_source_sha256 text,p_state text,p_facts jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare qinfo record; row_ jsonb; item jsonb; field_ text;
 n integer:=0;inserted integer:=0;
begin
 if coalesce(p_message_hmac,'') !~ '^[a-f0-9]{64}$'
  or coalesce(p_source_sha256,'') !~ '^[a-f0-9]{64}$'
  or p_state not in ('source_checked','unreadable')
  or p_facts is null or jsonb_typeof(p_facts)<>'object'
  or length(p_facts::text)>12000
  or p_facts->>'rankingAllowed'<>'false'
  or p_facts->>'sourceImmutabilityPreserved'<>'true'
  or (select count(*) from jsonb_object_keys(p_facts))<>4
  or not (p_facts ?& array['descuentos','condiciones',
    'rankingAllowed','sourceImmutabilityPreserved'])
 then return jsonb_build_object('state','invalid');end if;

 select q.message_hmac,q.request_id,q.supplier_key,q.line_count
 into qinfo from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.content_sha256=q.source_sha256
  and m.participant_key=q.supplier_key
  and m.storage_path='media/'||q.message_hmac and m.state='stored'
 join cotironda_piloto_privado.supplier_evidence_mvp138 e
  on e.message_hmac=q.message_hmac and e.verifier_version=9
  and e.request_id=q.request_id and e.supplier_key=q.supplier_key
  and e.source_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_source_facts_mvp163 sf
  on sf.message_hmac=q.message_hmac and sf.source_sha256=q.source_sha256
  and sf.state='source_checked'
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.participants supplier
  on supplier.key=q.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.requests r on r.id=q.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where q.message_hmac=p_message_hmac and q.source_sha256=p_source_sha256
  and e.state='verified' and e.reason='covered'
  and supplier.participant_role='supplier'
  and supplier.consent_at is not null and supplier.opted_out_at is null
  and buyer.participant_role='buyer'
  and buyer.consent_at is not null and buyer.opted_out_at is null
  and r.state in ('prepared','closed')
  and i.state='prepared'
  and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 newer
   where newer.message_hmac=q.message_hmac and newer.verifier_version>9)
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_economic_facts_mvp168 f
  where f.message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_checked');end if;
 if p_state='unreadable' then
  if p_facts->'descuentos' is not null or p_facts->'condiciones' is not null
   then return jsonb_build_object('state','invalid');end if;
 else
  if jsonb_typeof(p_facts->'descuentos')<>'object'
   or jsonb_typeof(p_facts->'condiciones')<>'object'
   then return jsonb_build_object('state','invalid');end if;
  if (select count(*) from jsonb_object_keys(p_facts->'descuentos'))<>5
   or not (p_facts->'descuentos' ?& array[
    'estado','precios','rankingHabilitado','contactosRevelados','originalesModificados'])
   or p_facts->'descuentos'->>'rankingHabilitado'<>'false'
   or p_facts->'descuentos'->>'contactosRevelados'<>'false'
   or p_facts->'descuentos'->>'originalesModificados'<>'false'
   or p_facts->'descuentos'->>'estado' not in
    ('descuentos_conciliados_sin_iva','parcial','fuente_no_acreditada')
   or jsonb_typeof(p_facts->'descuentos'->'precios')<>'array'
   or jsonb_array_length(p_facts->'descuentos'->'precios')<>qinfo.line_count
   then return jsonb_build_object('state','invalid');end if;
  for row_ in select value from jsonb_array_elements(p_facts->'descuentos'->'precios') loop
   n:=n+1;
   if jsonb_typeof(row_)<>'object'
    or (select count(*) from jsonb_object_keys(row_))<>7
    or not (row_ ?& array['linea','pagina','fila','estado',
     'descuentoPorcentaje','unitarioComercialTrasDescuento','ivaAcreditado'])
    or row_->>'linea'<>n::text
    or row_->>'ivaAcreditado'<>'false'
    or row_->>'estado' not in (
     'descuento_explicito_conciliado','importe_sin_ajuste_conciliado',
     'fila_no_univoca','descuento_ambiguo',
     'importe_no_conciliado','datos_insuficientes')
    or (row_->>'pagina' is null)<>(row_->>'fila' is null)
    or (row_->>'pagina' is not null and
     (row_->>'pagina' !~ '^[0-9]{1,2}$' or (row_->>'pagina')::int not between 1 and 12))
    or (row_->>'fila' is not null and
     (row_->>'fila' !~ '^[0-9]{1,3}$' or (row_->>'fila')::int not between 1 and 300))
    or (row_->>'descuentoPorcentaje' is not null and
     row_->>'descuentoPorcentaje' !~ '^(0|[1-9][0-9]?)\.[0-9]{2}$')
    or (row_->>'unitarioComercialTrasDescuento' is not null and
     row_->>'unitarioComercialTrasDescuento' !~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$')
   then return jsonb_build_object('state','invalid_lines');end if;
  end loop;

  if (select count(*) from jsonb_object_keys(p_facts->'condiciones'))<>11
   or not (p_facts->'condiciones' ?& array[
    'estado','iva','flete','pago','netoSinIvaAcreditado',
    'stockCorroborado','plazoCorroborado','minimoCompraCorroborado',
    'rankingHabilitado','originalesModificados','contactosRevelados'])
   or p_facts->'condiciones'->>'estado' not in ('fuente_leida','fuente_no_acreditada')
   or p_facts->'condiciones'->>'netoSinIvaAcreditado'<>'false'
   or p_facts->'condiciones'->>'stockCorroborado'<>'false'
   or p_facts->'condiciones'->>'plazoCorroborado'<>'false'
   or p_facts->'condiciones'->>'minimoCompraCorroborado'<>'false'
   or p_facts->'condiciones'->>'rankingHabilitado'<>'false'
   or p_facts->'condiciones'->>'originalesModificados'<>'false'
   or p_facts->'condiciones'->>'contactosRevelados'<>'false'
   then return jsonb_build_object('state','invalid');end if;
  if jsonb_typeof(p_facts->'condiciones'->'iva')<>'object'
   or jsonb_typeof(p_facts->'condiciones'->'flete')<>'object'
   or jsonb_typeof(p_facts->'condiciones'->'pago')<>'object'
   or p_facts->'condiciones'->'iva'->>'estado' not in (
    'no_informado','incluido','no_incluido','tasa_sin_base','contradictorio')
   or p_facts->'condiciones'->'flete'->>'estado' not in (
    'no_informado','incluido','sin_cargo','adicional_con_importe',
    'adicional_sin_importe','importe_sin_tratamiento',
    'a_convenir','contradictorio')
   or p_facts->'condiciones'->'pago'->>'estado' not in (
    'no_informado','contado','transferencia',
    'cuenta_corriente_30_dias','multiple')
   or (select count(*) from jsonb_object_keys(p_facts->'condiciones'->'iva'))<>3
   or (select count(*) from jsonb_object_keys(p_facts->'condiciones'->'flete'))<>3
   or (select count(*) from jsonb_object_keys(p_facts->'condiciones'->'pago'))<>2
   or (p_facts->'condiciones'->'iva'->>'tasa' is not null
    and p_facts->'condiciones'->'iva'->>'tasa' not in ('0','10.5','21'))
   or (p_facts->'condiciones'->'flete'->>'importe' is not null
    and p_facts->'condiciones'->'flete'->>'importe'
    !~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$')
   then return jsonb_build_object('state','invalid');end if;
  foreach field_ in array array['iva','flete','pago'] loop
   if jsonb_typeof(p_facts->'condiciones'->field_->'ubicaciones')<>'array'
    or jsonb_array_length(p_facts->'condiciones'->field_->'ubicaciones')>100
    then return jsonb_build_object('state','invalid');end if;
   for item in select value from jsonb_array_elements(
    p_facts->'condiciones'->field_->'ubicaciones')
   loop
    if jsonb_typeof(item)<>'object'
     or (select count(*) from jsonb_object_keys(item))<>2
     or not (item ?& array['pagina','fila'])
     or item->>'pagina' !~ '^[0-9]{1,2}$'
     or (item->>'pagina')::int not between 1 and 12
     or item->>'fila' !~ '^[0-9]{1,3}$'
     or (item->>'fila')::int not between 1 and 300
     then return jsonb_build_object('state','invalid_locations');end if;
   end loop;
  end loop;
 end if;
 insert into cotironda_piloto_privado.supplier_economic_facts_mvp168(
  message_hmac,request_id,supplier_key,source_sha256,state,facts)
 values(p_message_hmac,qinfo.request_id,qinfo.supplier_key,
  p_source_sha256,p_state,p_facts)
 on conflict(message_hmac) do nothing;
 get diagnostics inserted=row_count;
 return jsonb_build_object('state',case when inserted=1
  then 'recorded' else 'already_checked' end);
end;$fn$;

revoke all on function public.cotironda_piloto_next_economic_facts_mvp168()
 from public,anon,authenticated;
revoke all on function public.cotironda_piloto_record_economic_facts_mvp168(
 text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_economic_facts_mvp168()
 to service_role;
grant execute on function public.cotironda_piloto_record_economic_facts_mvp168(
 text,text,text,jsonb) to service_role;
