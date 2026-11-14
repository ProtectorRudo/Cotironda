-- Cotironda D016 P0: retirar SOLO la alternativa duplicada #847.
-- Canonical = PR #846, funciones register_terms_acceptance / record_terms_delivery,
-- política v2_d016_supplier_terms_policy, tabla *_terms_deliveries.
-- Las dos tablas y tres RPC a continuación se instalaron vacías en
-- migración 20261114024509. ANTES: preflight transaccional obligatorio.
-- Sin CASCADE, sin IF EXISTS: cualquier dependencia/deriva debe abortar.
DROP FUNCTION public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 text,text,text,boolean);
DROP FUNCTION public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 uuid,text,text);
DROP FUNCTION public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 text,text,text);
DROP TABLE cotironda_piloto_privado.v2_d016_supplier_terms_notices RESTRICT;
DROP TABLE cotironda_piloto_privado.v2_d016_supplier_terms_approval RESTRICT;
