-- MVP180 — only buyer-token-authorized, SOURCE-VERIFIED AGGREGATE of missing
-- commercial conditions. No price ranking, no original, no supplier id.
-- Installed exclusively in cotironda-piloto after reversible smoke; production untouched.
create or replace function public.cotironda_piloto_buyer_economy_summary_mvp180(
 p_token_hash text
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 tracking jsonb;
 rid uuid;
 expected_texts jsonb;
 audited_texts jsonb;
 quotes_count bigint;
 iva_missing bigint;
 freight_missing bigint;
 freight_to_agree bigint;
 stock_unverified bigint;
 payment_missing bigint;
 net_unverified bigint;
 delivery_unverified bigint;
 minimum_unverified bigint;
begin
 if coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' then return null; end if;
 -- Reuse the SAME buyer validation, expiry/revocation and reviewed-offer
 -- selection that governs the private tracking page.
 tracking:=public.cotironda_piloto_tracking_status_mvp091(p_token_hash);
 if tracking is null or tracking->>'state' not in ('waiting','closed')
    or tracking->>'can_open'<>'true'
    or jsonb_typeof(tracking->'offers')<>'array'
    or jsonb_array_length(tracking->'offers') not between 1 and 100
 then return null; end if;

 select t.request_id into rid
 from cotironda_piloto_privado.buyer_tracking_mvp091 t
 join cotironda_piloto_privado.requests r on r.id=t.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where t.token_hash=p_token_hash and t.revoked_at is null
   and t.expires_at>clock_timestamp()
   and buyer.participant_role='buyer'
   and buyer.consent_at is not null and buyer.opted_out_at is null
   and r.state in ('prepared','closed');
 if rid is null then return null; end if;

 select coalesce(jsonb_agg(off->>'text' order by off->>'text'),'[]'::jsonb)
 into expected_texts from jsonb_array_elements(tracking->'offers') off;
 if jsonb_array_length(expected_texts)<>jsonb_array_length(tracking->'offers')
    or exists(select 1 from jsonb_array_elements(tracking->'offers') off
      where jsonb_typeof(off)<>'object' or jsonb_typeof(off->'text')<>'string')
 then return null; end if;

 -- Only latest supplier revision matters; an unreviewed newer response
 -- invalidates older evidence for this aggregate, exactly like MVP091.
 with sources as(
   select v.supplier_key,v.source_message_hmac as hmac,v.created_at as created,
     'text'::text as kind
   from cotironda_piloto_privado.offer_versions v
   where v.request_id=rid and
     v.created_at<=(select r.closes_at from cotironda_piloto_privado.requests r where r.id=rid)
   union all
   select q.supplier_key,q.message_hmac as hmac,q.received_at as created,
     'media'::text as kind
   from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   where q.request_id=rid and
     q.received_at<=(select r.closes_at from cotironda_piloto_privado.requests r where r.id=rid)
 ),latest as(
   select distinct on (supplier_key) *
   from sources order by supplier_key,created desc,hmac desc
 ),approved as(
   select e.public_text, f.facts->'condiciones' as conditions
   from latest s
   join cotironda_piloto_privado.supplier_media_quotes_mvp098 q
     on s.kind='media' and q.message_hmac=s.hmac
     and q.request_id=rid and q.supplier_key=s.supplier_key
   join cotironda_piloto_privado.supplier_evidence_mvp138 e
     on e.message_hmac=q.message_hmac
     and e.request_id=q.request_id and e.supplier_key=q.supplier_key
     and e.source_sha256=q.source_sha256 and e.verifier_version=9
     and e.state='verified' and e.public_text is not null
   join cotironda_piloto_privado.supplier_economic_facts_mvp168 f
     on f.message_hmac=q.message_hmac
     and f.request_id=q.request_id and f.supplier_key=q.supplier_key
     and f.source_sha256=q.source_sha256 and f.state='source_checked'
     and f.facts->>'rankingAllowed'='false'
     and f.facts->>'sourceImmutabilityPreserved'='true'
     and f.facts#>>'{condiciones,rankingHabilitado}'='false'
     and f.facts#>>'{condiciones,contactosRevelados}'='false'
     and f.facts#>>'{condiciones,originalesModificados}'='false'
   where not exists(
     select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 newer
     where newer.message_hmac=q.message_hmac and newer.verifier_version>9
   )
 )
 select coalesce(jsonb_agg(public_text order by public_text),'[]'::jsonb),
   count(*),
   count(*) filter(where conditions#>>'{iva,estado}'='no_informado'),
   count(*) filter(where conditions#>>'{flete,estado}'='no_informado'),
   count(*) filter(where conditions#>>'{flete,estado}'='a_convenir'),
   count(*) filter(where conditions->>'stockCorroborado'='false'),
   count(*) filter(where conditions#>>'{pago,estado}'='no_informado'),
   count(*) filter(where conditions->>'netoSinIvaAcreditado'='false'),
   count(*) filter(where conditions->>'plazoCorroborado'='false'),
   count(*) filter(where conditions->>'minimoCompraCorroborado'='false')
 into audited_texts, quotes_count, iva_missing, freight_missing,
   freight_to_agree, stock_unverified, payment_missing,
   net_unverified, delivery_unverified, minimum_unverified
 from approved;
 -- Multiset equality includes duplicates, so even identical supplier quote
 -- texts cannot be reused or inferred; no partial/silent presentation.
 if quotes_count<>jsonb_array_length(expected_texts)
    or audited_texts<>expected_texts
 then return null; end if;
 return jsonb_build_object(
   'state','economia_observada_sin_ranking',
   'quotations',quotes_count,
   'iva_not_informed',iva_missing,
   'freight_not_informed',freight_missing,
   'freight_to_agree',freight_to_agree,
   'stock_unverified',stock_unverified,
   'payment_not_informed',payment_missing,
   'net_unverified',net_unverified,
   'delivery_unverified',delivery_unverified,
   'minimum_unverified',minimum_unverified,
   'ranking_allowed',false,
   'price_comparable',false,
   'contacts_revealed',false
 );
end;$fn$;
revoke all on function public.cotironda_piloto_buyer_economy_summary_mvp180(text)
 from public,anon,authenticated,service_role;
grant execute on function public.cotironda_piloto_buyer_economy_summary_mvp180(text)
 to service_role;