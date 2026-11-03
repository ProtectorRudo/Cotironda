-- MVP-110 / PILOTO ONLY. SQL never sends WhatsApp and never decrypts
-- participant contacts. Automatic delivery is disabled by default.
-- MVP-113 hardening of the NOT-YET-INSTALLED MVP-110 schema:
-- A fresh pilot must never backfill WhatsApp notifications from historical
-- rounds when the worker is first enabled. It is OFF by default. Only a
-- privileged SQL operator can enable it, at an explicit UTC timestamp.
create table cotironda_piloto_privado.finalist_activation_mvp113(
 only_row boolean primary key default true check(only_row),
 enabled boolean not null default false,
 activated_at timestamptz,
 check(not enabled or activated_at is not null)
);
insert into cotironda_piloto_privado.finalist_activation_mvp113(
 only_row,enabled,activated_at) values(true,false,null);
alter table cotironda_piloto_privado.finalist_activation_mvp113
 enable row level security;
revoke all on cotironda_piloto_privado.finalist_activation_mvp113
 from public,anon,authenticated,service_role;

create table cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 recipient_key text not null references cotironda_piloto_privado.participants(key),
 state text not null default 'pending'
  check(state in ('pending','leased','api_accepted','uncertain')),
 lease_token uuid,
 leased_at timestamptz,
 completed_at timestamptz,
 whapi_message_id text check(length(whapi_message_id)<=160),
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,recipient_key),
 check((state='leased' and lease_token is not null and leased_at is not null)
  or state<>'leased')
);
alter table cotironda_piloto_privado.finalist_whapi_outbox_mvp110
 enable row level security;
revoke all on cotironda_piloto_privado.finalist_whapi_outbox_mvp110
 from public,anon,authenticated,service_role;

-- A complete shortlist needs a buyer and each selected supplier to opt in
-- to mutual contact disclosure. A closed round alone authorizes NO disclosure.
create function public.cotironda_piloto_queue_finalists_mvp110(
 p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r_ record;consent_ jsonb;count_ integer:=0;v text;
begin
 if p_request is null then return jsonb_build_object('state','invalid');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled
      and whatsapp_outbound_enabled)
 then return jsonb_build_object('state','outbound_disabled');end if;
 if not exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
    where only_row and enabled and activated_at<=clock_timestamp())
 then return jsonb_build_object('state','pilot_finalist_off');end if;
 select req.id,req.buyer_key,plan.supplier_keys,plan.candidate_count
 into r_ from cotironda_piloto_privado.requests req
 join cotironda_piloto_privado.finalist_activation_mvp113 activation
  on activation.only_row and activation.enabled
    and activation.activated_at<=clock_timestamp()
    and req.created_at>=activation.activated_at
 join cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
  on plan.request_id=req.id
  and plan.state in ('two_complete_alternatives','one_complete_alternative','two_supplier_combination')
 where req.id=p_request and req.state='closed'
  and req.closes_at<=clock_timestamp()
  and req.buyer_key='arquitecto' and req.delivery_city='La Plata'
 for update of req;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 if r_.candidate_count not between 1 and 2 or
   cardinality(r_.supplier_keys)<>r_.candidate_count
 then return jsonb_build_object('state','invalid_plan');end if;
 consent_:=public.cotironda_piloto_finalist_contacts_mvp109(p_request);
 if consent_->>'state'<>'ready_private' or
   (consent_->>'count')::integer<>r_.candidate_count+1
 then return jsonb_build_object('state','consent_or_contact_missing');end if;
 -- Atomic batch; unique (round,recipient). Repeated scheduler ticks do not
 -- create a second message for any party even if Whapi times out.
 insert into cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
  request_id,recipient_key)
 select p_request,x.key from (
  select r_.buyer_key as key
  union all
  select unnest(r_.supplier_keys)
 ) x
 on conflict do nothing;
 get diagnostics count_=row_count;
 return jsonb_build_object('state','queued','created',count_,
  'total_recipients',r_.candidate_count+1,
  'messages_sent',false,'contacts_revealed',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_queue_finalists_mvp110(uuid)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_queue_finalists_mvp110(uuid) to service_role;

-- Called by a private worker (not a public browser) every ~5 minutes. The
-- preexisting SQL-only cron closes overdue rounds first.
create function public.cotironda_piloto_prepare_finalists_due_mvp110(
 p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rq record;v jsonb;planned integer:=0;queued integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 25
 then return jsonb_build_object('state','invalid_limit');end if;
 if not exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
    where only_row and enabled and activated_at<=clock_timestamp())
 then return jsonb_build_object('state','pilot_finalist_off');end if;
 for rq in select r.id
  from cotironda_piloto_privado.requests r
  join cotironda_piloto_privado.finalist_activation_mvp113 activation
   on activation.only_row and activation.enabled
     and activation.activated_at<=clock_timestamp()
     and r.created_at>=activation.activated_at
  where r.state='closed' and r.closes_at<=clock_timestamp()
    and r.buyer_key='arquitecto' and r.delivery_city='La Plata'
  order by r.closes_at,r.id limit p_limit
 loop
  if not exists(select 1 from
     cotironda_piloto_privado.finalist_coverage_plans_mvp108 p
     where p.request_id=rq.id) then
   v:=public.cotironda_piloto_plan_coverage_finalists_mvp108(rq.id);
   if v->>'state' in ('two_complete_alternatives',
    'one_complete_alternative','no_complete_alternatives')
   then planned:=planned+1;end if;
  end if;
  v:=public.cotironda_piloto_queue_finalists_mvp110(rq.id);
  if v->>'state'='queued' then
   queued:=queued+coalesce((v->>'created')::integer,0);end if;
 end loop;
 return jsonb_build_object('state','processed','plans_created',planned,
   'messages_queued',queued,'messages_sent',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_prepare_finalists_due_mvp110(integer)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_prepare_finalists_due_mvp110(integer)
 to service_role;

create function public.cotironda_piloto_claim_finalist_whapi_mvp110()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare one_ record;v uuid;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled
    and whatsapp_outbound_enabled)
 then return jsonb_build_object('state','outbound_disabled');end if;
 if not exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
    where only_row and enabled and activated_at<=clock_timestamp())
 then return jsonb_build_object('state','pilot_finalist_off');end if;
 select o.request_id,o.recipient_key into one_
 from cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
 join cotironda_piloto_privado.requests r on r.id=o.request_id
 join cotironda_piloto_privado.finalist_activation_mvp113 activation
  on activation.only_row and activation.enabled
    and activation.activated_at<=clock_timestamp()
    and r.created_at>=activation.activated_at
 join cotironda_piloto_privado.participants p on p.key=o.recipient_key
 join cotironda_piloto_privado.contact_reveal_consents_mvp109 c
  on c.participant_key=p.key and c.approved_at is not null
   and c.revoked_at is null
 where o.state='pending' and r.state='closed'
  and r.closes_at<=clock_timestamp()
  and p.consent_at is not null and p.opted_out_at is null
 order by o.created_at,o.request_id,o.recipient_key
 for update of o skip locked limit 1;
 if not found then return jsonb_build_object('state','empty');end if;
 v:=pg_catalog.gen_random_uuid();
 update cotironda_piloto_privado.finalist_whapi_outbox_mvp110
 set state='leased',lease_token=v,leased_at=clock_timestamp()
 where request_id=one_.request_id and recipient_key=one_.recipient_key;
 return jsonb_build_object('state','leased',
   'request_id',one_.request_id,'recipient_key',one_.recipient_key,
   'lease_token',v);
end;$fn$;
revoke all on function public.cotironda_piloto_claim_finalist_whapi_mvp110()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_claim_finalist_whapi_mvp110()
 to service_role;

-- Recheck explicit consent of ALL parties and exact lease right before the
-- only network attempt. Return ciphertext ONLY to authenticated backend.
create function public.cotironda_piloto_authorize_finalist_whapi_mvp110(
 p_request uuid,p_recipient text,p_lease uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r_ record;v jsonb;labels jsonb;
begin
 if p_request is null or p_recipient is null or p_lease is null
 then return jsonb_build_object('state','invalid');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
    where only_row and whatsapp_inbound_enabled
      and whatsapp_outbound_enabled)
 then return jsonb_build_object('state','outbound_disabled');end if;
 if not exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
    where only_row and enabled and activated_at<=clock_timestamp())
 then return jsonb_build_object('state','pilot_finalist_off');end if;
 select o.request_id,o.recipient_key,req.buyer_key,
  plan.supplier_keys,plan.candidate_count,
  plan.state as selection_state into r_
 from cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
 join cotironda_piloto_privado.requests req on req.id=o.request_id
 join cotironda_piloto_privado.finalist_activation_mvp113 activation
  on activation.only_row and activation.enabled
    and activation.activated_at<=clock_timestamp()
    and req.created_at>=activation.activated_at
 join cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
  on plan.request_id=req.id and plan.state in
   ('two_complete_alternatives','one_complete_alternative','two_supplier_combination')
 where o.request_id=p_request and o.recipient_key=p_recipient
  and o.lease_token=p_lease and o.state='leased'
  and req.state='closed' and req.closes_at<=clock_timestamp()
  and (o.recipient_key=req.buyer_key or
       o.recipient_key=any(plan.supplier_keys))
 for update of o;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 v:=public.cotironda_piloto_finalist_contacts_mvp109(p_request);
 if v->>'state'<>'ready_private' or
   (v->>'count')::integer<>r_.candidate_count+1
 then return jsonb_build_object('state','consent_or_contact_missing');end if;
 select jsonb_object_agg(p.key,p.display_label) into labels
 from cotironda_piloto_privado.participants p
 where p.key=r_.buyer_key or p.key=any(r_.supplier_keys);
 return jsonb_build_object('state','authorized',
   'recipient_key',p_recipient,
   'buyer_key',r_.buyer_key,
   'supplier_keys',to_jsonb(r_.supplier_keys),
   'contacts_encrypted',v->'contacts_encrypted',
   'labels',labels,'price_ranked',false,
   'joint_supplier_coverage',r_.selection_state='two_supplier_combination');
end;$fn$;
revoke all on function
 public.cotironda_piloto_authorize_finalist_whapi_mvp110(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_authorize_finalist_whapi_mvp110(uuid,text,uuid)
 to service_role;

create function public.cotironda_piloto_finish_finalist_whapi_mvp110(
 p_request uuid,p_recipient text,p_lease uuid,p_state text,
 p_message_id text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_request is null or p_recipient is null or p_lease is null
  or p_state not in ('api_accepted','uncertain')
  or (p_message_id is not null and length(p_message_id)>160)
 then return false;end if;
 update cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
 set state=p_state,completed_at=clock_timestamp(),whapi_message_id=p_message_id
 where request_id=p_request and recipient_key=p_recipient
  and state='leased' and lease_token=p_lease;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function
 public.cotironda_piloto_finish_finalist_whapi_mvp110(uuid,text,uuid,text,text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_finish_finalist_whapi_mvp110(uuid,text,uuid,text,text)
 to service_role;
