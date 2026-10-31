-- MVP-023 / D071. SERVER-ONLY single atomic operation: match -> queue.
-- Disposable PostgreSQL17 CI ONLY; NOT a Supabase DEV migration.
-- Does not open rounds, contact WhatsApp, or expose recipient/phone/PII.
-- The trusted scheduler MUST invoke this through its private dedicated role;
-- this is NOT a buyer, supplier or browser RPC.
grant select on cotironda_private.round_invites_v1
 to cotironda_invite_owner_d070;
create policy d071_invite_read on cotironda_private.round_invites_v1
 for select to cotironda_invite_owner_d070 using(true);
-- Only identifying columns, NEVER ciphertext, nonce or AES tag.
grant select(channel_id,chat_key,supplier_org_id)
 on cotironda_private.whapi_recipient_vault_d068
 to cotironda_invite_owner_d070;
create policy d071_vault_identity_read
 on cotironda_private.whapi_recipient_vault_d068
 for select to cotironda_invite_owner_d070 using(true);
grant execute on function
 cotironda_private.prepare_supplier_invites_d065(uuid,text)
 to cotironda_invite_owner_d070;

create function cotironda_private.whapi_prepare_commercial_round_d071(
 p_round uuid,p_channel text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_match jsonb;v_state text;v_invited int;
 v_supplier uuid;v_chat text;v_contacts bigint;
 v_result jsonb;
 v_prepared int:=0;v_repeat int:=0;
 v_missing int:=0;v_scope int:=0;
begin
 if p_round is null or p_channel is null
 or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 then raise exception 'd071_invalid_input' using errcode='22023';end if;

 -- D065 independently checks current round+buyer, zona, rubric,
 -- consent and stored preparation. All work is in ONE SQL transaction.
 v_match:=cotironda_private.prepare_supplier_invites_d065(
  p_round,p_channel);
 v_state:=v_match->>'state';
 if v_state in ('needs_verified_location','needs_catalog_mapping',
   'no_eligible_suppliers') then
   return pg_catalog.jsonb_build_object(
    'state',v_state,'matchedSuppliers',0,'prepared',0,
    'alreadyPrepared',0,'pendingContact',0,'pendingScope',0,
    'messagesSent',0);
 end if;
 if v_state not in ('prepared','already_prepared')
 or pg_catalog.jsonb_typeof(v_match->'invited')<>'number'
 then raise exception 'd071_invalid_match_result' using errcode='42501';end if;
 v_invited:=(v_match->>'invited')::integer;
 if v_invited<1 or v_invited>10
 then raise exception 'd071_invalid_match_count' using errcode='42501';end if;

 for v_supplier in
  select i.supplier_org_id
  from cotironda_private.round_invites_v1 i
  where i.round_id=p_round order by i.invite_position,i.supplier_org_id
 loop
  -- Exactly one *current* verified + opted-in contact for this supplier.
  -- BAJA and channel mismatch fail closed. Never choose between two chats.
  select count(*),min(c.chat_key) into v_contacts,v_chat
  from cotironda_private.whapi_contacts_v1 c
  where c.supplier_org_id=v_supplier and c.channel_id=p_channel
    and c.verified_at<=pg_catalog.clock_timestamp()
    and c.consented_at<=pg_catalog.clock_timestamp()
    and c.opted_out_at is null;
  if v_contacts<>1 or v_chat is null then
   v_missing:=v_missing+1;continue;
  end if;
  if not exists(select 1
   from cotironda_private.whapi_recipient_vault_d068 v
   where v.supplier_org_id=v_supplier and v.channel_id=p_channel
     and v.chat_key=v_chat) then
   v_missing:=v_missing+1;continue;
  end if;
  -- D068 independently verifies current D066 scoped packet, categories,
  -- locality, identity, BAJA and sealed recipient; no plaintext exposed.
  if cotironda_private.whapi_read_recipient_packet_d068(
      p_round,v_supplier,p_channel,v_chat) is null then
   v_scope:=v_scope+1;continue;
  end if;
  -- D070 is unique(round,supplier,channel) and revalidates again.
  v_result:=cotironda_private.whapi_prepare_invite_d070(
    p_round,v_supplier,p_channel,v_chat);
  if v_result->>'state'='prepared' then
   v_prepared:=v_prepared+1;
  elsif v_result->>'state'='already_prepared' then
   v_repeat:=v_repeat+1;
  else
   raise exception 'd071_unexpected_queue_result' using errcode='42501';
  end if;
 end loop;
 if v_prepared+v_repeat+v_missing+v_scope<>v_invited then
  raise exception 'd071_incomplete_scoped_selection' using errcode='42501';end if;
 return pg_catalog.jsonb_build_object(
  'state','queued_without_sending','matchedSuppliers',v_invited,
  'prepared',v_prepared,'alreadyPrepared',v_repeat,
  'pendingContact',v_missing,'pendingScope',v_scope,
  'messagesSent',0);
end;$fn$;

-- Own the definer by an already-scoped NONLOGIN/NOBYPASSRLS role. Never
-- grant EXECUTE to public, anon, authenticated, service_role or cotironda_app.
grant create on schema cotironda_private to cotironda_invite_owner_d070;
grant cotironda_invite_owner_d070 to postgres with set true,inherit false;
alter function cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)
 owner to cotironda_invite_owner_d070;
revoke cotironda_invite_owner_d070 from postgres;
revoke create on schema cotironda_private from cotironda_invite_owner_d070;
revoke all on function
 cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)
 to cotironda_invite_gateway_d070;
comment on function
 cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)
 is 'CI-only private matching and idempotent queue; NO Whapi HTTP, no actual consent onboarding';
