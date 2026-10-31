-- D020: dispatcher secuencial EXCLUSIVO Cotironda DEV.
-- Instalacion aislada; NO crea cron job ni ejecuta HTTP por defecto.
-- La credencial de invocacion es una Supabase sb_secret_ de DEV en Vault, NUNCA OPENAI_API_KEY.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists cotironda_private.dev_quality_auto_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into cotironda_private.dev_quality_auto_control(singleton, enabled)
values (true, false) on conflict (singleton) do nothing;
alter table cotironda_private.dev_quality_auto_control enable row level security;
revoke all on cotironda_private.dev_quality_auto_control from public, anon, authenticated, service_role;

create table if not exists cotironda_private.dev_quality_auto_runs (
  case_id text primary key check (case_id in (
    'dos_productos_misma_linea',
    'marca_mencionada_y_presentacion_distinta',
    'cemento_generico_sin_especificacion_inventada',
    'solo_marca_exclusiva',
    'RH_pedido_RF_cotizacion_diferente_no_homologada'
  )),
  ordinal integer not null unique check (ordinal between 1 and 5),
  state text not null default 'pending'
    check (state in ('pending', 'submitted', 'complete', 'needs_review')),
  net_request_id bigint,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into cotironda_private.dev_quality_auto_runs (case_id, ordinal)
values
  ('dos_productos_misma_linea', 1),
  ('marca_mencionada_y_presentacion_distinta', 2),
  ('cemento_generico_sin_especificacion_inventada', 3),
  ('solo_marca_exclusiva', 4),
  ('RH_pedido_RF_cotizacion_diferente_no_homologada', 5)
on conflict (case_id) do nothing;
alter table cotironda_private.dev_quality_auto_runs enable row level security;
revoke all on cotironda_private.dev_quality_auto_runs from public, anon, authenticated, service_role;

-- No acepta case_id ni URL del caller. El unico destinatario es el Edge DEV ya autenticado.
-- Requiere pg_net, Vault con nombre 'cotironda_quality_dev_invoker' y activacion explicita.
create or replace function cotironda_private.dev_quality_dispatch_next()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean;
  v_key text;
  v_case text;
  v_request bigint;
begin
  -- Serializar invocaciones cron simultaneas sin locks persistentes.
  if not pg_catalog.pg_try_advisory_xact_lock(22020, 2026) then
    return 'busy';
  end if;

  select enabled into v_enabled
  from cotironda_private.dev_quality_auto_control where singleton = true;
  if v_enabled is distinct from true then
    return 'disabled';
  end if;

  -- Cualquier resultado no conforme bloquea el resto, incluso si hay result en DB.
  update cotironda_private.dev_quality_auto_runs q
  set state = 'needs_review', updated_at = now()
  from public.dev_ia_quality_results r
  where q.case_id = r.case_id and q.state in ('pending', 'submitted')
    and (r.source <> 'edge_runtime' or not r.security_pass or not r.coverage_pass
      or r.products_exact <> r.products_expected or r.products_omitted <> 0
      or r.products_altered <> 0 or r.suppliers_correct <> r.suppliers_expected
      or r.suppliers_omitted <> 0 or r.suppliers_incorrect <> 0);

  update cotironda_private.dev_quality_auto_runs q
  set state = 'complete', updated_at = now()
  from public.dev_ia_quality_results r
  where q.case_id = r.case_id and q.state in ('pending', 'submitted')
    and r.source = 'edge_runtime' and r.security_pass and r.coverage_pass
    and r.products_exact = r.products_expected and r.products_omitted = 0
    and r.products_altered = 0 and r.suppliers_correct = r.suppliers_expected
    and r.suppliers_omitted = 0 and r.suppliers_incorrect = 0;

  -- Un claim sin resultado guardado no permite avanzar ni reintentar.
  update cotironda_private.dev_quality_auto_runs q
  set state = 'needs_review', updated_at = now()
  where q.state = 'pending' and exists (
    select 1 from public.dev_ia_quality_claims c where c.case_id = q.case_id
  );
  update cotironda_private.dev_quality_auto_runs
  set state = 'needs_review', updated_at = now()
  where state = 'submitted' and submitted_at < now() - interval '12 minutes';

  if exists (select 1 from cotironda_private.dev_quality_auto_runs
             where state = 'needs_review') then
    update cotironda_private.dev_quality_auto_control set enabled = false where singleton = true;
    return 'halted_needs_review';
  end if;
  if exists (select 1 from cotironda_private.dev_quality_auto_runs
             where state = 'submitted') then
    return 'awaiting_result';
  end if;

  select case_id into v_case
  from cotironda_private.dev_quality_auto_runs
  where state = 'pending'
  order by ordinal
  limit 1
  for update;
  if v_case is null then
    update cotironda_private.dev_quality_auto_control set enabled = false where singleton = true;
    return 'all_complete';
  end if;

  -- No recuperar, copiar o imprimir este secreto fuera del contexto privilegiado.
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cotironda_quality_dev_invoker'
  limit 1;
  if v_key is null or v_key not like 'sb_secret_%' then
    return 'blocked_missing_dev_invoker';
  end if;

  -- pg_net es asíncrono: encola un POST, no ejecuta IA dentro de la transacción.
  -- Nunca reencolar 'submitted' aunque haya timeout, error HTTP o problema de métricas.
  select net.http_post(
    url := 'https://qkercsoqhehbenbbncwk.supabase.co/functions/v1/cotironda-ia-dev',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json', 'apikey', v_key),
    body := pg_catalog.jsonb_build_object('mode', 'quality_case', 'case_id', v_case),
    timeout_milliseconds := 30000
  ) into v_request;

  update cotironda_private.dev_quality_auto_runs
  set state = 'submitted', net_request_id = v_request,
      submitted_at = now(), updated_at = now()
  where case_id = v_case and state = 'pending';

  return 'submitted';
end
$function$;
revoke all on function cotironda_private.dev_quality_dispatch_next()
  from public, anon, authenticated, service_role;
comment on function cotironda_private.dev_quality_dispatch_next() is
  'D020 DEV only; postgres/cron only; one synthetic case per execution; no retry.';
-- NO cron.schedule en esta migracion: el propietario autoriza la activacion separada.
