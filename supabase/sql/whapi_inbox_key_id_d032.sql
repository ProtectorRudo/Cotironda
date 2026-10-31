-- D032 / Issue #165: solo PostgreSQL17 CI sobre D028/D030; NO migración DEV.
-- Retrocompatible: filas D028 y ruta D031 antigua conservan legacy_d029.
alter table cotironda_private.whapi_inbox_v1
 add column crypto_key_id text not null default 'legacy_d029'
 check(crypto_key_id ~ '^[a-z][a-z0-9_]{2,40}$');
comment on column cotironda_private.whapi_inbox_v1.crypto_key_id is
 'D032 identificador NO secreto de clave AES; legacy_d029 significa AAD anterior. Nunca contiene bytes de clave.';

create function cotironda_private.whapi_inbox_record_keyed_v1(
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
     or v_prev.crypto_key_id<>p_key_id
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

grant create on schema cotironda_private to cotironda_whapi_inbox_writer;
grant cotironda_whapi_inbox_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_inbox_record_keyed_v1(
 text,text,text,text,text,bytea,bytea,bytea,bigint,text)
 owner to cotironda_whapi_inbox_writer;
revoke cotironda_whapi_inbox_writer from postgres;
revoke create on schema cotironda_private from cotironda_whapi_inbox_writer;

revoke all on function cotironda_private.whapi_inbox_record_keyed_v1(
 text,text,text,text,text,bytea,bytea,bytea,bigint,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_inbox_record_keyed_v1(
 text,text,text,text,text,bytea,bytea,bytea,bigint,text)
 to cotironda_whapi_gateway;
