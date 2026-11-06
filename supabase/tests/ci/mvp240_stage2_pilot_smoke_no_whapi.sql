-- MVP240: etapa 2, prueba sobre esquema PILOTO real SIN envíos ni fuentes nuevas.
-- Seguridad: no crear rondas ni invitaciones sintéticas en el piloto;
-- INSERT a invitations activa triggers que preparan salidas de WhatsApp.
-- Este script SOLO realiza SELECT y consultas a RPCs con HMAC inexistentes.
-- BEGIN/ROLLBACK protegen ante futura modificación interna de una RPC.
BEGIN;
DO $smoke$
DECLARE
 v_fake_chat text:=repeat('e',64);
 v_flags jsonb;
 v_quote jsonb;
 v_preamble jsonb;
 v_attachment jsonb;
 v_prompt jsonb;
 v_reply jsonb;
 v_trials integer;
 v_main integer;
 v_dispatch integer;
 v_malicious_count integer;
BEGIN
 SELECT (SELECT count(*) FROM cotironda_piloto_privado.ai_trial_control_mvp229 WHERE enabled),
        (SELECT count(*) FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE enabled),
        (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 WHERE enabled)
 INTO v_trials,v_main,v_dispatch;
 IF v_trials<>0 OR v_main<>0 OR v_dispatch<>0
 THEN RAISE EXCEPTION 'MVP240: active gates: do not use inactive preflight';END IF;
 IF NOT EXISTS(
   SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid='cotironda_piloto_privado.invitations'::regclass
     AND t.tgname='enqueue_on_invitation' AND NOT t.tgisinternal
 ) THEN RAISE EXCEPTION 'MVP240: invitation dispatch trigger changed';END IF;
 IF to_regclass('cotironda_piloto_privado.ai_supplier_unresolved_mvp237') IS NULL
 OR to_regclass('cotironda_piloto_privado.ai_supplier_preambles_mvp238') IS NULL
 OR to_regclass('cotironda_piloto_privado.ai_supplier_clarifications_mvp239') IS NULL
 THEN RAISE EXCEPTION 'MVP240: stage 2 SQL missing';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_resolve_clarification_mvp239(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_reserve_clarification_mvp239(text,text)','EXECUTE')
 OR has_table_privilege('service_role',
   'cotironda_piloto_privado.ai_supplier_unresolved_mvp237','SELECT')
 OR has_table_privilege('anon',
   'cotironda_piloto_privado.ai_supplier_clarifications_mvp239','SELECT')
 THEN RAISE EXCEPTION 'MVP240: public/private permissions regressed';END IF;
 IF (SELECT relrowsecurity FROM pg_class WHERE oid=
  'cotironda_piloto_privado.ai_supplier_unresolved_mvp237'::regclass)
 IS DISTINCT FROM TRUE
 OR (SELECT relrowsecurity FROM pg_class WHERE oid=
  'cotironda_piloto_privado.ai_supplier_clarifications_mvp239'::regclass)
 IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'MVP240: RLS regressed';END IF;
 SELECT count(*) INTO v_malicious_count FROM cotironda_piloto_privado.whapi_inbox
 WHERE message_hmac IN (repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),repeat('f',64));
 IF v_malicious_count<>0 THEN
  RAISE EXCEPTION 'MVP240: fake HMAC collision: abort';END IF;
 v_flags:=public.cotironda_piloto_ia_trial_flags_mvp229(v_fake_chat);
 v_quote:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('a',64),v_fake_chat,NULL,'cemento 10000');
 v_preamble:=public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
  repeat('b',64),v_fake_chat,'Te paso el presupuesto');
 v_attachment:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(
  repeat('c',64),v_fake_chat);
 v_prompt:=public.cotironda_piloto_ia_reserve_clarification_mvp239(
  repeat('d',64),v_fake_chat);
 v_reply:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('f',64),v_fake_chat,'whapi-test-12345','Es de este pedido');
 IF v_flags->>'state'<>'inactive'
 OR v_quote->>'state'<>'source_not_eligible'
 OR v_preamble->>'state'<>'not_eligible'
 OR v_attachment->>'state'<>'not_eligible'
 OR v_prompt->>'state'<>'disabled'
 OR v_reply->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'MVP240: failed closed-source checks: %, %, %, %, %, %',
 v_flags->>'state',v_quote->>'state',v_preamble->>'state',
 v_attachment->>'state',v_prompt->>'state',v_reply->>'state';
 END IF;
 RAISE NOTICE 'PASS MVP240: six RPCs fail closed, private ACL/RLS, gates OFF; no invitations created';
END $smoke$;
SELECT 'MVP240 preflight executed within transaction and rolled back' AS result;
ROLLBACK;
