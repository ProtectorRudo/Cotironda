-- MVP119. Run with already staged scripts MVP101..119 in ONE transaction.
-- No network, no real WhatsApp, no persists; all fixtures ROLLBACK.
begin;
do $smoke$
declare
 rid uuid:=gen_random_uuid();now_ timestamptz:=clock_timestamp();
 buyer_hmac text;supplier_hmac text;token text;
 supplier_mid text:='MsgSupplierProof120260000000001';
 buyer_mid text:='MsgBuyerProof12026000000000002';
 finalist_mid text:='MsgFinalistProof12026000000003';
 ts bigint:=extract(epoch from clock_timestamp())::bigint;
 out_ jsonb;n integer;
begin
 select chat_hmac into buyer_hmac from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer';
 select chat_hmac into supplier_hmac from cotironda_piloto_privado.participants
 where key='corralon_ailin' and participant_role='supplier';
 if buyer_hmac is null or supplier_hmac is null then
  raise exception 'mvp119_missing_participants';end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.requests(
  id,buyer_key,delivery_city,original_request,source_hmac,
  state,created_at,round_days,closes_at)
 values(rid,'arquitecto','La Plata',
  '10 bolsas de cemento CPC 50 kg, confirmar entrega en La Plata',
  encode(extensions.gen_random_bytes(32),'hex'),
  'prepared',now_,4,now_+interval '4 days');
 insert into cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 values(rid,1,'Cemento CPC 50 kg',10,'bag','cemento_gris_obra');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key,state)
 values(rid,'corralon_ailin','prepared');
 -- The original outbound trigger queues a private message. Mark API-accepted
 -- ONLY inside this transaction; no live HTTP request is performed.
 update cotironda_piloto_privado.whapi_outbox
 set state='api_accepted',whapi_message_id=supplier_mid
 where request_id=rid and supplier_key='corralon_ailin';

 -- Never infer 2 ticks from Whapi API accepted response.
 if exists(select 1 from cotironda_piloto_privado.delivery_receipts_mvp119
    where request_id=rid) then raise exception 'mvp119_false_delivery';end if;

 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'sent',2,supplier_hmac,ts);
 if out_->>'state'<>'recorded' then
  raise exception 'mvp119_not_recorded %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'delivered',3,supplier_hmac,ts);
 if out_->>'state'<>'advanced' then
  raise exception 'mvp119_not_delivered %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'sent',2,supplier_hmac,ts-1);
 if out_->>'state'<>'unchanged' then
  raise exception 'mvp119_older_status_downgraded %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'delivered',3,supplier_hmac,ts);
 if out_->>'state'<>'unchanged' then
  raise exception 'mvp119_duplicate_status %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'failed',0,supplier_hmac,ts+1);
 if out_->>'state'<>'unchanged' then
  raise exception 'mvp119_failed_overrode_delivery %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'read',4,supplier_hmac,ts+1);
 if out_->>'state'<>'advanced' then
  raise exception 'mvp119_read_missing %',out_;end if;

 -- Spoofed recipient or unknown API id must not produce delivery evidence.
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  supplier_mid,'played',5,buyer_hmac,ts+1);
 if out_->>'state'<>'unmatched' then
  raise exception 'mvp119_wrong_recipient_accepted %',out_;end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  'UnknownProof12026000000000002','delivered',3,supplier_hmac,ts);
 if out_->>'state'<>'unmatched' then
  raise exception 'mvp119_unknown_message_accepted %',out_;end if;

 -- Tracking message is not deliverable until actual Whapi API id is persisted.
 insert into cotironda_piloto_privado.buyer_tracking_mvp091(
  request_id,token_hash,expires_at,send_state,send_attempted_at)
 values(rid,token,now_+interval '7 days','api_accepted',now_);
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  buyer_mid,'delivered',3,buyer_hmac,ts);
 if out_->>'state'<>'unmatched' then
  raise exception 'mvp119_buyer_without_id';end if;
 if not public.cotironda_piloto_record_tracking_id_mvp119(token,buyer_mid)
 then raise exception 'mvp119_buyer_id_not_recorded';end if;
 if public.cotironda_piloto_record_tracking_id_mvp119(token,buyer_mid)
 then raise exception 'mvp119_buyer_id_overwritten';end if;
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  buyer_mid,'delivered',3,buyer_hmac,ts);
 if out_->>'state'<>'recorded' then
  raise exception 'mvp119_buyer_delivery_not_recorded %',out_;end if;

 -- Finalist worker is disabled, but a synthetic accepted ledger proves
 -- the matched ID route. It does NOT simulate contacting anyone.
 insert into cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
  request_id,recipient_key,state,whapi_message_id)
 values(rid,'corralon_ailin','api_accepted',finalist_mid);
 out_:=public.cotironda_piloto_record_delivery_mvp119(
  finalist_mid,'delivered',3,supplier_hmac,ts);
 if out_->>'state'<>'recorded' then
  raise exception 'mvp119_finalist_not_recorded %',out_;end if;

 select count(*) into n from cotironda_piloto_privado.delivery_receipts_mvp119
 where request_id=rid and state in ('delivered','read','played');
 if n<>3 then raise exception 'mvp119_wrong_proven_count %',n;end if;
 if has_table_privilege('anon',
  'cotironda_piloto_privado.delivery_receipts_mvp119','SELECT') or
  has_table_privilege('authenticated',
  'cotironda_piloto_privado.delivery_receipts_mvp119','SELECT')
 then raise exception 'mvp119_receipt_public';end if;
 if exists(select 1 from cotironda_piloto_privado.delivery_receipts_mvp119
 where message_id_sha256=supplier_mid or message_id_sha256=buyer_mid)
 then raise exception 'mvp119_plaintext_ids_leaked';end if;
end $smoke$;
rollback;
