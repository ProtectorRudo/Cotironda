-- Exactly-once broker tests: no actual WhatsApp requests; always rollback.
begin;
update cotironda_piloto_privado.integration_flags
set whatsapp_inbound_enabled=true,whatsapp_outbound_enabled=true where only_row;
insert into cotironda_piloto_privado.enrollment_codes(participant_key,code_hash,expires_at)
select v.k,encode(sha256(convert_to(repeat(v.ch,32),'UTF8')),'hex'),
clock_timestamp()+interval '1 hour'
from (values ('arquitecto','a'),('corralon_ailin','c'),('corralon_nahuel','e')) v(k,ch);
do $qa$
declare v jsonb; r uuid; n integer; token uuid;
begin
 perform public.cotironda_piloto_enroll_whapi_v1(repeat('a',32),repeat('b',64));
 perform public.cotironda_piloto_enroll_whapi_v1(repeat('c',32),repeat('d',64));
 perform public.cotironda_piloto_enroll_whapi_v1(repeat('e',32),repeat('f',64));
 v:=public.cotironda_piloto_receive_whapi_v1(
  repeat('b',64),repeat('1',64),repeat('2',64),'text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
  extract(epoch from clock_timestamp())::bigint,
  '20 bolsas de cemento CPC 50 kg, 5 litros de hidrofugo. Entrega: La Plata.',
  'La Plata',
  '[{"description":"cemento CPC 50 kg","quantity":20,"unit":"bag","family":"cemento_gris_obra"},{"description":"hidrofugo","quantity":5,"unit":"l","family":"hidrofugo"}]'::jsonb);
 if (v->>'invitations_prepared')::int<>2 then raise exception 'expected_2_invites_%',v;end if;
 select count(*) into n from cotironda_piloto_privado.whapi_outbox where state='pending';
 if n<>2 then raise exception 'expected_2_outbox_%',n;end if;
 v:=public.cotironda_piloto_claim_whapi_v1();
 if v->>'state'<>'leased' or v->>'chat_hmac' not in (repeat('d',64),repeat('f',64))
 or v->>'message_body' not like '%Entrega: La Plata%'
 or v->>'message_body' not like '%cemento CPC 50 kg%' then
 raise exception 'claim_invalid_%',v;end if;
 r:=(v->>'request_id')::uuid;
 token:=(v->>'lease_token')::uuid;
 if public.cotironda_piloto_authorize_whapi_v1(r,v->>'supplier_key',token) is not true
 then raise exception 'send_authorization_failed';end if;
 -- BAJA del comprador bloquea incluso un lease ya adquirido, antes del API POST.
 if (public.cotironda_piloto_optout_whapi_v1(repeat('b',64))->>'state')<>'opted_out'
 then raise exception 'buyer_optout_failed';end if;
 if public.cotironda_piloto_authorize_whapi_v1(r,v->>'supplier_key',token) is true
 then raise exception 'buyer_optout_must_block_authorization';end if;
 v:=public.cotironda_piloto_claim_whapi_v1();
 if v->>'state'<>'empty' then raise exception 'buyer_optout_must_block_pending_%',v;end if;
 -- Restablecer la prueba sintética sin reenrolar un nuevo chat.
 update cotironda_piloto_privado.participants
 set consent_at=clock_timestamp(),opted_out_at=null where key='arquitecto';

 if public.cotironda_piloto_finish_whapi_v1(r,v->>'supplier_key',token,'api_accepted','example-msg-123') is not true
 then raise exception 'finish_failed';end if;
 if public.cotironda_piloto_finish_whapi_v1(r,v->>'supplier_key',token,'api_accepted','example-msg-123') is true
 then raise exception 'duplicate_finish_allowed';end if;
 v:=public.cotironda_piloto_claim_whapi_v1();
 if v->>'state'<>'leased' then raise exception 'second_claim_failed_%',v;end if;
 if public.cotironda_piloto_finish_whapi_v1((v->>'request_id')::uuid,
  v->>'supplier_key',(v->>'lease_token')::uuid,'uncertain',null) is not true
 then raise exception 'uncertain_failed';end if;
 v:=public.cotironda_piloto_claim_whapi_v1();
 if v->>'state'<>'empty' then raise exception 'unwanted_retransmission_%',v;end if;
end $qa$;
rollback;