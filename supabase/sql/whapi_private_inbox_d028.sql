-- D028 / Issue #157 - ESTRUCTURA PRIVADA para tests PG17 (sin migracion DEV).
-- No publica RPC, no configura webhook, no guarda telefono/chat/texto en claro.
-- Chat y message keys = HMAC-SHA256 derivadas por broker CON SECRETO SERVER.
-- Payload cifrado con AES-256-GCM fuera de PostgreSQL; clave nunca en tablas.
create table cotironda_private.whapi_contacts_v1 (
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 chat_key text not null check(chat_key ~ '^[0-9a-f]{64}$'),
 supplier_org_id uuid not null references public.supplier_profiles(organization_id)
  on delete restrict,
 verified_at timestamptz not null,
 consented_at timestamptz not null,
 opted_out_at timestamptz,
 primary key(channel_id,chat_key),
 check(opted_out_at is null or opted_out_at>=consented_at)
);
create table cotironda_private.whapi_inbox_v1 (
 channel_id text not null,
 message_key text not null check(message_key ~ '^[0-9a-f]{64}$'),
 chat_key text not null,
 supplier_org_id uuid not null references public.supplier_profiles(organization_id)
  on delete restrict,
 round_id uuid,
 payload_fingerprint text not null check(payload_fingerprint ~ '^[0-9a-f]{64}$'),
 kind text not null check(kind in ('text','image','document','audio','voice','opt_out')),
 payload_ciphertext bytea,
 payload_nonce bytea,
 payload_tag bytea,
 source_unix bigint not null check(source_unix>0),
 status text not null default 'pendiente_interpretacion'
  check(status in ('pendiente_interpretacion','opt_out_registrado')),
 received_at timestamptz not null default clock_timestamp(),
 primary key(channel_id,message_key),
 foreign key(channel_id,chat_key) references cotironda_private.whapi_contacts_v1(channel_id,chat_key) on delete restrict,
 foreign key(round_id,supplier_org_id) references cotironda_private.round_invites_v1(round_id,supplier_org_id) on delete restrict,
 check(
 (kind='opt_out' and status='opt_out_registrado' and round_id is null and
  payload_ciphertext is null and payload_nonce is null and payload_tag is null)
 or
 (kind<>'opt_out' and status='pendiente_interpretacion' and round_id is not null
  and payload_ciphertext is not null and octet_length(payload_ciphertext) between 1 and 8192
  and octet_length(payload_nonce)=12 and octet_length(payload_tag)=16)
 )
);
create index whapi_inbox_processing_idx
 on cotironda_private.whapi_inbox_v1(status,received_at)
 where status='pendiente_interpretacion';
create index whapi_contacts_supplier_idx
 on cotironda_private.whapi_contacts_v1(supplier_org_id);

create function cotironda_private.whapi_guard_contact_update_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if (new.channel_id,new.chat_key,new.supplier_org_id,new.verified_at,new.consented_at)
    is distinct from
    (old.channel_id,old.chat_key,old.supplier_org_id,old.verified_at,old.consented_at)
    or (old.opted_out_at is not null and
       new.opted_out_at is distinct from old.opted_out_at)
    or (old.opted_out_at is null and new.opted_out_at is null)
 then
  raise exception 'whapi_contact_immutable_or_optout_reset' using errcode='42501';
 end if;
 return new;
end;$fn$;
create trigger whapi_contacts_guard_v1 before update
 on cotironda_private.whapi_contacts_v1
 for each row execute function cotironda_private.whapi_guard_contact_update_v1();

create function cotironda_private.whapi_inbox_immutable_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'whapi_inbox_immutable' using errcode='42501';
end;$fn$;
create trigger whapi_inbox_no_change_v1 before update or delete
 on cotironda_private.whapi_inbox_v1 for each row
 execute function cotironda_private.whapi_inbox_immutable_v1();

alter table cotironda_private.whapi_contacts_v1 enable row level security;
alter table cotironda_private.whapi_inbox_v1 enable row level security;
revoke all on cotironda_private.whapi_contacts_v1,cotironda_private.whapi_inbox_v1
 from public,anon,authenticated,service_role,cotironda_app;

create role cotironda_whapi_inbox_writer nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_whapi_inbox_writer;
grant select on cotironda_private.whapi_contacts_v1,
 cotironda_private.whapi_inbox_v1,
 cotironda_private.rounds_v1,cotironda_private.round_invites_v1
 to cotironda_whapi_inbox_writer;
grant update(opted_out_at) on cotironda_private.whapi_contacts_v1
 to cotironda_whapi_inbox_writer;
grant insert on cotironda_private.whapi_inbox_v1
 to cotironda_whapi_inbox_writer;
create policy d028_contact_select on cotironda_private.whapi_contacts_v1
 for select to cotironda_whapi_inbox_writer using(true);
create policy d028_contact_opt_out on cotironda_private.whapi_contacts_v1
 for update to cotironda_whapi_inbox_writer using(true) with check(true);
create policy d028_inbox_select on cotironda_private.whapi_inbox_v1
 for select to cotironda_whapi_inbox_writer using(true);
create policy d028_inbox_insert on cotironda_private.whapi_inbox_v1
 for insert to cotironda_whapi_inbox_writer with check(true);
create policy d028_rounds_select on cotironda_private.rounds_v1
 for select to cotironda_whapi_inbox_writer using(true);
create policy d028_invites_select on cotironda_private.round_invites_v1
 for select to cotironda_whapi_inbox_writer using(true);

-- SOLO trusted broker; IDs/HMAC y cifrado llegan del servidor autenticado.
-- No se admiten identificadores de proveedor/ronda del body de Whapi.
create function cotironda_private.whapi_inbox_record_v1(
 p_channel text,p_chat_key text,p_message_key text,p_fingerprint text,
 p_kind text,p_cipher bytea,p_nonce bytea,p_tag bytea,p_source_unix bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_prev cotironda_private.whapi_inbox_v1%rowtype;
 v_rounds uuid[];
 v_round uuid;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat_key is null or p_chat_key !~ '^[0-9a-f]{64}$'
    or p_message_key is null or p_message_key !~ '^[0-9a-f]{64}$'
    or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_kind is null or p_kind not in ('text','image','document','audio','voice')
    or p_cipher is null or octet_length(p_cipher) not between 1 and 8192
    or octet_length(p_nonce) is distinct from 12
    or octet_length(p_tag) is distinct from 16
    or p_source_unix is null or p_source_unix<1
 then raise exception 'inbox_payload_invalid' using errcode='22023'; end if;
 select * into v_contact from cotironda_private.whapi_contacts_v1
 where channel_id=p_channel and chat_key=p_chat_key for update;
 if not found or v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'inbox_contact_not_verified' using errcode='42501'; end if;
 select * into v_prev from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message_key;
 if found then
   if v_prev.chat_key<>p_chat_key or v_prev.kind<>p_kind
      or v_prev.payload_fingerprint<>p_fingerprint
      or v_prev.supplier_org_id<>v_contact.supplier_org_id
   then raise exception 'inbox_event_collision' using errcode='23505'; end if;
   return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',true);
 end if;
 if v_contact.opted_out_at is not null or
  v_contact.consented_at>pg_catalog.clock_timestamp()
 then raise exception 'inbox_consent_revoked' using errcode='42501'; end if;
 select pg_catalog.array_agg(r.id) into v_rounds
 from cotironda_private.round_invites_v1 i
 join cotironda_private.rounds_v1 r on r.id=i.round_id
 where i.supplier_org_id=v_contact.supplier_org_id and
 r.status='abierta' and pg_catalog.clock_timestamp()>=r.begins_at
 and pg_catalog.clock_timestamp()<r.ends_at;
 if pg_catalog.coalesce(pg_catalog.array_length(v_rounds,1),0)<>1
 then raise exception 'inbox_invitation_missing_or_ambiguous' using errcode='42501'; end if;
 v_round:=v_rounds[1];
 -- Recheck bajo row lock, al igual que D026, para impedir carrera con cierre.
 perform 1 from cotironda_private.rounds_v1 r where r.id=v_round
   and r.status='abierta' and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at for update;
 if not found then
  raise exception 'inbox_round_not_active' using errcode='42501'; end if;
 insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 values(p_channel,p_message_key,p_chat_key,v_contact.supplier_org_id,v_round,
   p_fingerprint,p_kind,p_cipher,p_nonce,p_tag,p_source_unix);
 return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',false);
end;$fn$;

-- BAJA válida aun si ya no tiene invitación abierta, nunca requiere cotizar.
-- Guardar evento y baja en una sola transacción; BAJA posterior no resuscribe.
create function cotironda_private.whapi_record_optout_v1(
 p_channel text,p_chat_key text,p_message_key text,p_fingerprint text,p_source_unix bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_prev cotironda_private.whapi_inbox_v1%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat_key is null or p_chat_key !~ '^[0-9a-f]{64}$'
    or p_message_key is null or p_message_key !~ '^[0-9a-f]{64}$'
    or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_source_unix is null or p_source_unix<1
 then raise exception 'optout_payload_invalid' using errcode='22023'; end if;
 select * into v_contact from cotironda_private.whapi_contacts_v1
 where channel_id=p_channel and chat_key=p_chat_key for update;
 if not found or v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'optout_contact_not_verified' using errcode='42501'; end if;
 select * into v_prev from cotironda_private.whapi_inbox_v1
 where channel_id=p_channel and message_key=p_message_key;
 if found then
   if v_prev.chat_key<>p_chat_key or v_prev.kind<>'opt_out'
      or v_prev.payload_fingerprint<>p_fingerprint
      or v_prev.supplier_org_id<>v_contact.supplier_org_id
   then raise exception 'inbox_event_collision' using errcode='23505'; end if;
   return pg_catalog.jsonb_build_object('estado','baja_registrada','repetido',true);
 end if;
 if v_contact.opted_out_at is null then
   update cotironda_private.whapi_contacts_v1
    set opted_out_at=pg_catalog.clock_timestamp()
    where channel_id=p_channel and chat_key=p_chat_key;
 end if;
 insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
 payload_fingerprint,kind,source_unix,status)
 values(p_channel,p_message_key,p_chat_key,v_contact.supplier_org_id,null,
 p_fingerprint,'opt_out',p_source_unix,'opt_out_registrado');
 return pg_catalog.jsonb_build_object('estado','baja_registrada','repetido',false);
end;$fn$;

grant create on schema cotironda_private to cotironda_whapi_inbox_writer;
grant cotironda_whapi_inbox_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)
 owner to cotironda_whapi_inbox_writer;
alter function cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)
 owner to cotironda_whapi_inbox_writer;
revoke cotironda_whapi_inbox_writer from postgres;
revoke create on schema cotironda_private from cotironda_whapi_inbox_writer;

revoke all on function
 cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint),
 cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint),
 cotironda_private.whapi_guard_contact_update_v1(),
 cotironda_private.whapi_inbox_immutable_v1()
 from public,anon,authenticated,service_role,cotironda_app;
comment on table cotironda_private.whapi_inbox_v1 is
 'D028: inbox sintético cifrado, sin teléfono ni mensaje en claro; NO API, NO DESPLEGAR.';
