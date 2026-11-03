-- MVP-072: ejecutar SOLO en proyecto Supabase cotironda-piloto
-- id ilggkalaafhtiysyzlmg con credenciales administrativas controladas.
-- Test transaccional: no persiste clientes, pedidos, presupuestos ni mensajería.
begin;
do $smoke$
declare
 r_good uuid; r_wrong uuid; n integer; literal text;
begin
 insert into cotironda_piloto_privado.requests
 (buyer_key,delivery_city,original_request,state)
 values('arquitecto','La Plata',
 'ENSAYO: 20 bolsas de cemento CPC 50 kg y 5 litros de hidrófugo. Entrega La Plata.',
 'prepared') returning id into r_good;
 insert into cotironda_piloto_privado.request_lines
 (request_id,line_no,original_description,quantity,unit,family_code)
 values
 (r_good,1,'Cemento CPC 50 kg',20,'bag','cemento_gris_obra'),
 (r_good,2,'Hidrófugo 1 litro',5,'l','hidrofugo');
 select count(*) into n from cotironda_piloto_privado.candidate_suppliers
 where request_id=r_good;
 if n<>2 then raise exception 'mvp072_expected_two_suppliers_got_%',n;end if;
 if exists(select 1 from cotironda_piloto_privado.candidate_suppliers
  where request_id=r_good and (whatsapp_sent or catalogue_confirmed)) then
  raise exception 'mvp072_must_not_send_or_confirm';end if;
 insert into cotironda_piloto_privado.requests
 (buyer_key,delivery_city,original_request,state)
 values('arquitecto','Berisso',
 'ENSAYO: 20 bolsas de cemento CPC 50 kg. Entrega Berisso.',
 'prepared') returning id into r_wrong;
 insert into cotironda_piloto_privado.request_lines
 (request_id,line_no,original_description,quantity,unit,family_code)
 values(r_wrong,1,'Cemento CPC 50 kg',20,'bag','cemento_gris_obra');
 select count(*) into n from cotironda_piloto_privado.candidate_suppliers
 where request_id=r_wrong;
 if n<>0 then raise exception 'mvp072_zone_leak_%',n;end if;
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 values(r_good,'corralon_ailin'),(r_good,'corralon_nahuel');
 insert into cotironda_piloto_privado.offer_versions
 (request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(r_good,'corralon_ailin',1,repeat('a',64),
  '20 bolsas cemento: $190.000' || E'\n' ||
  '2 pallets vacíos: $14.000' || E'\n' ||
  'Flete: $12.000' || E'\n' ||
  'TOTAL FINAL: $216.000');
 select original_quote into literal
 from cotironda_piloto_privado.offer_versions
 where request_id=r_good and supplier_key='corralon_ailin';
 if literal not like '%2 pallets vacíos%' or literal not like '%$216.000%' then
  raise exception 'mvp072_quote_not_literal';end if;
 begin
  update cotironda_piloto_privado.offer_versions set original_quote='alterado'
  where request_id=r_good and supplier_key='corralon_ailin';
  raise exception 'mvp072_immutable_failed';
 exception when raise_exception then
  if sqlerrm<>'original_quote_immutable' then raise;end if;
 end;
 begin
  insert into cotironda_piloto_privado.offer_versions
  (request_id,supplier_key,revision_no,source_message_hmac,original_quote)
  values(r_good,'corralon_ailin',2,repeat('a',64),'otra versión repetida');
  raise exception 'mvp072_duplicate_accepted';
 exception when unique_violation then null;
 end;
 if (select whatsapp_outbound_enabled or whatsapp_inbound_enabled
   from cotironda_piloto_privado.integration_flags where only_row=true) then
  raise exception 'mvp072_whapi_not_off';end if;
end $smoke$;
rollback;
