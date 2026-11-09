-- MVP320: preflight of prospective autonomous Cotironda pilot.
-- STRICTLY READ ONLY: no writes, no RPC causing side effects, no Whapi, no API keys.
-- Compatible with MVP306 present and MVP309-315 NOT INSTALLED.
-- Never expose phones, chat HMAC, tokens, identities, quote source or prices.
SELECT
  to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS audited_at_utc,
  'MVP320_READ_ONLY_NO_OUTBOUND'::text AS execution,
  (current_setting('server_version_num')::integer BETWEEN 170000 AND 179999) AS postgres17,
  (to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NOT NULL) AS mvp309_installed,
  (
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='cotironda_piloto_privado.participants'::regclass
        AND conname='participants_key_mvp310')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='cotironda_piloto_privado.participants'::regclass
        AND conname='participants_role_city_mvp310')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='cotironda_piloto_privado.requests'::regclass
        AND tgname='requests_buyer_verified_mvp310'
        AND NOT tgisinternal)
  ) AS mvp310_installed,
  (to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NOT NULL) AS mvp312_installed,
  (to_regprocedure('public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)') IS NOT NULL) AS mvp313_installed,
  (to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NOT NULL) AS mvp314_installed,
  (to_regclass('cotironda_piloto_privado.ai_buyer_notice_gate_mvp315') IS NOT NULL) AS mvp315_installed,
  COALESCE((SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306
    WHERE only_row),false) AS auto_release_enabled,
  COALESCE((SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
    WHERE only_row),false) AS legacy_dispatch_enabled,
  COALESCE((SELECT whatsapp_inbound_enabled FROM cotironda_piloto_privado.integration_flags
    WHERE only_row),false) AS inbound_enabled,
  COALESCE((SELECT whatsapp_outbound_enabled FROM cotironda_piloto_privado.integration_flags
    WHERE only_row),false) AS outbound_enabled,
  (SELECT count(*)::integer FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306)
    AS auto_released_rounds,
  (SELECT count(*)::integer FROM storage.objects
    WHERE bucket_id='cotironda-piloto-originals') AS original_files,
  false AS external_whapi_transport_verified,
  false AS real_e2e_certified;
