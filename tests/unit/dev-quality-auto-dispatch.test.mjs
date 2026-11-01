import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/sql/dev_quality_auto_dispatch.sql', import.meta.url),'utf8');

test('D020: el despacho usa exactamente el host de Cotironda DEV y quality_case',()=>{
  assert.match(sql,/https:\/\/qkercsoqhehbenbbncwk\.supabase\.co\/functions\/v1\/cotironda-ia-dev/);
  assert.match(sql,/'mode', 'quality_case', 'case_id', v_case/);
  assert.doesNotMatch(sql,/https:\/\/[^'\s]*vercel\.app/);
});

test('D020: sin cron automatico en la migracion, control OFF por defecto',()=>{
  assert.match(sql,/enabled boolean not null default false/);
  assert.match(sql,/values \(true, false\) on conflict/);
  assert.doesNotMatch(sql,/^\s*select\s+cron\.schedule\s*\(/im);
  assert.ok(sql.indexOf('if v_enabled is distinct from true') < sql.indexOf('select net.http_post('));
});

test('D020: cinco casos permitidos, el primero cemento y pintura; no reusa cemento ya gastado',()=>{
  const names=[
    'dos_productos_misma_linea',
    'marca_mencionada_y_presentacion_distinta',
    'cemento_generico_sin_especificacion_inventada',
    'solo_marca_exclusiva',
    'RH_pedido_RF_cotizacion_diferente_no_homologada'
  ];
  for(const id of names) assert.match(sql,new RegExp("'"+id+"'"));
  assert.match(sql,/\('dos_productos_misma_linea', 1\)/);
  assert.match(sql,/\('RH_pedido_RF_cotizacion_diferente_no_homologada', 5\)/);
  assert.doesNotMatch(sql,/\('cemento_cpc_50_a_avellaneda_25', \d+\)/);
  assert.match(sql,/where state = 'pending'\s+order by ordinal/);
});

test('D020: fail-closed cuando el resultado falta, falla o hay duplicidad',()=>{
  assert.match(sql,/state = 'needs_review'/);
  assert.match(sql,/r\.source <> 'edge_runtime' or not r\.security_pass or not r\.coverage_pass/);
  assert.match(sql,/r\.products_exact <> r\.products_expected/);
  assert.match(sql,/r\.suppliers_correct <> r\.suppliers_expected/);
  assert.match(sql,/state = 'submitted' and submitted_at < now\(\) - interval '12 minutes'/);
  assert.match(sql,/return 'halted_needs_review'/);
  assert.match(sql,/return 'awaiting_result'/);
  assert.match(sql,/pg_try_advisory_xact_lock/);
  assert.match(sql,/where q\.state = 'pending' and exists \(/);
  assert.doesNotMatch(sql,/\bhttp_post\s*\([^;]*retry/si);
});

test('D020: privilegios minimos, secreto Vault separado de OpenAI y no logueado',()=>{
  assert.match(sql,/alter table cotironda_private\.dev_quality_auto_runs enable row level security/);
  assert.match(sql,/alter table cotironda_private\.dev_quality_auto_control enable row level security/);
  assert.match(sql,/revoke all on function cotironda_private\.dev_quality_dispatch_next\(\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql,/from vault\.decrypted_secrets/);
  assert.match(sql,/name = 'cotironda_quality_dev_invoker'/);
  assert.match(sql,/v_key not like 'sb_secret_%'/);
  assert.doesNotMatch(sql,/raise (notice|warning|log)[^;]*v_key/i);
  assert.doesNotMatch(sql,/OPENAI_API_KEY\s*[:=]\s*['"]/);
});

test('D020: Edge acepta solo claves secret concretas del proyecto DEV',()=>{
  const edge=readFileSync(new URL('../../supabase/functions/cotironda-ia-dev/index.ts',import.meta.url),'utf8');
  assert.match(edge,/auth:\s*'secret:cotironda_quality_lab'/);
  assert.doesNotMatch(edge,/secret:default/);
  assert.doesNotMatch(edge,/auth:\s*['"]secret:\*['"]/);
  assert.doesNotMatch(edge,/auth:\s*['"]none['"]/);
  assert.match(edge,/withSupabase\(/);
});
