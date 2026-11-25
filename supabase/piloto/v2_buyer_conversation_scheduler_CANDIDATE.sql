-- CANDIDATO: programador de 15 s, solo cuando hay trabajo pendiente.
-- OFF. No secretos estáticos nuevos: token aleatorio de un solo uso por tick.
CREATE TABLE cotironda_piloto_privado.v2_conversation_control(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO cotironda_piloto_privado.v2_conversation_control(singleton,enabled) VALUES(true,false);
CREATE TABLE cotironda_piloto_privado.v2_conversation_ticks(
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 seconds',
 consumed_at timestamptz
);
ALTER TABLE cotironda_piloto_privado.v2_conversation_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_conversation_ticks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_conversation_control,cotironda_piloto_privado.v2_conversation_ticks FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cotironda_piloto_v2_conversation_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT coalesce((SELECT enabled FROM cotironda_piloto_privado.v2_conversation_control WHERE singleton),false);
$fn$;
CREATE FUNCTION public.cotironda_piloto_v2_conversation_consume_tick(p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE n int;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR NOT public.cotironda_piloto_v2_conversation_enabled() THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_conversation_ticks SET consumed_at=clock_timestamp()
 WHERE digest=p_digest AND consumed_at IS NULL AND expires_at>clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n=1;
END $fn$;
CREATE FUNCTION cotironda_piloto_privado.v2_conversation_schedule_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE token text;digest text;
BEGIN
 IF NOT public.cotironda_piloto_v2_conversation_enabled() THEN RETURN;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('cotironda_v2_conversation_tick',0)) THEN RETURN;END IF;
 DELETE FROM cotironda_piloto_privado.v2_conversation_ticks WHERE expires_at<clock_timestamp()-interval '1 day';
 IF jsonb_array_length(public.cotironda_piloto_v2_conversation_due())=0 THEN RETURN;END IF;
 -- No duplicar un tick que aún no ha sido reclamado por el servidor.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_conversation_ticks WHERE consumed_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN;END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 digest:=encode(sha256(convert_to(token,'UTF8')),'hex');
 INSERT INTO cotironda_piloto_privado.v2_conversation_ticks(digest) VALUES(digest);
 PERFORM net.http_post(url:='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi?conversation_tick=1',
 headers:=jsonb_build_object('Content-Type','application/json','x-cotironda-conversation-tick',token),
 body:='{}'::jsonb,timeout_milliseconds:=180000);
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_conversation_enabled(),public.cotironda_piloto_v2_conversation_consume_tick(text),cotironda_piloto_privado.v2_conversation_schedule_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_conversation_enabled(),public.cotironda_piloto_v2_conversation_consume_tick(text) TO service_role;
-- Registro programado se deja INACTIVO dentro de esta misma transacción.
DO $cron$ DECLARE jid bigint;BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='cotironda-v2-buyer-conversation-15s') THEN RAISE EXCEPTION 'conversation cron already exists';END IF;
 jid:=cron.schedule('cotironda-v2-buyer-conversation-15s','15 seconds','SELECT cotironda_piloto_privado.v2_conversation_schedule_tick()');
 PERFORM cron.alter_job(jid,active:=false);
END $cron$;
