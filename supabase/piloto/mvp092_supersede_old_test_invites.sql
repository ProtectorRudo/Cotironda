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
