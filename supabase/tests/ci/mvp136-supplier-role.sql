-- MVP136: self-contained PostgreSQL17 rollback-isolated synthetic gate.
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
 message_hmac text primary key,chat_hmac text,participant_key text,request_id uuid,
 mime text,storage_path text,size_bytes integer,content_sha256 text,
 state text,review_state text,proposal jsonb,reserved_at timestamptz);
create table cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac text primary key);
create function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
returns trigger language plpgsql as $func$
begin raise exception 'immutable';end;$func$;
-- Unit stub: production still uses the existing full source quote/line mirror RPC.
create function public.cotironda_piloto_record_supplier_media_mvp098(p_message_hmac text)
returns jsonb language plpgsql as $fn$
begin
 if not exists(select 1 from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=p_message_hmac and proposal->>'kind'='supplier_quote')
 then return jsonb_build_object('state','not_eligible');end if;
 insert into cotironda_piloto_privado.supplier_media_quotes_mvp098 values(p_message_hmac);
 return jsonb_build_object('state','stored_unverified');
end;$fn$;
insert into cotironda_piloto_privado.participants values
 ('provider',repeat('a',64),'supplier',clock_timestamp(),null),
 ('buyer',repeat('b',64),'buyer',clock_timestamp(),null);
insert into cotironda_piloto_privado.requests values(
 '11111111-1111-1111-1111-111111111111','prepared',clock_timestamp()+interval '2 days');
insert into cotironda_piloto_privado.invitations values(
 '11111111-1111-1111-1111-111111111111','provider','prepared');
insert into cotironda_piloto_privado.media_archive_mvp095 values(
 repeat('c',64),repeat('a',64),'provider',
 '11111111-1111-1111-1111-111111111111',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'media/'||repeat('c',64),9696,repeat('f',64),
 'stored','suggested_only',
 jsonb_build_object('kind','buyer_request','total_declared','$ 31400',
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento CPC 25kg','quantity','40',
   'unit',null,'unit_price','$1000','line_total','$ 30000',
   'evidence_location','sheet 1 row 3','ambiguity',null),
   jsonb_build_object('original_description','Hidrofugo 5l','quantity','1',
   'unit',null,'unit_price','$ 1400','line_total','$ 1400',
   'evidence_location','sheet 1 row 4','ambiguity',null))),
 clock_timestamp()-interval '5 minutes');
\i supabase/piloto/mvp136_supplier_role_from_archived_quote.sql
do $test$
declare p jsonb;
begin
 if has_function_privilege('anon','public.cotironda_piloto_next_supplier_role_mvp136()','EXECUTE')
 or has_function_privilege('authenticated','public.cotironda_piloto_correct_supplier_role_mvp136(text,text)','EXECUTE')
 or has_table_privilege('anon','cotironda_piloto_privado.supplier_role_corrections_mvp136','SELECT')
 or not has_function_privilege('service_role','public.cotironda_piloto_next_supplier_role_mvp136()','EXECUTE')
 then raise exception 'mvp136_roles_exposed';end if;
 p:=public.cotironda_piloto_next_supplier_role_mvp136();
 if p->>'state'<>'candidate' or p->>'mime'<>
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 then raise exception 'mvp136_xlsx_not_detected';end if;
 p:=public.cotironda_piloto_correct_supplier_role_mvp136(
  repeat('c',64),repeat('e',64));
 if p->>'state'<>'not_permitted'
 then raise exception 'mvp136_wrong_hash_accepted';end if;
 p:=public.cotironda_piloto_correct_supplier_role_mvp136(
  repeat('c',64),repeat('f',64));
 if p->>'state'<>'reclassified_private' or p->>'ranking_allowed'<>'false'
 then raise exception 'mvp136_did_not_correct';end if;
 if (select proposal->>'kind' from cotironda_piloto_privado.media_archive_mvp095
   where message_hmac=repeat('c',64))<>'supplier_quote'
 or (select original_proposal->>'kind' from
  cotironda_piloto_privado.supplier_role_corrections_mvp136
  where message_hmac=repeat('c',64))<>'buyer_request'
 or (select count(*) from cotironda_piloto_privado.supplier_media_quotes_mvp098)<>1
 then raise exception 'mvp136_original_lost_or_mirror_missing';end if;
 if (public.cotironda_piloto_correct_supplier_role_mvp136(
  repeat('c',64),repeat('f',64))->>'state')<>'already_corrected'
 then raise exception 'mvp136_not_idempotent';end if;
 if (public.cotironda_piloto_next_supplier_role_mvp136()->>'state')<>'none'
 then raise exception 'mvp136_duplicate_selected';end if;
end;$test$;
do $immutable$
declare blocked boolean:=false;
begin
 begin
  delete from cotironda_piloto_privado.supplier_role_corrections_mvp136;
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'mvp136_audit_mutable';end if;
end;$immutable$;
-- Reject a second candidate if consent revoked.
insert into cotironda_piloto_privado.media_archive_mvp095
select repeat('d',64),chat_hmac,participant_key,request_id,mime,
 'media/'||repeat('d',64),size_bytes,content_sha256,state,review_state,
 jsonb_set(proposal,'{kind}','"buyer_request"'::jsonb),clock_timestamp()
 from cotironda_piloto_privado.media_archive_mvp095 where message_hmac=repeat('c',64);
update cotironda_piloto_privado.participants set opted_out_at=clock_timestamp()
 where key='provider';
do $test$begin
 if (public.cotironda_piloto_next_supplier_role_mvp136()->>'state')<>'none'
 then raise exception 'mvp136_optedout_selected';end if;end;$test$;
update cotironda_piloto_privado.participants set opted_out_at=null where key='provider';
update cotironda_piloto_privado.requests set closes_at=clock_timestamp()-interval '1 hour';
do $test$begin
 if (public.cotironda_piloto_next_supplier_role_mvp136()->>'state')<>'none'
 then raise exception 'mvp136_expired_selected';end if;end;$test$;
update cotironda_piloto_privado.requests set closes_at=clock_timestamp()+interval '1 day';
update cotironda_piloto_privado.media_archive_mvp095
 set storage_path='media/forged' where message_hmac=repeat('d',64);
do $test$begin
 if (public.cotironda_piloto_next_supplier_role_mvp136()->>'state')<>'none'
 then raise exception 'mvp136_path_forged_selected';end if;end;$test$;
