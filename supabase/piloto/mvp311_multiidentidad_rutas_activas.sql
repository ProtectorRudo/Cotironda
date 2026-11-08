-- MVP311 · DESARROLLO EXCLUSIVO. NO publicar con Luz verde.
-- Los 14 procedimientos siguen siendo service_role-only y mantienen firmas.
-- Fuente de snapshot: PostgreSQL 17.11 cotironda-piloto v70 (solo lectura).
-- Solo se retiran filtros de identidad fija; quedan rol, HMAC y registros privados.
-- Tres funciones de finalistas antiguas con exposición potencial quedan SIN cambios.


-- MVP311 · PRIMERA BARRERA: abortar toda la transacción si alguna RPC cambió
-- desde el snapshot PostgreSQL 17. Nunca sobrescribir una corrección posterior.
DO $mvp311_preflight$ BEGIN
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_autolink_unquoted_media_mvp155' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text, p_chat_hmac text') IS DISTINCT FROM '1b5db6ab19fbd9682019bc688155aa7d97d6bd6ec4a43cc8b99c7eeb8010aec7' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_autolink_unquoted_media_mvp155' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_curated_families_mvp152' AND pg_get_function_identity_arguments(p.oid)='p_buyer_chat_hmac text, p_city text') IS DISTINCT FROM '96d180007c756b494567dcf13154cc8332b181b67b45b7e093ea89a4a9ccbae7' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_curated_families_mvp152' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_ia_claim_zone_mvp233' AND pg_get_function_identity_arguments(p.oid)='p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text') IS DISTINCT FROM 'b41595b537038fed1b5201065b0ee9ebb0e72566e98b075e5ae5dcf83bb6df74' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_ia_claim_zone_mvp233' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_ia_link_supplier_mvp225' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text, p_original_text text') IS DISTINCT FROM 'c60d1d2943b388e69635ede03124254ce8828f2e944f4946891975ddcce6e237' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_ia_link_supplier_mvp225' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_ia_reserve_review_notice_mvp286' AND pg_get_function_identity_arguments(p.oid)='p_chat_hmac text, p_message_hmac text') IS DISTINCT FROM '8af9d790ec8dde6ef4619328c0775ca68e76b0d410015980c8cc8e9b4f285932' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_ia_reserve_review_notice_mvp286' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_ia_review_launch_mvp285' AND pg_get_function_identity_arguments(p.oid)='p_chat_hmac text') IS DISTINCT FROM '72b786fef4a76be524cb2462056e464f90c11140257b6f340393e2ebc4688a66' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_ia_review_launch_mvp285' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_ia_trial_flags_mvp229' AND pg_get_function_identity_arguments(p.oid)='p_chat_hmac text') IS DISTINCT FROM 'ebb602bfa1a899634065ebaf53e05068a7c10096e2cef29b4539d5aa6499da90' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_ia_trial_flags_mvp229' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_link_quoted_media_mvp151' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text, p_chat_hmac text, p_quoted_id text') IS DISTINCT FROM '820e9fed0469dd9591bd85344758c68bf99227cd46d2cc22a27413084c7c8db4' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_link_quoted_media_mvp151' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_link_quoted_text_mvp151' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text, p_chat_hmac text, p_quoted_id text, p_plaintext text') IS DISTINCT FROM '844630f70ceb3bba5044afae5590bf6ddf47c9770ffec201b7ce6f416d65fde5' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_link_quoted_text_mvp151' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_prepare_document_mvp099' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text') IS DISTINCT FROM '43767004be65d27bad8e7e3be5dd6614063f0784468f1cae582a2502ef691fc3' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_prepare_document_mvp099' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_publish_source_text_mvp107' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text') IS DISTINCT FROM '4aa4839d2cb0a4c5917abace56f83553a35bf3205586eaa6ae477a2b2b30cfd2' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_publish_source_text_mvp107' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_record_delivery_mvp119' AND pg_get_function_identity_arguments(p.oid)='p_whapi_message_id text, p_status text, p_status_code integer, p_recipient_chat_hmac text, p_event_unix bigint') IS DISTINCT FROM '87fab1a4be22530233a004a49c173d976d6cf8a867e222555342ee5e15f6d4c9' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_record_delivery_mvp119' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_reserve_ai_mvp094' AND pg_get_function_identity_arguments(p.oid)='p_chat_hmac text, p_message_hmac text') IS DISTINCT FROM 'f8599a1efa0169bc6a5408bad73bbf05d6c7d7fa6954db3d85e25b74c4d1b8b9' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_reserve_ai_mvp094' USING ERRCODE='42501';END IF;
 IF (SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_reserve_reply_mvp094' AND pg_get_function_identity_arguments(p.oid)='p_message_hmac text, p_chat_hmac text, p_reply_code text') IS DISTINCT FROM 'bdcde6055c006891f0df656dab30b3797df2ae3a155000d7e7c6d62833e887b8' THEN RAISE EXCEPTION 'mvp311_baseline_changed_cotironda_piloto_reserve_reply_mvp094' USING ERRCODE='42501';END IF;
END $mvp311_preflight$;


-- MVP311 cotironda_piloto_autolink_unquoted_media_mvp155 (audited baseline: 1b5db6ab19fbd9682019bc688155aa7d97d6bd6ec4a43cc8b99c7eeb8010aec7)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_autolink_unquoted_media_mvp155(p_message_hmac text, p_chat_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_autolink_unquoted_media_mvp155(p_message_hmac text, p_chat_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_autolink_unquoted_media_mvp155(p_message_hmac text, p_chat_hmac text) TO service_role;

-- MVP311 cotironda_piloto_curated_families_mvp152 (audited baseline: 96d180007c756b494567dcf13154cc8332b181b67b45b7e093ea89a4a9ccbae7)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_curated_families_mvp152(p_buyer_chat_hmac text, p_city text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((
  select jsonb_agg(family_code order by family_code) from (
   select distinct c.family_code
   from cotironda_piloto_privado.participants b
   join cotironda_piloto_privado.participants s on
     s.participant_role='supplier'
     and s.consent_at is not null and s.opted_out_at is null
   join cotironda_piloto_privado.catalogue_lines c on
     c.participant_key=s.key and c.recognition_state='curated_family'
   where b.participant_role='buyer'
     and b.chat_hmac=p_buyer_chat_hmac
     and b.consent_at is not null and b.opted_out_at is null
     and (p_city is null or lower(btrim(p_city))=lower(btrim(s.delivery_city)))
  ) curated
 ),'[]'::jsonb);
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_curated_families_mvp152(p_buyer_chat_hmac text, p_city text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_curated_families_mvp152(p_buyer_chat_hmac text, p_city text) TO service_role;

-- MVP311 cotironda_piloto_ia_claim_zone_mvp233 (audited baseline: b41595b537038fed1b5201065b0ee9ebb0e72566e98b075e5ae5dcf83bb6df74)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233(p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_buyer text;v_count integer;v_source_hmac text;
 v_source record;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_reply_hmac IS NULL OR p_reply_hmac !~ '^[a-f0-9]{64}$'
 OR p_reply_text IS NULL OR length(p_reply_text) NOT BETWEEN 3 AND 130
 OR p_city IS NULL OR length(p_city) NOT BETWEEN 3 AND 80
 OR p_city ~ '[[:cntrl:]]'
 OR position(lower(p_city) IN lower(p_reply_text))=0
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Prohibido retomar una compra si venció la autorización de nuevos pedidos.
 IF NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t
  JOIN cotironda_piloto_privado.ai_central_control_mvp226 c ON c.only_row
  JOIN cotironda_piloto_privado.ai_dispatch_gate_mvp222 d ON d.only_row
  JOIN cotironda_piloto_privado.integration_flags f ON f.only_row
  WHERE t.only_row AND t.enabled AND t.activated_at<=clock_timestamp()
    AND t.expires_at>clock_timestamp()
    AND c.enabled AND c.activated_at IS NOT NULL
    AND d.enabled AND d.activated_at IS NOT NULL
    AND f.whatsapp_inbound_enabled AND f.whatsapp_outbound_enabled
 ) THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT p.key INTO v_buyer
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox reply
  ON reply.participant_key=p.key AND reply.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
  AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL AND reply.message_hmac=p_reply_hmac
  AND reply.kind='text' AND reply.request_id IS NULL
  AND reply.processing_state='needs_review'
  AND reply.plaintext_sha256=encode(sha256(convert_to(p_reply_text,'UTF8')),'hex')
  AND reply.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF reply;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_zone_replies_mvp233 WHERE reply_hmac=p_reply_hmac)
 THEN RETURN jsonb_build_object('state','already_consumed');END IF;
 -- Sin adivinar contexto: exactamente UN pedido IA previo a la respuesta.
 SELECT count(*),min(a.message_hmac) INTO v_count,v_source_hmac
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 JOIN cotironda_piloto_privado.whapi_inbox original ON original.message_hmac=a.message_hmac
 JOIN cotironda_piloto_privado.whapi_inbox reply ON reply.message_hmac=p_reply_hmac
 WHERE a.buyer_key=v_buyer AND a.chat_hmac=p_chat_hmac
   AND a.state='needs_zone' AND a.failure_code='delivery_city_missing'
   AND a.finished_at IS NOT NULL AND a.source_sha256=original.plaintext_sha256
   AND original.participant_key=v_buyer AND original.chat_hmac=p_chat_hmac
   AND original.kind='text' AND original.request_id IS NULL
   AND original.processing_state='needs_review'
   AND original.received_at>clock_timestamp()-interval '24 hours'
   AND original.received_at<reply.received_at;
 IF v_count<>1 OR v_source_hmac IS NULL THEN
  RETURN jsonb_build_object('state',CASE WHEN v_count>1 THEN 'ambiguous' ELSE 'no_pending' END);
 END IF;
 SELECT m.message_hmac,m.nonce_b64,m.ciphertext_b64,m.plaintext_sha256 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m WHERE m.message_hmac=v_source_hmac
 FOR UPDATE OF m;
 IF v_source.nonce_b64 IS NULL OR v_source.ciphertext_b64 IS NULL
 OR v_source.plaintext_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','original_unavailable');END IF;
 -- Reclamar la misma fuente + marcar respuesta en una transacción indivisible.
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 a
 SET state='reserved',finished_at=NULL,failure_code=NULL
 WHERE a.message_hmac=v_source_hmac AND a.chat_hmac=p_chat_hmac
   AND a.state='needs_zone' AND a.buyer_key=v_buyer;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_consumed');END IF;
 INSERT INTO cotironda_piloto_privado.ai_zone_replies_mvp233
 (reply_hmac,source_hmac,buyer_key,delivery_city)
 VALUES(p_reply_hmac,v_source_hmac,v_buyer,p_city);
 RETURN jsonb_build_object('state','resumed',
  'source_hmac',v_source_hmac,'source_sha256',v_source.plaintext_sha256,
  'nonce',v_source.nonce_b64,'ciphertext',v_source.ciphertext_b64,
  'delivery_city',p_city);
END;
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233(p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233(p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text) TO service_role;

-- MVP311 cotironda_piloto_ia_link_supplier_mvp225 (audited baseline: c60d1d2943b388e69635ede03124254ce8828f2e944f4946891975ddcce6e237)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text DEFAULT NULL::text, p_original_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_source record; v_supplier record; v_request uuid;
 v_count integer; v_legacy_count integer; v_sha text;
 v_method text; v_media_prelinked uuid;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR (p_quoted_whapi_id IS NOT NULL
     AND p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$')
 OR (p_original_text IS NOT NULL AND
     length(p_original_text) NOT BETWEEN 1 AND 3000)
 THEN RETURN jsonb_build_object('state','invalid_input'); END IF;

 SELECT m.message_hmac,m.participant_key,m.kind,m.chat_hmac,
        m.received_at,m.processing_state,m.plaintext_sha256
 INTO v_source FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND m.request_id IS NULL
  AND m.processing_state IN ('unmatched_quote','needs_review')
  AND m.kind IN ('text','image','document')
 FOR UPDATE OF m;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 a
    WHERE a.message_hmac=p_message_hmac)
  THEN RETURN jsonb_build_object('state','already_linked');END IF;
  RETURN jsonb_build_object('state','source_not_eligible');
 END IF;

 SELECT p.key INTO v_supplier FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source.participant_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier'
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','supplier_not_authorized'); END IF;

 IF v_source.kind='text' THEN
  IF p_original_text IS NULL OR
     v_source.plaintext_sha256 IS DISTINCT FROM
       encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
  THEN RETURN jsonb_build_object('state','text_source_mismatch');END IF;
  v_sha:=v_source.plaintext_sha256;
 ELSE
  IF p_original_text IS NOT NULL THEN
    RETURN jsonb_build_object('state','media_requires_original_archive');END IF;
  SELECT a.content_sha256,a.request_id INTO v_sha,v_media_prelinked
  FROM cotironda_piloto_privado.media_archive_mvp095 a
  WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
   AND a.participant_key=v_supplier.key
   AND a.state='stored' AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','media_not_archived');END IF;
 END IF;

 -- quoted ID es la opción fuerte: exactamente 1 mensaje saliente conocido
 -- de ESTE proveedor y de una ronda aún abierta.
 SELECT count(*),min(r.id::text)::uuid INTO v_count,v_request
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=r.id AND i.supplier_key=j.supplier_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
   ON shadow.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE j.supplier_key=v_supplier.key AND j.state='api_accepted'
   AND j.whapi_message_id IS NOT NULL
   AND j.finished_at IS NOT NULL AND j.finished_at<=v_source.received_at
   AND r.created_at<=v_source.received_at AND r.closes_at>v_source.received_at
   AND r.state='prepared' AND i.state='prepared'
   AND shadow.status='shadow'
   AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
   AND (p_quoted_whapi_id IS NULL OR j.whapi_message_id=p_quoted_whapi_id);

 IF p_quoted_whapi_id IS NOT NULL THEN
  v_method:='quoted_whapi_id';
 ELSE
  -- Sin cita explícita, abstenerse ante más de UNA ronda posible,
  -- incluyendo rondas LEGACY. No usar similitud del contenido para
  -- resolver propiedad económica.
  v_method:='single_active_round';
  SELECT count(*) INTO v_legacy_count
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.requests r ON r.id=i.request_id
  WHERE i.supplier_key=v_supplier.key AND i.state='prepared'
    AND r.state='prepared' AND r.created_at<=v_source.received_at
    AND r.closes_at>v_source.received_at
    -- Solo invitaciones LEGACY que tienen prueba de envío aceptado
    -- por Whapi (no confundir 'prepared' con pedido efectivamente enviado).
    AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=i.request_id AND o.supplier_key=i.supplier_key
        AND o.state='api_accepted'
        AND o.whapi_message_id IS NOT NULL
        AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at
    )
    AND NOT EXISTS(SELECT 1 FROM
      cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
      WHERE sh.request_id=r.id);
  v_count:=v_count+v_legacy_count;
 END IF;
 IF v_count<>1 OR v_request IS NULL THEN
  INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237
   (message_hmac,supplier_key,source_sha256,kind,state,
    candidate_count,association_method)
  VALUES (p_message_hmac,v_supplier.key,v_sha,v_source.kind,
   CASE WHEN v_count>1 THEN 'ambiguous_round' ELSE 'not_matched' END,
   v_count,v_method)
  ON CONFLICT (message_hmac) DO NOTHING;
  RETURN jsonb_build_object('state',
   CASE WHEN v_count>1 THEN 'ambiguous_round' ELSE 'not_matched' END);
 END IF;
 -- El archivador antiguo puede preasignar una ronda. Conservarla
 -- SOLO si coincide con la ronda acreditada por el mensaje citado.
 IF v_source.kind IN('image','document') AND
    v_media_prelinked IS NOT NULL AND v_media_prelinked<>v_request
 THEN
  INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237
   (message_hmac,supplier_key,source_sha256,kind,state,
    candidate_count,association_method)
  VALUES (p_message_hmac,v_supplier.key,v_sha,v_source.kind,
   'media_context_conflict',v_count,v_method)
  ON CONFLICT (message_hmac) DO NOTHING;
  RETURN jsonb_build_object('state','media_context_conflict');
 END IF;
 -- Idempotencia y cambios de estado en la misma transacción.
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225(
   message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES (p_message_hmac,v_request,v_supplier.key,v_source.kind,v_method,v_sha);
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_request,processing_state='needs_review'
 WHERE message_hmac=p_message_hmac AND request_id IS NULL;
 IF v_source.kind IN('image','document') THEN
  UPDATE cotironda_piloto_privado.media_archive_mvp095 a
  SET request_id=v_request
  WHERE a.message_hmac=p_message_hmac
    AND (a.request_id IS NULL OR a.request_id=v_request)
    AND a.content_sha256=v_sha AND a.state='stored';
  IF NOT FOUND THEN
   RAISE EXCEPTION 'mvp225_media_not_linked_atomically';
  END IF;
 END IF;
 RETURN jsonb_build_object('state','linked_for_semantic_review',
  'request_id',v_request,'supplier_key',v_supplier.key,
  'association',v_method);
END;
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text, p_original_text text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text, p_original_text text) TO service_role;

-- MVP311 cotironda_piloto_ia_reserve_review_notice_mvp286 (audited baseline: 8af9d790ec8dde6ef4619328c0775ca68e76b0d410015980c8cc8e9b4f285932)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_review_notice_mvp286(p_chat_hmac text, p_message_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE n integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.integration_flags
   WHERE only_row AND whatsapp_inbound_enabled AND whatsapp_outbound_enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
   WHERE only_row AND enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
   WHERE only_row AND enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229
   WHERE only_row AND enabled AND
    (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_review_launch_mvp285
   WHERE only_row AND enabled)
 THEN RETURN jsonb_build_object('state','inactive');END IF;
 -- Only the buyer's signed, immutable, recently archived original.
 PERFORM 1 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m ON
   m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a ON
   a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
 WHERE p.participant_role='buyer'
  AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND m.message_hmac=p_message_hmac AND m.kind='text'
  AND m.processing_state='needs_review' AND m.request_id IS NULL
  AND m.received_at>clock_timestamp()-interval '10 minutes'
  AND a.state='review' AND a.finished_at IS NOT NULL
  AND a.source_sha256=m.plaintext_sha256
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 -- Maximum two review notices per buyer per day and no duplicate per source.
 SELECT count(*) INTO n
 FROM cotironda_piloto_privado.ai_buyer_review_notice_mvp286
 WHERE chat_hmac=p_chat_hmac
   AND created_at>=clock_timestamp()-interval '24 hours';
 IF n>=2 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_buyer_review_notice_mvp286(
  message_hmac,chat_hmac)
 VALUES(p_message_hmac,p_chat_hmac) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'leased' ELSE 'already_reserved' END);
END $function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_reserve_review_notice_mvp286(p_chat_hmac text, p_message_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_reserve_review_notice_mvp286(p_chat_hmac text, p_message_hmac text) TO service_role;

-- MVP311 cotironda_piloto_ia_review_launch_mvp285 (audited baseline: 72b786fef4a76be524cb2462056e464f90c11140257b6f340393e2ebc4688a66)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_launch_mvp285(p_chat_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE can_review boolean:=false; v_trial jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','inactive','send',false,
   'confirm',false,'release',false); END IF;
 -- Fuente autorizada de vigencia, identidad y rol, nunca contexto IA.
 v_trial:=public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac);
 can_review:=coalesce(v_trial->>'state'='active',false)
    AND coalesce(v_trial->>'buyer'='true',false)
    AND coalesce(v_trial->>'dispatch'='true',false)
    AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_review_launch_mvp285 l
       WHERE l.only_row AND l.enabled AND l.activated_at IS NOT NULL)
    AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants p
       WHERE p.participant_role='buyer'
       AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
       AND p.opted_out_at IS NULL);
 RETURN jsonb_build_object('state',CASE WHEN can_review
    THEN 'active' ELSE 'inactive' END,
   'send',can_review,'confirm',can_review,'release',can_review);
END
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_review_launch_mvp285(p_chat_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_review_launch_mvp285(p_chat_hmac text) TO service_role;

-- MVP311 cotironda_piloto_ia_trial_flags_mvp229 (audited baseline: ebb602bfa1a899634065ebaf53e05068a7c10096e2cef29b4539d5aa6499da90)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_trial_active boolean:=false;
 v_buyer boolean:=false;
 v_dispatch boolean:=false;
 v_quote boolean:=false;
 v_role text;
 v_supplier text;
 v_inbound boolean:=false;
 v_outbound boolean:=false;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT p.participant_role,p.key INTO v_role,v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND p.participant_role IN ('buyer','supplier');
 IF NOT FOUND THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT t.enabled AND t.activated_at<=clock_timestamp()
  AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
 INTO v_trial_active
 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t WHERE t.only_row;
 SELECT f.whatsapp_inbound_enabled,f.whatsapp_outbound_enabled
 INTO v_inbound,v_outbound FROM cotironda_piloto_privado.integration_flags f
 WHERE f.only_row;
 IF NOT coalesce(v_inbound,false)
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 -- SOLO compradores con modo piloto vigente pueden iniciar nuevas rondas
 -- y solo si todas las autorizaciones de despacho siguen activadas.
 v_buyer:=coalesce(v_trial_active,false) AND coalesce(v_outbound,false)
  AND v_role='buyer'
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 v_dispatch:=v_buyer
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 -- Un proveedor autorizado conserva el derecho a RESPONDER a una
 -- solicitud efectivamente entregada, sin necesidad de activar envío.
 -- Nunca habilitar pendientes, leased, inciertos ni rondas legacy.
 v_quote:=v_role='supplier' AND EXISTS(
  SELECT 1
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
  JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sr
   ON sr.request_id=r.id AND sr.source_hmac=r.source_hmac
  WHERE j.supplier_key=v_supplier
    AND j.state='api_accepted'
    AND j.whapi_message_id IS NOT NULL
    AND j.finished_at IS NOT NULL
    AND r.state='prepared' AND r.closes_at>clock_timestamp()
    AND r.created_at<=j.finished_at
 );
 RETURN jsonb_build_object(
  'state',CASE WHEN coalesce(v_trial_active,false) THEN 'active'
    WHEN v_quote THEN 'continuation' ELSE 'inactive' END,
  'buyer',v_buyer,'dispatch',v_dispatch,
  'quote_link',v_quote,'quote_analysis',v_quote);
END
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac text) TO service_role;

-- MVP311 cotironda_piloto_link_quoted_media_mvp151 (audited baseline: 820e9fed0469dd9591bd85344758c68bf99227cd46d2cc22a27413084c7c8db4)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_link_quoted_media_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare seller text;rid uuid;old_rid uuid;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_chat_hmac !~ '^[a-f0-9]{64}$'
 or p_quoted_id !~ '^[A-Za-z0-9._:-]{8,160}$'
 then return jsonb_build_object('state','invalid');end if;

 select m.participant_key,m.request_id into seller,old_rid
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.whapi_inbox inbox on
  inbox.message_hmac=m.message_hmac and inbox.chat_hmac=m.chat_hmac
  and inbox.participant_key=m.participant_key
 join cotironda_piloto_privado.participants s on
  s.key=m.participant_key and s.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
 and m.state='leased' and m.review_state='unread'
 and inbox.kind in ('image','document') and inbox.processing_state='needs_review'
 and s.participant_role='supplier' and s.consent_at is not null
 and s.opted_out_at is null for update of m,inbox;
 if seller is null then return jsonb_build_object('state','not_eligible');end if;

 rid:=cotironda_piloto_privado.resolve_supplier_pdf_quote_mvp151(seller,p_quoted_id);
 -- Do not trust the legacy single-open-round guess over an explicit quoted
 -- message. A wrong/stale reply remains archived but unassociated.
 update cotironda_piloto_privado.media_archive_mvp095
 set request_id=rid where message_hmac=p_message_hmac;
 update cotironda_piloto_privado.whapi_inbox
 set request_id=rid where message_hmac=p_message_hmac
 and chat_hmac=p_chat_hmac and processing_state='needs_review';
 return jsonb_build_object('state',
   case when rid is null then 'not_matched' else 'linked' end);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_link_quoted_media_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_link_quoted_media_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text) TO service_role;

-- MVP311 cotironda_piloto_link_quoted_text_mvp151 (audited baseline: 844630f70ceb3bba5044afae5590bf6ddf47c9770ffec201b7ce6f416d65fde5)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_link_quoted_text_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text, p_plaintext text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare seller text;rid uuid;revision smallint;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_chat_hmac !~ '^[a-f0-9]{64}$'
 or p_quoted_id !~ '^[A-Za-z0-9._:-]{8,160}$'
 or p_plaintext is null or length(p_plaintext) not between 1 and 3000
 then return jsonb_build_object('state','invalid');end if;

 select m.participant_key into seller
 from cotironda_piloto_privado.whapi_inbox m
 join cotironda_piloto_privado.participants s on
  s.key=m.participant_key and s.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
 and m.kind='text' and m.processing_state='unmatched_quote'
 and m.request_id is null
 and m.plaintext_sha256=encode(extensions.digest(p_plaintext,'sha256'),'hex')
 and s.participant_role='supplier' and s.consent_at is not null
 and s.opted_out_at is null for update of m;
 if seller is null then return jsonb_build_object('state','not_eligible');end if;

 rid:=cotironda_piloto_privado.resolve_supplier_pdf_quote_mvp151(seller,p_quoted_id);
 if rid is null then return jsonb_build_object('state','not_matched');end if;

 -- Serialize revisions for the same request without overwriting originals.
 perform 1 from cotironda_piloto_privado.requests r
 where r.id=rid and r.state='prepared' and r.closes_at>clock_timestamp()
 for update;
 if not found then return jsonb_build_object('state','not_matched');end if;
 select coalesce(max(revision_no),0)+1 into revision
 from cotironda_piloto_privado.offer_versions v
 where v.request_id=rid and v.supplier_key=seller;
 if revision>100 then return jsonb_build_object('state','revision_review');end if;

 insert into cotironda_piloto_privado.offer_versions(
 request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,seller,revision,p_message_hmac,p_plaintext)
 on conflict do nothing;
 if not found then return jsonb_build_object('state','duplicate');end if;

 update cotironda_piloto_privado.whapi_inbox
 set processing_state='quote_recorded',request_id=rid
 where message_hmac=p_message_hmac and chat_hmac=p_chat_hmac
 and processing_state='unmatched_quote';
 return jsonb_build_object('state','linked');
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_link_quoted_text_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text, p_plaintext text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_link_quoted_text_mvp151(p_message_hmac text, p_chat_hmac text, p_quoted_id text, p_plaintext text) TO service_role;

-- MVP311 cotironda_piloto_prepare_document_mvp099 (audited baseline: 43767004be65d27bad8e7e3be5dd6614063f0784468f1cae582a2502ef691fc3)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_prepare_document_mvp099(p_message_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record; line_ record; city text; v_request uuid; n int;
        item_count int:=0; eligible_count int:=0; u text;
        transcription text;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid_hmac');end if;
 select m.message_hmac,m.participant_key,m.chat_hmac,
  m.content_sha256,m.proposal,m.delivery_city_confirmed,agr.line_count
 into a from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.document_agreements_mvp099 agr on
  agr.message_hmac=m.message_hmac and agr.source_sha256=m.content_sha256
 join cotironda_piloto_privado.participants p on p.key=m.participant_key
  and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.review_state='suggested_only' and m.request_id is null
  and m.proposal->>'kind'='buyer_request'
  and p.participant_role='buyer'
  and p.consent_at is not null and p.opted_out_at is null
 for update of m;
 if not found then
  return jsonb_build_object('state','not_agreed_or_already_created');end if;
 city:=coalesce(a.delivery_city_confirmed,a.proposal->>'delivery_city');
 if city is null or btrim(city)<> 'La Plata' then
  return jsonb_build_object('state','needs_serviceable_delivery_city');end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
   where message_hmac=p_message_hmac)<>a.line_count then
  return jsonb_build_object('state','missing_source_lines');end if;
 -- Every line must be numeric, explicitly unitized and family-mapped.
 for line_ in
  select l.* from cotironda_piloto_privado.document_lines_mvp098 l
  where l.message_hmac=p_message_hmac order by l.line_no
 loop
  u:=cotironda_piloto_privado.unit_code_mvp099(line_.unit_literal);
  if u is null or line_.classified_family is null
   or line_.quantity_literal is null
   or line_.quantity_literal !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
   or replace(line_.quantity_literal,',','.')::numeric not between 0.001 and 1000000
   or length(line_.description_literal) not between 3 and 75
  then return jsonb_build_object('state','needs_material_specification',
     'line_no',line_.line_no);end if;
  item_count:=item_count+1;
 end loop;
 if item_count<>a.line_count then
  return jsonb_build_object('state','line_count_mismatch');end if;
 -- Exact supplier eligibility derives from declared curated family + city,
 -- consent and identity. No assertion of stock or confirmed prices.
 select count(distinct p.key) into eligible_count
 from cotironda_piloto_privado.participants p
 where p.participant_role='supplier'
  and p.participant_role='supplier' and p.delivery_city=city
  and p.chat_hmac is not null and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.document_lines_mvp098 l
   join cotironda_piloto_privado.catalogue_lines c
    on c.family_code=l.classified_family
    and c.participant_key=p.key and c.recognition_state='curated_family'
   where l.message_hmac=p_message_hmac);
 if eligible_count=0 then return jsonb_build_object(
   'state','no_matching_suppliers');end if;
 -- Never silently drop an item for lack of any matching supplier. Keep
 -- the original private and notify via future status rather than pretend
 -- the buyer's full list is being quoted.
 if exists(select 1 from cotironda_piloto_privado.document_lines_mvp098 l
    where l.message_hmac=p_message_hmac
     and not exists(select 1 from cotironda_piloto_privado.participants p
      join cotironda_piloto_privado.catalogue_lines c
       on c.participant_key=p.key and c.family_code=l.classified_family
        and c.recognition_state='curated_family'
      where p.participant_role='supplier'
       and p.delivery_city=city and p.participant_role='supplier'
       and p.chat_hmac is not null and p.consent_at is not null
       and p.opted_out_at is null))
 then return jsonb_build_object('state','uncovered_items');end if;
 -- No plaintext media or contact data is placed in this transcription:
 -- immutable original byte-for-byte is referenced by SHA256+message_hmac.
 select 'Documento privado archivado (SHA256 '||a.content_sha256||')'||
   E'\nTranscripción estructurada revisada por doble lectura:'||E'\n'||
   string_agg(l.quantity_literal||' '||l.unit_literal||' · '||
    l.description_literal,E'\n' order by l.line_no)
 into transcription from cotironda_piloto_privado.document_lines_mvp098 l
 where l.message_hmac=p_message_hmac;
 insert into cotironda_piloto_privado.requests(
    buyer_key,delivery_city,original_request,source_hmac,state,
    requested_delivery_note)
 values(a.participant_key,city,transcription,p_message_hmac,'prepared',
   nullif(btrim(left(coalesce(a.proposal->>'requested_delivery_note',''),90)),''))
 returning id into v_request;
 insert into cotironda_piloto_privado.request_lines(
   request_id,line_no,original_description,quantity,unit,family_code)
 select v_request,l.line_no,l.description_literal,
  replace(l.quantity_literal,',','.')::numeric,
  cotironda_piloto_privado.unit_code_mvp099(l.unit_literal),
  l.classified_family
 from cotironda_piloto_privado.document_lines_mvp098 l
 where l.message_hmac=p_message_hmac order by l.line_no;
 insert into cotironda_piloto_privado.document_sources_mvp099(
  request_id,message_hmac,content_sha256,verified_method)
 values(v_request,p_message_hmac,a.content_sha256,'dual_ai_exact_lines');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 select v_request,p.key from cotironda_piloto_privado.participants p
 where p.participant_role='supplier'
  and p.participant_role='supplier' and p.delivery_city=city
  and p.chat_hmac is not null and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.request_lines l
   join cotironda_piloto_privado.catalogue_lines c on
     c.family_code=l.family_code and c.participant_key=p.key
     and c.recognition_state='curated_family'
   where l.request_id=v_request);
 get diagnostics n=row_count;
 if n<>eligible_count then
  raise exception 'mvp099_supplier_count_changed' using errcode='23514';end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set request_id=v_request where message_hmac=p_message_hmac;
 return jsonb_build_object('state','prepared','request_id',v_request,
  'all_lines',item_count,'supplier_invites',n);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_prepare_document_mvp099(p_message_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_prepare_document_mvp099(p_message_hmac text) TO service_role;

-- MVP311 cotironda_piloto_publish_source_text_mvp107 (audited baseline: 4aa4839d2cb0a4c5917abace56f83553a35bf3205586eaa6ae477a2b2b30cfd2)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_publish_source_text_mvp107(p_message_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q_ record;raw_text text;v_text text;note_ text;bad integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;

 select q.message_hmac,q.request_id,q.supplier_key,q.source_sha256,
  q.line_count,q.declared_total_literal
 into q_ from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.participant_key=q.supplier_key and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_source_checks_mvp106 s
  on s.message_hmac=q.message_hmac and s.source_sha256=q.source_sha256
  and s.model_line_count=q.line_count and s.state='source_text_covered'
  and s.reason='covered'
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  on dual.message_hmac=q.message_hmac
   and dual.source_sha256=q.source_sha256
   and dual.state='model_readings_match'
 join cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  on amounts.message_hmac=q.message_hmac
   and amounts.source_sha256=q.source_sha256
   and amounts.state='balanced'
 join cotironda_piloto_privado.requests r
  on r.id=q.request_id and r.state='prepared' and r.closes_at>clock_timestamp()
 join cotironda_piloto_privado.participants supplier
  on supplier.key=q.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.participants buyer
  on buyer.key=r.buyer_key
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.state='stored' and m.review_state='suggested_only'
  and m.mime in ('text/plain','text/csv','application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  and m.proposal->>'kind'='supplier_quote'
  and m.proposal->'unanswered'='[]'::jsonb
  and r.delivery_city='La Plata'
  and supplier.participant_role='supplier'
  and supplier.consent_at is not null and supplier.opted_out_at is null
  and buyer.participant_role='buyer' and buyer.consent_at is not null
  and buyer.opted_out_at is null
  and i.state='prepared'
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107
   where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_published');end if;

 -- The publication is composed exclusively from the complete SOURCE-COVERED
 -- ordered line mirror. A model-supplied note not anchored to a source line
 -- would have failed independent source coverage earlier.
 select count(*) into bad
 from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
 where l.message_hmac=p_message_hmac
 and (
   l.ambiguity_literal is not null
   or length(btrim(l.description_literal))<2
   or NOT cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(l.description_literal)
   or l.description_literal ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|direcci[oó]n|domicilio|contacto|raz[oó]n social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,})'
   or coalesce(l.quantity_literal,'') ~ '[\r\n\t]'
   or coalesce(l.unit_literal,'') ~ '[\r\n\t]'
   or coalesce(l.unit_price_literal,'') ~ '[\r\n\t]'
   or coalesce(l.line_total_literal,'') ~ '[\r\n\t]'
   or l.description_literal ~ '[\r\n\t]'
 );
 if bad<>0 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 if (select count(*) from
  cotironda_piloto_privado.supplier_quote_lines_mvp101
  where message_hmac=p_message_hmac)<>q_.line_count
 then return jsonb_build_object('state','missing_source_lines');end if;

 select string_agg(
  l.line_no||'. '||l.description_literal||
   case when l.quantity_literal is null then ''
    else E'\nCantidad: '||l.quantity_literal end||
   case when l.unit_literal is null then ''
    else E' '||l.unit_literal end||
   case when l.unit_price_literal is null then ''
    else E'\nPrecio unitario informado (ver aclaraciones): '||l.unit_price_literal end||
   case when l.line_total_literal is null then ''
    else E'\nImporte: '||l.line_total_literal end,
  E'\n\n' order by l.line_no)
 into raw_text
 from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
 where l.message_hmac=p_message_hmac;
 -- A clarification belongs to the supplier quote; do not hide payment,
 -- list price, freight or return conditions. It is NOT a new line item.
 -- Only the existing source-covered, twice-checked and arithmetic gates
 -- may reach this projection. The displayed note is subject to the same
 -- anti-contact guard as every other line and remains anonymous.
 select nullif(m.proposal->>'requested_delivery_note','') into note_
 from cotironda_piloto_privado.media_archive_mvp095 m
 where m.message_hmac=p_message_hmac and m.content_sha256=q_.source_sha256;
 if note_ is not null and (
   length(note_)>4096 or note_ ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 v_text:='COTIRONDA · Presupuesto anónimo'||E'\n\n'||
  raw_text||E'\n\nTOTAL DECLARADO: '||q_.declared_total_literal||
  case when note_ is null then '' else
   E'\n\nACLARACIONES DEL PROVEEDOR\n'||note_ end;
 if length(v_text)>12000 or
    q_.declared_total_literal is null or
    q_.declared_total_literal !~ '^[-]?[$][[:space:]]*[0-9][0-9.,]*$' or
    v_text ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|direcci[oó]n|domicilio|contacto|[0-9]{8,})'
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 insert into cotironda_piloto_privado.anonymous_supplier_docs_mvp107(
  message_hmac,request_id,supplier_key,source_sha256,line_count,public_text)
 values(p_message_hmac,q_.request_id,q_.supplier_key,q_.source_sha256,
  q_.line_count,v_text);
 return jsonb_build_object('state','published_anonymous',
  'lines',q_.line_count,'ranking_allowed',false,
  'contact_revealed',false);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_publish_source_text_mvp107(p_message_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_publish_source_text_mvp107(p_message_hmac text) TO service_role;

-- MVP311 cotironda_piloto_record_delivery_mvp119 (audited baseline: 87fab1a4be22530233a004a49c173d976d6cf8a867e222555342ee5e15f6d4c9)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_record_delivery_mvp119(p_whapi_message_id text, p_status text, p_status_code integer, p_recipient_chat_hmac text, p_event_unix bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare matched_source_kind text; matched_request_id uuid;
 matched_recipient_key text; count_ integer; existing record;
 old_rank integer;new_rank integer;hash_ text;rows_ integer;
begin
 if p_whapi_message_id is null or
    p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$' or
    p_recipient_chat_hmac is null or
    p_recipient_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_status not in ('failed','pending','sent','delivered','read','played','deleted') or
    p_status_code not between 0 and 6 or
    p_event_unix is null or
    p_event_unix<extract(epoch from clock_timestamp()-interval '7 days')::bigint or
    p_event_unix>extract(epoch from clock_timestamp()+interval '5 minutes')::bigint
 then return jsonb_build_object('state','invalid');end if;

 select count(*),max(k.source_kind),max(k.request_id::text)::uuid,
   max(k.recipient_key)
 into count_,matched_source_kind,matched_request_id,matched_recipient_key
 from (
  select 'supplier_request'::text source_kind,o.request_id,o.supplier_key recipient_key
   from cotironda_piloto_privado.whapi_outbox o
   where o.whapi_message_id=p_whapi_message_id and o.state='api_accepted'
  union all
  select 'buyer_tracking',t.request_id,r.buyer_key
   from cotironda_piloto_privado.buyer_tracking_mvp091 t
   join cotironda_piloto_privado.requests r on r.id=t.request_id
   where t.whapi_message_id=p_whapi_message_id and t.send_state='api_accepted'
  union all
  select 'supplier_ack',m.request_id,m.participant_key
   from cotironda_piloto_privado.supplier_ack_mvp104 a
   join cotironda_piloto_privado.whapi_inbox m on m.message_hmac=a.message_hmac
   where a.whapi_message_id=p_whapi_message_id and a.state='api_accepted'
  union all
  select 'finalist',o.request_id,o.recipient_key
   from cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
   where o.whapi_message_id=p_whapi_message_id and o.state='api_accepted'
  union all
  -- MVP287: notice issued only to a recognized buyer, matched to the
  -- original authenticated inbound HMAC, never to arbitrary chat IDs.
  select 'buyer_review_notice'::text,NULL::uuid,m.participant_key
   from cotironda_piloto_privado.ai_buyer_review_notice_mvp286 n
   join cotironda_piloto_privado.whapi_inbox m
     ON m.message_hmac=n.message_hmac AND m.chat_hmac=n.chat_hmac
   where n.whapi_message_id=p_whapi_message_id
     and n.state='api_accepted' AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants b
      WHERE b.key=m.participant_key AND b.participant_role='buyer'
       AND b.chat_hmac=m.chat_hmac AND b.consent_at IS NOT NULL
       AND b.opted_out_at IS NULL)
 ) k
 join cotironda_piloto_privado.participants p
   on p.key=k.recipient_key and p.chat_hmac=p_recipient_chat_hmac;
 if count_<>1 then return jsonb_build_object('state','unmatched');end if;

 hash_:=encode(sha256(convert_to(p_whapi_message_id,'UTF8')),'hex');
 new_rank:=case p_status
  when 'pending' then 0 when 'sent' then 1
  when 'failed' then 2 when 'deleted' then 2
  when 'delivered' then 3 when 'read' then 4 when 'played' then 5 end;

 insert into cotironda_piloto_privado.delivery_receipts_mvp119(
  message_id_sha256,source_kind,request_id,recipient_key,
  state,status_code,event_unix)
 values(hash_,matched_source_kind,matched_request_id,
  matched_recipient_key,p_status,p_status_code,p_event_unix)
 on conflict(message_id_sha256) do nothing;
 get diagnostics rows_=row_count;
 if rows_=1 then return jsonb_build_object('state','recorded');end if;

 -- Recheck identity before updating; also prevents races when two different
 -- recipient keys are found for the same reused Whapi message identifier.
 select state,source_kind,request_id,recipient_key into existing
 from cotironda_piloto_privado.delivery_receipts_mvp119
 where message_id_sha256=hash_ for update;
 if existing.source_kind is distinct from matched_source_kind or
    existing.request_id is distinct from matched_request_id or
    existing.recipient_key is distinct from matched_recipient_key
 then return jsonb_build_object('state','unmatched');end if;
 old_rank:=case existing.state
  when 'pending' then 0 when 'sent' then 1
  when 'failed' then 2 when 'deleted' then 2
  when 'delivered' then 3 when 'read' then 4 when 'played' then 5 end;
 if new_rank<=old_rank
 then return jsonb_build_object('state','unchanged');end if;
 update cotironda_piloto_privado.delivery_receipts_mvp119
 set state=p_status,status_code=p_status_code,event_unix=p_event_unix,
     last_seen_at=clock_timestamp()
 where message_id_sha256=hash_;
 return jsonb_build_object('state','advanced');
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_record_delivery_mvp119(p_whapi_message_id text, p_status text, p_status_code integer, p_recipient_chat_hmac text, p_event_unix bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_record_delivery_mvp119(p_whapi_message_id text, p_status text, p_status_code integer, p_recipient_chat_hmac text, p_event_unix bigint) TO service_role;

-- MVP311 cotironda_piloto_reserve_ai_mvp094 (audited baseline: f8599a1efa0169bc6a5408bad73bbf05d6c7d7fa6954db3d85e25b74c4d1b8b9)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_ai_mvp094(p_chat_hmac text, p_message_hmac text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer; reserved integer;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$'
    or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled=true)
 or not exists(select 1 from cotironda_piloto_privado.participants p
   where p.participant_role='buyer'
     and p.chat_hmac=p_chat_hmac
     and p.consent_at is not null and p.opted_out_at is null)
 or exists(select 1 from cotironda_piloto_privado.whapi_inbox
   where message_hmac=p_message_hmac)
 then return false;end if;
 -- Concurrent event order is serialized by locking a single participant.
 perform 1 from cotironda_piloto_privado.participants
 where participant_role='buyer' and chat_hmac=p_chat_hmac for update;
 select count(*) into n from cotironda_piloto_privado.ai_attempts_mvp094
 where chat_hmac=p_chat_hmac and
   reserved_at>=clock_timestamp()-interval '24 hours';
 if n>=(select max_text_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row) then return false;end if;
 insert into cotironda_piloto_privado.ai_attempts_mvp094(
 message_hmac,chat_hmac)values(p_message_hmac,p_chat_hmac)
 on conflict do nothing;
 get diagnostics reserved=row_count;
 return reserved=1;
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_ai_mvp094(p_chat_hmac text, p_message_hmac text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_ai_mvp094(p_chat_hmac text, p_message_hmac text) TO service_role;

-- MVP311 cotironda_piloto_reserve_reply_mvp094 (audited baseline: bdcde6055c006891f0df656dab30b3797df2ae3a155000d7e7c6d62833e887b8)
CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_reply_mvp094(p_message_hmac text, p_chat_hmac text, p_reply_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or
    p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_reply_code not in ('zone','materials','how_it_works','supplier_pricing',
      'buyer_pricing','privacy','timing','status')then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
    where only_row and whatsapp_inbound_enabled=true
       and whatsapp_outbound_enabled=true)
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.whapi_inbox m
   join cotironda_piloto_privado.participants p
    on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
   where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
    and m.kind='text' and m.received_at>clock_timestamp()-interval '10 minutes'
    and m.processing_state in ('needs_zone','needs_review')
    and p.participant_role='buyer'
    and p.consent_at is not null and p.opted_out_at is null)
 then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where participant_role='buyer' and chat_hmac=p_chat_hmac for update;
 select count(*) into n from cotironda_piloto_privado.ai_replies_mvp094
 where chat_hmac=p_chat_hmac and created_at>=clock_timestamp()-interval '24 hours';
 if n>=(select max_replies_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row) then return false;end if;
 insert into cotironda_piloto_privado.ai_replies_mvp094(
 message_hmac,chat_hmac,reply_code)
 values(p_message_hmac,p_chat_hmac,p_reply_code) on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_reply_mvp094(p_message_hmac text, p_chat_hmac text, p_reply_code text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_reply_mvp094(p_message_hmac text, p_chat_hmac text, p_reply_code text) TO service_role;

-- MVP311: el comprador de una ronda nunca puede cambiarse por otro
-- comprador igualmente verificado. Preserva auditoría y acceso por empresa.
-- Este trigger ya fue creado en MVP310; solo se endurece su cuerpo.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.verify_request_buyer_mvp310()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $buyer$
BEGIN
 IF TG_OP='UPDATE' AND OLD.buyer_key IS DISTINCT FROM NEW.buyer_key
 THEN RAISE EXCEPTION 'mvp311_buyer_owner_immutable' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  WHERE p.key=NEW.buyer_key AND p.participant_role='buyer'
   AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 ) THEN RAISE EXCEPTION 'mvp310_buyer_not_verified' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $buyer$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.verify_request_buyer_mvp310()
 FROM PUBLIC,anon,authenticated,service_role;
