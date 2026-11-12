-- MVP362 layered integration for M360 (NOT deployed).
-- This M360 definition now requires mvp362_originales_alta_consentimiento_off.sql
-- BEFORE applying it, and after all MVP360 dependencies.
-- The LATERAL helper enforces identical permission in the preflight and
-- downloads. No Auth/session/byte hash/legacy blocking was removed.
-- MVP360 ONLY IN DEVELOPMENT, DO NOT INSTALL WITHOUT PILOT PUBLICATION.
-- Source pg_get_functiondef fetched from cotironda-piloto 2026-11-12.
-- Replace ONLY the original catalog source: immutable media + audited
-- association, not AI V9 or parsed quote. Existing Auth/consent policy,
-- original download audit, no-store HTTP and SHA byte verification persist.
-- This function is private service-side, never a public tracking endpoint.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_originals_private_mvp192(p_request_id uuid, p_auth_user_id uuid, p_auth_session_id uuid, p_document_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_buyer text;
 v_activation timestamptz;
 v_docs jsonb := '[]'::jsonb;
 v_selected jsonb := null;
 v_doc uuid;
 v_hex text;
 v_total integer := 0;
 v_rec record;
 v_now timestamptz := clock_timestamp();
begin
 if p_request_id is null or p_auth_user_id is null
    or p_auth_session_id is null then return null; end if;

 -- Private identity check. No caller-provided phone, company or supplier.
 -- A missing, banned, anonymous, revoked or ambiguous phone blocks access.
 select buyer.key, pol.activated_at
 into v_buyer,v_activation
 from auth.users u
 join auth.sessions sess
   on sess.id=p_auth_session_id and sess.user_id=u.id
 join cotironda_piloto_privado.requests r
   on r.id=p_request_id and r.state='closed'
   and r.closed_at is not null and r.closed_at>=r.closes_at
   and r.closed_at<=v_now
 join cotironda_piloto_privado.original_share_policy_mvp178 pol
   on pol.singleton=true and pol.enabled=true
   and pol.activated_at is not null
   and r.created_at>pol.activated_at
 join cotironda_piloto_privado.participants buyer
   on buyer.key=r.buyer_key and buyer.participant_role='buyer'
   and buyer.consent_at is not null and buyer.opted_out_at is null
 join cotironda_piloto_privado.participant_channels_mvp109 ch
   on ch.participant_key=buyer.key and ch.chat_hmac=buyer.chat_hmac
 join cotironda_piloto_privado.whapi_inbox bound
   on bound.message_hmac=ch.authenticated_message_hmac
   and bound.participant_key=buyer.key and bound.chat_hmac=buyer.chat_hmac
 where u.id=p_auth_user_id
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=v_now)
   and u.is_anonymous=false and u.phone_confirmed_at is not null
   and u.phone ~ '^[+]?[1-9][0-9]{7,15}$'
   and ch.contact_sha256=encode(extensions.digest(
    convert_to(regexp_replace(u.phone,'^[+]','','')||
       '@s.whatsapp.net','UTF8'),'sha256'),'hex')
   and (sess.not_after is null or sess.not_after>v_now)
   and not exists (
     select 1
     from cotironda_piloto_privado.participant_channels_mvp109 duplicate
     join cotironda_piloto_privado.participants buyer2
       on buyer2.key=duplicate.participant_key
     where duplicate.contact_sha256=ch.contact_sha256
       and duplicate.participant_key<>buyer.key
       and buyer2.participant_role='buyer'
       and buyer2.opted_out_at is null
   )
 limit 1;
 if v_buyer is null then return null; end if;

 -- Scope to the buyer's round, exact current supplier quote, a valid source
 -- archive and fresh, specific supplier consent. DO NOT require economic
 -- ranking or finalist selection: even partial offers must be downloadable.
 -- MVP360: originals are selected from immutable source+verified WhatsApp
 -- correlation, NOT an economic parser's V9 verifier or quote table.
 -- Do not weaken identity, prospective supplier consent or source sha.
 for v_rec in
   select m.message_hmac,m.content_sha256 AS source_sha256,
      source_msg.received_at,
      proof.supplier_key,m.mime,m.kind,m.size_bytes,m.storage_path,
      i.created_at invited_at,c.accepted_at consent_at,
      c.version consent_version,
      r.created_at round_created,r.closes_at,r.closed_at
   from cotironda_piloto_privado.media_archive_mvp095 m
   join cotironda_piloto_privado.ai_supplier_links_mvp225 proof
     on proof.message_hmac=m.message_hmac
     and proof.supplier_key=m.participant_key
     and proof.request_id=m.request_id
     and proof.kind=m.kind
     and proof.source_sha256=m.content_sha256
     and proof.association in ('quoted_whapi_id','single_active_round',
       'prior_supplier_preamble')
   join cotironda_piloto_privado.whapi_inbox source_msg
     on source_msg.message_hmac=m.message_hmac
     and source_msg.request_id=proof.request_id
     and source_msg.participant_key=proof.supplier_key
     and source_msg.chat_hmac=m.chat_hmac
     and source_msg.kind=m.kind
   join cotironda_piloto_privado.requests r
     on r.id=proof.request_id and r.buyer_key=v_buyer
     and r.state='closed' and r.closed_at is not null
     and r.closed_at>=r.closes_at and r.closed_at<=v_now
   join cotironda_piloto_privado.invitations i
     on i.request_id=proof.request_id
     and i.supplier_key=proof.supplier_key
     and i.created_at between r.created_at and r.closes_at
     and i.state='prepared'
   join cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     on j.request_id=proof.request_id
     and j.supplier_key=proof.supplier_key
     and j.state='api_accepted'
     and j.whapi_message_id is not null
     and j.finished_at is not null
     and j.finished_at<=source_msg.received_at
   join cotironda_piloto_privado.participants supplier
     on supplier.key=proof.supplier_key
     and supplier.participant_role='supplier'
     and supplier.chat_hmac=m.chat_hmac
     and supplier.consent_at is not null and supplier.opted_out_at is null
   -- MVP362: the SAME private consent gate is used by preflight and
   -- the actual original-catalog, including future-only onboarding terms.
   -- It rejects revoked/retroactive/ambiguous enrollments, keeping legacy
   -- per-round permission only when its original evidentiary rules hold.
   join lateral cotironda_piloto_privado.original_effective_consent_mvp362(
     r.id,proof.supplier_key
   ) c on true
   where proof.request_id=p_request_id
     and m.message_hmac ~ '^[a-f0-9]{64}$'
     and m.content_sha256 ~ '^[a-f0-9]{64}$'
     and m.state='stored' and m.finished_at is not null
     and m.kind in ('document','image')
     and m.storage_path=('media/'||m.message_hmac)
     and m.size_bytes between 1 and 8388608
     and m.mime in (
       'application/pdf','image/jpeg','image/png','image/webp',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'text/plain','text/csv')
     and source_msg.received_at between i.created_at and r.closes_at
     and source_msg.received_at>=j.finished_at
     and m.reserved_at>=source_msg.received_at
     and NOT EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
       WHERE u.message_hmac=m.message_hmac
         and u.supplier_key=proof.supplier_key
         and u.state in ('ambiguous_round','not_matched',
                         'media_context_conflict')
     )
     -- Block uncertain overlapping accepted dispatches of another round:
     -- absence of a clear request MUST NOT disclose a document.
     and not exists (
       select 1 from cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other_j
       join cotironda_piloto_privado.requests other_r
         on other_r.id=other_j.request_id
       where other_j.supplier_key=proof.supplier_key
         and other_j.request_id<>r.id
         and other_j.state='api_accepted'
         and other_j.whapi_message_id is not null
         and other_j.finished_at is not null
         and other_j.finished_at<=source_msg.received_at
         and other_r.created_at<=source_msg.received_at
         and other_r.closes_at>=source_msg.received_at
     )
     and not exists (
       select 1 from cotironda_piloto_privado.whapi_outbox old_o
       join cotironda_piloto_privado.requests old_r
         on old_r.id=old_o.request_id
       where old_o.supplier_key=proof.supplier_key
         and old_o.request_id<>r.id
         and old_o.state='api_accepted'
         and old_o.sent_at is not null
         and old_o.sent_at<=source_msg.received_at
         and old_r.created_at<=source_msg.received_at
         and old_r.closes_at>=source_msg.received_at
     )
     and not exists (
       select 1 from cotironda_piloto_privado.offer_versions change_
       where change_.request_id=r.id
         and change_.supplier_key=proof.supplier_key
         and change_.created_at>=source_msg.received_at
         and change_.created_at<=r.closes_at
     )
     and not exists (
       select 1 from cotironda_piloto_privado.media_archive_mvp095 newer
       join cotironda_piloto_privado.whapi_inbox newer_msg
        on newer_msg.message_hmac=newer.message_hmac
         and newer_msg.request_id=newer.request_id
         and newer_msg.participant_key=newer.participant_key
       where newer.request_id=r.id
         and newer.participant_key=proof.supplier_key
         and newer.message_hmac<>m.message_hmac
         and newer.state='stored'
         and newer_msg.received_at>=source_msg.received_at
     )
   order by source_msg.received_at,m.message_hmac
 loop
   v_total:=v_total+1;
   if v_total>100 then return null; end if;

   -- Deterministic opaque UUID from verified message HMAC+round. The actual
   -- HMAC never appears in the catalog and the bucket is always private.
   v_hex:=encode(extensions.digest(convert_to(
      'cotironda-original-document-mvp192|'||p_request_id::text||
      '|'||v_rec.message_hmac,'UTF8'),'sha256'),'hex');
   v_doc:=(
      substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
      substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
      substr(v_hex,21,12))::uuid;
   if p_document_id is null then
     v_docs:=v_docs||jsonb_build_array(jsonb_build_object(
       'documentId',v_doc::text,'mime',v_rec.mime,'kind',v_rec.kind
     ));
   elsif p_document_id=v_doc then
     -- Server-only evidence for MVP190's existing guardian. The adapter
     -- attaches the independently verified auth session to 'autorizacion'.
     -- 'verificada' is archive/source integrity, NOT economic comparison.
     v_selected:=jsonb_build_object(
       'state','authorized_original',
       'documentoId',v_doc::text,
       'autorizacion',jsonb_build_object(
         'politicaDesdeMs',(extract(epoch from v_activation)*1000)::bigint,
         'ronda',jsonb_build_object(
           'id',p_request_id::text,
           'compradorId',p_auth_user_id::text,
           'empresaId',v_buyer,
           'estado','closed',
           'creadaMs',(extract(epoch from v_rec.round_created)*1000)::bigint,
           'venceMs',(extract(epoch from v_rec.closes_at)*1000)::bigint,
           'cerradaMs',(extract(epoch from v_rec.closed_at)*1000)::bigint
         ),
         'invitacion',jsonb_build_object(
           'rondaId',p_request_id::text,
           'proveedorId',v_rec.supplier_key,
           'enviadaMs',(extract(epoch from v_rec.invited_at)*1000)::bigint
         ),
         'consentimiento',jsonb_build_object(
           'rondaId',p_request_id::text,
           'proveedorId',v_rec.supplier_key,
           'alcance','original_identificable_tras_cierre',
           'version',v_rec.consent_version,
           'aceptadoMs',(extract(epoch from v_rec.consent_at)*1000)::bigint,
           'revocadoMs',null
         ),
         'archivo',jsonb_build_object(
           'rondaId',p_request_id::text,
           'proveedorId',v_rec.supplier_key,
           'mensajeHmac',v_rec.message_hmac,
           'bucket','cotironda-piloto-originals',
           'ruta',v_rec.storage_path,
           'mime',v_rec.mime,'bytes',v_rec.size_bytes,
           'sha256',v_rec.source_sha256,
           'recibidoMs',(extract(epoch from v_rec.received_at)*1000)::bigint,
           'vigente',true,'almacenado',true
         ),
         'prueba',jsonb_build_object(
           'rondaId',p_request_id::text,
           'proveedorId',v_rec.supplier_key,
           'sha256',v_rec.source_sha256,
           'verificada',true,'revisionVigente',true
         )
       )
     );
   end if;
 end loop;
 if p_document_id is null then
   return jsonb_build_object(
      'state','authorized_catalog',
      -- SERVER-ONLY: used to derive the buyer's organisation from the
      -- very same verified phone/session/round scope; the browser projection
      -- MUST omit this field.
      'buyerKey',v_buyer,
      'total',v_total,
      'originals',v_docs
   );
 end if;
 return v_selected;
end;
$function$

