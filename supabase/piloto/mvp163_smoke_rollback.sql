-- MVP163. Run only after migration within BEGIN...ROLLBACK on PILOT.
-- Synthetic fact claims on real already-publicly-verified *metadata*, never
-- persists test values or reveals buyer/supplier private file bytes.
do $smoke$
declare job jsonb; saved jsonb; facts jsonb; candidate jsonb;
 n integer; before_count integer; one jsonb;
begin
 if exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
  where enabled) then raise exception 'finalist_enable_unexpected';end if;
 if exists(select 1 from cotironda_piloto_privado.finalist_whapi_outbox_mvp110)
 then raise exception 'finalist_outbox_unexpected';end if;
 select count(*) into before_count
 from cotironda_piloto_privado.supplier_source_facts_mvp163;
 job:=public.cotironda_piloto_next_source_facts_mvp163();
 if job->>'state'<>'candidate' then raise exception 'missing_source_candidate';end if;
 n:=(job->>'line_count')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('lineNo',v,
  'unitStatus','not_explicit','unit',null,'presentation','none',
  'page',1,'row',v) order by v),'[]'::jsonb) into candidate
 from generate_series(1,n) v;
 facts:=jsonb_build_object('lines',candidate,
  'terms',jsonb_build_object('iva','not_stated','freight','not_stated',
    'payment','not_stated','stock','not_proven'),
  'rankingAllowed',false,'sourceImmutabilityPreserved',true);
 saved:=public.cotironda_piloto_record_source_facts_mvp163(
  job->>'message_hmac',job->>'source_sha256','source_checked',facts);
 if saved->>'state'<>'recorded' then
  raise exception 'write_missing %',saved->>'state';end if;
 if (select count(*) from cotironda_piloto_privado.supplier_source_facts_mvp163)
 <>before_count+1 then raise exception 'append_missing';end if;
 saved:=public.cotironda_piloto_record_source_facts_mvp163(
  job->>'message_hmac',job->>'source_sha256','source_checked',facts);
 if saved->>'state'<>'already_checked' then raise exception 'idempotency_bad';end if;
 saved:=public.cotironda_piloto_record_source_facts_mvp163(
  job->>'message_hmac',job->>'source_sha256','source_checked',
  jsonb_set(facts,'{lines,0,unit}',to_jsonb('foo'::text)));
 if saved->>'state'='recorded' then raise exception 'unsupported_unit_accepted';end if;
 saved:=public.cotironda_piloto_record_source_facts_mvp163(
  job->>'message_hmac',job->>'source_sha256','source_checked',
  facts||jsonb_build_object('contact','private_value'));
 if saved->>'state'='recorded' then raise exception 'untrusted_extra_accepted';end if;
 if has_function_privilege('anon',
  'public.cotironda_piloto_next_source_facts_mvp163()','EXECUTE')
 or has_function_privilege('authenticated',
  'public.cotironda_piloto_record_source_facts_mvp163(text,text,text,jsonb)','EXECUTE')
 or not has_function_privilege('service_role',
  'public.cotironda_piloto_next_source_facts_mvp163()','EXECUTE')
 then raise exception 'rpc_acl_unsafe';end if;
 if has_table_privilege('anon',
  'cotironda_piloto_privado.supplier_source_facts_mvp163','SELECT')
 or has_table_privilege('authenticated',
  'cotironda_piloto_privado.supplier_source_facts_mvp163','INSERT')
 then raise exception 'private_table_exposed';end if;
end;$smoke$;
select 'mvp163_source_facts_rollback_pass' as result;
