-- D049 / Issue #201. ONLY PostgreSQL17 disposable CI, NO Supabase DEV migration.
-- A trusted broker MUST verify decrypted "Confirmo" as a REPLY TO the exact
-- outbound message accepted by transport. This SQL cannot authenticate text
-- semantics or the Whapi reply-to metadata; it proves DB linkage only.
create role cotironda_confirm_writer nologin noinherit nobypassrls;
create role cotironda_confirm_gateway nologin noinherit nobypassrls;
grant usage on schema cotironda_private
 to cotironda_confirm_writer,cotironda_confirm_gateway;
grant select on
 cotironda_private.whapi_inbox_v1,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.rounds_v1,
 cotironda_private.offer_drafts_v1,
 cotironda_private.whapi_offer_sources_d048,
 cotironda_private.whapi_reply_jobs_d047,
 cotironda_private.offer_versions_v1
 to cotironda_confirm_writer;
-- FOR SHARE needs UPDATE privilege + policy, but WITH CHECK(false) denies
-- modifications. This lock serializes BAJA with confirmation.
grant update(opted_out_at) on cotironda_private.whapi_contacts_v1
 to cotironda_confirm_writer;
create policy d049_inbox_read on cotironda_private.whapi_inbox_v1
 for select to cotironda_confirm_writer using(true);
create policy d049_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_confirm_writer using(true);
create policy d049_contact_lock on cotironda_private.whapi_contacts_v1
 for update to cotironda_confirm_writer using(true) with check(false);
create policy d049_round_read on cotironda_private.rounds_v1
 for select to cotironda_confirm_writer using(true);
create policy d049_draft_read on cotironda_private.offer_drafts_v1
 for select to cotironda_confirm_writer using(true);
create policy d049_source_read on cotironda_private.whapi_offer_sources_d048
 for select to cotironda_confirm_writer using(true);
create policy d049_outbox_read on cotironda_private.whapi_reply_jobs_d047
 for select to cotironda_confirm_writer using(true);
create policy d049_versions_read on cotironda_private.offer_versions_v1
 for select to cotironda_confirm_writer using(true);
grant execute on function
 cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)
 to cotironda_confirm_writer;

-- Durable receipt for a CONFIRMED version. The inbox source, outbound job,
-- D048 draft and D026 version must all agree. No phones or decrypted text.
create table cotironda_private.whapi_confirm_sources_d049 (
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 draft_revision integer not null check(draft_revision between 1 and 100000),
 reply_job_id uuid not null,
 confirm_event_id uuid not null,
 confirmed_version integer not null check(confirmed_version>0),
 verified_reply_ack_hmac text not null check(verified_reply_ack_hmac ~ '^[a-f0-9]{64}$'),
 intent_hmac text not null check(intent_hmac ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 unique(round_id,supplier_org_id,draft_revision),
 unique(round_id,confirm_event_id),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_inbox_v1(channel_id,message_key)
  on delete restrict,
 foreign key(reply_job_id)
  references cotironda_private.whapi_reply_jobs_d047(job_id)
  on delete restrict,
 foreign key(round_id,supplier_org_id,draft_revision)
  references cotironda_private.whapi_offer_sources_d048(round_id,supplier_org_id,revision)
  on delete restrict,
 foreign key(round_id,confirm_event_id)
  references cotironda_private.offer_versions_v1(round_id,confirmation_event_id)
  on delete restrict,
 foreign key(round_id,supplier_org_id,confirmed_version)
  references cotironda_private.offer_versions_v1(round_id,supplier_org_id,version)
  on delete restrict
);
alter table cotironda_private.whapi_confirm_sources_d049 enable row level security;
revoke all on cotironda_private.whapi_confirm_sources_d049
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_confirm_sources_d049
 to cotironda_confirm_writer;
create policy d049_receipt_read on cotironda_private.whapi_confirm_sources_d049
 for select to cotironda_confirm_writer using(true);
create policy d049_receipt_insert on cotironda_private.whapi_confirm_sources_d049
 for insert to cotironda_confirm_writer with check(true);

create function cotironda_private.whapi_confirm_from_inbox_d049(
 p_channel text,
 p_message_key text,
 p_reply_job uuid,
 p_confirmation_event uuid,
 p_verified_reply_ack_hmac text,
 p_intent_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_inbox cotironda_private.whapi_inbox_v1%rowtype;
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_source cotironda_private.whapi_offer_sources_d048%rowtype;
 v_draft cotironda_private.offer_drafts_v1%rowtype;
 v_prior cotironda_private.whapi_confirm_sources_d049%rowtype;
 v_receipt jsonb;
 v_version integer;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
  or p_reply_job is null or p_confirmation_event is null
  or p_verified_reply_ack_hmac is null or p_verified_reply_ack_hmac !~ '^[a-f0-9]{64}$'
  or p_intent_hmac is null or p_intent_hmac !~ '^[a-f0-9]{64}$'
 then raise exception 'd049_invalid_input' using errcode='22023';end if;

 select * into v_inbox from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message_key;
 if not found or v_inbox.kind<>'text' or v_inbox.round_id is null
 then raise exception 'd049_message_not_verified' using errcode='42501';end if;

 -- Replay after a successful commit, including after round close / BAJA.
 -- No new confirmation; foreign keys and identity were checked on first save.
 select * into v_prior from cotironda_private.whapi_confirm_sources_d049
  where channel_id=p_channel and message_key=p_message_key;
 if found then
   if v_prior.round_id<>v_inbox.round_id
      or v_prior.supplier_org_id<>v_inbox.supplier_org_id
      or v_prior.reply_job_id<>p_reply_job
      or v_prior.confirm_event_id<>p_confirmation_event
      or v_prior.verified_reply_ack_hmac<>p_verified_reply_ack_hmac
      or v_prior.intent_hmac<>p_intent_hmac
   then raise exception 'd049_message_replay_collision' using errcode='23505';end if;
   return pg_catalog.jsonb_build_object('state','offer_confirmed',
    'version',v_prior.confirmed_version,
    'revision',v_prior.draft_revision,'repeated',true);
 end if;

 select * into v_contact from cotironda_private.whapi_contacts_v1
  where channel_id=v_inbox.channel_id and chat_key=v_inbox.chat_key
   and supplier_org_id=v_inbox.supplier_org_id for share;
 if not found or v_contact.opted_out_at is not null
   or v_contact.verified_at>pg_catalog.clock_timestamp()
   or v_contact.consented_at>pg_catalog.clock_timestamp()
 then raise exception 'd049_consent_or_contact_missing' using errcode='42501';end if;

 select * into v_job from cotironda_private.whapi_reply_jobs_d047
  where job_id=p_reply_job;
 if not found or v_job.status<>'accepted_by_transport'
    or v_job.transport_ack_key is distinct from p_verified_reply_ack_hmac
    or v_job.accepted_at is null
    or v_job.channel_id<>v_inbox.channel_id
    or v_job.chat_key<>v_inbox.chat_key
    or v_job.round_id<>v_inbox.round_id
    or v_job.supplier_org_id<>v_inbox.supplier_org_id
    or v_job.message_key=v_inbox.message_key
 then raise exception 'd049_wrong_outbound_or_reply' using errcode='42501';end if;

 select * into v_source from cotironda_private.whapi_offer_sources_d048
  where round_id=v_job.round_id and supplier_org_id=v_job.supplier_org_id
   and revision=v_job.revision
   and channel_id=v_job.channel_id and message_key=v_job.message_key;
 if not found then raise exception 'd049_draft_without_source' using errcode='42501';end if;

 select * into v_draft from cotironda_private.offer_drafts_v1
  where round_id=v_job.round_id and supplier_org_id=v_job.supplier_org_id;
 if not found or v_draft.revision<>v_job.revision
 then raise exception 'd049_stale_draft' using errcode='40001';end if;

 -- D026 deliberately permits incomplete drafts, but D049 MUST NOT confirm
 -- missing IVA, net price, payment, freight, minimum order or lead days.
 if v_draft.payment_method is null or v_draft.lead_days is null
  or v_draft.freight_gross is null or v_draft.min_goods_gross is null
  or exists(select 1 from pg_catalog.jsonb_array_elements(v_draft.lines_snapshot) line
    where pg_catalog.jsonb_typeof(line->'net_unit_price')='null'
       or pg_catalog.jsonb_typeof(line->'vat_rate')='null'
       or not (line ? 'net_unit_price')
       or not (line ? 'vat_rate'))
 then raise exception 'd049_incomplete_terms' using errcode='22023';end if;

 -- This is the SAME DB transaction: v_draft validated, D026 locks round and
 -- draft again, creates immutable version; receipt ties it to inbound message.
 v_receipt:=cotironda_private.confirm_offer_atomic_v1(
   v_job.round_id,v_job.supplier_org_id,p_confirmation_event,v_job.revision);
 if v_receipt->>'repetido'<>'false'
 then raise exception 'd049_event_preexisting_without_receipt' using errcode='23505';end if;
 v_version:=(v_receipt->>'version')::integer;
 insert into cotironda_private.whapi_confirm_sources_d049
  (channel_id,message_key,round_id,supplier_org_id,draft_revision,
   reply_job_id,confirm_event_id,confirmed_version,verified_reply_ack_hmac,intent_hmac)
 values(v_inbox.channel_id,v_inbox.message_key,v_inbox.round_id,
  v_inbox.supplier_org_id,v_job.revision,p_reply_job,p_confirmation_event,
  v_version,p_verified_reply_ack_hmac,p_intent_hmac);
 return pg_catalog.jsonb_build_object('state','offer_confirmed',
   'version',v_version,'revision',v_job.revision,'repeated',false);
end;$fn$;

-- Owner is a least-privilege, non-login role; NOT postgres or a bypass-RLS role.
grant create on schema cotironda_private to cotironda_confirm_writer;
grant cotironda_confirm_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_confirm_from_inbox_d049(
 text,text,uuid,uuid,text,text) owner to cotironda_confirm_writer;
revoke cotironda_confirm_writer from postgres;
revoke create on schema cotironda_private from cotironda_confirm_writer;
revoke all on function cotironda_private.whapi_confirm_from_inbox_d049(
 text,text,uuid,uuid,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_confirm_from_inbox_d049(
 text,text,uuid,uuid,text,text)
 to cotironda_confirm_gateway;
-- NO actual login, Whapi token or webhook route is provisioned in D049.
