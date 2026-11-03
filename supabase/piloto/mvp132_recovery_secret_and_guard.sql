-- MVP132 PILOTO phase 1: token generated in Postgres Vault, no cron yet.
do $body$
begin
 if not exists(select 1 from vault.secrets
               where name='cotironda_piloto_recovery_cron_v1') then
  perform vault.create_secret(
   encode(extensions.gen_random_bytes(48),'hex'),
   'cotironda_piloto_recovery_cron_v1',
   'Private scheduled document recovery in isolated pilot (rotatable)');
 end if;
end $body$;

create or replace function public.cotironda_piloto_recovery_token_allowed_mvp132(
 p_token text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare expected text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{96}$'
 then return false; end if;
 select v.decrypted_secret into expected
 from vault.decrypted_secrets v where v.name='cotironda_piloto_recovery_cron_v1';
 if expected is null or expected !~ '^[a-f0-9]{96}$'
 then return false; end if;
 return extensions.digest(convert_to(p_token,'UTF8'),'sha256')=
        extensions.digest(convert_to(expected,'UTF8'),'sha256');
end;$function$;
revoke all on function public.cotironda_piloto_recovery_token_allowed_mvp132(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_recovery_token_allowed_mvp132(text)
 to service_role;
