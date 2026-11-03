-- MVP-096: reversible test of result ledger, no calls to OpenAI or Whapi.
begin;
do $test$
declare first_h text; second_h text; chat_h text; n integer;
begin
 first_h:=encode(extensions.gen_random_bytes(32),'hex');
 second_h:=encode(extensions.gen_random_bytes(32),'hex');
 chat_h:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.ai_attempts_mvp094(message_hmac,chat_hmac)
 values(first_h,chat_h),(second_h,chat_h);
 if not public.cotironda_piloto_finish_ai_mvp096(
    first_h,'completed','business_question','answer_faq',null)
 then raise exception 'mvp096_success_not_saved';end if;
 if public.cotironda_piloto_finish_ai_mvp096(
    first_h,'completed','business_question','answer_faq',null)
 then raise exception 'mvp096_success_not_idempotent';end if;
 if public.cotironda_piloto_finish_ai_mvp096(
    second_h,'completed','unknown','answer_faq',null)
 then raise exception 'mvp096_invalid_intent_accepted';end if;
 if not public.cotironda_piloto_finish_ai_mvp096(
    second_h,'failed',null,null,'upstream')
 then raise exception 'mvp096_error_not_saved';end if;
 if public.cotironda_piloto_finish_ai_mvp096(
    second_h,'failed',null,null,'upstream')
 then raise exception 'mvp096_error_not_idempotent';end if;
 select count(*) into n from cotironda_piloto_privado.ai_attempts_mvp094
 where message_hmac in(first_h,second_h)
  and finished_at is not null and
  ((result_state='completed' and intent='business_question'
    and decision='answer_faq' and failure_category is null) or
   (result_state='failed' and intent is null and decision is null
    and failure_category='upstream'));
 if n<>2 then raise exception 'mvp096_wrong_final_state';end if;
 if has_table_privilege('anon',
    'cotironda_piloto_privado.ai_attempts_mvp094','SELECT')
 or has_function_privilege('anon',
    'public.cotironda_piloto_finish_ai_mvp096(text,text,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
    'public.cotironda_piloto_finish_ai_mvp096(text,text,text,text,text)','EXECUTE')
 then raise exception 'mvp096_result_exposure';end if;
end;$test$;
rollback;
