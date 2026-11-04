-- MVP168 — SOLO en PILOTO ya preparado, EJECUTAR en una transacción revertible.
-- Usa metadatos de una cotización elegible, NO los contenidos del archivo.
-- Las inserciones de prueba son ficticias y ROLLBACK siempre revierte todo.
begin;
do $smoke$
declare job jsonb; result jsonb; facts jsonb; linhas jsonb;
 old_count bigint; new_count bigint; n integer;
begin
 if to_regclass('cotironda_piloto_privado.supplier_economic_facts_mvp168') is null
 or to_regprocedure('public.cotironda_piloto_next_economic_facts_mvp168()') is null
 or to_regprocedure('public.cotironda_piloto_record_economic_facts_mvp168(text,text,text,jsonb)') is null
 then raise exception 'mvp168_not_installed';end if;
 if has_function_privilege('anon',
   'public.cotironda_piloto_next_economic_facts_mvp168()','EXECUTE')
 or has_function_privilege('authenticated',
   'public.cotironda_piloto_record_economic_facts_mvp168(text,text,text,jsonb)','EXECUTE')
 or not has_function_privilege('service_role',
   'public.cotironda_piloto_next_economic_facts_mvp168()','EXECUTE')
 or has_table_privilege('anon',
   'cotironda_piloto_privado.supplier_economic_facts_mvp168','SELECT')
 or has_table_privilege('authenticated',
   'cotironda_piloto_privado.supplier_economic_facts_mvp168','INSERT')
 then raise exception 'mvp168_private_acl_failure';end if;
 if exists(select 1 from cotironda_piloto_privado.finalist_whapi_outbox_mvp110)
 then raise exception 'mvp168_finalist_outbox_should_be_empty';end if;
 select count(*) into old_count
 from cotironda_piloto_privado.supplier_economic_facts_mvp168;
 job:=public.cotironda_piloto_next_economic_facts_mvp168();
 if job->>'state'='none' then
  raise notice 'mvp168_no_eligible_document_no_writer_test';
  return;
 end if;
 if job->>'state'<>'candidate' or
    (job->'doc'->'prueba'->>'rankingAllowed')<>'false'
 then raise exception 'mvp168_selector_invalid';end if;
 n:=(job->'doc'->'prueba'->>'lineCount')::integer;
 select coalesce(jsonb_agg(jsonb_build_object(
  'linea',i,'pagina',null,'fila',null,
  'estado','datos_insuficientes','descuentoPorcentaje',null,
  'unitarioComercialTrasDescuento',null,'ivaAcreditado',false
 ) order by i),'[]'::jsonb)
 into linhas from generate_series(1,n) i;
 facts:=jsonb_build_object(
  'descuentos',jsonb_build_object(
   'estado','parcial','precios',linhas,
   'rankingHabilitado',false,'contactosRevelados',false,
   'originalesModificados',false
  ),
  'condiciones',jsonb_build_object(
   'estado','fuente_leida',
   'iva',jsonb_build_object('estado','no_informado','tasa',null,
     'ubicaciones','[]'::jsonb),
   'flete',jsonb_build_object('estado','no_informado','importe',null,
     'ubicaciones','[]'::jsonb),
   'pago',jsonb_build_object('estado','no_informado',
     'ubicaciones','[]'::jsonb),
   'netoSinIvaAcreditado',false,'stockCorroborado',false,
   'plazoCorroborado',false,'minimoCompraCorroborado',false,
   'rankingHabilitado',false,'originalesModificados',false,
   'contactosRevelados',false
  ),
  'rankingAllowed',false,'sourceImmutabilityPreserved',true
 );
 result:=public.cotironda_piloto_record_economic_facts_mvp168(
  job->>'message_hmac',job->>'source_sha256','source_checked',
  facts||jsonb_build_object('telefono','not_allowed'));
 if result->>'state'<>'invalid' then raise exception 'mvp168_extra_PII_accepted';end if;
 result:=public.cotironda_piloto_record_economic_facts_mvp168(
  job->>'message_hmac',job->>'source_sha256','source_checked',
  jsonb_set(facts,'{descuentos,precios,0,ivaAcreditado}','true'::jsonb));
 if result->>'state' not in ('invalid','invalid_lines')
 then raise exception 'mvp168_iva_unproven_accepted';end if;
 result:=public.cotironda_piloto_record_economic_facts_mvp168(
  job->>'message_hmac',job->>'source_sha256','source_checked',facts);
 if result->>'state'<>'recorded' then
  raise exception 'mvp168_writer_rejects_safe_data';end if;
 result:=public.cotironda_piloto_record_economic_facts_mvp168(
  job->>'message_hmac',job->>'source_sha256','source_checked',facts);
 if result->>'state'<>'already_checked' then
  raise exception 'mvp168_idempotence_failure';end if;
 select count(*) into new_count
 from cotironda_piloto_privado.supplier_economic_facts_mvp168;
 if new_count<>old_count+1 then raise exception 'mvp168_count_mismatch';end if;
 if exists(select 1 from cotironda_piloto_privado.finalist_whapi_outbox_mvp110)
 then raise exception 'mvp168_sent_whatsapp';end if;
end;$smoke$;
select 'mvp168_rollback_check_completed' as result;
rollback;
