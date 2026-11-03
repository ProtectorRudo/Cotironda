-- MVP-074 smoke de integración, ejecutar SOLO en Cotironda PILOTO tras instalar la migración.
-- Exige el pedido real de arquitectura y una oferta de Ailín (no depende del UUID).
-- TODAS las modificaciones de ensayo se revierten; NO habilita el canal real.
begin;

do $smoke$
declare
 rid uuid;
 existing_quote text;
 lease uuid := gen_random_uuid();
begin
 select o.request_id into rid
 from cotironda_piloto_privado.whapi_outbox o
 where o.supplier_key='corralon_ailin'
   and exists(select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=o.request_id and v.supplier_key=o.supplier_key)
 order by o.created_at desc limit 1;
 if rid is null then raise exception 'mvp074_no_real_quote';end if;
 select original_quote into existing_quote
 from cotironda_piloto_privado.offer_versions
 where request_id=rid and supplier_key='corralon_ailin' and revision_no=1;
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_ailin') <> 'cancelled'
 then raise exception 'mvp074_backfill_not_cancelled';end if;
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_nahuel') <> 'pending'
 then raise exception 'mvp074_wrong_supplier_cancelled';end if;

 update cotironda_piloto_privado.whapi_outbox set state='pending'
 where request_id=rid and supplier_key='corralon_ailin';
 insert into cotironda_piloto_privado.offer_versions
 (request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,'corralon_ailin',2,encode(sha256(convert_to('mvp074-v2','UTF8')),'hex'),'PRESUPUESTO PRUEBA CORRECCION');
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_ailin') <> 'cancelled'
 then raise exception 'mvp074_trigger_failed';end if;

 update cotironda_piloto_privado.whapi_outbox
 set state='leased',lease_token=lease,leased_at=clock_timestamp()
 where request_id=rid and supplier_key='corralon_ailin';
 insert into cotironda_piloto_privado.offer_versions
 (request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,'corralon_ailin',3,encode(sha256(convert_to('mvp074-v3','UTF8')),'hex'),'CORRECCION 3');
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_ailin') <> 'leased'
 then raise exception 'mvp074_lease_damaged';end if;

 update cotironda_piloto_privado.integration_flags
 set whatsapp_outbound_enabled=true where only_row=true;
 if public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_ailin',lease)
 then raise exception 'mvp074_authorized_after_quote';end if;

 update cotironda_piloto_privado.whapi_outbox
 set state='uncertain' where request_id=rid and supplier_key='corralon_ailin';
 insert into cotironda_piloto_privado.offer_versions
 (request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,'corralon_ailin',4,encode(sha256(convert_to('mvp074-v4','UTF8')),'hex'),'CORRECCION 4');
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_ailin') <> 'uncertain'
 then raise exception 'mvp074_uncertain_damaged';end if;
 if (select original_quote from cotironda_piloto_privado.offer_versions
 where request_id=rid and supplier_key='corralon_ailin' and revision_no=1)
 is distinct from existing_quote then raise exception 'mvp074_original_modified';end if;
 if (select state from cotironda_piloto_privado.whapi_outbox
       where request_id=rid and supplier_key='corralon_nahuel') <> 'pending'
 then raise exception 'mvp074_nahuel_changed';end if;
end;
$smoke$;
select 'PASS rollback-only: backfill, trigger, lease, uncertain, auth, original source' as result;
rollback;
