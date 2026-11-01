-- D026 / Issue #153. SOLO CI PostgreSQL 17 tras D024/D025.
-- No se instala en Supabase DEV; no RPC publica; no WhatsApp ni llamadas de IA.
-- Un backend autenticado futuro debera derivar supplier_org_id de la identidad
-- y comprobar consentimiento, opt-in, permisos, canal y estado ANTES de invocar.
create role cotironda_rounds_writer nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_rounds_writer;
grant select on cotironda_private.rounds_v1,
 cotironda_private.round_items_v1,cotironda_private.round_invites_v1,
 cotironda_private.offer_drafts_v1,cotironda_private.offer_events_v1,
 cotironda_private.offer_versions_v1 to cotironda_rounds_writer;
grant update(status) on cotironda_private.rounds_v1 to cotironda_rounds_writer;
grant insert,update on cotironda_private.offer_drafts_v1 to cotironda_rounds_writer;
grant insert on cotironda_private.offer_events_v1,
 cotironda_private.offer_versions_v1 to cotironda_rounds_writer;
grant execute on function cotironda_private.check_quote_lines_v1(jsonb,uuid)
 to cotironda_rounds_writer;
-- RLS exclusiva del rol NOLOGIN. No hay permisos heredados por clientes/API.
create policy d026_writer_round_select on cotironda_private.rounds_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_round_lock on cotironda_private.rounds_v1
 for update to cotironda_rounds_writer using(true) with check(true);
create policy d026_writer_items_select on cotironda_private.round_items_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_invites_select on cotironda_private.round_invites_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_drafts_select on cotironda_private.offer_drafts_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_drafts_insert on cotironda_private.offer_drafts_v1
 for insert to cotironda_rounds_writer with check(true);
create policy d026_writer_drafts_update on cotironda_private.offer_drafts_v1
 for update to cotironda_rounds_writer using(true) with check(true);
create policy d026_writer_events_select on cotironda_private.offer_events_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_events_insert on cotironda_private.offer_events_v1
 for insert to cotironda_rounds_writer with check(true);
create policy d026_writer_versions_select on cotironda_private.offer_versions_v1
 for select to cotironda_rounds_writer using(true);
create policy d026_writer_versions_insert on cotironda_private.offer_versions_v1
 for insert to cotironda_rounds_writer with check(true);

create function cotironda_private.save_offer_draft_atomic_v1(
 p_round uuid,p_supplier uuid,p_event uuid,p_expected_revision integer,p_offer jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_round cotironda_private.rounds_v1%rowtype;
 v_old integer;
 v_previous cotironda_private.offer_events_v1%rowtype;
 v_rev integer;
 v_hash text;
 v_currency text;
 v_payment text;
 v_lead smallint;
 v_freight numeric(18,2);
 v_minimum numeric(18,2);
begin
 if p_round is null or p_supplier is null or p_event is null
    or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>100000 or
    jsonb_typeof(p_offer) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(p_offer))<>6
    or not (p_offer ?& array['currency','payment_method','lead_days',
      'freight_gross','min_goods_gross','lines_snapshot'])
 then raise exception 'quote_payload_invalid' using errcode='22023'; end if;
 if jsonb_typeof(p_offer->'currency')<>'string'
   or p_offer->>'currency' not in ('ARS','USD')
   or jsonb_typeof(p_offer->'payment_method') not in ('null','string')
   or (jsonb_typeof(p_offer->'payment_method')='string' and
      p_offer->>'payment_method' not in
      ('contado','transferencia','cuenta_corriente_30_dias'))
   or jsonb_typeof(p_offer->'lead_days') not in ('null','number')
   or (jsonb_typeof(p_offer->'lead_days')='number' and
      (p_offer->>'lead_days') !~ '^(0|[1-9][0-9]{0,2})$')
   or (jsonb_typeof(p_offer->'lead_days')='number' and
      (p_offer->>'lead_days')::integer>120)
   or jsonb_typeof(p_offer->'freight_gross') not in ('null','string')
   or (jsonb_typeof(p_offer->'freight_gross')='string' and
      p_offer->>'freight_gross' !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
   or jsonb_typeof(p_offer->'min_goods_gross') not in ('null','string')
   or (jsonb_typeof(p_offer->'min_goods_gross')='string' and
      p_offer->>'min_goods_gross' !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
 then raise exception 'quote_payload_invalid' using errcode='22023'; end if;

 -- Huella SHA-256 calculada por BD, NO recibida de WhatsApp ni del cliente.
 -- JSONB normaliza orden de campos; diferencia aun mismo event_id con otros datos.
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('action','draft_saved','round',p_round,
   'supplier',p_supplier,'expected',p_expected_revision,'offer',p_offer)::text,
   'UTF8')),'hex');
 select * into v_round from cotironda_private.rounds_v1
   where id=p_round for update;
 if not found then raise exception 'round_not_available' using errcode='42501'; end if;
 select * into v_previous from cotironda_private.offer_events_v1
   where round_id=p_round and event_id=p_event;
 if found then
   if v_previous.supplier_org_id is distinct from p_supplier
      or v_previous.event_kind<>'draft_saved'
      or v_previous.revision<>p_expected_revision+1
      or v_previous.payload_sha256<>v_hash
   then raise exception 'event_id_conflict' using errcode='23505'; end if;
   return pg_catalog.jsonb_build_object('estado','borrador_guardado',
       'revision',v_previous.revision,'repetido',true);
 end if;
 if v_round.status<>'abierta' or pg_catalog.clock_timestamp()<v_round.begins_at
    or pg_catalog.clock_timestamp()>=v_round.ends_at
 then raise exception 'round_not_accepting_quotes' using errcode='42501'; end if;
 if not exists (select 1 from cotironda_private.round_invites_v1 i
   where i.round_id=p_round and i.supplier_org_id=p_supplier)
 then raise exception 'supplier_not_invited' using errcode='42501'; end if;
 if not cotironda_private.check_quote_lines_v1(p_offer->'lines_snapshot',p_round)
 then raise exception 'quote_lines_invalid' using errcode='22023'; end if;

 select revision into v_old from cotironda_private.offer_drafts_v1
   where round_id=p_round and supplier_org_id=p_supplier for update;
 if coalesce(v_old,0)<>p_expected_revision
 then raise exception 'stale_draft_revision' using errcode='40001'; end if;
 v_rev:=p_expected_revision+1;
 v_currency:=p_offer->>'currency';
 v_payment:=p_offer->>'payment_method';
 v_lead:=(p_offer->>'lead_days')::smallint;
 v_freight:=(p_offer->>'freight_gross')::numeric(18,2);
 v_minimum:=(p_offer->>'min_goods_gross')::numeric(18,2);
 if v_old is null then
   insert into cotironda_private.offer_drafts_v1
    (round_id,supplier_org_id,revision,currency,payment_method,lead_days,
     freight_gross,min_goods_gross,lines_snapshot)
   values (p_round,p_supplier,v_rev,v_currency,v_payment,v_lead,
    v_freight,v_minimum,p_offer->'lines_snapshot');
 else
   update cotironda_private.offer_drafts_v1 set
    revision=v_rev,currency=v_currency,payment_method=v_payment,lead_days=v_lead,
    freight_gross=v_freight,min_goods_gross=v_minimum,
    lines_snapshot=p_offer->'lines_snapshot'
   where round_id=p_round and supplier_org_id=p_supplier;
 end if;
 insert into cotironda_private.offer_events_v1
  (round_id,event_id,supplier_org_id,event_kind,revision,payload_sha256)
 values(p_round,p_event,p_supplier,'draft_saved',v_rev,v_hash);
 return pg_catalog.jsonb_build_object('estado','borrador_guardado',
   'revision',v_rev,'repetido',false);
end;
$fn$;

create function cotironda_private.confirm_offer_atomic_v1(
 p_round uuid,p_supplier uuid,p_event uuid,p_revision integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_round cotironda_private.rounds_v1%rowtype;
 v_draft cotironda_private.offer_drafts_v1%rowtype;
 v_prev cotironda_private.offer_events_v1%rowtype;
 v_version integer;
 v_hash text;
begin
 if p_round is null or p_supplier is null or p_event is null
   or p_revision is null or p_revision<1 or p_revision>100000
 then raise exception 'confirmation_invalid' using errcode='22023'; end if;
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('action','offer_confirmed','round',p_round,
   'supplier',p_supplier,'revision',p_revision)::text,'UTF8')),'hex');
 select * into v_round from cotironda_private.rounds_v1
   where id=p_round for update;
 if not found then raise exception 'round_not_available' using errcode='42501'; end if;
 select * into v_prev from cotironda_private.offer_events_v1
   where round_id=p_round and event_id=p_event;
 if found then
  if v_prev.supplier_org_id is distinct from p_supplier or
     v_prev.event_kind<>'offer_confirmed' or
     v_prev.revision<>p_revision or
     v_prev.payload_sha256<>v_hash
  then raise exception 'event_id_conflict' using errcode='23505'; end if;
  select version into v_version from cotironda_private.offer_versions_v1
    where round_id=p_round and supplier_org_id=p_supplier and
       confirmation_event_id=p_event;
  if v_version is null then raise exception 'confirmation_incomplete' using errcode='42501'; end if;
  return pg_catalog.jsonb_build_object('estado','cotizacion_confirmada',
    'revision',p_revision,'version',v_version,'repetido',true);
 end if;
 if v_round.status<>'abierta' or pg_catalog.clock_timestamp()<v_round.begins_at
    or pg_catalog.clock_timestamp()>=v_round.ends_at
 then raise exception 'round_not_accepting_quotes' using errcode='42501'; end if;
 if not exists (select 1 from cotironda_private.round_invites_v1 i
  where i.round_id=p_round and i.supplier_org_id=p_supplier)
 then raise exception 'supplier_not_invited' using errcode='42501'; end if;
 select * into v_draft from cotironda_private.offer_drafts_v1
  where round_id=p_round and supplier_org_id=p_supplier for update;
 if not found or v_draft.revision<>p_revision
 then raise exception 'stale_or_missing_draft' using errcode='40001'; end if;
 if exists (select 1 from cotironda_private.offer_versions_v1
    where round_id=p_round and supplier_org_id=p_supplier and draft_revision=p_revision)
 then raise exception 'revision_already_confirmed' using errcode='23505'; end if;
 select coalesce(max(version),0)+1 into v_version
  from cotironda_private.offer_versions_v1
  where round_id=p_round and supplier_org_id=p_supplier;
 insert into cotironda_private.offer_events_v1
 (round_id,event_id,supplier_org_id,event_kind,revision,payload_sha256)
 values(p_round,p_event,p_supplier,'offer_confirmed',p_revision,v_hash);
 insert into cotironda_private.offer_versions_v1
 (round_id,supplier_org_id,version,draft_revision,confirmation_event_id,
 currency,payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot)
 values(p_round,p_supplier,v_version,p_revision,p_event,v_draft.currency,
 v_draft.payment_method,v_draft.lead_days,v_draft.freight_gross,
 v_draft.min_goods_gross,v_draft.lines_snapshot);
 return pg_catalog.jsonb_build_object('estado','cotizacion_confirmada',
  'revision',p_revision,'version',v_version,'repetido',false);
end;
$fn$;

-- Definer NOLOGIN/NOBYPASSRLS; sólo permisos mínimos y políticas privadas anteriores.
grant create on schema cotironda_private to cotironda_rounds_writer;
grant cotironda_rounds_writer to postgres with set true,inherit false;
alter function cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb)
 owner to cotironda_rounds_writer;
alter function cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)
 owner to cotironda_rounds_writer;
revoke cotironda_rounds_writer from postgres;
revoke create on schema cotironda_private from cotironda_rounds_writer;

revoke all on function
 cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb),
 cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)
 from public,anon,authenticated,service_role,cotironda_app;
-- Ningún grant EXECUTE externo: sólo disponible para auditoría de postgres en CI.
comment on function cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer) is
 'D026 SQL privado: requiere broker con identidad de proveedor comprobada; NO ES API PUBLICA.';
