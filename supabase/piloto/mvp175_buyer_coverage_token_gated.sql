-- MVP175 — acceso por token de seguimiento a insumos de cotejo, SOLO PRIVADO.
-- Selector delega a MVP172; el servidor reduce el resultado ANTES de responder.
-- Credencial de 256 bits del comprador: nunca va en query string o logs.
create or replace function public.cotironda_piloto_buyer_coverage_inputs_mvp175(
 p_token_hash text
) returns jsonb
language plpgsql security definer
set search_path='' as $fn$
declare
 v_request_id uuid;
 v_now timestamptz:=clock_timestamp();
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','not_found');
 end if;
 select r.id into v_request_id
 from cotironda_piloto_privado.buyer_tracking_mvp091 t
 join cotironda_piloto_privado.requests r on r.id=t.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where t.token_hash=p_token_hash
  and t.revoked_at is null
  and t.expires_at>v_now
  and buyer.participant_role='buyer'
  and buyer.consent_at is not null
  and buyer.opted_out_at is null
  and r.state in ('prepared','closed');
 if not found then
  return jsonb_build_object('state','not_found');
 end if;
 -- Not exposed to browser; the Edge summarizes it to bounded counts only.
 return public.cotironda_piloto_private_round_inputs_mvp172(v_request_id);
end;$fn$;
revoke all on function public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)
 to service_role;