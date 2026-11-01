-- MVP-045 D077 — ONE zone question per buyer chat, source stays AES-GCM in D074.
-- PostgreSQL17 CI ONLY, no Supabase DEV migration (#175).
create table cotironda_private.buyer_zone_pending_d077 (
 channel_id text not null check(channel_id~'^[A-Za-z0-9_-]{4,64}$'),
 chat_key text not null check(chat_key~'^[a-f0-9]{64}$'),
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 origin_message_key text not null check(origin_message_key~'^[a-f0-9]{64}$'),
 source_unix bigint not null check(source_unix>0),
 expires_at timestamptz not null,
 updated_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,chat_key),
 foreign key(channel_id,origin_message_key)
  references cotironda_private.whapi_buyer_inbox_d074(channel_id,message_key)
  on delete restrict
);
create table cotironda_private.buyer_zone_question_d077 (
 channel_id text not null,
 origin_message_key text not null,
 chat_key text not null,
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 question_code text not null default 'localidad_entrega'
  check(question_code='localidad_entrega'),
 queued_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,origin_message_key),
 foreign key(channel_id,origin_message_key)
  references cotironda_private.whapi_buyer_inbox_d074(channel_id,message_key)
  on delete restrict
);
create trigger buyer_zone_question_immutable_d077 before update or delete
 on cotironda_private.buyer_zone_question_d077 for each row
 execute function cotironda_private.whapi_inbox_immutable_v1();
alter table cotironda_private.buyer_zone_pending_d077 enable row level security;
alter table cotironda_private.buyer_zone_question_d077 enable row level security;
revoke all on cotironda_private.buyer_zone_pending_d077,
 cotironda_private.buyer_zone_question_d077
 from public,anon,authenticated,service_role,cotironda_app;

create role cotironda_buyer_zone_writer_d077 nologin noinherit nobypassrls;
create role cotironda_buyer_zone_gateway_d077 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_buyer_zone_writer_d077,cotironda_buyer_zone_gateway_d077;
grant select on cotironda_private.whapi_buyer_inbox_d074,
 cotironda_private.whapi_buyer_contacts_d074,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.buyer_zone_pending_d077,
 cotironda_private.buyer_zone_question_d077
 to cotironda_buyer_zone_writer_d077;
grant insert,update(origin_message_key,buyer_org_id,source_unix,expires_at,updated_at)
 on cotironda_private.buyer_zone_pending_d077
 to cotironda_buyer_zone_writer_d077;
grant insert on cotironda_private.buyer_zone_question_d077
 to cotironda_buyer_zone_writer_d077;
create policy d077_writer_inbox on cotironda_private.whapi_buyer_inbox_d074
 for select to cotironda_buyer_zone_writer_d077 using(true);
create policy d077_writer_buyer_contact on cotironda_private.whapi_buyer_contacts_d074
 for select to cotironda_buyer_zone_writer_d077 using(true);
create policy d077_writer_supplier_contact on cotironda_private.whapi_contacts_v1
 for select to cotironda_buyer_zone_writer_d077 using(true);
create policy d077_writer_pending_read on cotironda_private.buyer_zone_pending_d077
 for select to cotironda_buyer_zone_writer_d077 using(true);
create policy d077_writer_pending_insert on cotironda_private.buyer_zone_pending_d077
 for insert to cotironda_buyer_zone_writer_d077 with check(true);
create policy d077_writer_pending_update on cotironda_private.buyer_zone_pending_d077
 for update to cotironda_buyer_zone_writer_d077 using(true) with check(true);
create policy d077_writer_question_read on cotironda_private.buyer_zone_question_d077
 for select to cotironda_buyer_zone_writer_d077 using(true);
create policy d077_writer_question_insert on cotironda_private.buyer_zone_question_d077
 for insert to cotironda_buyer_zone_writer_d077 with check(true);

-- Authoritative source only: original D074 inbox, never plain text from D073.
-- Registration + question outbox are ONE atomic PostgreSQL transaction.
create function cotironda_private.whapi_zone_enqueue_d077(
 p_channel text,p_chat text,p_origin text,p_buyer uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_source cotironda_private.whapi_buyer_inbox_d074%rowtype;
 v_current cotironda_private.buyer_zone_pending_d077%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_channel is null or p_channel!~'^[A-Za-z0-9_-]{4,64}$'
  or p_chat is null or p_chat!~'^[a-f0-9]{64}$'
  or p_origin is null or p_origin!~'^[a-f0-9]{64}$'
  or p_buyer is null
 then raise exception 'd077_identity_invalid' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('whapi-zone:'||p_channel||':'||p_chat,0));
 select * into v_source from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_origin;
 if not found or v_source.chat_key<>p_chat or v_source.buyer_org_id<>p_buyer
  or v_source.kind<>'text' or v_source.status<>'pendiente_interpretacion'
 then raise exception 'd077_source_not_verified' using errcode='42501';end if;
 if not exists(
  select 1 from cotironda_private.whapi_buyer_contacts_d074 c
  where c.channel_id=p_channel and c.chat_key=p_chat and c.buyer_org_id=p_buyer
   and c.verified_at<=v_now and c.consented_at<=v_now and c.opted_out_at is null
 ) or exists(select 1 from cotironda_private.whapi_contacts_v1 s
  where s.channel_id=p_channel and s.chat_key=p_chat)
 then raise exception 'd077_contact_not_authorized' using errcode='42501';end if;
 select * into v_current from cotironda_private.buyer_zone_pending_d077
  where channel_id=p_channel and chat_key=p_chat;
 if found and v_current.expires_at>v_now then
  if v_current.origin_message_key<>p_origin or v_current.buyer_org_id<>p_buyer
   then raise exception 'd077_pending_other_request' using errcode='42501';end if;
  return pg_catalog.jsonb_build_object('estado','zona_solicitada_en_cola','repetido',true);
 end if;
 insert into cotironda_private.buyer_zone_pending_d077(
  channel_id,chat_key,buyer_org_id,origin_message_key,source_unix,expires_at)
 values(p_channel,p_chat,p_buyer,p_origin,v_source.source_unix,v_now+interval '48 hours')
 on conflict(channel_id,chat_key) do update set
  buyer_org_id=excluded.buyer_org_id,
  origin_message_key=excluded.origin_message_key,
  source_unix=excluded.source_unix,
  expires_at=excluded.expires_at,
  updated_at=pg_catalog.clock_timestamp();
 insert into cotironda_private.buyer_zone_question_d077(
  channel_id,origin_message_key,chat_key,buyer_org_id)
 values(p_channel,p_origin,p_chat,p_buyer)
 on conflict(channel_id,origin_message_key) do nothing;
 return pg_catalog.jsonb_build_object('estado','zona_solicitada_en_cola','repetido',false);
end;$fn$;

-- Single snapshot: current + original encrypted message. Same chat and company,
-- reply must be newer; no repeated text in DB. Outbox state NEVER means sent.
grant select on cotironda_private.buyer_zone_pending_d077
 to cotironda_buyer_reader_d076;
create policy d077_reader_pending on cotironda_private.buyer_zone_pending_d077
 for select to cotironda_buyer_reader_d076 using(true);
create function cotironda_private.whapi_zone_context_d077(
 p_channel text,p_message text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare
 v_entry jsonb;v_origin jsonb;
 v_pending cotironda_private.buyer_zone_pending_d077%rowtype;
begin
 v_entry:=cotironda_private.whapi_buyer_read_d076(p_channel,p_message);
 if v_entry is null then return null;end if;
 select * into v_pending from cotironda_private.buyer_zone_pending_d077
 where channel_id=p_channel and chat_key=v_entry->>'chatKey'
  and buyer_org_id=(v_entry->>'buyerOrgId')::uuid
  and expires_at>pg_catalog.clock_timestamp()
  and origin_message_key<>p_message
  and source_unix<(v_entry->>'sourceUnix')::bigint;
 if found and v_entry->>'kind'='text' then
  v_origin:=cotironda_private.whapi_buyer_read_d076(
   p_channel,v_pending.origin_message_key);
  if v_origin is null or v_origin->>'kind'<>'text'
   or v_origin->>'chatKey'<>v_entry->>'chatKey'
   or v_origin->>'buyerOrgId'<>v_entry->>'buyerOrgId'
   or (v_origin->>'sourceUnix')::bigint<>v_pending.source_unix
  then v_origin:=null;end if;
 end if;
 return pg_catalog.jsonb_build_object('entry',v_entry,'original',v_origin);
end;$fn$;

grant create on schema cotironda_private to cotironda_buyer_zone_writer_d077;
grant cotironda_buyer_zone_writer_d077 to postgres with set true,inherit false;
alter function cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)
 owner to cotironda_buyer_zone_writer_d077;
revoke cotironda_buyer_zone_writer_d077 from postgres;
revoke create on schema cotironda_private from cotironda_buyer_zone_writer_d077;

grant create on schema cotironda_private to cotironda_buyer_reader_d076;
grant cotironda_buyer_reader_d076 to postgres with set true,inherit false;
alter function cotironda_private.whapi_zone_context_d077(text,text)
 owner to cotironda_buyer_reader_d076;
revoke cotironda_buyer_reader_d076 from postgres;
revoke create on schema cotironda_private from cotironda_buyer_reader_d076;

revoke all on function cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid),
 cotironda_private.whapi_zone_context_d077(text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)
 to cotironda_buyer_zone_gateway_d077;
grant execute on function cotironda_private.whapi_zone_context_d077(text,text)
 to cotironda_buyer_gateway_d076;
