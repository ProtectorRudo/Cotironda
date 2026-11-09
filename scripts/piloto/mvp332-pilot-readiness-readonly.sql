-- MVP332 - Read-only pilot readiness evidence. No DDL/DML, no token,
-- contact, HMAC, supplier identity or raw quote content is selected.
-- Execute ONLY against project ilggkalaafhtiysyzlmg under pilot account.
SELECT jsonb_build_object(
 'project_ref','ilggkalaafhtiysyzlmg',
 'checked_utc',now(),
 'participants',(SELECT count(*) FROM cotironda_piloto_privado.participants),
 'buyers',(SELECT count(*) FROM cotironda_piloto_privado.participants
           WHERE participant_role='buyer' AND opted_out_at IS NULL),
 'suppliers',(SELECT count(*) FROM cotironda_piloto_privado.participants
              WHERE participant_role='supplier' AND opted_out_at IS NULL),
 'bound_legacy_channels',(SELECT count(*) FROM cotironda_piloto_privado.participant_channels_mvp109),
 'new_admin_channels',(SELECT count(*) FROM cotironda_piloto_privado.admin_channels_mvp312),
 'admin_authorizations',(SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309),
 'contact_disclosure_consents',(SELECT count(*) FROM cotironda_piloto_privado.contact_reveal_consents_mvp109
  WHERE approved_at IS NOT NULL AND revoked_at IS NULL),
 'contact_enrollment_proofs',(SELECT count(*) FROM cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307),
 'rounds',(SELECT count(*) FROM cotironda_piloto_privado.requests),
 'inbound_total',(SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox),
 'last_inbound_utc',(SELECT max(received_at) FROM cotironda_piloto_privado.whapi_inbox),
 'recent_inbound_3h',(SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox
                     WHERE received_at>now()-interval '3 hours'),
 'pending_dispatch_jobs',(SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
                           WHERE state IN ('pending','leased','uncertain')),
 'uncertain_outbound',(SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
                        WHERE state IN ('uncertain','leased')),
 'verified_supplier_reviews',(SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_review_mvp227
                              WHERE state='verified'),
 'supplier_reviews_needing_evidence',(SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_review_mvp227
                                      WHERE state='review'),
 'auto_release_enabled',(SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306),
 'batch_enabled',(SELECT enabled FROM cotironda_piloto_privado.ai_batch_gate_mvp314),
 'buyer_notice_enabled',(SELECT enabled FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315),
 'legacy_dispatch_enabled',(SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222),
 'mvp313_table_present',(to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NOT NULL)
) AS evidence_snapshot;
