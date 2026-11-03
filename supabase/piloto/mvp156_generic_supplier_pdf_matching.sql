-- MVP156. Reemplazo acotado de la RPC de asociación MVP155, solo en
-- cotironda-piloto. No cambia tabla, archivos, permisos ni Webhook v45.
-- Contexto no equivale a equivalencia de materiales: conservar la diferencia
-- entre Arena sin variante y arena fina pedida; idem Piedra y piedra partida.
-- MVP155 / PILOTO only. Source-anchored unique supplier document context.
-- No ranking, no price computations, no WhatsApp calls.
create or replace function public.cotironda_piloto_autolink_unquoted_media_mvp155(
 p_message_hmac text,p_chat_hmac text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare source record; candidate_count integer; target uuid; n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or p_chat_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 select a.message_hmac,a.participant_key,a.reserved_at,a.proposal
 into source
 from cotironda_piloto_privado.media_archive_mvp095 a
 join cotironda_piloto_privado.whapi_inbox inbox on
   inbox.message_hmac=a.message_hmac and inbox.chat_hmac=a.chat_hmac
   and inbox.participant_key=a.participant_key
 join cotironda_piloto_privado.participants supplier on
   supplier.key=a.participant_key and supplier.chat_hmac=a.chat_hmac
 where a.message_hmac=p_message_hmac and a.chat_hmac=p_chat_hmac
   and a.request_id is null and inbox.request_id is null
   and inbox.kind in ('document','image')
   and inbox.processing_state='needs_review'
   and supplier.key in ('corralon_ailin','corralon_nahuel')
   and supplier.participant_role='supplier'
   and supplier.consent_at is not null and supplier.opted_out_at is null
   and a.state='stored' and a.review_state='suggested_only'
   and a.ai_reserved_at is not null and a.size_bytes between 120 and 8388608
   and a.content_sha256 ~ '^[a-f0-9]{64}$'
   and a.storage_path='media/'||a.message_hmac
   and a.proposal->>'kind'='supplier_quote'
   and a.proposal->>'status'='review_required'
   and jsonb_typeof(a.proposal->'lines')='array'
   and jsonb_array_length(a.proposal->'lines') between 1 and 25
   and not exists(select 1 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
     where q.message_hmac=a.message_hmac)
 for update of a;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 if exists(select 1 from jsonb_array_elements(source.proposal->'lines') x
  where jsonb_typeof(x->'original_description') is distinct from 'string'
  or length(btrim(x->>'original_description')) not between 3 and 250)
 then return jsonb_build_object('state','unreadable_materials');end if;

 with raw_lines as materialized (
  select lower(translate(x->>'original_description',
    'ÁÉÍÓÚáéíóúÑñÜü','AEIOUaeiouNnUu')) as description,
    -- The file's quantity is a contextual clue, not a verified price or unit.
    -- Never coerce 1.000 / 1,000: its thousands/decimal meaning is ambiguous.
    case when x->>'quantity' ~ '^[1-9][0-9]{0,5}(?:[.,][0-9]{1,2})?$'
      then replace(x->>'quantity',',','.')::numeric
      else null
    end as quantity
  from jsonb_array_elements(source.proposal->'lines') x
 ), products as materialized (
  select description,quantity,
   description ~ '^[[:space:]]*(pallets?|flete|transporte|cargo[[:space:]]+de[[:space:]]+entrega|envases?[[:space:]]+retornables?|bolsones?[[:space:]]+vacios?)([^a-z]|$)' as extra
  from raw_lines
 ), candidates as (
  select r.id from cotironda_piloto_privado.requests r
  join cotironda_piloto_privado.invitations i on i.request_id=r.id
    and i.supplier_key=source.participant_key
  join cotironda_piloto_privado.participants supplier on
    supplier.key=i.supplier_key
  join cotironda_piloto_privado.participants buyer on
    buyer.key=r.buyer_key
  join cotironda_piloto_privado.whapi_outbox o on
    o.request_id=r.id and o.supplier_key=i.supplier_key
  where r.state='prepared' and r.closes_at>clock_timestamp()
    and r.created_at<=source.reserved_at
    and r.buyer_key='arquitecto'
    and r.delivery_city=supplier.delivery_city
    and i.state='prepared'
    and supplier.participant_role='supplier'
    and supplier.consent_at is not null and supplier.opted_out_at is null
    and buyer.participant_role='buyer'
    and buyer.consent_at is not null and buyer.opted_out_at is null
    and o.state='api_accepted' and o.whapi_message_id is not null
    and o.sent_at is not null and o.sent_at<=source.reserved_at
    and exists(select 1 from products p where not p.extra)
    and not exists(
      select 1 from products p where not p.extra and not exists(
        select 1 from cotironda_piloto_privado.request_lines l
        join cotironda_piloto_privado.catalogue_lines c on
          c.participant_key=source.participant_key
          and c.family_code=l.family_code
          and c.recognition_state='curated_family'
        where l.request_id=r.id
          and p.description ~ ('(^|[^a-z])'||
            split_part(l.family_code,'_',1)||'[a-z]*($|[^a-z])')
          and (
            -- Preserve exact variant match whenever the seller stated one.
            split_part(l.family_code,'_',2) in ('','gris','obra','adn')
            or p.description ~ ('(^|[^a-z])'||
              split_part(l.family_code,'_',2)||'[a-z]*($|[^a-z])')
            or (
              -- Generic "BIG BAG de Arena" can identify the source RFQ,
              -- but ONLY with >=2 DISTINCT source product families whose
              -- quantities also exactly match this particular RFQ.
              -- It does NOT prove fineness, grading, packaging or coverage.
              p.quantity is not null and p.quantity=l.quantity
              and (
                select count(distinct split_part(l2.family_code,'_',1))
                from cotironda_piloto_privado.request_lines l2
                join products p2 on p2.quantity=l2.quantity and not p2.extra
                 and p2.description ~ ('(^|[^a-z])'||
                   split_part(l2.family_code,'_',1)||'[a-z]*($|[^a-z])')
                where l2.request_id=r.id
              )>=2
              and not (
                l.family_code='arena_fina' and
                  p.description ~ '(^|[^a-z])gruesa($|[^a-z])'
                or l.family_code='arena_gruesa' and
                  p.description ~ '(^|[^a-z])(fina|zarandeada)($|[^a-z])'
                or l.family_code='piedra_partida' and
                  p.description ~ '(^|[^a-z])(laja|rodada|rodado)($|[^a-z])'
                or l.family_code='cemento_gris_obra' and
                  p.description ~ '(^|[^a-z])(blanco|refractario|contacto)($|[^a-z])'
              )
            )
          )
      )
    )
 )
 select count(*)::integer,min(id::text)::uuid into candidate_count,target
 from candidates;
 if candidate_count<>1 or target is null then
   return jsonb_build_object('state',
    case when candidate_count>1 then 'ambiguous' else 'no_match' end);
 end if;
 update cotironda_piloto_privado.media_archive_mvp095 set request_id=target
 where message_hmac=p_message_hmac and chat_hmac=p_chat_hmac
   and request_id is null and state='stored';
 get diagnostics n=row_count;
 if n<>1 then return jsonb_build_object('state','not_eligible');end if;
 update cotironda_piloto_privado.whapi_inbox set request_id=target
 where message_hmac=p_message_hmac and chat_hmac=p_chat_hmac
   and request_id is null and processing_state='needs_review';
 get diagnostics n=row_count;
 if n<>1 then
  raise exception 'mvp155_archived_source_not_linked_atomically' using errcode='23514';
 end if;
 return jsonb_build_object('state','linked');
end;$fn$;
revoke all on function public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)
 to service_role;

      then replace(x->>'quantity',',','.')::numeric
      else null
    end as quantity
  from jsonb_array_elements(source.proposal->'lines') x
 ), products as materialized (
  select description,
   description ~ '^[[:space:]]*(pallets?|flete|transporte|cargo[[:space:]]+de[[:space:]]+entrega|envases?[[:space:]]+retornables?|bolsones?[[:space:]]+vacios?)([^a-z]|$)' as extra
  from raw_lines
 ), candidates as (
  select r.id from cotironda_piloto_privado.requests r
  join cotironda_piloto_privado.invitations i on i.request_id=r.id
    and i.supplier_key=source.participant_key
  join cotironda_piloto_privado.participants supplier on
    supplier.key=i.supplier_key
  join cotironda_piloto_privado.participants buyer on
    buyer.key=r.buyer_key
  join cotironda_piloto_privado.whapi_outbox o on
    o.request_id=r.id and o.supplier_key=i.supplier_key
  where r.state='prepared' and r.closes_at>clock_timestamp()
    and r.created_at<=source.reserved_at
    and r.buyer_key='arquitecto'
    and r.delivery_city=supplier.delivery_city
    and i.state='prepared'
    and supplier.participant_role='supplier'
    and supplier.consent_at is not null and supplier.opted_out_at is null
    and buyer.participant_role='buyer'
    and buyer.consent_at is not null and buyer.opted_out_at is null
    and o.state='api_accepted' and o.whapi_message_id is not null
    and o.sent_at is not null and o.sent_at<=source.reserved_at
    and exists(select 1 from products p where not p.extra)
    and not exists(
      select 1 from products p where not p.extra and not exists(
        select 1 from cotironda_piloto_privado.request_lines l
        join cotironda_piloto_privado.catalogue_lines c on
          c.participant_key=source.participant_key
          and c.family_code=l.family_code
          and c.recognition_state='curated_family'
        where l.request_id=r.id
          and p.description ~ ('(^|[^a-z])'||
            split_part(l.family_code,'_',1)||'[a-z]*($|[^a-z])')
          and (split_part(l.family_code,'_',2) in ('','gris','obra','adn')
            or p.description ~ ('(^|[^a-z])'||
              split_part(l.family_code,'_',2)||'[a-z]*($|[^a-z])'))
      )
    )
 )
 select count(*)::integer,min(id::text)::uuid into candidate_count,target
 from candidates;
 if candidate_count<>1 or target is null then
   return jsonb_build_object('state',
    case when candidate_count>1 then 'ambiguous' else 'no_match' end);
 end if;
 update cotironda_piloto_privado.media_archive_mvp095 set request_id=target
 where message_hmac=p_message_hmac and chat_hmac=p_chat_hmac
   and request_id is null and state='stored';
 get diagnostics n=row_count;
 if n<>1 then return jsonb_build_object('state','not_eligible');end if;
 update cotironda_piloto_privado.whapi_inbox set request_id=target
 where message_hmac=p_message_hmac and chat_hmac=p_chat_hmac
   and request_id is null and processing_state='needs_review';
 get diagnostics n=row_count;
 if n<>1 then
  raise exception 'mvp155_archived_source_not_linked_atomically' using errcode='23514';
 end if;
 return jsonb_build_object('state','linked');
end;$fn$;
revoke all on function public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_autolink_unquoted_media_mvp155(text,text)
 to service_role;
