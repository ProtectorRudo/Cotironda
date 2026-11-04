-- MVP164 PILOTO ONLY.
-- Read-only commercial volume inference for standard aggregate BIG BAG / bolson.
-- NEVER rewrites original lines, supplier evidence or source facts, and
-- NEVER grants ranking / communication / reveal or supplier access.
create or replace function public.cotironda_piloto_aridos_bolson_nominal_mvp164(
 p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare candidates jsonb;
begin
 if p_request_id is null or not exists (
  select 1 from cotironda_piloto_privado.requests r
  where r.id=p_request_id and r.state in ('prepared','closed')
 ) then return jsonb_build_object('state','not_found',
  'candidates','[]'::jsonb,'ranking_allowed',false);
 end if;
 with candidates_private as (
  select q.message_hmac,q.supplier_key,l.line_no as offer_line,
   rl.line_no as requested_line,
   case when lower(l.description_literal) ~ '\marena\M' then 'arena'
    when lower(l.description_literal) ~ '\m(piedra|granza|ripio|grava|gravilla)\M'
     then 'piedra'
    when lower(l.description_literal) ~ '\mcascotes?\M' then 'cascote'
   end as family,
   l.description_literal as quoted_text,
   rl.original_description as requested_text,
   replace(trim(l.quantity_literal),',','.')::numeric as quoted_containers,
   rl.quantity as requested_m3,
   f.facts->'lines'->(l.line_no-1)->>'presentation' as packaging,
   f.facts->'lines'->(l.line_no-1)->>'unitStatus' as unit_status,
   f.facts->'lines'->(l.line_no-1)->>'unit' as unit_literal
  from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  join cotironda_piloto_privado.supplier_evidence_mvp138 e
   on e.message_hmac=q.message_hmac and e.verifier_version=9
   and e.state='verified' and e.request_id=q.request_id
   and e.supplier_key=q.supplier_key and e.source_sha256=q.source_sha256
  join cotironda_piloto_privado.supplier_source_facts_mvp163 f
   on f.message_hmac=q.message_hmac and f.request_id=q.request_id
   and f.supplier_key=q.supplier_key and f.source_sha256=q.source_sha256
   and f.state='source_checked'
  join cotironda_piloto_privado.supplier_quote_lines_mvp101 l
   on l.message_hmac=q.message_hmac
  join cotironda_piloto_privado.request_lines rl
   on rl.request_id=q.request_id and rl.unit='m3' and rl.quantity>0
   and (
    lower(l.description_literal) ~ '\marena\M'
     and lower(rl.original_description) ~ '\marena\M'
    or lower(l.description_literal) ~ '\m(piedra|granza|ripio|grava|gravilla)\M'
     and lower(rl.original_description) ~ '\m(piedra|granza|ripio|grava|gravilla)\M'
    or lower(l.description_literal) ~ '\mcascotes?\M'
     and lower(rl.original_description) ~ '\mcascotes?\M'
   )
  join cotironda_piloto_privado.media_archive_mvp095 m
   on m.message_hmac=q.message_hmac and m.request_id=q.request_id
   and m.participant_key=q.supplier_key and m.content_sha256=q.source_sha256
   and m.state='stored' and m.storage_path='media/'||q.message_hmac
  where q.request_id=p_request_id
   and q.line_count between 1 and 25
   and l.line_no between 1 and q.line_count
   and trim(l.quantity_literal) ~ '^[1-9][0-9]{0,6}([.,][0-9]{1,3})?$'
   and f.facts->'lines'->(l.line_no-1)->>'presentation'
       in ('big_bag','bolson')
   and (f.facts->'lines'->(l.line_no-1)->>'unitStatus'
        ='not_explicit'
       or (f.facts->'lines'->(l.line_no-1)->>'unitStatus'
           ='explicit' and
           f.facts->'lines'->(l.line_no-1)->>'unit'='bag'))
   and lower(l.description_literal)
    !~ '([0-9]+[.,]?[0-9]*[[:space:]]*m[3³]|\m(medio|media|mini|chico|pequeno|jumbo)\M|[0-9]+[[:space:]]*/[[:space:]]*[0-9]+|[0-9]+[.,]?[0-9]*[[:space:]]*(kg|kilos|toneladas))'
   and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 newer
     where newer.message_hmac=q.message_hmac and newer.verifier_version>9)
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'document_key',message_hmac,'supplier_key_internal',supplier_key,
  'requested_line',requested_line,'offer_line',offer_line,
  'family',family,'packaging',packaging,
  'm3_per_bolson_nominal',1,'m3_offered_nominal',quoted_containers,
  'm3_requested',requested_m3,
  'nominal_quantity_matches',quoted_containers=requested_m3,
  'technical_variant',case
   when family='arena' and lower(requested_text) ~ '\mfina\M' and
    lower(quoted_text) !~ '\mfina\M' then
     case when lower(quoted_text) ~ '\mgruesa\M' then 'different'
          else 'not_stated' end
   when family='piedra' and lower(requested_text) ~ '\mpartida\M' and
    lower(quoted_text) !~ '\mpartida\M' then
     case when lower(quoted_text) ~ '\mrodada\M' then 'different'
          else 'not_stated' end
   else 'needs_independent_technical_check' end,
  'volume_basis','convention_1m3_nominal_ar',
  'supplier_confirmed_volume',false,
  'ranking_allowed',false
 ) order by supplier_key,offer_line,requested_line),'[]'::jsonb)
 into candidates from candidates_private;
 return jsonb_build_object('state','commercial_volume_estimated',
  'candidates',candidates,'ranking_allowed',false,'contacts_revealed',false);
end;$fn$;
revoke all on function public.cotironda_piloto_aridos_bolson_nominal_mvp164(uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_aridos_bolson_nominal_mvp164(uuid)
 to service_role;
