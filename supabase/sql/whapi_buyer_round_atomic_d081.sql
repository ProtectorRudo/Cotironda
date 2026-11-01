-- MVP-046 / D081 — WHATSAPP BUYER ATOMIC ROUND, PostgreSQL17 CI ONLY.
-- D064 is browser/JWT-only; NEVER invent auth.sessions for WhatsApp.
-- D065/D071 use round_requests_d064 for zone & VAT, so store an explicit
-- anonymous-WHAPI source row without a forged created_by.
-- Depends on D024,D064,D074,D076,D077,D078. Do not deploy DEV until #175.

create role cotironda_whapi_round_writer_d081 nologin noinherit nobypassrls;
create role cotironda_whapi_round_gateway_d081 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_whapi_round_writer_d081,cotironda_whapi_round_gateway_d081;

alter table cotironda_private.round_requests_d064 alter column created_by drop not null;
create table cotironda_private.buyer_whapi_round_sources_d081(
 channel_id text not null check(channel_id~'^[A-Za-z0-9_-]{4,64}$'),
 origin_message_key text not null check(origin_message_key~'^[a-f0-9]{64}$'),
 reply_message_key text not null check(reply_message_key~'^[a-f0-9]{64}$'),
 chat_key text not null check(chat_key~'^[a-f0-9]{64}$'),
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 round_id uuid not null unique references cotironda_private.round_requests_d064(round_id) on delete restrict,
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,origin_message_key),
 foreign key(channel_id,origin_message_key)
  references cotironda_private.whapi_buyer_inbox_d074(channel_id,message_key)
  on delete restrict,
 foreign key(channel_id,reply_message_key)
  references cotironda_private.whapi_buyer_inbox_d074(channel_id,message_key)
  on delete restrict
);
alter table cotironda_private.buyer_whapi_round_sources_d081 enable row level security;
revoke all on cotironda_private.buyer_whapi_round_sources_d081
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.buyer_whapi_round_sources_d081
 to cotironda_whapi_round_writer_d081;
create policy d081_source_read on cotironda_private.buyer_whapi_round_sources_d081
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_source_insert on cotironda_private.buyer_whapi_round_sources_d081
 for insert to cotironda_whapi_round_writer_d081 with check(true);
create trigger d081_source_immutable before update or delete
 on cotironda_private.buyer_whapi_round_sources_d081 for each row
 execute function cotironda_private.reject_immutable_quote_v1();

-- Database provenance guard: NULL created_by can exist only for a committed
-- WHAPI source, never for a silently unauthenticated browser request.
create function cotironda_private.guard_whapi_round_provenance_d081()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if new.created_by is null and not exists(
  select 1 from cotironda_private.buyer_whapi_round_sources_d081 s
  where s.round_id=new.round_id and s.buyer_org_id=new.buyer_org_id
 ) then raise exception 'd081_whapi_provenance_required'
  using errcode='42501';end if;
 return null;
end;$fn$;
create constraint trigger d081_whapi_provenance_after_insert
 after insert on cotironda_private.round_requests_d064
 deferrable initially deferred for each row
 execute function cotironda_private.guard_whapi_round_provenance_d081();

-- Mark only THE reply that completed the request. A worker retry may read
-- that identical reply again; a subsequent unrelated chat message cannot
-- pick up an old list and manufacture another round.
alter table cotironda_private.buyer_zone_pending_d077
 add column consumed_by_message_key text
  check(consumed_by_message_key~'^[a-f0-9]{64}$'),
 add column consumed_round_id uuid references cotironda_private.rounds_v1(id),
 add column consumed_at timestamptz,
 add constraint d081_pending_consumed_together check(
  (consumed_by_message_key is null and consumed_round_id is null and consumed_at is null)
  or (consumed_by_message_key is not null and consumed_round_id is not null and consumed_at is not null));
-- A consumed question must NOT block the architect's NEXT new pedido.
-- Keep immutable outbox history; replay old origin never queues again.
grant update(consumed_by_message_key,consumed_round_id,consumed_at)
 on cotironda_private.buyer_zone_pending_d077 to cotironda_buyer_zone_writer_d077;
create or replace function cotironda_private.whapi_zone_enqueue_d077(
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
 if found and v_current.expires_at>v_now and v_current.consumed_round_id is null then
  if v_current.origin_message_key<>p_origin or v_current.buyer_org_id<>p_buyer
   then raise exception 'd077_pending_other_request' using errcode='42501';end if;
  return pg_catalog.jsonb_build_object('estado','zona_solicitada_en_cola','repetido',true);
 end if;
 -- Old webhook replay, even after expiry/newer requests, must NOT
 -- resurrect an already-questioned origin or manufacture another send.
 if exists(select 1 from cotironda_private.buyer_zone_question_d077 q
  where q.channel_id=p_channel and q.origin_message_key=p_origin)
 then
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
  updated_at=pg_catalog.clock_timestamp(),
  consumed_by_message_key=null,consumed_round_id=null,consumed_at=null;
 insert into cotironda_private.buyer_zone_question_d077(
  channel_id,origin_message_key,chat_key,buyer_org_id)
 values(p_channel,p_origin,p_chat,p_buyer)
 on conflict(channel_id,origin_message_key) do nothing;
 return pg_catalog.jsonb_build_object('estado','zona_solicitada_en_cola','repetido',false);
end;$fn$;
grant select,update(consumed_by_message_key,consumed_round_id,consumed_at)
 on cotironda_private.buyer_zone_pending_d077
 to cotironda_whapi_round_writer_d081;
create policy d081_pending_read on cotironda_private.buyer_zone_pending_d077
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_pending_write on cotironda_private.buyer_zone_pending_d077
 for update to cotironda_whapi_round_writer_d081 using(true) with check(true);

-- Replays need immutable source history even after a subsequent NEW pending.
grant select on cotironda_private.buyer_whapi_round_sources_d081
 to cotironda_buyer_reader_d076;
create policy d081_reader_history on cotironda_private.buyer_whapi_round_sources_d081
 for select to cotironda_buyer_reader_d076 using(true);

-- A re-delivered WhatsApp reply keeps the original authenticated request,
-- including if the architect has since asked for a new batch of materials.
-- Prioritize immutable completed mapping before the active pending.
create or replace function cotironda_private.whapi_zone_context_d077(
 p_channel text,p_message text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare
 v_entry jsonb;v_origin jsonb;
 v_old_key text;
 v_pending cotironda_private.buyer_zone_pending_d077%rowtype;
begin
 v_entry:=cotironda_private.whapi_buyer_read_d076(p_channel,p_message);
 if v_entry is null then return null;end if;
 if v_entry->>'kind'='text' then
  select s.origin_message_key into v_old_key
  from cotironda_private.buyer_whapi_round_sources_d081 s
  where s.channel_id=p_channel and s.reply_message_key=p_message
    and s.origin_message_key<>p_message
    and s.chat_key=v_entry->>'chatKey'
    and s.buyer_org_id=(v_entry->>'buyerOrgId')::uuid;
  if not found then
   select * into v_pending from cotironda_private.buyer_zone_pending_d077
   where channel_id=p_channel and chat_key=v_entry->>'chatKey'
    and buyer_org_id=(v_entry->>'buyerOrgId')::uuid
    and origin_message_key<>p_message
    and source_unix<(v_entry->>'sourceUnix')::bigint
    and (
      (consumed_round_id is null and expires_at>pg_catalog.clock_timestamp())
      or (consumed_round_id is not null and consumed_by_message_key=p_message)
    );
   if found then v_old_key:=v_pending.origin_message_key;end if;
  end if;
  if v_old_key is not null then
   v_origin:=cotironda_private.whapi_buyer_read_d076(
    p_channel,v_old_key);
   if v_origin is null or v_origin->>'kind'<>'text'
    or v_origin->>'chatKey'<>v_entry->>'chatKey'
    or v_origin->>'buyerOrgId'<>v_entry->>'buyerOrgId'
    or (v_origin->>'sourceUnix')::bigint >= (v_entry->>'sourceUnix')::bigint
    or (v_pending.origin_message_key is not null
      and v_pending.origin_message_key=v_old_key and
      (v_origin->>'sourceUnix')::bigint<>v_pending.source_unix)
   then v_origin:=null;end if;
  end if;
 end if;
 return pg_catalog.jsonb_build_object('entry',v_entry,'original',v_origin);
end;$fn$;

-- All D081 reads/writes are RLS-limited to its own NONLOGIN writer.
grant select on cotironda_private.whapi_buyer_inbox_d074,
 cotironda_private.whapi_buyer_contacts_d074,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.rounds_v1,cotironda_private.round_items_v1,
 cotironda_private.round_requests_d064 to cotironda_whapi_round_writer_d081;
grant insert,update(status) on cotironda_private.rounds_v1
 to cotironda_whapi_round_writer_d081;
grant insert on cotironda_private.round_items_v1,
 cotironda_private.round_requests_d064 to cotironda_whapi_round_writer_d081;
grant execute on function cotironda_private.valid_pilot_product_d078(text,text)
 to cotironda_whapi_round_writer_d081;
create policy d081_inbox_read on cotironda_private.whapi_buyer_inbox_d074
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_buyer_contact_read on cotironda_private.whapi_buyer_contacts_d074
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_supplier_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_round_read on cotironda_private.rounds_v1
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_round_insert on cotironda_private.rounds_v1
 for insert to cotironda_whapi_round_writer_d081 with check(true);
create policy d081_round_lock on cotironda_private.rounds_v1
 for update to cotironda_whapi_round_writer_d081 using(true) with check(true);
create policy d081_item_read on cotironda_private.round_items_v1
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_item_insert on cotironda_private.round_items_v1
 for insert to cotironda_whapi_round_writer_d081 with check(true);
create policy d081_request_read on cotironda_private.round_requests_d064
 for select to cotironda_whapi_round_writer_d081 using(true);
create policy d081_request_insert on cotironda_private.round_requests_d064
 for insert to cotironda_whapi_round_writer_d081 with check(true);

create function cotironda_private.whapi_create_buyer_round_d081(
 p_channel text,p_chat text,p_origin text,p_reply text,p_buyer uuid,
 p_zone text,p_iva text,p_items jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_source cotironda_private.whapi_buyer_inbox_d074%rowtype;
 v_reply cotironda_private.whapi_buyer_inbox_d074%rowtype;
 v_pending cotironda_private.buyer_zone_pending_d077%rowtype;
 v_prev cotironda_private.buyer_whapi_round_sources_d081%rowtype;
 v_contact cotironda_private.whapi_buyer_contacts_d074%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_hash text;v_round uuid;v_reqkey uuid;
 v_line jsonb;v_code text;v_seen text[]:=array[]::text[];
 v_count int;v_i int;
begin
 if p_channel is null or p_channel!~'^[A-Za-z0-9_-]{4,64}$'
 or p_chat is null or p_chat!~'^[a-f0-9]{64}$'
 or p_origin is null or p_origin!~'^[a-f0-9]{64}$'
 or p_reply is null or p_reply!~'^[a-f0-9]{64}$'
 or p_buyer is null
 or p_zone is null or pg_catalog.length(pg_catalog.btrim(p_zone)) not between 3 and 65
 or p_zone<>pg_catalog.btrim(p_zone)
 or p_zone!~'^[[:alnum:] .,-]+$'
 or p_iva is null or p_iva not in('no_especificado','con_iva','sin_iva')
 or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
 or pg_catalog.jsonb_array_length(p_items) not between 1 and 8
 or pg_catalog.length(p_items::text)>6000
 then raise exception 'd081_invalid_request' using errcode='22023';end if;
 v_count:=pg_catalog.jsonb_array_length(p_items);
 for v_i in 0..v_count-1 loop
  v_line:=p_items->v_i;
  if pg_catalog.jsonb_typeof(v_line) is distinct from 'object'
   or (select count(*) from pg_catalog.jsonb_object_keys(v_line))<>5
   or not (v_line ?& array['line_no','product_code','quantity','unit','source_description'])
   or pg_catalog.jsonb_typeof(v_line->'line_no') is distinct from 'number'
   or v_line->>'line_no' is distinct from (v_i+1)::text
   or pg_catalog.jsonb_typeof(v_line->'product_code') is distinct from 'string'
   or (v_line->>'product_code')!~'^[a-z][a-z0-9_]{2,49}$'
   or pg_catalog.jsonb_typeof(v_line->'quantity') is distinct from 'string'
   or (v_line->>'quantity')!~'^[1-9][0-9]{0,8}(\.[0-9]{1,3})?$'
   or pg_catalog.jsonb_typeof(v_line->'unit') is distinct from 'string'
   or v_line->>'unit' not in('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
   or pg_catalog.jsonb_typeof(v_line->'source_description') is distinct from 'string'
   or pg_catalog.char_length(v_line->>'source_description') not between 3 and 90
   or v_line->>'source_description'!~
     '^[[:alnum:] ÁÉÍÓÚÜÑáéíóúüñ.,()/+²³-]+$'
   or v_line->>'source_description'~*'(https?://|www[.]|[0-9]{10,})'
   or not cotironda_private.valid_pilot_product_d078(
    v_line->>'product_code',v_line->>'source_description')
  then raise exception 'd081_invalid_material' using errcode='22023';end if;
  v_code:=v_line->>'product_code';
  if v_code=any(v_seen) then
   raise exception 'd081_duplicate_family' using errcode='22023';end if;
  v_seen:=pg_catalog.array_append(v_seen,v_code);
 end loop;
 -- Source, contact and any pending-zone conversation are serialized by CHAT.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('whapi-zone:'||p_channel||':'||p_chat,0));
 select * into v_contact from cotironda_private.whapi_buyer_contacts_d074
  where channel_id=p_channel and chat_key=p_chat;
 if not found or v_contact.buyer_org_id<>p_buyer or
  v_contact.verified_at>v_now or v_contact.consented_at>v_now or
  v_contact.opted_out_at is not null
 then raise exception 'd081_buyer_not_authorized' using errcode='42501';end if;
 if exists(select 1 from cotironda_private.whapi_contacts_v1
  where channel_id=p_channel and chat_key=p_chat)
 then raise exception 'd081_double_role' using errcode='42501';end if;
 select * into v_source from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_origin;
 select * into v_reply from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_reply;
 if v_source.message_key is null or v_reply.message_key is null
  or v_source.chat_key<>p_chat or v_reply.chat_key<>p_chat
  or v_source.buyer_org_id<>p_buyer or v_reply.buyer_org_id<>p_buyer
  or v_source.kind<>'text' or v_reply.kind<>'text'
  or v_source.status<>'pendiente_interpretacion'
  or v_reply.status<>'pendiente_interpretacion'
 then raise exception 'd081_messages_not_verified' using errcode='42501';end if;
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('buyer',p_buyer,'channel',p_channel,
    'chat',p_chat,'origin',p_origin,'reply',p_reply,'zone',p_zone,
    'iva',p_iva,'items',p_items)::text,'UTF8')),'hex');
 select * into v_prev from cotironda_private.buyer_whapi_round_sources_d081
  where channel_id=p_channel and origin_message_key=p_origin;
 if found then
  if v_prev.chat_key<>p_chat or v_prev.buyer_org_id<>p_buyer or
   v_prev.reply_message_key<>p_reply or v_prev.content_sha256<>v_hash
  then raise exception 'd081_replayed_changed_payload' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object(
   'roundId',v_prev.round_id,'repetida',true);
 end if;

 select * into v_pending from cotironda_private.buyer_zone_pending_d077
  where channel_id=p_channel and chat_key=p_chat for update;
 if p_reply<>p_origin then
  if not found or v_pending.origin_message_key<>p_origin or
   v_pending.buyer_org_id<>p_buyer or v_pending.consumed_round_id is not null or
   v_pending.expires_at<=v_now or v_pending.source_unix<>v_source.source_unix or
   v_reply.source_unix<=v_source.source_unix
  then raise exception 'd081_reply_not_pending' using errcode='42501';end if;
 elsif found and v_pending.expires_at>v_now and
  v_pending.consumed_round_id is null then
   raise exception 'd081_active_other_question' using errcode='42501';
 end if;

 insert into cotironda_private.rounds_v1(buyer_org_id,begins_at,ends_at)
 values(p_buyer,v_now+interval '30 seconds',v_now+interval '2 days')
 returning id into v_round;
 for v_i in 0..v_count-1 loop
  v_line:=p_items->v_i;
  insert into cotironda_private.round_items_v1(
    round_id,line_no,product_code,quantity,unit,source_description)
   values(v_round,(v_line->>'line_no')::smallint,v_line->>'product_code',
    (v_line->>'quantity')::numeric(18,3),v_line->>'unit',
    v_line->>'source_description');
 end loop;
 v_reqkey:=pg_catalog.gen_random_uuid();
 insert into cotironda_private.round_requests_d064(
  round_id,buyer_org_id,created_by,request_key,content_sha256,
  delivery_zone,buyer_iva_request)
 values(v_round,p_buyer,null,v_reqkey,v_hash,p_zone,p_iva);
 insert into cotironda_private.buyer_whapi_round_sources_d081(
  channel_id,origin_message_key,reply_message_key,chat_key,buyer_org_id,
  round_id,content_sha256)
 values(p_channel,p_origin,p_reply,p_chat,p_buyer,v_round,v_hash);
 if p_reply<>p_origin then
  update cotironda_private.buyer_zone_pending_d077
   set consumed_by_message_key=p_reply,consumed_round_id=v_round,
    consumed_at=v_now
   where channel_id=p_channel and chat_key=p_chat;
 end if;
 return pg_catalog.jsonb_build_object('roundId',v_round,'repetida',false);
end;$fn$;

-- D081 writer owns only its own gateway function. It is NOT a browser or
-- background task with unrestricted table access.
grant create on schema cotironda_private to cotironda_whapi_round_writer_d081;
grant cotironda_whapi_round_writer_d081 to postgres with set true,inherit false;
alter function cotironda_private.whapi_create_buyer_round_d081(
 text,text,text,text,uuid,text,text,jsonb) owner to cotironda_whapi_round_writer_d081;
revoke cotironda_whapi_round_writer_d081 from postgres;
revoke create on schema cotironda_private from cotironda_whapi_round_writer_d081;
revoke all on function cotironda_private.whapi_create_buyer_round_d081(
 text,text,text,text,uuid,text,text,jsonb)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_create_buyer_round_d081(
 text,text,text,text,uuid,text,text,jsonb)
 to cotironda_whapi_round_gateway_d081;
comment on function cotironda_private.whapi_create_buyer_round_d081(
 text,text,text,text,uuid,text,text,jsonb)
 is 'CI-only WhatsApp buyer round; HMAC company+messages, replay and pending consumed atomically; NO WhatsApp send';
