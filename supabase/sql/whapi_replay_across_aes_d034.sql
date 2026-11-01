-- D034 / Issue #169. Postgres 17 CI EXCLUSIVAMENTE. NO instalar en DEV.
-- Funciones existentes siguen con owner NOLOGIN cotironda_whapi_inbox_writer.
-- Se mantienen firma, SECURITY DEFINER, search_path='', RLS y permisos EXECUTE.
-- Identidad de replay: canal+message_key+chat_key+supplier+kind+timestamp+
-- payload_fingerprint HMAC, independientemente del key-id AES que cifró el envío.
-- El contenido cifrado y clave originales son inmutables; reenvíos idénticos
-- devuelven recibo repetido=true SIN guardar, descifrar ni reescribir.
-- Una huella distinta, otro actor/tipo/timestamp continua siendo COLISIÓN.

create or replace function cotironda_private.whapi_inbox_record_keyed_v1(
 p_channel text,p_chat_key text,p_message_key text,p_fingerprint text,
 p_kind text,p_cipher bytea,p_nonce bytea,p_tag bytea,p_source_unix bigint,
 p_key_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_prev cotironda_private.whapi_inbox_v1%rowtype;
 v_rounds uuid[];
 v_round uuid;
begin
 if p_key_id is null or p_key_id !~ '^[a-z][a-z0-9_]{2,40}$'
    or p_key_id='legacy_d029'
    or p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat_key is null or p_chat_key !~ '^[a-f0-9]{64}$'
    or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_kind is null or p_kind not in ('text','image','document','audio','voice')
    or p_cipher is null or octet_length(p_cipher) not between 1 and 8192
    or octet_length(p_nonce) is distinct from 12
    or octet_length(p_tag) is distinct from 16
    or p_source_unix is null or p_source_unix<1
 then raise exception 'keyed_inbox_payload_invalid' using errcode='22023';end if;

 select * into v_contact from cotironda_private.whapi_contacts_v1
 where channel_id=p_channel and chat_key=p_chat_key for update;
 if not found or v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'keyed_inbox_contact_not_verified' using errcode='42501';end if;

 select * into v_prev from cotironda_private.whapi_inbox_v1
 where channel_id=p_channel and message_key=p_message_key;
 if found then
   if v_prev.chat_key<>p_chat_key or v_prev.kind<>p_kind
     or v_prev.payload_fingerprint<>p_fingerprint
     or v_prev.supplier_org_id<>v_contact.supplier_org_id
     or v_prev.source_unix<>p_source_unix
     -- El ID de clave identifica el cifrado HISTÓRICO, no la identidad del mensaje.
     -- La huella HMAC firmada por el broker garantiza que es mismo contenido.
     -- No UPDATE: se conserva ciphertext, nonce, tag y crypto_key_id previos.
   then raise exception 'keyed_inbox_event_collision' using errcode='23505';end if;
   return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',true);
 end if;

 if v_contact.opted_out_at is not null or
   v_contact.consented_at>pg_catalog.clock_timestamp()
 then raise exception 'keyed_inbox_consent_revoked' using errcode='42501';end if;
 select pg_catalog.array_agg(r.id) into v_rounds
 from cotironda_private.round_invites_v1 i
 join cotironda_private.rounds_v1 r on r.id=i.round_id
 where i.supplier_org_id=v_contact.supplier_org_id and
   r.status='abierta' and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at;
 if coalesce(pg_catalog.array_length(v_rounds,1),0)<>1
 then raise exception 'keyed_inbox_invitation_missing_or_ambiguous' using errcode='42501';end if;
 v_round:=v_rounds[1];
 perform 1 from cotironda_private.rounds_v1 r where r.id=v_round
   and r.status='abierta' and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at for share;
 if not found
 then raise exception 'keyed_inbox_round_not_active' using errcode='42501';end if;
 insert into cotironda_private.whapi_inbox_v1(
   channel_id,message_key,chat_key,supplier_org_id,round_id,
   payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,
   source_unix,crypto_key_id)
 values(p_channel,p_message_key,p_chat_key,v_contact.supplier_org_id,v_round,
   p_fingerprint,p_kind,p_cipher,p_nonce,p_tag,p_source_unix,p_key_id);
 return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',false);
end;$fn$;

-- Ruta antigua D028: al menos igualar timestamp al recibo previo.
create or replace function cotironda_private.whapi_inbox_record_v1(
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
      or v_prev.source_unix<>p_source_unix
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
 if coalesce(pg_catalog.array_length(v_rounds,1),0)<>1
 then raise exception 'inbox_invitation_missing_or_ambiguous' using errcode='42501'; end if;
 v_round:=v_rounds[1];
 -- Recheck bajo row lock, al igual que D026, para impedir carrera con cierre.
 perform 1 from cotironda_private.rounds_v1 r where r.id=v_round
   and r.status='abierta' and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at for share;
 if not found then
  raise exception 'inbox_round_not_active' using errcode='42501'; end if;
 insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 values(p_channel,p_message_key,p_chat_key,v_contact.supplier_org_id,v_round,
   p_fingerprint,p_kind,p_cipher,p_nonce,p_tag,p_source_unix);
 return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',false);
end;$fn$;

-- El evento BAJA también conserva timestamp de evento, sin reactivación.
create or replace function cotironda_private.whapi_record_optout_v1(
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
      or v_prev.source_unix<>p_source_unix
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

-- D034 no crea roles, grants ni nueva función pública.
do $audit$
begin
 if (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)'::regprocedure)
    <> 'cotironda_whapi_inbox_writer'
 or (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)'::regprocedure)
    <> 'cotironda_whapi_inbox_writer'
 or (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)'::regprocedure)
    <> 'cotironda_whapi_inbox_writer'
 or not has_function_privilege('cotironda_whapi_gateway',
     'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('authenticated',
     'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('anon',
     'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 then raise exception 'D034_permissions_or_owner_regressed'; end if;
end;$audit$;
