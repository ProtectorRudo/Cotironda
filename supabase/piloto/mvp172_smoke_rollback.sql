-- MVP172: prueba reversible de insumos de una ronda, SOLO PILOTO.
-- Requiere instalar el esquema en esta misma transacción antes.
-- Nunca devuelve textos, hashes ni campos económicos reales.
begin;
do $$
declare
 r record;
 v_total integer:=0;v_ok integer:=0;v_quotes integer:=0;v_items integer:=0;
 v_result jsonb;
begin
 if to_regprocedure('public.cotironda_piloto_private_round_inputs_mvp172(uuid)') is null
 then raise exception 'mvp172_missing_rpc';end if;
 if has_function_privilege('anon',
  'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
  or has_function_privilege('authenticated',
  'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
  or not has_function_privilege('service_role',
  'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
 then raise exception 'mvp172_acl_failure';end if;
 for r in select distinct request_id
 from cotironda_piloto_privado.supplier_economic_facts_mvp168 loop
  v_total:=v_total+1;
  v_result:=public.cotironda_piloto_private_round_inputs_mvp172(r.request_id);
  if v_result->>'state'='private_inputs' then
   v_ok:=v_ok+1;
   v_items:=v_items+jsonb_array_length(v_result->'requestItems');
   v_quotes:=v_quotes+jsonb_array_length(v_result->'quotations');
   if v_result->>'rankingAllowed'<>'false'
    or v_result->>'contactsRevealed'<>'false'
   then raise exception 'mvp172_ranking_contact_exposure';end if;
   if exists(select 1 from jsonb_array_elements(v_result->'quotations') entry
    where entry->'doc'->'prueba'->>'rankingAllowed'<>'false'
     or entry->'economia'->>'rankingAllowed'<>'false'
     or entry->'fuente'->>'rankingAllowed'<>'false'
     or entry->'doc'->'prueba'->>'version'<>'9'
     or entry->'economia'->>'sourceSha256'
       <>entry->'doc'->>'sourceSha256'
     or entry->'fuente'->>'sourceSha256'
       <>entry->'doc'->>'sourceSha256')
   then raise exception 'mvp172_invalid_source_binding';end if;
  else
   raise notice 'mvp172_incomplete_round_pending_verification';
  end if;
 end loop;
 if v_total<1 or v_ok<1 or v_quotes<1 or v_items<1
 then raise exception 'mvp172_no_auditable_rounds';end if;
 if public.cotironda_piloto_private_round_inputs_mvp172(
  '00000000-0000-0000-0000-000000000000'::uuid)->>'state'<>'not_permitted'
 then raise exception 'mvp172_unowned_request_visible';end if;
 raise notice 'mvp172_rounds_checked %, quotes_checked %, request_items_checked %',
  v_ok,v_quotes,v_items;
end $$;
select 'mvp172_rollback_check_completed' as status;
rollback;
