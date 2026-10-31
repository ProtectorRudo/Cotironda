-- D037. Restauración PARCIAL de archivos IA puramente tabulares, en PG17 CI.
-- NO recrea D020 pg_net/cron/dispatch. NO ejecutar en DEV ni producción.
do $check$
declare
  n int;
begin
 if to_regclass('public.dev_ia_quality_claims') is null or
    to_regclass('public.dev_ia_quality_results') is null
 then raise exception 'D037_SAFE_RESTORE_MISSING_TABLES';end if;
 if not (select relrowsecurity from pg_class where oid='public.dev_ia_quality_claims'::regclass)
 or not (select relrowsecurity from pg_class where oid='public.dev_ia_quality_results'::regclass)
 then raise exception 'D037_SAFE_RESTORE_RLS_OFF';end if;
 if has_table_privilege('anon','public.dev_ia_quality_claims','SELECT')
 or has_table_privilege('authenticated','public.dev_ia_quality_claims','SELECT')
 or has_table_privilege('anon','public.dev_ia_quality_results','SELECT')
 or has_table_privilege('authenticated','public.dev_ia_quality_results','SELECT')
 then raise exception 'D037_SAFE_RESTORE_EXPOSED_TO_CLIENT';end if;
 if not has_table_privilege('service_role','public.dev_ia_quality_claims','INSERT')
 or not has_table_privilege('service_role','public.dev_ia_quality_results','INSERT')
 then raise exception 'D037_SAFE_RESTORE_SERVICE_ROLE_MISSING';end if;
 select count(*) into n from information_schema.columns
 where table_schema='public' and table_name='dev_ia_quality_results'
   and column_name in ('diag_items_propuestos','diag_items_con_aclaracion',
    'diag_origen_no_verificado','diag_cantidad_sin_evidencia',
    'diag_segmentos_sin_extraccion','diag_lineas_retenidas');
 if n<>6 then raise exception 'D037_SAFE_RESTORE_DIAGNOSTICS_MISSING';end if;
 if (select count(*) from public.dev_ia_quality_claims)<>0
 or (select count(*) from public.dev_ia_quality_results)<>0
 then raise exception 'D037_SAFE_RESTORE_UNEXPECTED_ROWS';end if;
 if to_regclass('cotironda_private.dev_quality_auto_runs') is not null
 or to_regclass('cotironda_private.dev_quality_auto_control') is not null
 then raise exception 'D037_UNSAFE_AUTOMATION_D020_WAS_INSTALLED';end if;
 raise notice 'D037_SAFE_RESTORE_3_SQL_PASS_NO_D020_EXECUTED';
end;$check$;
