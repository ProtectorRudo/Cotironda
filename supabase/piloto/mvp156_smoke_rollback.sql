-- MVP156: ejecute TODO entre BEGIN y ROLLBACK junto con migración MVP156.
-- No envía WhatsApp ni publica ofertas. Trabaja con los dos documentos
-- originales ya archivados en PILOTO y revierte cualquier cambio.
do $audit$
declare v record;x jsonb;y jsonb;original jsonb;changed jsonb;n integer:=0;
 expected uuid:='469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid;
begin
 for v in select message_hmac,chat_hmac,participant_key,content_sha256,proposal
 from cotironda_piloto_privado.media_archive_mvp095
 where reserved_at>'2026-11-03 22:15:00+00'
   and participant_key in ('corralon_ailin','corralon_nahuel')
   and state='stored' and review_state='suggested_only'
 loop
 n:=n+1;original:=v.proposal;
 -- Las características explícitamente contradictorias bloquean la relación.
 changed:=jsonb_set(original,'{lines,0,original_description}',
   to_jsonb('arena gruesa'::text));
 update cotironda_piloto_privado.media_archive_mvp095 set proposal=changed
 where message_hmac=v.message_hmac;
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,v.chat_hmac);
 if x->>'state' not in ('no_match','ambiguous')
 then raise exception 'contradictory_arena_linked_%_%',v.participant_key,x;end if;
 -- Variación explícita opuesta en piedra.
 changed:=jsonb_set(original,'{lines,1,original_description}',
   to_jsonb('piedra rodada'::text));
 update cotironda_piloto_privado.media_archive_mvp095 set proposal=changed
 where message_hmac=v.message_hmac;
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,v.chat_hmac);
 if x->>'state' not in ('no_match','ambiguous')
 then raise exception 'contradictory_piedra_linked_%_%',v.participant_key,x;end if;
 -- No inventar cantidad: un artículo con cantidad distinta y sin variante
 -- no puede completar las dos corroboraciones independientes.
 changed:=jsonb_set(original,'{lines,0,quantity}',to_jsonb('7,00'::text));
 update cotironda_piloto_privado.media_archive_mvp095 set proposal=changed
 where message_hmac=v.message_hmac;
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,v.chat_hmac);
 if x->>'state' not in ('no_match','ambiguous')
 then raise exception 'wrong_quantity_linked_%_%',v.participant_key,x;end if;
 update cotironda_piloto_privado.media_archive_mvp095 set proposal=original
 where message_hmac=v.message_hmac;
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,repeat('f',64));
 if x->>'state'<>'not_eligible' then raise exception 'foreign_chat_allowed';end if;

 -- Ahora sí, documentos originales reales tal como se recibieron.
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,v.chat_hmac);
 if x->>'state'<>'linked' then raise exception 'original_not_linked_%_%',v.participant_key,x;end if;
 if (select request_id from cotironda_piloto_privado.media_archive_mvp095
   where message_hmac=v.message_hmac)<>expected then raise exception 'wrong_round';end if;
 if (select content_sha256 from cotironda_piloto_privado.media_archive_mvp095
   where message_hmac=v.message_hmac)<>v.content_sha256 then raise exception 'original_hash_changed';end if;
 y:=public.cotironda_piloto_record_supplier_media_mvp098(v.message_hmac);
 if y->>'state'<>'stored_unverified' or (y->>'mirror_lines')::int<>3
 then raise exception 'not_all_original_lines_recorded_%_%',v.participant_key,y;end if;
 if (select count(*) from cotironda_piloto_privado.supplier_quote_lines_mvp101
   where message_hmac=v.message_hmac)<>3 then raise exception 'line_loss';end if;
 x:=public.cotironda_piloto_autolink_unquoted_media_mvp155(v.message_hmac,v.chat_hmac);
 if x->>'state'<>'not_eligible' then raise exception 'duplicate_link';end if;
 end loop;
 if n<>2 then raise exception 'expected_two_originals_%',n;end if;
 if has_function_privilege('anon',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 or not has_function_privilege('service_role',
   'public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)','EXECUTE')
 then raise exception 'ACL_BROKEN';end if;
end;$audit$;
