-- MVP291 CI bootstrap for legacy supplier routing structures not provided
-- by the earlier MVP289 synthetic buyer fixture. **TEST ONLY**, never deploy.
-- Intentional minimal copy of column/constraint shape; NOT an exact schema dump.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN('text','document','image')),
 state text NOT NULL CHECK(state IN('ambiguous_round','not_matched','media_context_conflict','context_blocked')),
 candidate_count integer NOT NULL CHECK(candidate_count>=0),
 association_method text NOT NULL CHECK(association_method IN('quoted_whapi_id','single_active_round','prior_supplier_preamble')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_request_id uuid REFERENCES cotironda_piloto_privado.requests(id),
 resolved_at timestamptz,
 CHECK((resolved_request_id IS NULL)=(resolved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN('text','document','image')),
 association text NOT NULL CHECK(association IN('quoted_whapi_id','single_active_round','prior_supplier_preamble','clarified_supplier_reply')),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'awaiting_semantic_review' CHECK(status='awaiting_semantic_review'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,supplier_key) REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key)
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225 ENABLE ROW LEVEL SECURITY;
-- The original cumulative synthetic schema is intentionally incomplete.
ALTER TABLE cotironda_piloto_privado.requests ADD COLUMN IF NOT EXISTS round_days smallint NOT NULL DEFAULT 4;
ALTER TABLE cotironda_piloto_privado.requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE cotironda_piloto_privado.invitations ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'prepared';
ALTER TABLE cotironda_piloto_privado.whapi_outbox ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'pending';
ALTER TABLE cotironda_piloto_privado.whapi_outbox ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE cotironda_piloto_privado.whapi_outbox ADD COLUMN IF NOT EXISTS whapi_message_id text;
ALTER TABLE cotironda_piloto_privado.whapi_outbox ADD COLUMN IF NOT EXISTS message_body text;
ALTER TABLE cotironda_piloto_privado.whapi_inbox ADD COLUMN IF NOT EXISTS nonce_b64 text;
ALTER TABLE cotironda_piloto_privado.whapi_inbox ADD COLUMN IF NOT EXISTS ciphertext_b64 text;
ALTER TABLE cotironda_piloto_privado.whapi_inbox ADD COLUMN IF NOT EXISTS source_unix bigint;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'document';
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS media_id_sha256 text;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS size_bytes integer;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS ai_reserved_at timestamptz;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'unread';
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS proposal jsonb;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES cotironda_piloto_privado.requests(id);
ALTER TABLE cotironda_piloto_privado.participants ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;
ALTER TABLE cotironda_piloto_privado.participants ADD COLUMN IF NOT EXISTS consent_at timestamptz;

-- The old MVP225 cumulative fixture has an earlier pre-MVP239 association
-- check. Real pilot already includes clarified_supplier_reply. Align CI only.
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 DROP CONSTRAINT IF EXISTS ai_supplier_links_mvp225_association_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 ADD CONSTRAINT ai_supplier_links_mvp225_association_check CHECK(
 association IN('quoted_whapi_id','single_active_round',
 'prior_supplier_preamble','clarified_supplier_reply'));
