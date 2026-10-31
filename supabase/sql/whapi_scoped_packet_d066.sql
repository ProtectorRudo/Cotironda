-- D066 PRIVATE read-only supplier packet. PostgreSQL17 CI only. No Whapi.
create table cotironda_private.item_display_d066(
 product_code text primary key references cotironda_private.item_rubros_d065(product_code),
 display_label text not null check(
 char_length(display_label) between 3 and 90
 and display_label ~ '^[[:alnum:] ÁÉÍÓÚÜÑáéíóúüñ.,()/+ -]+$'
 and display_label !~* '(https?://|www[.])')
);
alter table cotironda_private.item_display_d066 enable row level security;
revoke all on cotironda_private.item_display_d066 from public,anon,authenticated,service_role,cotironda_app;
grant select on cotironda_private.item_display_d066 to cotironda_matcher_d065;
create policy d066_labels_read on cotironda_private.item_display_d066
 for select to cotironda_matcher_d065 using(true);

create function cotironda_private.preview_invitation_packet_d066(
 p_round uuid,p_supplier uuid,p_channel text
) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare
 v_status text;v_ends timestamptz;v_zone text;v_iva text;
 v_province text;v_city text;v_total int;v_eligible int;v_contact_count int;
 v_items jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_round is null or p_supplier is null or p_channel is null or
  p_channel !~ '^[A-Za-z0-9_-]{4,64}$' then
  raise exception 'd066_invalid_identity' using errcode='22023';
 end if;
 select r.status,r.ends_at,d.delivery_zone,d.buyer_iva_request,
  loc.province,loc.city
 into v_status,v_ends,v_zone,v_iva,v_province,v_city
 from cotironda_private.round_match_preparations_d065 prep
 join cotironda_private.rounds_v1 r on r.id=prep.round_id
 join cotironda_private.round_requests_d064 d on d.round_id=r.id
 join cotironda_private.delivery_localities_d065 loc
   on loc.alias_key=lower(pg_catalog.btrim(d.delivery_zone))
 join cotironda_private.round_invites_v1 inv on inv.round_id=r.id
   and inv.supplier_org_id=p_supplier
 where prep.round_id=p_round and prep.channel_id=p_channel;
 if not found or v_status<>'programada' or v_now>=v_ends
   then return null;end if;
 select count(*) into v_contact_count
 from cotironda_private.whapi_contacts_v1 c
 where c.channel_id=p_channel and c.supplier_org_id=p_supplier
  and c.consented_at<=v_now and c.verified_at<=v_now
  and c.opted_out_at is null;
 if v_contact_count<>1 then return null;end if;
 select count(*) into v_total
 from cotironda_private.round_supplier_lines_d065 s
 where s.round_id=p_round and s.supplier_org_id=p_supplier;
 if v_total<1 or v_total>8 then return null;end if;
 select count(*),
 pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'lineNo',i.line_no,'productCode',i.product_code,
  'label',coalesce(i.source_description,label.display_label),
  'quantity',i.quantity::text,'unit',i.unit) order by i.line_no)
 into v_eligible,v_items
 from cotironda_private.round_supplier_lines_d065 s
 join cotironda_private.round_items_v1 i
   on i.round_id=s.round_id and i.line_no=s.line_no
 join cotironda_private.item_rubros_d065 rubro
   on rubro.product_code=i.product_code and rubro.category_code=s.category_code
 join cotironda_private.item_display_d066 label
   on label.product_code=i.product_code
 join public.supplier_profiles profile
   on profile.organization_id=s.supplier_org_id and profile.accepting_quotes=true
 join public.supplier_categories cat
   on cat.organization_id=s.supplier_org_id
   and cat.category_code=s.category_code and cat.is_enabled=true
 join public.supplier_delivery_areas area
   on area.organization_id=s.supplier_org_id and area.is_enabled=true
   and lower(pg_catalog.btrim(area.city))=lower(pg_catalog.btrim(v_city))
   and lower(pg_catalog.btrim(area.province))=lower(pg_catalog.btrim(v_province))
 where s.round_id=p_round and s.supplier_org_id=p_supplier;
 if v_eligible<>v_total or v_items is null then return null;end if;
 return pg_catalog.jsonb_build_object(
  'roundId',p_round,'supplierOrgId',p_supplier,'channel',p_channel,
  'deliveryZone',v_zone,'vatRequest',v_iva,'items',v_items);
end;$fn$;
grant create on schema cotironda_private to cotironda_matcher_d065;
grant cotironda_matcher_d065 to postgres with set true,inherit false;
alter function cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)
 owner to cotironda_matcher_d065;
revoke cotironda_matcher_d065 from postgres;
revoke create on schema cotironda_private from cotironda_matcher_d065;
revoke all on function cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)
 to cotironda_match_gateway_d065;
comment on function cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)
 is 'MVP017 server-only preview; NO WhatsApp authorization, no phone';
