-- MVP-073: test SQL-only, never persist fake users or messages
begin;
update cotironda_piloto_privado.integration_flags set whatsapp_inbound_enabled=true where only_row;
insert into cotironda_piloto_privado.enrollment_codes(participant_key,code_hash,expires_at)
select v.k,encode(sha256(convert_to(repeat(v.ch,32),'UTF8')),'hex'),clock_timestamp()+interval '1 hour'
from (values ('arquitecto','a'),('corralon_ailin','c'),('corralon_nahuel','e')) v(k,ch);
do $qa$
declare x jsonb;n integer;
begin
 x:=public.cotironda_piloto_enroll_whapi_v1(repeat('a',32),repeat('b',64));
 if x->>'state'<>'enrolled' then raise exception 'buyer_enroll_%',x;end if;
 x:=public.cotironda_piloto_enroll_whapi_v1(repeat('c',32),repeat('d',64));
 if x->>'state'<>'enrolled' then raise exception 'supplier_a_enroll_%',x;end if;
 x:=public.cotironda_piloto_enroll_whapi_v1(repeat('e',32),repeat('f',64));
 if x->>'state'<>'enrolled' then raise exception 'supplier_b_enroll_%',x;end if;
 x:=public.cotironda_piloto_receive_whapi_v1(repeat('b',64),repeat('1',64),repeat('2',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  '20 bolsas de cemento CPC 50 kg, 5 litros de hidrofugo. Entrega: La Plata.','La Plata',
  '[{"description":"cemento CPC 50 kg","quantity":20,"unit":"bag","family":"cemento_gris_obra"},{"description":"hidrofugo","quantity":5,"unit":"l","family":"hidrofugo"}]'::jsonb);
 if x->>'state'<>'recorded' or (x->>'invitations_prepared')::int<>2 then
   raise exception 'buyer_request_%',x;end if;
 x:=public.cotironda_piloto_receive_whapi_v1(repeat('b',64),repeat('1',64),repeat('2',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  '20 bolsas de cemento CPC 50 kg, 5 litros de hidrofugo. Entrega: La Plata.','La Plata',
  '[{"description":"cemento CPC 50 kg","quantity":20,"unit":"bag","family":"cemento_gris_obra"}]'::jsonb);
 if x->>'state'<>'duplicate' then raise exception 'replay_failed_%',x;end if;
 x:=public.cotironda_piloto_receive_whapi_v1(repeat('d',64),repeat('3',64),repeat('4',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  '20 bolsas cemento = $190000' || E'\n' || '2 pallets vacíos = $14000' || E'\n' || 'TOTAL FINAL = $204000',null,null);
 if x->>'state'<>'quote_recorded' then raise exception 'quote_failed_%',x;end if;
 select count(*) into n from cotironda_piloto_privado.offer_versions
 where supplier_key='corralon_ailin' and original_quote like '%pallets vacíos%';
 if n<>1 then raise exception 'original_missing';end if;
 x:=public.cotironda_piloto_optout_whapi_v1(repeat('d',64));
 if x->>'state'<>'opted_out' then raise exception 'optout_failed_%',x;end if;
 x:=public.cotironda_piloto_receive_whapi_v1(repeat('d',64),repeat('5',64),repeat('6',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',extract(epoch from clock_timestamp())::bigint,
  'cotización posterior a BAJA',null,null);
 if x->>'state'<>'unrecognized_contact' then raise exception 'optout_not_enforced_%',x;end if;
end $qa$;
rollback;