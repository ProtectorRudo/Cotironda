-- MVP132 isolated PG17 testing, no pilot data or private tokens.
create role anon;
create role authenticated;
create role service_role;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema vault;
create table vault.secrets(name text);
create table vault.decrypted_secrets(name text, decrypted_secret text);
create function vault.create_secret(new_secret text, new_name text, new_description text)
returns uuid language plpgsql as $fn$
begin
 insert into vault.secrets(name) values(new_name);
 insert into vault.decrypted_secrets(name,decrypted_secret) values(new_name,new_secret);
 return 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
end;$fn$;
\i supabase/piloto/mvp132_recovery_secret_and_guard.sql
do $check$
declare n int; v text;
begin
 select count(*) into n from vault.secrets
 where name='cotironda_piloto_recovery_cron_v1';
 if n<>1 then raise exception 'Vault secret was not provisioned exactly once';end if;
 select decrypted_secret into v from vault.decrypted_secrets
 where name='cotironda_piloto_recovery_cron_v1';
 if v !~ '^[a-f0-9]{96}$' then raise exception 'Expected high-entropy token';end if;
 if has_function_privilege('anon',
    'public.cotironda_piloto_recovery_token_allowed_mvp132(text)','EXECUTE')
 or has_function_privilege('authenticated',
    'public.cotironda_piloto_recovery_token_allowed_mvp132(text)','EXECUTE')
 or not has_function_privilege('service_role',
    'public.cotironda_piloto_recovery_token_allowed_mvp132(text)','EXECUTE')
 then raise exception 'Token verifier privileges are wrong';end if;
 if not public.cotironda_piloto_recovery_token_allowed_mvp132(v)
 then raise exception 'Expected correct token accepted';end if;
 if public.cotironda_piloto_recovery_token_allowed_mvp132(repeat('f',96))
 or public.cotironda_piloto_recovery_token_allowed_mvp132('bad')
 or public.cotironda_piloto_recovery_token_allowed_mvp132(null)
 then raise exception 'Token verifier accepted invalid token';end if;
end;$check$;
-- Idempotent migration: does not rotate or duplicate live keys on repeat.
\i supabase/piloto/mvp132_recovery_secret_and_guard.sql
do $idempotent$
begin
 if (select count(*) from vault.secrets where name='cotironda_piloto_recovery_cron_v1')<>1
 then raise exception 'Duplicate secret after second apply';end if;
end;$idempotent$;
