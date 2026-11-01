-- Message classification guard: real SQL, revert all fixtures.
begin;
update cotironda_piloto_privado.integration_flags set whatsapp_inbound_enabled=true where only_row;
insert into cotironda_piloto_privado.enrollment_codes(participant_key,code_hash,expires_at)
select v.k,encode(sha256(convert_to(repeat(v.ch,32),'UTF8')),'hex'),
clock_timestamp()+interval '1 hour'
from (values ('arquitecto','a'),('corralon_ailin','c')) v(k,ch);
do $qa$
declare v jsonb;n integer;
begin
 perform public.cotironda_piloto_enroll_whapi_v1(repeat('a',32),repeat('b',64));
 perform public.cotironda_piloto_enroll_whapi_v1(repeat('c',32),repeat('d',64));
 v:=public.cotironda_piloto_receive_whapi_v1(repeat('b',64),repeat('1',64),repeat('2',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  '20 bolsas de cemento CPC 50 kg. Entrega: La Plata.','La Plata',
  '[{"description":"cemento CPC 50 kg","quantity":20,"unit":"bag","family":"cemento_gris_obra"}]'::jsonb);
 if v->>'state'<>'recorded' then raise exception 'buyer_failed_%',v;end if;
 v:=public.cotironda_piloto_receive_whapi_v1(repeat('d',64),repeat('3',64),repeat('4',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  'Hola, gracias por enviar la consulta.',null,null);
 if v->>'state'<>'needs_review' then raise exception 'greeting_was_quote_%',v;end if;
 select count(*) into n from cotironda_piloto_privado.offer_versions;
 if n<>0 then raise exception 'false_quote_persisted';end if;
 v:=public.cotironda_piloto_receive_whapi_v1(repeat('d',64),repeat('5',64),repeat('6',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  '20 bolsas de cemento x $ 190000' || E'\n' || 'TOTAL: $ 190000',null,null);
 if v->>'state'<>'quote_recorded' then raise exception 'real_quote_missing_%',v;end if;
 select count(*) into n from cotironda_piloto_privado.offer_versions;
 if n<>1 then raise exception 'quote_count_wrong_%',n;end if;
end $qa$;
rollback;