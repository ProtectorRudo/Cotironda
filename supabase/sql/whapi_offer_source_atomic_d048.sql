-- D048 / Issue #199 / PostgreSQL 17 disposable CI ONLY.
-- Atomic provenance: a trusted broker maps one D028 encrypted inbox message
-- to exactly one D026 draft revision. No text/phone/secret/remote operations.
-- NOT evidence of semantic accuracy of the broker's extraction.
create role cotironda_source_writer nologin noinherit nobypassrls;
create role cotironda_source_gateway nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_source_writer,cotironda_source_gateway;
grant select on cotironda_private.whapi_inbox_v1,
  cotironda_private.whapi_contacts_v1,
  cotironda_private.rounds_v1,
  cotironda_private.round_invites_v1,
  cotironda_private.offer_drafts_v1,
  cotironda_private.offer_events_v1
 to cotironda_source_writer;
-- SHARE lock on contact serializes against D028 BAJA, without enabling updates.
grant update(opted_out_at) on cotironda_private.whapi_contacts_v1
 to cotironda_source_writer;
create policy d048_source_inbox_select on cotironda_private.whapi_inbox_v1
 for select to cotironda_source_writer using(true);
create policy d048_source_contact_select on cotironda_private.whapi_contacts_v1
 for select to cotironda_source_writer using(true);
create policy d048_source_contact_lock on cotironda_private.whapi_contacts_v1
 for update to cotironda_source_writer using(true) with check(false);
create policy d048_source_round_select on cotironda_private.rounds_v1
 for select to cotironda_source_writer using(true);
create policy d048_source_invite_select on cotironda_private.round_invites_v1
 for select to cotironda_source_writer using(true);
create policy d048_source_draft_select on cotironda_private.offer_drafts_v1
 for select to cotironda_source_writer using(true);
create policy d048_source_event_select on cotironda_private.offer_events_v1
 for select to cotironda_source_writer using(true);
grant execute on function
 cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb)
 to cotironda_source_writer;

create table cotironda_private.whapi_offer_sources_d048 (
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 revision integer not null check(revision between 1 and 100000),
 event_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 unique(round_id,supplier_org_id,revision),
 unique(round_id,event_id),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_inbox_v1(channel_id,message_key) on delete restrict,
 foreign key(round_id,supplier_org_id)
  references cotironda_private.offer_drafts_v1(round_id,supplier_org_id) on delete restrict,
 foreign key(round_id,event_id)
  references cotironda_private.offer_events_v1(round_id,event_id) on delete restrict
);
alter table cotironda_private.whapi_offer_sources_d048 enable row level security;
revoke all on cotironda_private.whapi_offer_sources_d048
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_offer_sources_d048
 to cotironda_source_writer;
create policy d048_link_select on cotironda_private.whapi_offer_sources_d048
 for select to cotironda_source_writer using(true);
create policy d048_link_insert on cotironda_private.whapi_offer_sources_d048
 for insert to cotironda_source_writer with check(true);

create function cotironda_private.whapi_save_draft_from_inbox_d048(
 p_channel text,p_message_key text,p_event uuid,p_expected_revision integer,p_offer jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_msg cotironda_private.whapi_inbox_v1%rowtype;
 v_contact cotironda_private.whapi_contacts_v1%rowtype;
 v_link cotironda_private.whapi_offer_sources_d048%rowtype;
 v_sha text;
 v_out jsonb;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
    or p_event is null
    or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>=100000
    or pg_catalog.jsonb_typeof(p_offer)<>'object'
 then raise exception 'd048_bad_input' using errcode='22023'; end if;
 v_sha:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object(
     'source_channel',p_channel,'source_key',p_message_key,
     'event',p_event,'expected',p_expected_revision,'offer',p_offer)::text,
   'UTF8')),'hex');
 select * into v_msg from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message_key;
 if not found or v_msg.kind<>'text' or v_msg.round_id is null
 then raise exception 'd048_source_not_found' using errcode='42501';end if;
 -- Contact lock and state checked before D026 locks the round row.
 select * into v_contact from cotironda_private.whapi_contacts_v1
  where channel_id=v_msg.channel_id and chat_key=v_msg.chat_key
   and supplier_org_id=v_msg.supplier_org_id for share;
 if not found or v_contact.opted_out_at is not null or
   v_contact.consented_at>pg_catalog.clock_timestamp() or
   v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'd048_contact_not_active' using errcode='42501';end if;
 select * into v_link from cotironda_private.whapi_offer_sources_d048
  where channel_id=p_channel and message_key=p_message_key;
 if found then
   if v_link.request_sha256<>v_sha or v_link.event_id<>p_event or
      v_link.revision<>p_expected_revision+1 or
      v_link.round_id<>v_msg.round_id or
      v_link.supplier_org_id<>v_msg.supplier_org_id
   then raise exception 'd048_source_reused' using errcode='23505';end if;
   return pg_catalog.jsonb_build_object('state','linked','revision',
     v_link.revision,'repeated',true);
 end if;
 -- Supplier/round identity is DERIVED from the private inbox, never input.
 -- D026 checks invitation, open window, matching line items, and optimistic revision.
 v_out:=cotironda_private.save_offer_draft_atomic_v1(
   v_msg.round_id,v_msg.supplier_org_id,p_event,p_expected_revision,p_offer);
 if v_out->>'repetido'='true'
 then raise exception 'd048_event_preexisting_without_source' using errcode='23505';end if;
 if (v_out->>'revision')::integer <> p_expected_revision+1
 then raise exception 'd048_unexpected_revision' using errcode='40001';end if;
 insert into cotironda_private.whapi_offer_sources_d048
   (channel_id,message_key,round_id,supplier_org_id,revision,event_id,request_sha256)
 values(p_channel,p_message_key,v_msg.round_id,v_msg.supplier_org_id,
    p_expected_revision+1,p_event,v_sha);
 return pg_catalog.jsonb_build_object('state','linked','revision',
    p_expected_revision+1,'repeated',false);
end;$fn$;

-- Guard on ALL D047 outbox jobs. A stored Whapi message by itself is NOT proof
-- it led to that draft; only the atomic D048 source linkage authorizes the job.
create function cotironda_private.whapi_reply_source_guard_d048()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if not exists(
  select 1 from cotironda_private.whapi_offer_sources_d048 src
   where src.channel_id=new.channel_id and src.message_key=new.message_key
     and src.round_id=new.round_id
     and src.supplier_org_id=new.supplier_org_id
     and src.revision=new.revision
 ) then raise exception 'd048_outbox_unlinked_source' using errcode='42501';end if;
 return new;
end;$fn$;
create trigger d048_outbox_require_source
 before insert or update of round_id,supplier_org_id,revision,channel_id,message_key
 on cotironda_private.whapi_reply_jobs_d047 for each row
 execute function cotironda_private.whapi_reply_source_guard_d048();

grant create on schema cotironda_private to cotironda_source_writer;
grant cotironda_source_writer to postgres with set true,inherit false;
alter function
 cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)
 owner to cotironda_source_writer;
alter function cotironda_private.whapi_reply_source_guard_d048()
 owner to cotironda_source_writer;
revoke cotironda_source_writer from postgres;
revoke create on schema cotironda_private from cotironda_source_writer;
revoke all on function
 cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb),
 cotironda_private.whapi_reply_source_guard_d048()
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)
 to cotironda_source_gateway;
-- No SQL LOGIN is provisioned for source_gateway or source_writer.
