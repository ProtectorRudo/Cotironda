-- MVP-096 | Supabase PILOTO. Post-mortem of an AI request without
-- storing prompts, customer text, model answers, tokens or secrets.
alter table cotironda_piloto_privado.ai_attempts_mvp094
 add column result_state text not null default 'reserved'
  check(result_state in ('reserved','completed','failed')),
 add column intent text
  check(intent is null or intent in
    ('quote_request','business_question','status_question','greeting','other')),
 add column decision text
  check(decision is null or decision in
    ('ready_to_distribute','ask_zone','ask_material','answer_faq',
     'ignore','not_evaluated')),
 add column failure_category text
  check(failure_category is null or failure_category in
   ('auth_config','upstream','quota','bad_output','other')),
 add column finished_at timestamptz,
 add constraint ai_attempts_mvp096_result_consistency check(
  (result_state='reserved' and intent is null and decision is null
    and failure_category is null and finished_at is null)
  or (result_state='completed' and intent is not null and decision is not null
    and failure_category is null and finished_at is not null)
  or (result_state='failed' and intent is null and decision is null
    and failure_category is not null and finished_at is not null)
 );

create function public.cotironda_piloto_finish_ai_mvp096(
 p_message_hmac text,p_result_state text,p_intent text default null,
 p_decision text default null,p_failure_category text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare updated integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$'
    or p_result_state not in ('completed','failed') then return false;end if;
 if p_result_state='completed' then
   if p_intent not in ('quote_request','business_question',
      'status_question','greeting','other')
      or p_decision not in ('ready_to_distribute','ask_zone','ask_material',
        'answer_faq','ignore','not_evaluated')
      or p_failure_category is not null then return false;end if;
 else
   if p_intent is not null or p_decision is not null
      or p_failure_category not in ('auth_config','upstream','quota',
        'bad_output','other')then return false;end if;
 end if;
 update cotironda_piloto_privado.ai_attempts_mvp094
  set result_state=p_result_state,intent=p_intent,decision=p_decision,
     failure_category=p_failure_category,finished_at=clock_timestamp()
 where message_hmac=p_message_hmac and result_state='reserved';
 get diagnostics updated=row_count;
 return updated=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_ai_mvp096(
 text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_ai_mvp096(
 text,text,text,text,text) to service_role;
