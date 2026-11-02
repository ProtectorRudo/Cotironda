-- MVP-082 — Smoke aislado del rol RLS en PILOTO.
-- SOLO SQL Editor de Supabase cotironda-piloto. Sin escritura persistente.
-- Siempre ROLLBACK: el GRANT temporal al operador NO queda instalado.
begin;
grant cotironda_piloto_reader to postgres
 with admin false, inherit false, set true;
set local role cotironda_piloto_reader;
do $mvp082$
declare
 total_ofertas integer;
 con_sha integer;
begin
 if current_user <> 'cotironda_piloto_reader' then
  raise exception 'mvp082_role_not_activated';
 end if;
 select count(*) into total_ofertas
 from cotironda_piloto_privado.offer_versions;
 if total_ofertas<>1 then
  raise exception 'mvp082_pilot_expected_one_quote';
 end if;
 select count(*) into con_sha
 from cotironda_piloto_privado.offer_versions o
 join cotironda_piloto_privado.requests r
  on r.id=o.request_id
 join cotironda_piloto_privado.whapi_inbox w
  on w.message_hmac=o.source_message_hmac
  and w.participant_key=o.supplier_key
  and w.request_id=o.request_id
 where r.buyer_key='arquitecto'
  and w.processing_state='quote_recorded'
  and w.plaintext_sha256=encode(sha256(convert_to(o.original_quote,'UTF8')),'hex');
 if con_sha<>1 then
  raise exception 'mvp082_source_sha_not_proved';
 end if;
 if has_table_privilege(current_user,
   'cotironda_piloto_privado.offer_versions','UPDATE')
  or has_table_privilege(current_user,
   'cotironda_piloto_privado.offer_versions','DELETE')
  or has_table_privilege(current_user,
   'cotironda_piloto_privado.whapi_outbox','SELECT')
  or has_column_privilege(current_user,
   'cotironda_piloto_privado.whapi_inbox','ciphertext_b64','SELECT')
  or has_column_privilege(current_user,
   'cotironda_piloto_privado.participants','chat_hmac','SELECT') then
  raise exception 'mvp082_reader_unexpected_permission';
 end if;
end $mvp082$;
reset role;
rollback;
