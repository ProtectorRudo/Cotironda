-- MVP347: Tracking PG17 regression with synthetic buyer and suppliers.
-- Baseline source was fetched read-only; the overlay must match its fingerprint.
\set ON_ERROR_STOP on
begin;
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin;end if;
end;$roles$;
create schema cotironda_piloto_privado;
create table cotironda_piloto_privado.requests(
 id uuid primary key,buyer_key text,state text,closes_at timestamptz
);
create table cotironda_piloto_privado.participants(
 key text primary key,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
create table cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz
);
create table cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text
);
create table cotironda_piloto_privado.offer_versions(
 request_id uuid,supplier_key text,source_message_hmac text,
 created_at timestamptz,revision_no smallint
);
create table cotironda_piloto_privado.anonymous_offers_mvp091(
 request_id uuid,supplier_key text,revision_no smallint,public_text text
);
create table cotironda_piloto_privado.supplier_media_quotes_mvp098(
 request_id uuid,supplier_key text,message_hmac text,received_at timestamptz
);
create table cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,request_id uuid,participant_key text,
 state text,reserved_at timestamptz
);
create table cotironda_piloto_privado.anonymous_supplier_docs_mvp107(
 message_hmac text,request_id uuid,supplier_key text,public_text text
);
create table cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac text,request_id uuid,supplier_key text,
 public_text text,state text,verifier_version smallint
);
create table cotironda_piloto_privado.anonymous_supplier_revisions_mvp347(
 message_hmac text,request_id uuid,supplier_key text,public_text text
);
\i supabase/tests/ci/mvp347-tracking-baseline-readonly.sql
-- The migration must abort if actual tracking differs from this one.
\i supabase/piloto/mvp347_tracking_verified_revision_overlay.sql

insert into cotironda_piloto_privado.requests values
 ('11111111-1111-4111-8111-111111111111',
  'comprador_sintetico','prepared',now()+interval '1 day');
insert into cotironda_piloto_privado.participants values
 ('comprador_sintetico','buyer',now(),null),
 ('proveedor_1','supplier',now(),null),
 ('proveedor_2','supplier',now(),null);
insert into cotironda_piloto_privado.buyer_tracking_mvp091 values
 ('11111111-1111-4111-8111-111111111111',repeat('a',64),
  null,now()+interval '4 days');
insert into cotironda_piloto_privado.invitations values
 ('11111111-1111-4111-8111-111111111111','proveedor_1','prepared'),
 ('11111111-1111-4111-8111-111111111111','proveedor_2','prepared');
insert into cotironda_piloto_privado.supplier_media_quotes_mvp098 values
 ('11111111-1111-4111-8111-111111111111','proveedor_1',repeat('b',64),now()-interval '10 minutes'),
 ('11111111-1111-4111-8111-111111111111','proveedor_2',repeat('c',64),now()-interval '8 minutes');
insert into cotironda_piloto_privado.media_archive_mvp095 values
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','proveedor_1','stored',now()-interval '10 minutes'),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','proveedor_2','stored',now()-interval '8 minutes');
insert into cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 values
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','proveedor_1',
  E'COTIRONDA · Presupuesto anónimo\n1. Cemento CPC\nPrecio unitario informado: $100,00\nTOTAL DECLARADO: $150,00');

do $smoke$
declare r jsonb;old jsonb;preview jsonb;
begin
 r:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if r->>'state'<>'waiting' or (r->>'received_count')::integer<>2
  or (r->>'files_pending_review')::integer<>1
  or r->>'can_open'<>'true' or jsonb_array_length(r->'offers')<>1
 then raise exception 'first verified revision not visible or status wrong: %',r;end if;
 if r->'offers'->0->>'text' not like '%$100,00%'
 then raise exception 'corrected amount not visible';end if;
 if (r->'offers'->0->>'label')<>'Presupuesto 1'
 then raise exception 'unstable anonymous label';end if;
 old:=r;
 -- Second independently approved supplier becomes visible without any
 -- buyer action, and anonymity numbering remains stable on refresh.
 insert into cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 values
  (repeat('c',64),'11111111-1111-4111-8111-111111111111',
   'proveedor_2','COTIRONDA · Presupuesto anónimo, piedra $300,00');
 r:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if jsonb_array_length(r->'offers')<>2
  or (r->>'files_pending_review')::integer<>0
 then raise exception 'two approved offers not shown: %',r;end if;
 preview:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if r->'offers'<>preview->'offers' then
  raise exception 'labels changed between refreshes';end if;
 -- New UNREVIEWED PDF from supplier_1 suppresses its old projection.
 insert into cotironda_piloto_privado.supplier_media_quotes_mvp098 values
  ('11111111-1111-4111-8111-111111111111',
   'proveedor_1',repeat('d',64),now());
 insert into cotironda_piloto_privado.media_archive_mvp095 values
  (repeat('d',64),'11111111-1111-4111-8111-111111111111',
   'proveedor_1','stored',now());
 r:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if jsonb_array_length(r->'offers')<>1
  or (r->>'files_pending_review')::integer<>1
 then raise exception 'superseded approved source leaked: %',r;end if;
 -- Revocation, expiry and cancellation must never expose the quotes.
 update cotironda_piloto_privado.buyer_tracking_mvp091
 set revoked_at=now() where token_hash=repeat('a',64);
 r:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if r->>'state'<>'not_found' then
  raise exception 'revoked token accepted';end if;
 update cotironda_piloto_privado.buyer_tracking_mvp091
 set revoked_at=null where token_hash=repeat('a',64);
 update cotironda_piloto_privado.requests set state='cancelled';
 r:=public.cotironda_piloto_tracking_status_mvp091(repeat('a',64));
 if r->>'state'<>'cancelled'
  or jsonb_array_length(r->'offers')<>0
  or r->>'can_open'<>'false'
 then raise exception 'cancelled leaked offers';end if;
 if has_function_privilege('anon',
  'public.cotironda_piloto_tracking_status_mvp091(text)','EXECUTE')
 then raise exception 'anon can call tracking';end if;
end;$smoke$;
rollback;
select to_regnamespace('cotironda_piloto_privado') is null as rolled_back;
