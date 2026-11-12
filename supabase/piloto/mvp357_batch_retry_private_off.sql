-- MVP357 / PILOTO / DESARROLLO. NO EJECUTAR sobre Supabase hasta "Publicalo".
-- Reusa Edge privado cotironda-piloto-ai-batch y SQL claim mvp314.
-- El programador solo hace 1 HTTP asincrono si hay un job pending elegible;
-- nunca crea rondas, nunca manda directo a Whapi, nunca reintenta uncertain.
-- Nombres de Vault no son valores de secretos. NO registrar sus valores.
-- Pg_net guarda headers temporalmente en net.http_request_queue: restringir
-- roles con login DB/inspeccion de cola. Ver documentación de Supabase.
-- Prerrequisito: MVP356 y mvp357_next_batch_skip_blocked instalados.

CREATE TABLE cotironda_piloto_privado.ai_batch_retry_gate_mvp357(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 last_enqueued_at timestamptz
);
INSERT INTO cotironda_piloto_privado.ai_batch_retry_gate_mvp357(
 only_row, enabled, activated_at, last_enqueued_at)
 VALUES (true,false,null,null);
ALTER TABLE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.ai_batch_retry_tick_mvp357()
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $mvp357$
DECLARE
 v_gate record;
 v_next jsonb;
 v_cron text;
 v_private text;
 v_response bigint;
BEGIN
 -- Doble ticks de cron no deben disparar dos llamadas simultáneas.
 IF NOT pg_try_advisory_xact_lock(7835637) THEN RETURN 'busy';END IF;
 SELECT enabled,activated_at,last_enqueued_at INTO v_gate
 FROM cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 WHERE only_row FOR UPDATE;
 IF NOT FOUND OR NOT v_gate.enabled OR v_gate.activated_at IS NULL
 OR v_gate.activated_at>clock_timestamp()
 THEN RETURN 'disabled';END IF;
 -- Hasta 1 tick por cinco minutos. El claim/lease maneja la idempotencia
 -- de WhatsApp; este intervalo limita invocaciones HTTP, NO "reenvios".
 IF v_gate.last_enqueued_at IS NOT NULL AND
    v_gate.last_enqueued_at>clock_timestamp()-interval '4 minutes'
 THEN RETURN 'throttled';END IF;

 -- Solo este selector privado decide si hay trabajo seguro: exige
 -- pending, ronda preparada, presupuesto, consentimiento y límites,
 -- ademas de saltear proveedores temporalmente bloqueados por MVP356.
 v_next:=public.cotironda_piloto_ia_next_batch_mvp314();
 IF v_next IS NULL OR v_next->>'state'<>'ready'
 THEN RETURN 'no_eligible_job';END IF;

 -- DOS secretos INDEPENDIENTES, únicamente con capacidad de pedir un tick.
 -- No transportar service_role ni otro secreto administrativo en pg_net.
 SELECT decrypted_secret INTO v_cron
 FROM vault.decrypted_secrets
 WHERE name='cotironda_piloto_ai_batch_cron_proof_mvp357' LIMIT 1;
 SELECT decrypted_secret INTO v_private
 FROM vault.decrypted_secrets
 WHERE name='cotironda_piloto_ai_batch_private_mvp357' LIMIT 1;
 -- El Edge solo exige dos headers privados scoped, sin llave administrativa.
 IF v_cron IS NULL OR v_cron !~ '^[A-Za-z0-9_-]{32,256}$'
 OR v_private IS NULL OR length(v_private) NOT BETWEEN 32 AND 256
 OR btrim(v_private)<>v_private
 THEN RETURN 'credentials_unavailable';END IF;

 SELECT net.http_post(
   url:='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-ai-batch',
   body:='{}'::jsonb,
   headers:=jsonb_build_object(
     'Content-Type','application/json',
     'x-cotironda-batch-cron-proof',v_cron,
     'x-cotironda-ai-batch-secret',v_private),
   timeout_milliseconds:=5000
 ) INTO v_response;
 IF v_response IS NULL OR v_response<=0
 THEN RAISE EXCEPTION 'mvp357_http_queue_unavailable';END IF;
 UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
 SET last_enqueued_at=clock_timestamp() WHERE only_row;
 RETURN 'queued';
END
$mvp357$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.ai_batch_retry_tick_mvp357()
 FROM PUBLIC,anon,authenticated,service_role;
-- La función SOLO la puede invocar el propietario de cron/SQL autorizado.
-- No se crea cron ni se activa el gate en este archivo.
