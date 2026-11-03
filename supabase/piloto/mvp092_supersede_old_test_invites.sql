-- MVP-092: one active supplier invitation per buyer in an explicitly scoped
-- replacement pilot round. Keep historical rounds, offers, message IDs intact.
-- This trigger runs on insertion of a NEW invitation, never on unrelated text.
create function cotironda_piloto_privado.supersede_old_test_invites_mvp092()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare incoming record;
begin
 if new.supplier_key not in ('corralon_ailin','corralon_nahuel') then
   return new;
 end if;
 select r.id,r.buyer_key,r.created_at,r.delivery_city into incoming
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.next_round_window_mvp091 w
  on r.created_at>=w.starts_at and r.created_at<w.expires_at
 where r.id=new.request_id and r.buyer_key='arquitecto'
   and r.delivery_city='La Plata'
   and r.state='prepared' and w.only_row
   and w.expires_at>clock_timestamp();
 if not found then return new;end if;
 -- Preserve offers and outbound history. Only the ACTIVE binding is retired
 -- so a new supplier WhatsApp quote cannot be ambiguously matched to two
 -- open pilot rounds. Fail closed if the window does not match.
 update cotironda_piloto_privado.invitations old
 set state='cancelled'
 from cotironda_piloto_privado.requests prev,
      cotironda_piloto_privado.next_round_window_mvp091 w
 where old.request_id=prev.id
   and prev.buyer_key=incoming.buyer_key
   and prev.created_at<w.starts_at
   and old.supplier_key=new.supplier_key
   and old.state='prepared'
   and old.request_id<>new.request_id
   and w.only_row;
 return new;
end;$fn$;
revoke all on function cotironda_piloto_privado.supersede_old_test_invites_mvp092()
 from public,anon,authenticated,service_role;
create trigger mvp092_supersede_old_test_invitations
before insert on cotironda_piloto_privado.invitations
for each row execute function
 cotironda_piloto_privado.supersede_old_test_invites_mvp092();

-- Run an actual transaction/subtransaction smoke as part of installation.
-- Every synthetic row and the old invitation updates are rolled back inside
-- the exception handler, leaving only the installed trigger afterward.
do $test$
declare
 old_id uuid; new_id uuid; passed boolean:=false;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled=true and whatsapp_outbound_enabled=true)
 then raise exception 'mvp092_flags_not_ready' using errcode='42501';end if;
 select r.id into old_id from cotironda_piloto_privado.requests r
  where r.buyer_key='arquitecto' and r.state='prepared'
   and r.created_at < (select starts_at from cotironda_piloto_privado.next_round_window_mvp091)
   and r.delivery_city='La Plata';
 if old_id is null or
  (select count(*) from cotironda_piloto_privado.invitations
   where request_id=old_id and state='prepared')<>2 or
  (select count(*) from cotironda_piloto_privado.offer_versions
   where request_id=old_id)<>1
 then raise exception 'mvp092_old_test_unexpected' using errcode='42501';end if;
 begin
  insert into cotironda_piloto_privado.requests(
   buyer_key,delivery_city,original_request,source_hmac,state)
  values('arquitecto','La Plata','ENSAYO TEMPORAL SOLO ROLLBACK',
   encode(extensions.gen_random_bytes(32),'hex'),'prepared')
  returning id into new_id;
  insert into cotironda_piloto_privado.request_lines(
    request_id,line_no,original_description,quantity,unit,family_code)
  values(new_id,1,'cemento CPC 50 kg',20,'bag','cemento_gris_obra'),
        (new_id,2,'hidrófugo',5,'l','hidrofugo');
  insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
  values(new_id,'corralon_ailin'),(new_id,'corralon_nahuel');
  if (select count(*) from cotironda_piloto_privado.invitations
      where request_id=old_id and state='cancelled')<>2
   or (select count(*) from cotironda_piloto_privado.invitations
      where request_id=new_id and state='prepared')<>2
   or (select count(*) from cotironda_piloto_privado.offer_versions
      where request_id=old_id)<>1
   or (select count(*) from cotironda_piloto_privado.whapi_outbox
      where request_id=new_id and state='pending')<>2
  then raise exception 'mvp092_supersession_failed';end if;
  passed:=true;
  raise exception 'internal_test_rollback' using errcode='PT001';
 exception when sqlstate 'PT001' then null;
 end;
 if not passed then raise exception 'mvp092_test_not_completed';end if;
 if exists(select 1 from cotironda_piloto_privado.requests where id=new_id)
  or (select count(*) from cotironda_piloto_privado.invitations
      where request_id=old_id and state='prepared')<>2
  or (select count(*) from cotironda_piloto_privado.offer_versions
      where request_id=old_id)<>1
 then raise exception 'mvp092_test_rollback_not_clean';end if;
end;$test$;
