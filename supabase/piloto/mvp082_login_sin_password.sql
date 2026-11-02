-- MVP-082: cuenta puente SIN PASSWORD, no habilita conexiones reales.
-- Aplicar UNICAMENTE en Supabase proyecto piloto ilggkalaafhtiysyzlmg.
-- Requiere rol NOLOGIN/lectura aprobado en MVP081.
do $check$
begin
 if not exists(select 1 from pg_catalog.pg_roles
   where rolname='cotironda_piloto_reader'
    and not rolcanlogin and not rolbypassrls and not rolsuper) then
  raise exception 'mvp082_role_mvp081_missing_or_unsafe';
 end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row=true and whatsapp_outbound_enabled=false) then
  raise exception 'mvp082_wrong_database_or_outbound_on';
 end if;
end $check$;

do $create$
begin
 if not exists(select 1 from pg_catalog.pg_roles
   where rolname='cotironda_piloto_reader_login') then
  create role cotironda_piloto_reader_login
   login password null noinherit nosuperuser nocreatedb nocreaterole
   noreplication nobypassrls connection limit 2;
 end if;
 if not exists(select 1 from pg_catalog.pg_roles
   where rolname='cotironda_piloto_reader_login'
    and rolcanlogin and not rolsuper and not rolbypassrls
    and not rolcreaterole and not rolcreatedb and not rolreplication
    and not rolinherit) then
  raise exception 'mvp082_login_flags_insecure';
 end if;
end $create$;

-- El login NO hereda SELECT; solo dentro de transaccion autenticada:
-- SET LOCAL ROLE cotironda_piloto_reader (permiso de SET, no ADMIN).
grant cotironda_piloto_reader
 to cotironda_piloto_reader_login with admin false, inherit false, set true;
alter role cotironda_piloto_reader_login set statement_timeout='6s';
alter role cotironda_piloto_reader_login set idle_in_transaction_session_timeout='8s';

-- No hay ALTER ROLE ... PASSWORD: credencial se emitira por canal seguro
-- fuera de GitHub y el chat, en un segundo paso autorizado.
