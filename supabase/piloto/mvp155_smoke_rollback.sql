-- MVP155 SOLO PILOTO. Se ejecuta con BEGIN/ROLLBACK (sin mensajes).
-- Requiere que el archivo mvp155_autolink_unquoted_supplier_media.sql se
-- ejecute en la misma transacción ANTES de este bloque.
do $tests$
declare
 chat text; h text; rows jsonb; expected text; answer jsonb; saved jsonb;
 ix integer; newid uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid;
 oldid uuid:='e134c5fc-fe38-4109-bfbd-33acec264b22'::uuid;
 sand jsonb;stone jsonb;cement jsonb;pallet jsonb;
begin
 select chat_hmac into chat from cotironda_piloto_privado.participants
  where key='corralon_ailin' and consent_at is not null and opted_out_at is null;
 if chat is null then raise exception 'supplier_not_authorized';end if;
 sand:=jsonb_build_object('original_description','arena fina','quantity','1','unit','m3','unit_price','100','line_total','100','evidence_location','p1','ambiguity',null);
 stone:=jsonb_build_object('original_description','piedra partida','quantity','2','unit','m3','unit_price','100','line_total','200','evidence_location','p1','ambiguity',null);
 cement:=jsonb_build_object('original_description','cemento gris 25 kg','quantity','25','unit','bolsas','unit_price','100','line_total','2500','evidence_location','p1','ambiguity',null);
 pallet:=jsonb_build_object('original_description','pallet retornable','quantity','1','unit','unit','unit_price','50','line_total','50','evidence_location','p1','ambiguity',null);
 for ix in 1..6 loop
   h:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
   rows:=case ix
     when 1 then jsonb_build_array(sand,stone,cement,pallet)
     when 2 then jsonb_build_array(
       jsonb_build_object('original_description','cemento CPC 50 KG'),
       jsonb_build_object('original_description','hidrofugo en pasta'))
     when 3 then jsonb_build_array(jsonb_build_object('original_description','cemento CPC 50 KG'))
     when 4 then jsonb_build_array(sand,stone,cement)
     when 5 then jsonb_build_array(stone)
     else jsonb_build_array(jsonb_build_object('original_description','pintura blanca para interiores')) end;
   expected:=case ix when 1 then 'linked' when 2 then 'linked'
     when 3 then 'ambiguous' when 4 then 'linked'
     when 5 then 'linked' else 'no_match' end;
   insert into cotironda_piloto_privado.whapi_inbox(
     message_hmac,chat_hmac,participant_key,kind,nonce_b64,
     ciphertext_b64,plaintext_sha256,source_unix,processing_state)
   values(h,chat,'corralon_ailin','document','AAAAAAAAAAAAAAAA',
     repeat('A',96),md5(h)||md5(h),
     extract(epoch from clock_timestamp())::bigint,'needs_review');
   insert into cotironda_piloto_privado.media_archive_mvp095(
     message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
     state,size_bytes,content_sha256,storage_path,review_state,ai_reserved_at,proposal)
   values(h,chat,'corralon_ailin','document','application/pdf',
     md5(h)||md5(h),'stored',1024,md5(h)||md5(h),'media/'||h,
     'suggested_only',clock_timestamp(),
     jsonb_build_object('status','review_required','kind','supplier_quote',
      'lines',rows,'total_declared','2850','unanswered',jsonb_build_array()));
   if ix=4 then
     answer:=public.cotironda_piloto_autolink_unquoted_media_mvp155(h,repeat('f',64));
     if answer->>'state'<>'not_eligible' then raise exception 'wrong_chat_allowed';end if;
   end if;
   answer:=public.cotironda_piloto_autolink_unquoted_media_mvp155(h,chat);
   if answer->>'state' is distinct from expected
   then raise exception 'case_%_got_%_expected_%',ix,answer,expected;end if;
   if ix in (1,4,5) and (select request_id from
     cotironda_piloto_privado.media_archive_mvp095 where message_hmac=h)<>newid
   then raise exception 'wrong_new_round_%',ix;end if;
   if ix=2 and (select request_id from
     cotironda_piloto_privado.media_archive_mvp095 where message_hmac=h)<>oldid
   then raise exception 'wrong_old_round';end if;
   if expected in ('ambiguous','no_match') and exists(
     select 1 from cotironda_piloto_privado.media_archive_mvp095
     where message_hmac=h and request_id is not null)
   then raise exception 'unmatched_assigned_%',ix;end if;
   if ix=1 then
     saved:=public.cotironda_piloto_record_supplier_media_mvp098(h);
     if saved->>'state'<>'stored_unverified'
       or (saved->>'mirror_lines')::int<>4
     then raise exception 'did_not_record_all_original_lines_%',saved;end if;
     if (select count(*) from cotironda_piloto_privado.supplier_quote_lines_mvp101
       where message_hmac=h and description_literal='pallet retornable')<>1
     then raise exception 'commercial_extra_disappeared';end if;
     answer:=public.cotironda_piloto_autolink_unquoted_media_mvp155(h,chat);
     if answer->>'state'<>'not_eligible' then raise exception 'duplicate_association';end if;
   end if;
 end loop;
 if has_function_privilege('anon',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 or not has_function_privilege('service_role',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 then raise exception 'ACL_ERROR';end if;
end;$tests$;
