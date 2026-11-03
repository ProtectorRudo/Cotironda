-- MVP089: SQL-only rehearsal on cotironda-piloto, always ROLLBACK.
-- No HTTP, no Whapi messages, no persistent catalogue confirmations.
begin;
do $smoke$
declare rid uuid; c integer; message text; payload jsonb; lid uuid;
begin
 select count(*),min(id::text)::uuid into c,rid
 from cotironda_piloto_privado.requests
 where state='prepared' and buyer_key='arquitecto' and delivery_city='La Plata'
 and closes_at>clock_timestamp();
 if c<>1 then raise exception 'mvp089_missing_unique_request';end if;
 if exists(select 1 from cotironda_piloto_privado.whapi_test_send_scope_mvp089) then
   raise exception 'mvp089_rehearsal_requires_empty_scope';end if;
 message:=cotironda_piloto_privado.invitation_body_mvp089(rid);
 if message not like '%20 bolsas · cemento CPC 50 kg%'
  or message not like '%5 litros · hidrófugo%'
  or message not like '%Entrega: La Plata%'
  or message like '%20.000 bag%' or message like '%5.000 l%'
 then raise exception 'mvp089_bad_whatsapp_quantities';end if;
 if (select whatsapp_outbound_enabled from cotironda_piloto_privado.integration_flags)
 then raise exception 'mvp089_live_outbound_already_on';end if;
 payload:=public.cotironda_piloto_claim_whapi_v1();
 if payload->>'state'<>'outbound_disabled' then
   raise exception 'mvp089_outbound_should_be_disabled';end if;
 update cotironda_piloto_privado.integration_flags
   set whatsapp_outbound_enabled=true where only_row=true;
 payload:=public.cotironda_piloto_claim_whapi_v1();
 if payload->>'state'<>'empty' then
   raise exception 'mvp089_unscoped_must_not_send';end if;
 insert into cotironda_piloto_privado.whapi_test_send_scope_mvp089(
  only_row,request_id,supplier_key,expires_at
 ) values (true,rid,'corralon_nahuel',least(clock_timestamp()+interval '1 hour',
    (select closes_at from cotironda_piloto_privado.requests where id=rid)));
 if cotironda_piloto_privado.allow_single_test_send_mvp089(rid,'corralon_ailin')
 then raise exception 'mvp089_ailin_outside_scope';end if;
 if not cotironda_piloto_privado.allow_single_test_send_mvp089(rid,'corralon_nahuel')
 then raise exception 'mvp089_nahuel_scope_rejected';end if;
 payload:=public.cotironda_piloto_claim_whapi_v1();
 if payload->>'state'<>'leased' or payload->>'supplier_key'<>'corralon_nahuel'
 then raise exception 'mvp089_not_one_nahuel_claim';end if;
 lid:=(payload->>'lease_token')::uuid;
 if not public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_nahuel',lid)
 then raise exception 'mvp089_correct_lease_rejected';end if;
 if public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_ailin',lid)
 then raise exception 'mvp089_ailin_leaked';end if;
 if public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_nahuel',gen_random_uuid())
 then raise exception 'mvp089_wrong_lease_accepted';end if;
 payload:=public.cotironda_piloto_claim_whapi_v1();
 if payload->>'state'<>'empty' then
   raise exception 'mvp089_duplicate_claim';end if;
 update cotironda_piloto_privado.participants
 set opted_out_at=clock_timestamp() where key='corralon_nahuel';
 if public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_nahuel',lid)
 then raise exception 'mvp089_optout_not_respected';end if;
 update cotironda_piloto_privado.participants
 set opted_out_at=null where key='corralon_nahuel';
 update cotironda_piloto_privado.whapi_test_send_scope_mvp089
 set expires_at=clock_timestamp()-interval '1 minute';
 if public.cotironda_piloto_authorize_whapi_v1(rid,'corralon_nahuel',lid)
 then raise exception 'mvp089_expired_scope_not_respected';end if;
end;$smoke$;
rollback;
-- Read-only after-state validation separately: scope 0, outbound false, pending.
