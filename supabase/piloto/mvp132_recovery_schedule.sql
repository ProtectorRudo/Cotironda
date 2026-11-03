-- MVP132 PILOTO phase 2: activate ONLY after Edge v2 has passed HTTP auth tests.
-- pg_net will queue HTTP privately. Secrets are read at invocation from Vault.
create extension if not exists pg_net;
select cron.schedule(
 'cotironda_piloto_document_recovery_5min',
 '*/5 * * * *',
 $cron$
 select net.http_post(
   url:='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-document-recovery',
   headers:=jsonb_build_object(
    'Content-Type','application/json',
    'x-cotironda-recovery-token',(
     select decrypted_secret from vault.decrypted_secrets
     where name='cotironda_piloto_recovery_cron_v1'
    )
   ),
   body:='{}'::jsonb,
   timeout_milliseconds:=1000
 );
 $cron$
);
