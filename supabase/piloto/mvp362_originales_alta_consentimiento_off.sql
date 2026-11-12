-- MVP362: SOLO DESARROLLO; NO EJECUTAR SOBRE PILOTO sin 'Publicalo'.
-- Consentimiento EXPLICITO de originales al alta, UNA VEZ para rondas FUTURAS.
-- No inferir permiso de "participants.consent_at" ni del envío de un PDF.
-- Política nace SIN FILAS (OFF). Sin migración de consentimientos históricos.
-- El personal autorizado registra la evidencia sólo tras verificar que el
-- mensaje Whapi expresa inequívocamente aceptación de ESTA version y texto.
CREATE TABLE cotironda_piloto_privado.original_terms_policy_mvp362 (
 terms_version text PRIMARY KEY
    CHECK (terms_version='cotironda-originales-alta-v1'),
 terms_body text NOT NULL CHECK(length(terms_body) BETWEEN 200 AND 20000),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 scope text NOT NULL DEFAULT 'original_identificable_tras_cierre'
   CHECK(scope='original_identificable_tras_cierre'),
 approved_at timestamptz,
 activated_at timestamptz,
 enabled boolean NOT NULL DEFAULT false,
 CHECK (NOT enabled OR (
   approved_at IS NOT NULL AND activated_at IS NOT NULL
   AND approved_at<=activated_at))
);
-- M364: notice ledger stays empty and private until the trusted sender is wired.
-- A recorded notice does not itself prove operator MFA or informed intent.
CREATE TABLE cotironda_piloto_privado.supplier_original_terms_notices_mvp364 (
 notice_message_hmac text PRIMARY KEY CHECK(notice_message_hmac ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 terms_version text NOT NULL REFERENCES
   cotironda_piloto_privado.original_terms_policy_mvp362(terms_version),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_chat_hmac text NOT NULL CHECK(supplier_chat_hmac ~ '^[a-f0-9]{64}$'),
 outbound_body_sha256 text NOT NULL CHECK(outbound_body_sha256 ~ '^[a-f0-9]{64}$'),
 delivery_state text NOT NULL CHECK(delivery_state='api_accepted'),
 sent_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(supplier_key,terms_version,notice_message_hmac),
 CHECK(recorded_at>=sent_at)
);
CREATE TABLE cotironda_piloto_privado.supplier_original_optins_mvp362 (
 supplier_key text NOT NULL,
 terms_version text NOT NULL
   REFERENCES cotironda_piloto_privado.original_terms_policy_mvp362(terms_version),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 notice_message_hmac text NOT NULL
   CHECK(notice_message_hmac ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(supplier_key,terms_version,notice_message_hmac)
   REFERENCES cotironda_piloto_privado.supplier_original_terms_notices_mvp364
     (supplier_key,terms_version,notice_message_hmac),
 evidence_message_hmac text NOT NULL
   CHECK(evidence_message_hmac ~ '^[a-f0-9]{64}$'),
 ack_plaintext_sha256 text NOT NULL
   CHECK(ack_plaintext_sha256 ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_by_operator uuid NOT NULL,
 evidence_review_sha256 text NOT NULL
   CHECK(evidence_review_sha256 ~ '^[a-f0-9]{64}$'),
 method text NOT NULL DEFAULT 'whapi_onboarding_explicit'
   CHECK(method='whapi_onboarding_explicit'),
 PRIMARY KEY(supplier_key,terms_version),
 UNIQUE(evidence_message_hmac),
 CHECK (recorded_at>=accepted_at)
);
CREATE TABLE cotironda_piloto_privado.supplier_original_revocations_mvp362 (
 supplier_key text NOT NULL,
 terms_version text NOT NULL,
 evidence_message_hmac text NOT NULL
   CHECK(evidence_message_hmac ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_by_operator uuid NOT NULL,
 PRIMARY KEY(supplier_key,terms_version,evidence_message_hmac),
 FOREIGN KEY(supplier_key,terms_version) REFERENCES
 cotironda_piloto_privado.supplier_original_optins_mvp362(supplier_key,terms_version),
 CHECK(recorded_at>=revoked_at)
);
-- Deny all direct API roles; only a tightly reviewed operator/owner action
-- may register explicit optin/revocation. Never create public insert RPC.
ALTER TABLE cotironda_piloto_privado.original_terms_policy_mvp362
 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.supplier_original_terms_notices_mvp364
 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.supplier_original_optins_mvp362
 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.supplier_original_revocations_mvp362
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.original_terms_policy_mvp362,
 cotironda_piloto_privado.supplier_original_terms_notices_mvp364,
 cotironda_piloto_privado.supplier_original_optins_mvp362,
 cotironda_piloto_privado.supplier_original_revocations_mvp362
 FROM PUBLIC,anon,authenticated,service_role;

-- Private, one source of truth for BOTH preview/consent preflight and download.
-- The function checks prospective publication, valid supplier and buyer,
-- proof exact message/chat/SHA, audited operator review and any revocation.
-- It does not leak contact/identity and cannot activate policy.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.original_effective_consent_mvp362(
   p_request_id uuid,p_supplier_key text
 ) RETURNS TABLE(accepted_at timestamptz, version text)
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $mvp362$
 WITH allowed AS (
  SELECT r.id,r.created_at,r.closes_at,r.closed_at,r.state,r.buyer_key,
   i.created_at invited_at,s.chat_hmac supplier_chat,
   pol.activated_at policy_activated_at
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=r.id AND i.supplier_key=p_supplier_key
   AND i.created_at BETWEEN r.created_at AND r.closes_at
  JOIN cotironda_piloto_privado.participants s
   ON s.key=i.supplier_key AND s.participant_role='supplier'
   AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.participants b
   ON b.key=r.buyer_key AND b.participant_role='buyer'
   AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.original_share_policy_mvp178 pol
   ON pol.singleton=true AND pol.enabled=true
   AND pol.activated_at IS NOT NULL
   AND r.created_at>pol.activated_at
  WHERE r.id=p_request_id AND r.state='closed'
   AND r.closed_at IS NOT NULL AND r.closed_at>=r.closes_at
   AND r.closed_at<=clock_timestamp()
 ), opts AS (
  -- Legacy specific authorization remains valid ONLY under its old rules.
  SELECT c.accepted_at,c.version,1 priority
  FROM allowed a
  JOIN cotironda_piloto_privado.original_share_consents_mvp178 c
   ON c.request_id=a.id AND c.supplier_key=p_supplier_key
   AND c.alcance='original_identificable_tras_cierre'
   AND c.version='cotironda-originales-v1'
   AND c.revoked_at IS NULL
   AND c.accepted_at>=a.created_at
   AND c.accepted_at>=a.policy_activated_at
   AND c.accepted_at<=a.invited_at
  JOIN cotironda_piloto_privado.whapi_inbox msg
   ON msg.message_hmac=c.consent_message_hmac
   AND msg.participant_key=p_supplier_key
   AND msg.chat_hmac=a.supplier_chat
   AND msg.received_at=c.accepted_at
   AND (msg.request_id IS NULL OR msg.request_id=a.id)

  UNION ALL

  -- One-time explicit onboarding consent, only for future rounds.
  SELECT o.accepted_at,o.terms_version AS version,2 priority
  FROM allowed a
  JOIN cotironda_piloto_privado.supplier_original_optins_mvp362 o
   ON o.supplier_key=p_supplier_key
   AND o.terms_version='cotironda-originales-alta-v1'
   AND o.accepted_at>=a.policy_activated_at
   AND o.accepted_at<a.created_at
   AND o.recorded_at<=a.created_at
   AND o.recorded_at<=a.invited_at
  JOIN cotironda_piloto_privado.original_terms_policy_mvp362 t
   ON t.terms_version=o.terms_version AND t.enabled=true
   AND t.approved_at IS NOT NULL AND t.activated_at IS NOT NULL
   AND t.activated_at<=o.accepted_at
   AND t.activated_at<a.created_at
   AND t.terms_sha256=o.terms_sha256
   -- Verify canonical text hash EVERY time: altered terms fail CLOSED.
   AND t.terms_sha256=encode(extensions.digest(
       convert_to(t.terms_body,'UTF8'),'sha256'),'hex')
   AND t.scope='original_identificable_tras_cierre'
  -- Require independently registered outbound Whapi acceptance for same
  -- supplier, chat, terms SHA and an earlier delivery than incoming consent.
  JOIN cotironda_piloto_privado.supplier_original_terms_notices_mvp364 n
   ON n.notice_message_hmac=o.notice_message_hmac
   AND n.supplier_key=o.supplier_key
   AND n.terms_version=o.terms_version
   AND n.terms_sha256=t.terms_sha256
   AND n.supplier_chat_hmac=a.supplier_chat
   AND n.delivery_state='api_accepted'
   AND n.sent_at>=t.activated_at
   AND n.sent_at<o.accepted_at
   AND n.recorded_at<=o.accepted_at
   AND n.sent_at<a.created_at
   AND n.notice_message_hmac<>o.evidence_message_hmac
  JOIN cotironda_piloto_privado.whapi_inbox msg
   ON msg.message_hmac=o.evidence_message_hmac
   AND msg.participant_key=p_supplier_key
   AND msg.chat_hmac=a.supplier_chat
   AND msg.request_id IS NULL
   AND msg.kind='text'
   AND msg.received_at=o.accepted_at
   AND msg.plaintext_sha256=o.ack_plaintext_sha256
   AND msg.plaintext_sha256 ~ '^[a-f0-9]{64}$'
  WHERE o.reviewed_by_operator IS NOT NULL
    AND o.evidence_review_sha256 ~ '^[a-f0-9]{64}$'
 )
 SELECT opts.accepted_at,opts.version FROM opts
 WHERE NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.supplier_original_revocations_mvp362 rev
  WHERE rev.supplier_key=p_supplier_key
    AND rev.revoked_at<=clock_timestamp()
    -- A global revocation blocks BOTH legacy and onboarding downloads.
 )
 -- If an explicit per-round consent was revoked, don't fall back to
 -- an older onboarding acceptance to override that withdrawal.
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.original_share_consents_mvp178 rev_c
  WHERE rev_c.request_id=p_request_id AND rev_c.supplier_key=p_supplier_key
    AND rev_c.revoked_at IS NOT NULL
 )
 ORDER BY opts.priority,opts.accepted_at DESC
 LIMIT 1;
$mvp362$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.original_effective_consent_mvp362(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.original_effective_consent_mvp362(uuid,text)
 TO service_role;

-- Keep old preflight signature. It now delegates to SAME private gate.
-- Even a service_role caller gets only a boolean, no original data.
CREATE OR REPLACE FUNCTION
 public.cotironda_piloto_original_consent_preflight_mvp178(
  p_request_id uuid,p_supplier_key text
 ) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $mvp362_preflight$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.original_effective_consent_mvp362(
    p_request_id,p_supplier_key)
 );
$mvp362_preflight$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)
 TO service_role;
