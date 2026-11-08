-- MVP315: SOLO LECTURA, seguro para ejecutar en cotironda-piloto.
-- No contactos, tokens, hashes, secretos ni SQL DDL/DML. No activa nada.
-- La presencia de un objeto NO garantiza coincidencia de cuerpo, permisos,
-- migración completa, rol o preparación real de Whapi.
SELECT jsonb_build_object(
 'postgres_version',current_setting('server_version_num')::integer,
 'mvp309_admin_evidence',
   to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NOT NULL,
 'mvp310_buyer_role_trigger',
   to_regprocedure('cotironda_piloto_privado.verify_request_buyer_mvp310()') IS NOT NULL,
 'mvp312_admin_channel',
   to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NOT NULL,
 'mvp313_dynamic_recipient',
   to_regprocedure('public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)') IS NOT NULL,
 'mvp314_batch_policy',
   to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NOT NULL,
 'mvp315_buyer_notice_policy',
   to_regclass('cotironda_piloto_privado.ai_buyer_notice_gate_mvp315') IS NOT NULL,
 'mvp315_buyer_packet',
   to_regprocedure('public.cotironda_piloto_ia_buyer_packet_mvp315(uuid,text,text)') IS NOT NULL,
 'mvp306_auto_release_enabled',
   (SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 WHERE only_row),
 'mvp222_dispatch_enabled',
   (SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 WHERE only_row),
 'whapi_outbound_flag',
   (SELECT whatsapp_outbound_enabled FROM cotironda_piloto_privado.integration_flags WHERE only_row)
) AS preflight_solo_lectura;
