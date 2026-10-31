-- MVP-009 / Issue #231: WhatsApp inbox -> accepted supplier offer in ONE transaction.
-- PostgreSQL 17 disposable CI ONLY; NOT a Supabase migration or public endpoint.
-- The authenticated broker saves a verified, linked D028 inbox message before calling.
-- Sending a quote IS acceptance of its contents; NEVER require "Confirmo".
-- WARNING: semantic authenticity of decrypted source/text is the broker's obligation.
create role cotironda_receive_writer_d059 nologin noinherit nobypassrls;
create role cotironda_receive_gateway_d059 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_receive_writer_d059,cotironda_receive_gateway_d059;
grant select on cotironda_private.whapi_inbox_v1 to cotironda_receive_writer_d059;
create policy d059_inbox_read on cotironda_private.whapi_inbox_v1
 for select to cotironda_receive_writer_d059 using(true);
grant execute on function
 cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb),
 cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)
 to cotironda_receive_writer_d059;

-- Immutable provenance linking exact incoming chat message to VERSION accepted.
-- No cleartext/phone/PII is stored here.
create table cotironda_private.whapi_received_offers_d059 (
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 draft_revision integer not null check(draft_revision between 1 and 100000),
 version integer not null check(version between 1 and 100000),
 confirm_event_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 unique(round_id,supplier_org_id,draft_revision),
 unique(round_id,confirm_event_id),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_inbox_v1(channel_id,message_key)
  on delete restrict,
 foreign key(round_id,supplier_org_id,draft_revision)
  references cotironda_private.whapi_offer_sources_d048(round_id,supplier_org_id,revision)
  on delete restrict,
 foreign key(round_id,supplier_org_id,version)
  references cotironda_private.offer_versions_v1(round_id,supplier_org_id,version)
  on delete restrict,
 foreign key(round_id,confirm_event_id)
  references cotironda_private.offer_versions_v1(round_id,confirmation_event_id)
  on delete restrict
);
alter table cotironda_private.whapi_received_offers_d059 enable row level security;
revoke all on cotironda_private.whapi_received_offers_d059
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_received_offers_d059
 to cotironda_receive_writer_d059;
create policy d059_receipt_read on cotironda_private.whapi_received_offers_d059
 for select to cotironda_receive_writer_d059 using(true);
create policy d059_receipt_insert on cotironda_private.whapi_received_offers_d059
 for insert to cotironda_receive_writer_d059 with check(true);
create trigger d059_immutable_receipt
 before update or delete on cotironda_private.whapi_received_offers_d059
 for each row execute function cotironda_private.reject_immutable_quote_v1();

create function cotironda_private.whapi_receive_quote_d059(
 p_channel text,
 p_message_key text,
 p_expected_revision integer,
 p_offer jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_inbox cotironda_private.whapi_inbox_v1%rowtype;
 v_prior cotironda_private.whapi_received_offers_d059%rowtype;
 v_draft_event uuid;
 v_version_event uuid;
 v_sha text;
 v_draft jsonb;
 v_confirm jsonb;
 v_version integer;
 v_revision integer;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
   or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
   or p_expected_revision is null or p_expected_revision<0
   or p_expected_revision>=100000
   or pg_catalog.jsonb_typeof(p_offer) is distinct from 'object'
 then raise exception 'd059_invalid_input' using errcode='22023'; end if;
 -- Never accept an organization or supplier identity from caller's JSON.
 v_sha:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('channel',p_channel,'message',p_message_key,
    'expected',p_expected_revision,'quote',p_offer)::text,'UTF8')),'hex');
 -- Draft/confirmation event IDs are bound to SOURCE, not supplied by the IA.
 v_draft_event:=pg_catalog.md5('cotironda:d059:draft:'||p_channel||':'||p_message_key)::uuid;
 v_version_event:=pg_catalog.md5('cotironda:d059:version:'||p_channel||':'||p_message_key)::uuid;
 select * into v_inbox from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message_key;
 if not found or v_inbox.kind<>'text' or v_inbox.round_id is null
 then raise exception 'd059_inbox_not_verified' using errcode='42501';end if;

 -- Exact replay is harmless, even after later corrections or close/BAJA.
 -- A different payload with the same message ID is NEVER accepted.
 select * into v_prior from cotironda_private.whapi_received_offers_d059
  where channel_id=p_channel and message_key=p_message_key;
 if found then
  if v_prior.round_id<>v_inbox.round_id
     or v_prior.supplier_org_id<>v_inbox.supplier_org_id
     or v_prior.request_sha256<>v_sha
     or v_prior.draft_revision<>p_expected_revision+1
     or v_prior.confirm_event_id<>v_version_event
  then raise exception 'd059_replay_conflict' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object('state','offer_received',
    'revision',v_prior.draft_revision,
    'version',v_prior.version,'repeated',true);
 end if;

 -- D048 derives supplier/round from encrypted inbox; checks consent/BAJA,
 -- invitation, round window, source fingerprint and draft revision.
 v_draft:=cotironda_private.whapi_save_draft_from_inbox_d048(
   p_channel,p_message_key,v_draft_event,p_expected_revision,p_offer);
 if v_draft->>'repeated'<>'false'
 then raise exception 'd059_preexisting_draft_unlinked' using errcode='23505';end if;
 v_revision:=(v_draft->>'revision')::integer;
 if v_revision<>p_expected_revision+1
 then raise exception 'd059_unexpected_revision' using errcode='40001';end if;

 -- D026 uses the legacy name "confirmed" for a version. Here it means
 -- RECEIVED from authenticated supplier; no confirmation message exists.
 -- D026 does NOT require IVA/freight/payment/margin to be known.
 v_confirm:=cotironda_private.confirm_offer_atomic_v1(
   v_inbox.round_id,v_inbox.supplier_org_id,v_version_event,v_revision);
 if v_confirm->>'repetido'<>'false'
 then raise exception 'd059_version_preexisting_without_receipt' using errcode='23505';end if;
 v_version:=(v_confirm->>'version')::integer;
 insert into cotironda_private.whapi_received_offers_d059
 (channel_id,message_key,round_id,supplier_org_id,draft_revision,
  version,confirm_event_id,request_sha256)
 values(p_channel,p_message_key,v_inbox.round_id,v_inbox.supplier_org_id,
  v_revision,v_version,v_version_event,v_sha);
 return pg_catalog.jsonb_build_object('state','offer_received',
  'revision',v_revision,'version',v_version,'repeated',false);
end;$fn$;

-- No login, no generic service_role, no direct table writes.
grant create on schema cotironda_private to cotironda_receive_writer_d059;
grant cotironda_receive_writer_d059 to postgres with set true,inherit false;
alter function cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)
 owner to cotironda_receive_writer_d059;
revoke cotironda_receive_writer_d059 from postgres;
revoke create on schema cotironda_private from cotironda_receive_writer_d059;
revoke all on function cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)
 to cotironda_receive_gateway_d059;
comment on function cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)
 is 'MVP-009 offline CI: quote submitted => version; no Confirmo. Requires authenticated inbox broker; NOT public Supabase RPC.';
