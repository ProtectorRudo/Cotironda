-- MVP192 · DEVELOPMENT ONLY · DO NOT INSTALL without 'Publicalo en cotironda-piloto'.
-- A single private source of truth for ALL currently valid, supplier-consented
-- original documents. NO award/ranking constraint, no public URLs, no backfill.
-- Prerequisites: MVP178 policy and consent, MVP191 Auth buyer identity.
--
-- Caller contract: server first verifies getUser() + verified PILOT JWT and
-- the authenticated-only MVP191 buyer identity RPC using THAT same JWT.
-- Then a server-only service_role connection passes user_id and session_id
-- taken from the VERIFIED JWT (NEVER from request params). This service-only
-- RPC repeats phone, live session, company, closed round and consent checks.
--
-- NULL -> no permission or no matching document. Catalog empty -> authorized
-- round with no consented originals. No guessing by filename, MIME or rank.
create or replace function public.cotironda_piloto_originals_private_mvp192(
 p_request_id uuid,
 p_auth_user_id uuid,
 p_auth_session_id uuid,
 p_document_id uuid default null
) returns jsonb
language plpgsql volatile security definer
set search_path='' as $fn$
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
 for v_rec in
   select q.message_hmac,q.source_sha256,q.received_at,
      q.supplier_key,m.mime,m.kind,m.size_bytes,m.storage_path,
      i.created_at invited_at,c.accepted_at consent_at,
      r.created_at round_created,r.closes_at,r.closed_at
   from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   -- A stored SHA alone is not proof that every product, price and total was
   -- verified. Demand the CURRENT immutable verifier V9 for this exact
   -- request/supplier/message/source digest before exposing any original.
   join cotironda_piloto_privado.supplier_evidence_mvp138 ev
     on ev.message_hmac=q.message_hmac
     and ev.request_id=q.request_id
     and ev.supplier_key=q.supplier_key
     and ev.source_sha256=q.source_sha256
     and ev.verifier_version=9
     and ev.state='verified' and ev.reason='covered'
     and ev.ranking_allowed=false
   join cotironda_piloto_privado.requests r
     on r.id=q.request_id and r.buyer_key=v_buyer
   join cotironda_piloto_privado.media_archive_mvp095 m
     on m.message_hmac=q.message_hmac
     and m.participant_key=q.supplier_key and m.request_id=q.request_id
     and m.state='stored' and m.finished_at is not null
     and m.kind in ('document','image')
     and m.storage_path=('media/'||q.message_hmac)
     and m.content_sha256=q.source_sha256
     and m.size_bytes between 1 and 8388608
     and m.mime in (
       'application/pdf','image/jpeg','image/png','image/webp',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'text/plain','text/csv')
   join cotironda_piloto_privado.whapi_inbox source_msg
     on source_msg.message_hmac=q.message_hmac
     and source_msg.participant_key=q.supplier_key
     and (source_msg.request_id is null or source_msg.request_id=q.request_id)
   join cotironda_piloto_privado.invitations i
     on i.request_id=q.request_id and i.supplier_key=q.supplier_key
     and i.created_at between r.created_at and r.closes_at
     and i.state='prepared'
   join cotironda_piloto_privado.participants supplier
     on supplier.key=q.supplier_key
     and supplier.participant_role='supplier'
     and supplier.consent_at is not null and supplier.opted_out_at is null
   join cotironda_piloto_privado.original_share_consents_mvp178 c
     on c.request_id=q.request_id and c.supplier_key=q.supplier_key
     and c.alcance='original_identificable_tras_cierre'
     and c.version='cotironda-originales-v1'
     and c.revoked_at is null
     and c.accepted_at>=v_activation
     and c.accepted_at>=r.created_at and c.accepted_at<=i.created_at
   join cotironda_piloto_privado.whapi_inbox consent_msg
     on consent_msg.message_hmac=c.consent_message_hmac
     and consent_msg.participant_key=q.supplier_key
     and consent_msg.received_at=c.accepted_at
     and (consent_msg.request_id is null
          or consent_msg.request_id=q.request_id)
   where q.request_id=p_request_id
     and q.message_hmac ~ '^[a-f0-9]{64}$'
     and q.source_sha256 ~ '^[a-f0-9]{64}$'
     and q.received_at between i.created_at and r.closes_at
     and source_msg.received_at between i.created_at and r.closes_at
     -- A later text/portal correction voids the previous source approval.
     -- Never expose the original as still-current while a new version
     -- awaits verification; no automatic backfill/reinterpretation.
     and not exists (
       select 1 from cotironda_piloto_privado.offer_versions change_
       where change_.request_id=q.request_id
         and change_.supplier_key=q.supplier_key
         and change_.created_at>=q.received_at
         and change_.created_at<=r.closes_at
     )
     and not exists (
       -- Do not leak superseded quotes. Equal timestamps are ambiguous.
       select 1
       from cotironda_piloto_privado.supplier_media_quotes_mvp098 newer
       where newer.request_id=q.request_id
         and newer.supplier_key=q.supplier_key
         and newer.message_hmac<>q.message_hmac
         and newer.received_at>=q.received_at
     )
   order by q.received_at,q.message_hmac
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
           'version','cotironda-originales-v1',
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
$fn$;

-- A service-role-only server function, never exposed to the browser.
revoke all on function
 public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function
 public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)
 to service_role;
