-- MVP313: only IA Central lease owners may retrieve an encrypted supplier
-- recipient. No new WhatsApp sending, no new permissions, no migrations
-- applied to pilot under "Luz verde". Requires MVP307/309/310/311/312A/B.
-- No phone in SQL, JWT, logs or buyer response. Service-role only.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_recipient_packet_mvp313(
 p_request uuid,p_supplier text,p_lease uuid,p_chat_hmac text,p_channel text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $packet$
DECLARE v_ch record;v_direct record;v_admin record;v_source text;
BEGIN
 IF p_request IS NULL OR p_lease IS NULL
   OR p_supplier IS NULL OR p_supplier !~ '^[a-z][a-z0-9_]{2,60}$'
   OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
   OR p_channel IS NULL OR p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Verify the exact live central lease AND all original source/zone/
 -- deadline/dispatch/buyer/invitation checks in the PDF snapshot routine.
 -- The caller cannot substitute a supplier or borrow another lease.
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  JOIN cotironda_piloto_privado.participants p
   ON p.key=j.supplier_key AND p.participant_role='supplier'
    AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
  WHERE j.request_id=p_request AND j.supplier_key=p_supplier
   AND j.lease_token=p_lease AND j.state='leased'
 ) OR public.cotironda_piloto_ia_pdf_snapshot_mvp222(
  p_request,p_supplier,p_lease) IS NULL
 OR NOT cotironda_piloto_privado.proveedor_contactable_mvp307(p_supplier)
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 SELECT ch.chat_hmac,ch.contact_sha256,ch.nonce_b64,ch.ciphertext_b64
 INTO v_direct FROM cotironda_piloto_privado.participant_channels_mvp109 ch
 WHERE ch.participant_key=p_supplier AND ch.chat_hmac=p_chat_hmac;
 SELECT ch.chat_hmac,ch.contact_sha256,ch.nonce_b64,ch.ciphertext_b64
 INTO v_admin FROM cotironda_piloto_privado.admin_channels_mvp312 ch
 JOIN cotironda_piloto_privado.admin_authorizations_mvp309 a
  ON a.participant_key=ch.participant_key
   AND a.source_reference=ch.source_reference
   AND a.role=ch.participant_role
 WHERE ch.participant_key=p_supplier AND ch.chat_hmac=p_chat_hmac
  AND ch.channel_id=p_channel AND ch.participant_role='supplier'
  AND ch.evidence_kind='owner_vouched_phone'
  AND a.scope='supplier_business_contact_after_close'
  AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
    WHERE rev.participant_key=a.participant_key);
 IF v_direct.chat_hmac IS NULL AND v_admin.chat_hmac IS NULL
 THEN RETURN jsonb_build_object('state','contact_unavailable');END IF;
 -- An inconsistent second source may indicate a reassignment. Fail closed.
 IF v_direct.chat_hmac IS NOT NULL AND v_admin.chat_hmac IS NOT NULL AND
  (v_direct.contact_sha256<>v_admin.contact_sha256 OR
   v_direct.chat_hmac<>v_admin.chat_hmac)
 THEN RETURN jsonb_build_object('state','contact_conflict');END IF;
 v_source:=CASE WHEN v_direct.chat_hmac IS NOT NULL
   THEN 'authenticated_whapi' ELSE 'owner_statement' END;
 SELECT CASE WHEN v_direct.chat_hmac IS NOT NULL
    THEN v_direct.chat_hmac ELSE v_admin.chat_hmac END AS chat_hmac,
   CASE WHEN v_direct.chat_hmac IS NOT NULL
    THEN v_direct.contact_sha256 ELSE v_admin.contact_sha256 END AS contact_sha256,
   CASE WHEN v_direct.chat_hmac IS NOT NULL
    THEN v_direct.nonce_b64 ELSE v_admin.nonce_b64 END AS nonce_b64,
   CASE WHEN v_direct.chat_hmac IS NOT NULL
    THEN v_direct.ciphertext_b64 ELSE v_admin.ciphertext_b64 END AS ciphertext_b64
 INTO v_ch;
 IF v_ch.chat_hmac IS NULL OR v_ch.chat_hmac<>p_chat_hmac OR
   v_ch.contact_sha256 !~ '^[a-f0-9]{64}$'
   OR length(v_ch.nonce_b64) NOT BETWEEN 16 AND 40
   OR length(v_ch.ciphertext_b64) NOT BETWEEN 32 AND 300
 THEN RETURN jsonb_build_object('state','contact_invalid');END IF;
 RETURN jsonb_build_object('state','ready',
  'supplier_key',p_supplier,'request_id',p_request,
  'chat_hmac',v_ch.chat_hmac,'contact_sha256',v_ch.contact_sha256,
  'nonce_b64',v_ch.nonce_b64,'ciphertext_b64',v_ch.ciphertext_b64,
  'channel_id',p_channel,'source',v_source);
END $packet$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_recipient_packet_mvp313(
 uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_recipient_packet_mvp313(
 uuid,text,uuid,text,text) TO service_role;

-- The webhook must distinguish a known supplier from a buyer even when the
-- original 2-phone recipients config is omitted. Strict HMAC/role predicate.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_is_supplier_mvp313(
 p_chat_hmac text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $supplier$
 SELECT p_chat_hmac ~ '^[a-f0-9]{64}$' AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='supplier'
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
 );
$supplier$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_is_supplier_mvp313(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_is_supplier_mvp313(text)
 TO service_role;
