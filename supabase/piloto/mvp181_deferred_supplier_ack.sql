-- MVP181 / PILOTO ONLY. Future-only deferred receipt acknowledgement for
-- supplier PDF/XLSX/image read by background recovery. POLICY OFF.
-- Never automatically re-send historical messages (or uncertain messages).
create table if not exists cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181(
 only_row boolean primary key default true check(only_row),
 enabled boolean not null default false,
 activated_at timestamptz,
 check((enabled and activated_at is not null)
  or (not enabled and activated_at is null))
);
insert into cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181(
 only_row,enabled,activated_at) values(true,false,null)
 on conflict (only_row) do nothing;
alter table cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181
 from public,anon,authenticated,service_role;

-- Activation time must be server-clock time, never backdated by a caller.
create or replace function cotironda_piloto_privado.guard_deferred_ack_activation_mvp181()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if new.only_row is distinct from old.only_row then
   raise exception 'deferred_ack_singleton_immutable';
 end if;
 if new.enabled and not old.enabled then
  new.activated_at:=clock_timestamp();
 elsif new.enabled and old.enabled then
  new.activated_at:=old.activated_at;
 else
  new.activated_at:=null;
 end if;
 return new;
end;$fn$;
revoke all on function cotironda_piloto_privado.guard_deferred_ack_activation_mvp181()
 from public,anon,authenticated,service_role;
drop trigger if exists guard_deferred_ack_activation_mvp181
 on cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181;
create trigger guard_deferred_ack_activation_mvp181
before update on cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181
for each row execute function
 cotironda_piloto_privado.guard_deferred_ack_activation_mvp181();

-- Only a signed, already-stored inbound supplier quotation from the SAME
-- signed triggering chat may create a one-time reservation. No recipient
-- number or PII returned; the existing MVP104 immutable ACK ledger is reused.
create or replace function public.cotironda_piloto_reserve_deferred_supplier_ack_mvp181(
 p_message_hmac text,p_trigger_chat_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare reserved_count integer;
begin
 if coalesce(p_message_hmac,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_trigger_chat_hmac,'') !~ '^[a-f0-9]{64}$'
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags f
    where f.only_row and f.whatsapp_inbound_enabled and
    f.whatsapp_outbound_enabled) then return false;end if;

 insert into cotironda_piloto_privado.supplier_ack_mvp104(
   message_hmac,chat_hmac,mode)
 select q.message_hmac,m.chat_hmac,'media_quote'
 from cotironda_piloto_privado.supplier_deferred_ack_policy_mvp181 pol
 join cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   on q.received_at>=pol.activated_at
 join cotironda_piloto_privado.whapi_inbox m
   on m.message_hmac=q.message_hmac
   and m.participant_key=q.supplier_key
   and m.chat_hmac=p_trigger_chat_hmac
   and m.received_at>=pol.activated_at
 join cotironda_piloto_privado.media_archive_mvp095 a
   on a.message_hmac=q.message_hmac
   and a.request_id=q.request_id
   and a.participant_key=q.supplier_key
   and a.content_sha256=q.source_sha256
   and a.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
   on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.requests r
   on r.id=q.request_id and r.created_at>=pol.activated_at
 join cotironda_piloto_privado.participants supplier
   on supplier.key=q.supplier_key
   and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.participants buyer
   on buyer.key=r.buyer_key
 where pol.only_row and pol.enabled and pol.activated_at is not null
  and pol.activated_at<=clock_timestamp()
  and q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.processing_state='needs_review'
  and m.kind in ('document','image')
  and m.received_at<=r.closes_at
  and a.state='stored' and a.review_state='suggested_only'
  and a.proposal->>'kind'='supplier_quote'
  and i.state='prepared' and i.created_at>=r.created_at
  and r.state='prepared' and r.closes_at>clock_timestamp()
  and supplier.participant_role='supplier'
  and supplier.consent_at is not null
  and supplier.opted_out_at is null
  and buyer.participant_role='buyer'
  and buyer.consent_at is not null
  and buyer.opted_out_at is null
 on conflict (message_hmac) do nothing;
 get diagnostics reserved_count=row_count;
 return reserved_count=1;
end;$fn$;
revoke all on function
 public.cotironda_piloto_reserve_deferred_supplier_ack_mvp181(text,text)
 from public,anon,authenticated,service_role;
grant execute on function
 public.cotironda_piloto_reserve_deferred_supplier_ack_mvp181(text,text)
 to service_role;
