-- MVP-011 / D061 — read encrypted inbound quote + CURRENT trusted round items.
-- PostgreSQL17 ephemeral CI ONLY; no endpoint, NOT a Supabase migration.
-- The output is NOT an offer: worker must AES-GCM-authenticate ciphertext
-- before attempting any interpretation. D060 rechecks eligibility at WRITE.
create role cotironda_quote_reader_d061 nologin noinherit nobypassrls;
create role cotironda_quote_gateway_d061 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_quote_reader_d061,cotironda_quote_gateway_d061;
grant select on cotironda_private.whapi_inbox_v1,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.rounds_v1,
 cotironda_private.round_invites_v1,
 cotironda_private.round_items_v1,
 cotironda_private.offer_drafts_v1,
 cotironda_private.whapi_received_offers_d059
 to cotironda_quote_reader_d061;
create policy d061_read_inbox on cotironda_private.whapi_inbox_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_contact on cotironda_private.whapi_contacts_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_round on cotironda_private.rounds_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_invite on cotironda_private.round_invites_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_item on cotironda_private.round_items_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_draft on cotironda_private.offer_drafts_v1
 for select to cotironda_quote_reader_d061 using(true);
create policy d061_read_receipt on cotironda_private.whapi_received_offers_d059
 for select to cotironda_quote_reader_d061 using(true);

create function cotironda_private.whapi_quote_read_d061(p_channel text,p_message text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare m cotironda_private.whapi_inbox_v1%rowtype;
 v_expected integer;v_lines jsonb;
 v_saved integer;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_message is null or p_message !~ '^[a-f0-9]{64}$'
 then raise exception 'd061_invalid_identity' using errcode='22023';end if;
 select * into m from cotironda_private.whapi_inbox_v1
 where channel_id=p_channel and message_key=p_message;
 if not found or m.kind<>'text' or m.round_id is null then return null;end if;
 if not exists(
  select 1 from cotironda_private.whapi_contacts_v1 c
  join cotironda_private.round_invites_v1 i
   on i.round_id=m.round_id and i.supplier_org_id=c.supplier_org_id
  join cotironda_private.rounds_v1 r on r.id=i.round_id
  where c.channel_id=m.channel_id and c.chat_key=m.chat_key
   and c.supplier_org_id=m.supplier_org_id
   and c.verified_at<=pg_catalog.clock_timestamp()
   and c.consented_at<=pg_catalog.clock_timestamp()
   and c.opted_out_at is null
   and r.status='abierta'
   and pg_catalog.clock_timestamp()>=r.begins_at
   and pg_catalog.clock_timestamp()<r.ends_at
 ) then return null;end if;
 select d.revision into v_expected from cotironda_private.offer_drafts_v1 d
  where d.round_id=m.round_id and d.supplier_org_id=m.supplier_org_id;
 select s.draft_revision-1 into v_saved
  from cotironda_private.whapi_received_offers_d059 s
  where s.channel_id=m.channel_id and s.message_key=m.message_key;
 v_expected:=coalesce(v_saved,v_expected,0);
 select jsonb_agg(jsonb_build_object('itemId',i.product_code,
    'line_no',i.line_no,'unit',i.unit) order by i.line_no) into v_lines
 from cotironda_private.round_items_v1 i where i.round_id=m.round_id;
 if v_lines is null then return null;end if;
 return pg_catalog.jsonb_build_object(
  'channel',m.channel_id,'messageKey',m.message_key,'chatKey',m.chat_key,
  'supplierOrgId',m.supplier_org_id,'roundId',m.round_id,
  'kind',m.kind,'sourceUnix',m.source_unix,'cryptoKeyId',m.crypto_key_id,
  'fingerprint',m.payload_fingerprint,
  'cipherHex',pg_catalog.encode(m.payload_ciphertext,'hex'),
  'nonceHex',pg_catalog.encode(m.payload_nonce,'hex'),
  'tagHex',pg_catalog.encode(m.payload_tag,'hex'),
  'expectedRevision',v_expected,'roundItems',v_lines);
end;$fn$;
grant create on schema cotironda_private to cotironda_quote_reader_d061;
grant cotironda_quote_reader_d061 to postgres with set true,inherit false;
alter function cotironda_private.whapi_quote_read_d061(text,text)
 owner to cotironda_quote_reader_d061;
revoke cotironda_quote_reader_d061 from postgres;
revoke create on schema cotironda_private from cotironda_quote_reader_d061;
revoke all on function cotironda_private.whapi_quote_read_d061(text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_quote_read_d061(text,text)
 to cotironda_quote_gateway_d061;
comment on function cotironda_private.whapi_quote_read_d061(text,text) is
 'D061 CI-only read encrypted text from persisted supplier inbox + round snapshot; not exposed via Data API';
