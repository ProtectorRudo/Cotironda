-- MVP-092b: atomic, tested supersession. PILOT ONLY.
-- BEFORE INSERT trigger, so a supplier quote is always linked to at most
-- one active invitation when the new WhatsApp round starts.
create function cotironda_piloto_privado.supersede_prior_pilot_invitations_mvp092b()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare target_request record;
begin
 if new.supplier_key not in ('corralon_ailin','corralon_nahuel') then
  return new;
 end if;
 select r.id,r.buyer_key,r.created_at into target_request
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.next_round_window_mvp091 w
   on r.created_at>=w.starts_at and r.created_at<w.expires_at
 where r.id=new.request_id and r.buyer_key='arquitecto'
   and r.state='prepared' and r.delivery_city='La Plata'
   and w.only_row and w.expires_at>clock_timestamp();
 if not found then return new;end if;

 -- The old quote and sent event remain immutable. Only the binding changes.
 update cotironda_piloto_privado.invitations as previous_invitation
 set state='cancelled'
 from cotironda_piloto_privado.requests as previous_request,
      cotironda_piloto_privado.next_round_window_mvp091 as window_scope
 where previous_invitation.request_id=previous_request.id
   and previous_request.buyer_key=target_request.buyer_key
   and previous_request.created_at<window_scope.starts_at
   and previous_invitation.supplier_key=new.supplier_key
   and previous_invitation.state='prepared'
   and previous_invitation.request_id<>new.request_id
   and window_scope.only_row;
 return new;
end;$fn$;

revoke all on function cotironda_piloto_privado.supersede_prior_pilot_invitations_mvp092b()
 from public,anon,authenticated,service_role;
create trigger mvp092b_supersede_prior_invitations
before insert on cotironda_piloto_privado.invitations
for each row execute function
 cotironda_piloto_privado.supersede_prior_pilot_invitations_mvp092b();

-- Reversible synthetic transaction in the DO sub-block, but migration itself
-- persists the trigger. The test intentionally raises PT001 to ROLLBACK
-- synthetic data as well as temporary old-invitation updates.
do $test$
declare
 previous_id uuid; simulated_id uuid;
 finished boolean:=false;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
     where only_row and whatsapp_inbound_enabled and whatsapp_outbound_enabled)
 or (select count(*) from cotironda_piloto_privado.requests)<>1
 or (select count(*) from cotironda_piloto_privado.next_round_window_mvp091
     where expires_at>clock_timestamp())<>1
 then raise exception 'mvp092b_pilot_preconditions_changed';end if;
 select r.id into previous_id from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.next_round_window_mvp091 w
   on r.created_at<w.starts_at
 where r.buyer_key='arquitecto' and r.state='prepared';
 if previous_id is null or
   (select count(*) from cotironda_piloto_privado.invitations
    where request_id=previous_id and state='prepared')<>2 or
   (select count(*) from cotironda_piloto_privado.offer_versions
    where request_id=previous_id)<>1
 then raise exception 'mvp092b_unexpected_old_round';end if;
 begin
  insert into cotironda_piloto_privado.requests(
   buyer_key,delivery_city,original_request,source_hmac,state)
  values('arquitecto','La Plata','SYNTHETIC TEST -- ALWAYS ROLLBACK',
    encode(extensions.gen_random_bytes(32),'hex'),'prepared')
  returning id into simulated_id;
  insert into cotironda_piloto_privado.request_lines(
   request_id,line_no,original_description,quantity,unit,family_code)
  values
   (simulated_id,1,'cemento CPC 50 kg',20,'bag','cemento_gris_obra'),
   (simulated_id,2,'hidrófugo',5,'l','hidrofugo');
  insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
  values(simulated_id,'corralon_ailin'),(simulated_id,'corralon_nahuel');
  if (select count(*) from cotironda_piloto_privado.invitations
      where request_id=previous_id and state='cancelled')<>2
   or (select count(*) from cotironda_piloto_privado.invitations
      where request_id=simulated_id and state='prepared')<>2
   or (select count(*) from cotironda_piloto_privado.whapi_outbox
      where request_id=simulated_id and state='pending')<>2
   or (select count(*) from cotironda_piloto_privado.offer_versions
      where request_id=previous_id)<>1
  then raise exception 'mvp092b_test_assertions_failed';end if;
  finished:=true;
  raise exception 'internal_rollback' using errcode='PT001';
 exception when sqlstate 'PT001' then null;
 end;
 if not finished or
    exists(select 1 from cotironda_piloto_privado.requests where id=simulated_id)
    or (select count(*) from cotironda_piloto_privado.invitations
      where request_id=previous_id and state='prepared')<>2
    or (select count(*) from cotironda_piloto_privado.offer_versions
      where request_id=previous_id)<>1
 then raise exception 'mvp092b_rollback_invariant_failed';end if;
end;$test$;
