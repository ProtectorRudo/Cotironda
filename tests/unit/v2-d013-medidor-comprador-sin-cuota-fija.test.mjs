import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generarWebhookD016,activarMedicionCompradorV2D013}
 from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';

const legacy=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),
 'utf8');
const candidate=generarWebhookD016(legacy);
const buyerOld=`      model,
      usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true',
      rpc:async(name,params)=>{`;
const buyerNew=`      model,
      usageTraceEnabled:true,
      rpc:async(name,params)=>{`;
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_cuota_comercial_recuperacion_inbox_CANDIDATE.sql',
 import.meta.url),'utf8');
const active=sql.split('END $guard$;')[1]??'';

test('D013: activar medición del comprador sólo modifica una llamada',()=>{
 assert.equal(candidate.split(buyerOld).length-1,1);
 const s=activarMedicionCompradorV2D013(candidate);
 assert.equal(s.split(buyerOld).length-1,0);
 assert.equal(s.split(buyerNew).length-1,1);
 assert.equal(s.length,candidate.length-buyerOld.length+buyerNew.length);
 assert.equal(s.includes('const buyerWorker=procesarCompradorCentralV2D013;'),true);
 assert.equal(s.includes('const zoneWorker=continuarZonaCentralV2D013;'),true);
 assert.equal(s.includes('habilitado:true,publicar:d013Enabled'),true);
 assert.equal(s.includes('model,publicar:d013ZoneEnabled'),true);
 // Preserva todo lo referido a proveedor y otros llamados no afectados.
 const remaining="usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true'";
 assert.equal(s.split(remaining).length-1,candidate.split(remaining).length-2);
});

test('D013: fallar cerrado si falta el medidor, se duplica o se altera el gate',()=>{
 const once=activarMedicionCompradorV2D013(candidate);
 assert.throws(()=>activarMedicionCompradorV2D013(once),/buyer-usage-meter|d013_/u);
 assert.throws(()=>activarMedicionCompradorV2D013(
  candidate.replace('habilitado:true,publicar:d013Enabled','habilitado:true,publicar:true')
 ),/d013_meter_source_not_v93/u);
 assert.throws(()=>activarMedicionCompradorV2D013(
  candidate.replace(buyerOld,buyerOld+buyerOld)
 ),/buyer-usage-meter|d013_/u);
});

test('D013: medidor por tokens conserva presupuesto y bloqueo de consumo desconocido',()=>{
 assert.match(sql,/D013_USAGE_BUDGET_DRIFTED/u);
 assert.match(active,/cotironda_piloto_ai_usage_reserve_mvp264/u);
 const n=active.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264');
 assert.ok(n>0);
 const updated=active.slice(n);
 assert.match(updated,/IF unknown_>0 THEN RETURN jsonb_build_object\('state','usage_unknown_blocked'\)/u);
 assert.match(updated,/IF used_>=200000/u);
 assert.doesNotMatch(updated,/IF n_>=24 OR used_>=200000/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.cotironda_piloto_ai_usage_reserve_mvp264/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.cotironda_piloto_ai_usage_reserve_mvp264/u);
});
