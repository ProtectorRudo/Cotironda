-- D030 / Issue #161. SOLO PostgreSQL17 CI tras D028, NO migracion DEV.
-- El rol gateway NO puede conectarse: el login del broker queda pendiente.
-- Se concede EXCLUSIVAMENTE EXECUTE sobre tres funciones privadas.
create role cotironda_whapi_gateway nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_whapi_gateway;

-- Resolver solo vínculo de chat HMAC previamente VERIFICADO, consentido,
-- NO dado de baja y con UNA única ronda abierta al momento del servidor.
-- D028 vuelve a comprobar invitación y estado bajo bloqueo al guardar.
create function cotironda_private.whapi_resolve_active_contact_v1(
 p_channel text,p_chat_key text)
returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_round uuid;
 v_count integer;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat_key is null or p_chat_key !~ '^[0-9a-f]{64}$'
 then raise exception 'whapi_lookup_invalid' using errcode='22023'; end if;
 select * into v_contact from cotironda_private.whapi_contacts_v1 c
  where c.channel_id=p_channel and c.chat_key=p_chat_key
    and c.verified_at<=pg_catalog.clock_timestamp()
    and c.consented_at<=pg_catalog.clock_timestamp()
    and c.opted_out_at is null;
 if not found then return null; end if;
 select count(*), min(r.id::text)::uuid into v_count,v_round
 from cotironda_private.round_invites_v1 i
 join cotironda_private.rounds_v1 r on r.id=i.round_id
 where i.supplier_org_id=v_contact.supplier_org_id
   and r.status='abierta'
   and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at;
 if v_count<>1 then return null; end if;
 return pg_catalog.jsonb_build_object(
   'supplierOrgId',v_contact.supplier_org_id::text,
   'roundId',v_round::text,
   'consentimientoVigente',true,
   'invitacionVigente',true);
end;$fn$;

-- SECURITY DEFINER propiedad de rol D028, nunca postgres ni rol bypassrls.
-- Ya existen politicas SELECT especificas para este rol interno sobre sus tablas.
grant create on schema cotironda_private to cotironda_whapi_inbox_writer;
grant cotironda_whapi_inbox_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_resolve_active_contact_v1(text,text)
 owner to cotironda_whapi_inbox_writer;
revoke cotironda_whapi_inbox_writer from postgres;
revoke create on schema cotironda_private from cotironda_whapi_inbox_writer;

revoke all on function cotironda_private.whapi_resolve_active_contact_v1(text,text)
 from public,anon,authenticated,service_role,cotironda_app;

grant execute on function
 cotironda_private.whapi_resolve_active_contact_v1(text,text),
 cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint),
 cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)
 to cotironda_whapi_gateway;
comment on function cotironda_private.whapi_resolve_active_contact_v1(text,text) is
 'D030 SOLO PRIVATE: HMAC chat verificado, opt-in y ronda unica. No publica ni cliente.';

-- El gateway no recibe SELECT de tablas, ni siquiera del inbox.
-- NO GRANT a postgres como supergrupo, NOLOGIN y sin credencial de app.
