-- D038 - ensayo lógico D020 en PostgreSQL17 efímero, SIN pg_net ni pg_cron.
-- Este fichero NO se instala en DEV y NO contiene credenciales reales.
do $guard$
begin
 if exists(select 1 from pg_extension where extname in ('pg_net','pg_cron'))
 then raise exception 'D038_EXTERNAL_EXTENSIONS_MUST_BE_ABSENT'; end if;
 if to_regclass('cotironda_private.dev_quality_auto_control') is null or
    to_regclass('cotironda_private.dev_quality_auto_runs') is null
 then raise exception 'D038_D020_CONTROL_TABLES_MISSING';end if;
 if not (select relrowsecurity from pg_class where oid=
    'cotironda_private.dev_quality_auto_control'::regclass) or
    not (select relrowsecurity from pg_class where oid=
    'cotironda_private.dev_quality_auto_runs'::regclass)
 then raise exception 'D038_D020_RLS_MISSING';end if;
 if has_table_privilege('anon','cotironda_private.dev_quality_auto_control','SELECT')
 or has_table_privilege('authenticated','cotironda_private.dev_quality_auto_control','SELECT')
 or has_table_privilege('service_role','cotironda_private.dev_quality_auto_runs','SELECT')
 or has_function_privilege('anon','cotironda_private.dev_quality_dispatch_next()','EXECUTE')
 or has_function_privilege('authenticated','cotironda_private.dev_quality_dispatch_next()','EXECUTE')
 or has_function_privilege('service_role','cotironda_private.dev_quality_dispatch_next()','EXECUTE')
 then raise exception 'D038_D020_ACCESS_TOO_BROAD';end if;
 if not (select prosecdef from pg_proc where
    oid='cotironda_private.dev_quality_dispatch_next()'::regprocedure)
 then raise exception 'D038_DISPATCHER_MUST_BE_DEFENDER';end if;
 if (select enabled from cotironda_private.dev_quality_auto_control where singleton=true)
    is distinct from false
 then raise exception 'D038_DISPATCHER_NOT_DISABLED';end if;
 if (select count(*) from cotironda_private.dev_quality_auto_runs)<>5
 then raise exception 'D038_SEED_CASES_MISSING';end if;
end;$guard$;

-- El cron NO está instalado. La función de despacho es la original,
-- pero se ejecuta SOLO con flag false: debe retornar sin tocar red ni Vault.
select ci_helpers.assert_true(
 cotironda_private.dev_quality_dispatch_next()='disabled',
 'D038_dispatch_does_not_call_network_when_disabled');
select ci_helpers.assert_true(
 (select count(*)=5 from cotironda_private.dev_quality_auto_runs
 where state='pending' and net_request_id is null and submitted_at is null),
 'D038_no_dispatch_side_effects');

-- Cuatro reservas SINTÉTICAS: SOLO filas análogas al conteo de DEV.
-- Nunca copiar usuarios, resultados, documentos, tokens ni case-ids reales.
insert into public.dev_ia_quality_claims(case_id) values
 ('dos_productos_misma_linea'),
 ('marca_mencionada_y_presentacion_distinta'),
 ('cemento_generico_sin_especificacion_inventada'),
 ('solo_marca_exclusiva');
select ci_helpers.assert_true(
 (select count(*)=4 from public.dev_ia_quality_claims),
 'D038_four_synthetic_claims_restored');
select ci_helpers.assert_true(
 (select count(*)=0 from public.dev_ia_quality_results),
 'D038_no_expensive_ia_results_or_calls');
select ci_helpers.assert_true(
 (select enabled=false from cotironda_private.dev_quality_auto_control
 where singleton=true), 'D038_auto_still_disabled');
select ci_helpers.assert_true(
 cotironda_private.dev_quality_dispatch_next()='disabled',
 'D038_claims_do_not_enable_dispatch');
select ci_helpers.assert_true(
 (select count(*)=5 from cotironda_private.dev_quality_auto_runs
 where state='pending' and net_request_id is null),
 'D038_no_http_requests_after_claims');
select ci_helpers.assert_true(
 (select count(*)=0 from pg_extension where extname in ('pg_net','pg_cron')),
 'D038_no_network_or_scheduler_extensions_installed');
do $$begin
  raise notice 'D038_INERT_D020_POSTGRES17_PASS_NO_NETWORK_NO_CRON';
end;$$;
