-- MVP-081: rol LECTOR NOLOGIN, aislado, para el PILOTO Supabase
-- PROHIBIDO aplicar en DEV histórica o producción. No incluye password.
-- No modifica fuentes, ofertas, mensajes ni flags. Solo grants select y RLS.
do $guard$
begin
 if to_regclass('cotironda_piloto_privado.offer_versions') is null
    or to_regclass('cotironda_piloto_privado.whapi_inbox') is null
    or to_regclass('cotironda_piloto_privado.requests') is null
    or not exists(select 1 from cotironda_piloto_privado.integration_flags
      where only_row=true and whatsapp_outbound_enabled=false) then
   raise exception 'mvp081_wrong_database_or_whatsapp_outbound'
     using errcode='42501';
 end if;
end $guard$;

do $create$
begin
 if not exists(select 1 from pg_catalog.pg_roles
    where rolname='cotironda_piloto_reader') then
  create role cotironda_piloto_reader nologin noinherit;
 end if;
 if exists(select 1 from pg_catalog.pg_roles
    where rolname='cotironda_piloto_reader'
      and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then
  raise exception 'mvp081_reader_role_must_remain_no_login'
    using errcode='42501';
 end if;
end $create$;

-- Esquema NO expuesto en la Data API. No se otorgan privilegios
-- a anon, authenticated, service_role ni PUBLIC.
grant usage on schema cotironda_piloto_privado to cotironda_piloto_reader;

-- SELECT por columna, sin INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES.
grant select(id,buyer_key,state)
 on cotironda_piloto_privado.requests to cotironda_piloto_reader;
grant select(request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 on cotironda_piloto_privado.offer_versions to cotironda_piloto_reader;
grant select(message_hmac,participant_key,request_id,processing_state,plaintext_sha256)
 on cotironda_piloto_privado.whapi_inbox to cotironda_piloto_reader;

-- Políticas limitadas a las entidades del piloto, nunca a otro comprador.
-- No se crean RLS para rol anon/authenticated.
create policy mvp081_reader_requests on cotironda_piloto_privado.requests
 for select to cotironda_piloto_reader
 using (buyer_key='arquitecto' and state in ('prepared','closed'));
create policy mvp081_reader_offers on cotironda_piloto_privado.offer_versions
 for select to cotironda_piloto_reader
 using (supplier_key in ('corralon_ailin','corralon_nahuel'));
create policy mvp081_reader_inbox on cotironda_piloto_privado.whapi_inbox
 for select to cotironda_piloto_reader
 using (participant_key in ('corralon_ailin','corralon_nahuel')
  and processing_state='quote_recorded');

-- Sin LOGIN, aun no hay conexion real ni secreta para utilizar el rol.
-- Login futuro: crear otro rol dedicado con password fuerte EN DASHBOARD,
-- sin almacenar password en este repositorio y con autorizacion separada.
