-- MVP-092 OPERATOR — Reemplazo explícito de ronda de ENSAYO, pilot only.
-- Preserva pedido antiguo, 1 presupuesto Ailín, estados Whapi y auditoría.
-- Se cancelan SOLO invitaciones antiguas para no asignar presupuestos nuevos
-- al ensayo anterior ni forzar campos/códigos al proveedor.
begin;
do $cleanup$
declare old_id uuid; n integer; prev_quotes integer;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row=true and whatsapp_inbound_enabled and whatsapp_outbound_enabled)
 or (select count(*) from cotironda_piloto_privado.next_round_window_mvp091
   where expires_at>clock_timestamp())<>1
 or (select count(*) from cotironda_piloto_privado.requests)<>1
 or (select count(*) from cotironda_piloto_privado.whapi_outbox
   where state in ('pending','leased','uncertain'))<>0
 or (select count(*) from cotironda_piloto_privado.buyer_tracking_mvp091)<>0
 then raise exception 'mvp092_pilot_not_ready_for_reset' using errcode='42501';end if;
 select r.id into old_id from cotironda_piloto_privado.requests r
 where r.buyer_key='arquitecto' and r.delivery_city='La Plata'
   and r.state='prepared'
   and r.created_at<(select starts_at from cotironda_piloto_privado.next_round_window_mvp091)
   and (select count(*) from cotironda_piloto_privado.request_lines l
      where l.request_id=r.id)=2;
 if old_id is null then raise exception 'mvp092_old_request_missing' using errcode='42501';end if;
 if (select count(*) from cotironda_piloto_privado.invitations i
      where i.request_id=old_id and i.state='prepared'
      and i.supplier_key in ('corralon_ailin','corralon_nahuel'))<>2
 then raise exception 'mvp092_old_invites_changed' using errcode='42501';end if;
 select count(*) into prev_quotes from cotironda_piloto_privado.offer_versions
  where request_id=old_id and supplier_key='corralon_ailin';
 if prev_quotes<>1 then raise exception 'mvp092_original_quote_changed' using errcode='42501';end if;
 update cotironda_piloto_privado.invitations
 set state='cancelled' where request_id=old_id and state='prepared'
   and supplier_key in('corralon_ailin','corralon_nahuel');
 get diagnostics n=row_count;
 if n<>2 then raise exception 'mvp092_cancel_count_failed' using errcode='42501';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions
      where request_id=old_id and supplier_key='corralon_ailin')<>prev_quotes
 then raise exception 'mvp092_quote_integrity_failed' using errcode='42501';end if;
 if (select count(*) from cotironda_piloto_privado.whapi_outbox o
      where o.request_id=old_id and o.supplier_key='corralon_nahuel'
        and o.state='api_accepted')<>1
 then raise exception 'mvp092_old_whapi_history_changed' using errcode='42501';end if;
end;$cleanup$;
commit;
