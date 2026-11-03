-- MVP091 live PostgreSQL 17 smoke, test data synthetic and ROLLBACK.
begin;
do $smoke$
declare
 rid uuid; hid text; source_hid text; token text; result jsonb; lease uuid;
 second uuid;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags f
 where f.only_row and f.whatsapp_inbound_enabled and not f.whatsapp_outbound_enabled)
 then raise exception 'mvp091_required_pilot_flags';end if;
 select chat_hmac into hid from cotironda_piloto_privado.participants
 where key='arquitecto' and consent_at is not null and opted_out_at is null;
 if hid is null then raise exception 'mvp091_buyer_not_linked';end if;
 insert into cotironda_piloto_privado.next_round_window_mvp091(
 only_row,starts_at,expires_at)
 values(true,clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '1 hour');
 source_hid:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.requests(
 buyer_key,delivery_city,original_request,source_hmac,state)
 values('arquitecto','La Plata',
  'Entrega: La Plata'||E'\n'||
  '20 bolsas cemento CPC 50 kg'||E'\n'||'5 litros hidrófugo',
  source_hid,'prepared') returning id into rid;
 insert into cotironda_piloto_privado.request_lines(
 request_id,line_no,original_description,quantity,unit,family_code)
 values(rid,1,'cemento CPC 50 kg',20,'bag','cemento_gris_obra'),
       (rid,2,'hidrófugo',5,'l','hidrofugo');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 values(rid,'corralon_ailin'),(rid,'corralon_nahuel');
 -- MVP092: this is a replacement test. Older invitations are not eligible
 -- to receive a new WhatsApp quote; retain the original test quote/version.
 if (select count(*) from cotironda_piloto_privado.invitations
      where supplier_key in('corralon_ailin','corralon_nahuel') and state='prepared')<>2
 then raise exception 'mvp092_ambiguous_supplier_invitations';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions
      where supplier_key='corralon_ailin' and request_id<>rid)<>1
 then raise exception 'mvp092_previous_quote_was_changed';end if;
 if not cotironda_piloto_privado.allow_next_pilot_send_mvp091(rid,'corralon_ailin')
 or not cotironda_piloto_privado.allow_next_pilot_send_mvp091(rid,'corralon_nahuel')
 then raise exception 'mvp091_two_suppliers_not_eligible';end if;
 if (select count(*) from cotironda_piloto_privado.whapi_outbox
 where request_id=rid and state='pending')<>2
 then raise exception 'mvp091_two_invites_not_queued';end if;
 -- No sends while outbound flag OFF, even with an eligible scope.
 result:=public.cotironda_piloto_claim_whapi_v1();
 if result->>'state'<>'outbound_disabled'
 then raise exception 'mvp091_claim_should_be_disabled';end if;
 update cotironda_piloto_privado.integration_flags
 set whatsapp_outbound_enabled=true where only_row;
 result:=public.cotironda_piloto_issue_tracking_mvp091(
 hid,source_hid,encode(extensions.gen_random_bytes(32),'hex'));
 if result->>'state'<>'issued' then raise exception 'mvp091_tracking_issue_fail';end if;
 select token_hash into token from cotironda_piloto_privado.buyer_tracking_mvp091
 where request_id=rid;
 result:=public.cotironda_piloto_tracking_status_mvp091(token);
 if result->>'state'<>'waiting' or (result->>'received_count')::integer<>0
  or (result->>'can_open')::boolean or result->'offers'<>'[]'::jsonb
 then raise exception 'mvp091_tracking_not_private_before_quote';end if;
 result:=public.cotironda_piloto_claim_whapi_v1();
 if result->>'state'<>'leased' or result->>'supplier_key' not in
  ('corralon_ailin','corralon_nahuel')
 then raise exception 'mvp091_first_claim_wrong';end if;
 lease:=(result->>'lease_token')::uuid;
 if not public.cotironda_piloto_authorize_whapi_v1(rid,result->>'supplier_key',lease)
 then raise exception 'mvp091_claim_unauthorized';end if;
 if public.cotironda_piloto_pdf_snapshot_mvp091(rid,result->>'supplier_key',lease)->>'city'<>'La Plata'
 then raise exception 'mvp091_pdf_city';end if;
 if jsonb_array_length(public.cotironda_piloto_pdf_snapshot_mvp091(
   rid,result->>'supplier_key',lease)->'items')<>2
 then raise exception 'mvp091_pdf_items';end if;
 if public.cotironda_piloto_pdf_snapshot_mvp091(
  rid,result->>'supplier_key',gen_random_uuid()) is not null
 then raise exception 'mvp091_unleased_pdf_visible';end if;
 result:=public.cotironda_piloto_claim_whapi_v1();
 if result->>'state'<>'leased'
 then raise exception 'mvp091_second_claim_missing';end if;
 result:=public.cotironda_piloto_claim_whapi_v1();
 if result->>'state'<>'empty'
 then raise exception 'mvp091_third_claim_duplicate';end if;
 -- Supplier creates genuine quote (SOURCE unmodified, versioned).
 insert into cotironda_piloto_privado.offer_versions(
 request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,'corralon_ailin',1,encode(extensions.gen_random_bytes(32),'hex'),
  '20 bolsas cemento $ 900,00'||E'\n'||'TOTAL: $ 18000,00');
 result:=public.cotironda_piloto_tracking_status_mvp091(token);
 if result->>'state'<>'waiting' or (result->>'received_count')::integer<>1
 or (result->>'can_open')::boolean or result->'offers'<>'[]'::jsonb
 then raise exception 'mvp091_quote_appeared_before_deadline';end if;
 insert into cotironda_piloto_privado.anonymous_offers_mvp091(
 request_id,supplier_key,revision_no,public_text,approved_by)
 values(rid,'corralon_ailin',1,'20 bolsas cemento $ 900,00', 'operator-test');
 result:=public.cotironda_piloto_tracking_status_mvp091(token);
 if result->'offers'<>'[]'::jsonb
 then raise exception 'mvp091_approved_quote_predeadline_leaked';end if;
 if (public.cotironda_piloto_tracking_status_mvp091(
   encode(extensions.gen_random_bytes(32),'hex'))->>'state')<>'not_found'
 then raise exception 'mvp091_invalid_token_visible';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.buyer_tracking_mvp091','SELECT')
 or has_table_privilege('authenticated',
   'cotironda_piloto_privado.anonymous_offers_mvp091','SELECT')
 then raise exception 'mvp091_private_table_grants';end if;
 -- A second buyer round in the same operator window disables all dispatches.
 insert into cotironda_piloto_privado.requests(
 buyer_key,delivery_city,original_request,source_hmac,state)
 values('arquitecto','La Plata','Prueba concurrente extra',
   encode(extensions.gen_random_bytes(32),'hex'),'prepared') returning id into second;
 if cotironda_piloto_privado.allow_next_pilot_send_mvp091(rid,'corralon_nahuel')
 then raise exception 'mvp091_more_than_one_round_allowed';end if;
end;$smoke$;
rollback;
