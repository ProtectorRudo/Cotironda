-- V2 B4: read-only enablement gate for the existing Vault-authorized cron bridge.
-- No secrets are retrieved by this RPC. No source claim or side effects.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE only_row=true AND enabled=true
 )
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 TO service_role;
