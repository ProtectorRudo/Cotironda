-- MVP-093 / Supabase PILOTO: never drop an explicitly provided delivery date.
alter table cotironda_piloto_privado.requests
 add column requested_delivery_note text
 check(requested_delivery_note is null or
  (length(requested_delivery_note) between 2 and 90 and
    requested_delivery_note !~ '[[:cntrl:]]'));

create function cotironda_piloto_privado.capture_delivery_note_mvp093()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare match_text text[];
begin
 if new.original_request is null then return new;end if;
 match_text:=regexp_match(new.original_request,
 '(?:^|[[:cntrl:]])[[:space:]]*(?:fecha de entrega|entrega solicitada)[[:space:]]*:[[:space:]]*([^[:cntrl:].;]{2,90})','i');
 if match_text is null then
  -- E.g. "Entrega: La Plata para el viernes".
  match_text:=regexp_match(new.original_request,
   '(?:^|[[:cntrl:]])[[:space:]]*(?:entrega|destino)[[:space:]]*:[^[:cntrl:]]{3,70}[[:space:]]+(?:para el|antes del|el)[[:space:]]+([^[:cntrl:].;]{2,70})','i');
 end if;
 if match_text is not null and match_text[1] is not null then
  new.requested_delivery_note:=left(btrim(match_text[1]),90);
 end if;
 return new;
end;$fn$;
revoke all on function cotironda_piloto_privado.capture_delivery_note_mvp093()
 from public,anon,authenticated,service_role;
create trigger mvp093_capture_requested_delivery_note
before insert on cotironda_piloto_privado.requests
for each row execute function cotironda_piloto_privado.capture_delivery_note_mvp093();

create or replace function public.cotironda_piloto_pdf_snapshot_mvp091(
 p_request uuid,p_supplier text,p_lease uuid
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'requestId',r.id,'city',r.delivery_city,
  'deadlineIso',to_char(r.closes_at at time zone 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'deliveryNote',r.requested_delivery_note,
  'items', (select jsonb_agg(jsonb_build_object(
    'description',l.original_description,
    'quantity',l.quantity::text,'unit',l.unit) order by l.line_no)
    from cotironda_piloto_privado.request_lines l where l.request_id=r.id))
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.whapi_outbox o on o.request_id=r.id
 where r.id=p_request and o.supplier_key=p_supplier
  and o.state='leased' and o.lease_token=p_lease
  and cotironda_piloto_privado.allow_next_pilot_send_mvp091(p_request,p_supplier);
$fn$;
revoke all on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 to service_role;

-- Proof inside rollback subtransaction; preserves all actual requests.
do $smoke$
declare rid uuid; note text; good boolean:=false;
begin
 begin
  insert into cotironda_piloto_privado.requests(
   buyer_key,delivery_city,original_request,source_hmac,state)
  values('arquitecto','La Plata',
   'Entrega: La Plata'||chr(10)||
   'Fecha de entrega: 10/11/2026'||chr(10)||
   '20 bolsas cemento CPC 50 kg',
    encode(extensions.gen_random_bytes(32),'hex'),'draft')
  returning id,requested_delivery_note into rid,note;
  if note<>'10/11/2026' then raise exception 'mvp093_note_lost';end if;
  good:=true;
  raise exception 'internal_rollback' using errcode='PT001';
 exception when sqlstate 'PT001' then null;
 end;
 if not good or exists(select 1 from cotironda_piloto_privado.requests where id=rid)
 then raise exception 'mvp093_note_test_dirty';end if;
end;$smoke$;
