-- MVP148: smoke exclusivamente PILOTO. No SEND, no CLAIM, no net/http.
-- Ejecutar SQL real sobre un transaction BEGIN/ROLLBACK y verificar ambos estados.
begin;
\set VERBOSITY terse
-- La función real debe estar creada antes de ejecutar este archivo.
select
 cotironda_piloto_privado.allow_next_pilot_send_mvp091(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid,'corralon_ailin') as ailin_allowed,
 cotironda_piloto_privado.allow_next_pilot_send_mvp091(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid,'corralon_nahuel') as nahuel_allowed,
 cotironda_piloto_privado.allow_next_pilot_send_mvp091(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid,'corralon_no_autorizado') as unknown_disallowed;
rollback;
