-- MVP134 isolated PostgreSQL 17. No pilot data or private source text.
create schema cotironda_piloto_privado;
create role anon;
create role authenticated;
create role service_role;
create table cotironda_piloto_privado.participants(
 key text primary key,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
create table cotironda_piloto_privado.requests(
 id uuid primary key,state text,closes_at timestamptz);
create table cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text);
create table cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text primary key,content_sha256 text,request_id uuid,
 participant_key text,chat_hmac text,state text,review_state text,mime text,
 size_bytes integer,storage_path text,proposal jsonb);
create table cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text primary key,request_id uuid,supplier_key text,
 source_sha256 text,state text,line_count smallint,received_at timestamptz);
create table cotironda_piloto_privado.supplier_reading_checks_mvp102(
 message_hmac text,source_sha256 text,state text);
create function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
returns trigger language plpgsql as $func$
begin raise exception 'immutable_reconciliation';end;$func$;
insert into cotironda_piloto_privado.participants values(
 'supplier_test',repeat('a',64),'supplier',now(),null);
insert into cotironda_piloto_privado.requests values(
 '11111111-1111-1111-1111-111111111111','prepared',now()+interval '1 day');
insert into cotironda_piloto_privado.invitations values(
 '11111111-1111-1111-1111-111111111111','supplier_test','prepared');
insert into cotironda_piloto_privado.media_archive_mvp095 values(
 repeat('c',64),repeat('b',64),
 '11111111-1111-1111-1111-111111111111','supplier_test',
 repeat('a',64),'stored','suggested_only','application/pdf',
 12725,'media/'||repeat('c',64),
 jsonb_build_object('kind','supplier_quote','lines',
  jsonb_build_array(jsonb_build_object('text','synthetic line 1'),
                    jsonb_build_object('text','synthetic line 2')),
  'unanswered',jsonb_build_array('IVA','presentación','stock'))
);
insert into cotironda_piloto_privado.supplier_media_quotes_mvp098 values(
 repeat('c',64),'11111111-1111-1111-1111-111111111111','supplier_test',
 repeat('b',64),'awaiting_fidelity_check',2,now());
insert into cotironda_piloto_privado.supplier_reading_checks_mvp102 values(
 repeat('c',64),repeat('b',64),'needs_source_review');
\i supabase/piloto/mvp134_private_quote_reconciliation.sql
do $check$
declare result jsonb;
begin
 if has_function_privilege('anon',
   'public.cotironda_piloto_next_reconciliation_mvp134()','EXECUTE')
  or has_function_privilege('authenticated',
   'public.cotironda_piloto_next_reconciliation_mvp134()','EXECUTE')
  or has_function_privilege('anon',
   'public.cotironda_piloto_record_reconciliation_mvp134(text,text,text,text,integer,integer)','EXECUTE')
  or not has_function_privilege('service_role',
   'public.cotironda_piloto_next_reconciliation_mvp134()','EXECUTE')
 then raise exception 'exposed private reconciliation';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.supplier_reconciliation_mvp134','SELECT')
 then raise exception 'exposed private table';end if;
 result:=public.cotironda_piloto_next_reconciliation_mvp134();
 if result->>'state'<>'candidate' or result->>'message_hmac'<>repeat('c',64)
  or jsonb_array_length(result->'proposal'->'unanswered')<>3
 then raise exception 'missing eligible synthetic candidate';end if;
 result:=public.cotironda_piloto_record_reconciliation_mvp134(
  repeat('c',64),repeat('f',64),'source_candidate','covered',0,2);
 if result->>'state'<>'not_permitted' then raise exception 'wrong hash recorded';end if;
 result:=public.cotironda_piloto_record_reconciliation_mvp134(
  repeat('c',64),repeat('b',64),'source_candidate','unresolved_questions',3,2);
 if result->>'state'<>'invalid' then raise exception 'unsafe source approval';end if;
 result:=public.cotironda_piloto_record_reconciliation_mvp134(
  repeat('c',64),repeat('b',64),'needs_review','unresolved_questions',3,2);
 if result->>'state'<>'recorded' or result->>'ranking_allowed'<>'false'
 then raise exception 'failed to record private diagnosis';end if;
 result:=public.cotironda_piloto_record_reconciliation_mvp134(
  repeat('c',64),repeat('b',64),'needs_review','unresolved_questions',3,2);
 if result->>'state'<>'already_recorded'
 then raise exception 'idempotent record failed';end if;
 result:=public.cotironda_piloto_next_reconciliation_mvp134();
 if result->>'state'<>'none'
 then raise exception 'processed candidate selected twice';end if;
 if (select count(*) from cotironda_piloto_privado.supplier_reconciliation_mvp134)<>1
 then raise exception 'duplicate reconciliation';end if;
 if (select review_state from cotironda_piloto_privado.media_archive_mvp095
     where message_hmac=repeat('c',64))<>'suggested_only'
 then raise exception 'original state changed';end if;
end;$check$;
do $immutable$
declare blocked boolean:=false;
begin
 begin
  update cotironda_piloto_privado.supplier_reconciliation_mvp134
   set state='source_candidate' where message_hmac=repeat('c',64);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'diagnostic is mutable';end if;
end;$immutable$;
insert into cotironda_piloto_privado.media_archive_mvp095
select repeat('d',64),content_sha256,request_id,participant_key,chat_hmac,
 state,review_state,mime,size_bytes,'media/'||repeat('d',64),proposal
from cotironda_piloto_privado.media_archive_mvp095 where message_hmac=repeat('c',64);
insert into cotironda_piloto_privado.supplier_media_quotes_mvp098
select repeat('d',64),request_id,supplier_key,source_sha256,state,line_count,now()
from cotironda_piloto_privado.supplier_media_quotes_mvp098 where message_hmac=repeat('c',64);
insert into cotironda_piloto_privado.supplier_reading_checks_mvp102
values(repeat('d',64),repeat('b',64),'needs_source_review');
update cotironda_piloto_privado.participants
 set opted_out_at=now() where key='supplier_test';
do $check$
begin
 if (public.cotironda_piloto_next_reconciliation_mvp134()->>'state')<>'none'
 then raise exception 'opted-out candidate selected';end if;
end;$check$;
update cotironda_piloto_privado.participants set opted_out_at=null;
update cotironda_piloto_privado.requests set closes_at=now()-interval '1 minute';
do $check$
begin
 if (public.cotironda_piloto_next_reconciliation_mvp134()->>'state')<>'none'
 then raise exception 'expired round selected';end if;
end;$check$;
update cotironda_piloto_privado.requests set closes_at=now()+interval '1 day';
update cotironda_piloto_privado.media_archive_mvp095
 set storage_path='media/forged' where message_hmac=repeat('d',64);
do $check$
begin
 if (public.cotironda_piloto_next_reconciliation_mvp134()->>'state')<>'none'
 then raise exception 'wrong storage path selected';end if;
end;$check$;
